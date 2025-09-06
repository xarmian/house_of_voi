/**
 * Multi-Contract YBT Service
 * 
 * Contract-aware version of the YBT service that supports multiple
 * YBT contracts dynamically. This service accepts contract context
 * and routes operations to the appropriate contract.
 */

import algosdk from 'algosdk';
import * as algokit from '@algorandfoundation/algokit-utils';
import { YieldBearingTokenClient, APP_SPEC as YBTAppSpec } from '../../clients/YieldBearingTokenClient.js';
import { CONTRACT } from 'ulujs';
import { NETWORK_CONFIG } from '$lib/constants/network';
import { BETTING_CONSTANTS } from '$lib/constants/betting';
import { selectedWallet, signAndSendTransactions, signTransactions } from 'avm-wallet-svelte';
import { get } from 'svelte/store';
import type { WalletAccount } from '$lib/types/wallet';
import type { 
  YBTGlobalState, 
  YBTTransactionResult, 
  YBTDepositParams, 
  YBTWithdrawParams 
} from '$lib/types/ybt';
import type { ContractPair } from '$lib/types/multiContract';
import { contractRegistry } from './contractRegistry';

// Contract-aware YBT operation context
export interface YBTContractContext {
  contractId: string;
  contract: ContractPair;
  ybtAppId: number;
  slotMachineAppId: number;
}

// Wallet context types (same as original)
export type WalletContextType = 'gaming' | 'third-party';

export interface WalletContext {
  type: WalletContextType;
  address: string;
  privateKey?: string; // Only for gaming wallets
}

// Extended YBT types with contract context
export interface YBTDepositParamsWithContract extends YBTDepositParams {
  contractId: string;
}

export interface YBTWithdrawParamsWithContract extends YBTWithdrawParams {
  contractId: string;
}

export interface YBTGlobalStateWithContract extends YBTGlobalState {
  contractId: string;
  contractName: string;
}

export interface YBTTransactionResultWithContract extends YBTTransactionResult {
  contractId: string;
}

// Import stores for triggering balance refresh
let multiContractStore: any = null;
let ybtStore: any = null;

class MultiContractYBTService {
  private algodClient: algosdk.Algodv2;
  private ybtClients: Map<number, YieldBearingTokenClient> = new Map();
  private preferredWalletType: 'gaming' | 'third-party' | 'auto' = 'auto';
  private ybtABI = {
    name: "Yield Bearing Token",
    desc: "A yield bearing token contract",
    methods: YBTAppSpec.contract.methods,
    events: [] // Add empty events array as required by ulujs
  };

  constructor() {
    // Initialize Algorand client
    this.algodClient = new algosdk.Algodv2(
      NETWORK_CONFIG.token,
      NETWORK_CONFIG.nodeUrl,
      NETWORK_CONFIG.port
    );
  }

  /**
   * Set preferred wallet type for operations
   */
  setPreferredWalletType(type: 'gaming' | 'third-party' | 'auto') {
    this.preferredWalletType = type;
  }

  /**
   * Get contract context from contract ID
   */
  private getContractContext(contractId: string): YBTContractContext | null {
    const contract = contractRegistry.getContract(contractId);
    if (!contract) {
      console.error(`Contract ${contractId} not found in registry`);
      return null;
    }

    return {
      contractId,
      contract,
      ybtAppId: contract.ybtAppId,
      slotMachineAppId: contract.slotMachineAppId
    };
  }

  /**
   * Get wallet context from current wallet state (same as original)
   */
  async getWalletContext(): Promise<WalletContext | null> {
    const { walletStore } = await import('$lib/stores/wallet');
    const { walletService } = await import('$lib/services/wallet');
    const gamingWallet = get(walletStore);
    const thirdPartyWallet = get(selectedWallet);
    
    const gamingAvailable = gamingWallet.isConnected && gamingWallet.account?.address;
    const gamingLocked = !gamingAvailable && walletService.hasStoredWallet();
    const gamingAddress = gamingAvailable ? 
      gamingWallet.account.address : 
      (gamingLocked ? walletService.getStoredWalletAddress() : null);
    const thirdPartyAvailable = thirdPartyWallet?.address;
    
    // Respect preferred wallet type
    if (this.preferredWalletType === 'gaming' && gamingAddress) {
      return {
        type: 'gaming',
        address: gamingAddress,
        privateKey: gamingAvailable ? gamingWallet.account.privateKey : undefined
      };
    }
    
    if (this.preferredWalletType === 'third-party' && thirdPartyAvailable) {
      return {
        type: 'third-party',
        address: thirdPartyWallet.address
      };
    }
    
    // Auto mode: prefer gaming wallet first, then third-party
    if (this.preferredWalletType === 'auto') {
      if (gamingAddress) {
        return {
          type: 'gaming',
          address: gamingAddress,
          privateKey: gamingAvailable ? gamingWallet.account.privateKey : undefined
        };
      }
      
      if (thirdPartyAvailable) {
        return {
          type: 'third-party',
          address: thirdPartyWallet.address
        };
      }
    }
    return null;
  }

  /**
   * Get wallet context for a specific address (for read operations)
   */
  private async getWalletContextForAddress(address: string): Promise<WalletContext | null> {
    // Try gaming wallet first
    const { walletStore } = await import('$lib/stores/wallet');
    const gamingWallet = get(walletStore);
    
    if (gamingWallet.account?.address === address) {
      return {
        type: 'gaming',
        address: gamingWallet.account.address,
        privateKey: gamingWallet.account.privateKey
      };
    }
    
    // Fall back to third-party wallet
    const thirdPartyWallet = get(selectedWallet);
    if (thirdPartyWallet?.address === address) {
      return {
        type: 'third-party',
        address: thirdPartyWallet.address
      };
    }
    
    return null;
  }

  /**
   * Sign and send transactions based on wallet context (same as original)
   */
  private async signAndSendTransactions(txns: string[], context: WalletContext): Promise<{ txId: string }> {
    if (context.type === 'gaming') {
      // Gaming wallet: direct signing
      if (!context.privateKey) {
        throw new Error('Gaming wallet private key not available');
      }
      
      const privateKeyBytes = this.hexToUint8Array(context.privateKey);
      
      const signedTxns = txns.map((txnBlob: string) => {
        // Convert base64 string to Uint8Array (browser-compatible)
        const binaryString = atob(txnBlob);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      }).map((txnBytes: Uint8Array) => {
        // Decode and sign the transaction
        const txn = algosdk.decodeUnsignedTransaction(txnBytes);
        return algosdk.signTransaction(txn, privateKeyBytes).blob;
      });

      // Send signed transactions
      const result = await this.algodClient.sendRawTransaction(signedTxns).do();
      return { txId: result.txId };
    } else {
      // Third-party wallet: use avm-wallet-svelte
      const decodedTxns = txns.map((txnBlob: string) => {
        const binaryString = atob(txnBlob);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      }).map((txnBytes: Uint8Array) => {
        return algosdk.decodeUnsignedTransaction(txnBytes);
      });
      
      const signedTxns = await signTransactions([decodedTxns]);
      const result = await this.algodClient.sendRawTransaction(signedTxns).do();
      return { txId: result.txId };
    }
  }

  /**
   * Convert hex string to Uint8Array (same as original)
   */
  private hexToUint8Array(hex: string): Uint8Array {
    return new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  }

  /**
   * Get multi-contract store dynamically
   */
  private async getMultiContractStore() {
    if (!multiContractStore) {
      const module = await import('$lib/stores/multiContract');
      multiContractStore = module;
    }
    return multiContractStore;
  }

  /**
   * Get YBT store dynamically
   */
  private async getYBTStore() {
    if (!ybtStore) {
      const module = await import('$lib/stores/ybt');
      ybtStore = module.ybtStore;
    }
    return ybtStore;
  }

  /**
   * Refresh balances after operations
   */
  private async refreshBalance() {
    try {
      const store = await this.getYBTStore();
      await store.refresh();
      
      // Also refresh multi-contract stores
      const multiStore = await this.getMultiContractStore();
      if (multiStore.aggregatedPortfolioStore) {
        // Trigger portfolio recalculation (would need user address)
        // await multiStore.aggregatedPortfolioStore.calculatePortfolio(userAddress);
      }
    } catch (error) {
      // Silently handle refresh errors to not interfere with main operations
      console.warn('Failed to refresh balances after YBT operation:', error);
    }
  }

  /**
   * Wait for transaction confirmation (same as original)
   */
  private async waitForConfirmation(txId: string): Promise<void> {
    try {
      const maxAttempts = 10;
      const delayMs = 1000;
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const txInfo = await this.algodClient.pendingTransactionInformation(txId).do();
          
          if (txInfo['confirmed-round'] && txInfo['confirmed-round'] > 0) {
            return;
          }
          
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } catch (error) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    } catch (error) {
      // Silently handle confirmation errors
    }
  }

  /**
   * Get YBT client for specific contract
   */
  private async getYBTClient(contractContext: YBTContractContext): Promise<YieldBearingTokenClient> {
    const ybtAppId = contractContext.ybtAppId;
    
    if (!this.ybtClients.has(ybtAppId)) {
      const client = new YieldBearingTokenClient(
        {
          resolveBy: 'id',
          id: ybtAppId,
          sender: {
            addr: get(selectedWallet)?.address || '',
            sk: new Uint8Array(0),
          }
        },
        this.algodClient
      );
      this.ybtClients.set(ybtAppId, client);
    }

    return this.ybtClients.get(ybtAppId)!;
  }

  /**
   * Get read-only YBT client for specific contract
   */
  private async getReadOnlyYBTClient(contractContext: YBTContractContext): Promise<YieldBearingTokenClient> {
    return new YieldBearingTokenClient(
      {
        resolveBy: 'id',
        id: contractContext.ybtAppId,
      },
      this.algodClient
    );
  }

  /**
   * Get global state for specific contract
   */
  async getGlobalState(contractId: string): Promise<YBTGlobalStateWithContract> {
    const contractContext = this.getContractContext(contractId);
    if (!contractContext) {
      throw new Error(`Contract ${contractId} not found`);
    }

    try {
      const client = await this.getYBTClient(contractContext);
      const appInfo = await this.algodClient.getApplicationByID(contractContext.ybtAppId).do();
      
      const globalState = appInfo.params['global-state'] || [];
      const decodedState: any = {};
      
      // Decode global state (same logic as original)
      for (const item of globalState) {
        const keyBytes = new Uint8Array(atob(item.key).split('').map(c => c.charCodeAt(0)));
        const key = new TextDecoder().decode(keyBytes);
        if (item.value.type === 1) {
          // Bytes
          const valueBytes = new Uint8Array(atob(item.value.bytes).split('').map(c => c.charCodeAt(0)));
          
          // Special handling for totalSupply
          if (key === 'totalSupply') {
            if (valueBytes.length <= 8) {
              const paddedBytes = new Uint8Array(8);
              paddedBytes.set(valueBytes, 8 - valueBytes.length);
              
              const dataView = new DataView(paddedBytes.buffer);
              const value = dataView.getBigUint64(0, false);
              decodedState[key] = value;
            } else {
              decodedState[key] = BigInt(0);
            }
          } else {
            try {
              const value = new TextDecoder().decode(valueBytes);
              decodedState[key] = value;
            } catch (decodeError) {
              const hexValue = Array.from(valueBytes).map(b => b.toString(16).padStart(2, '0')).join('');
              decodedState[key] = hexValue;
            }
          }
        } else if (item.value.type === 2) {
          // Uint
          const value = BigInt(item.value.uint);
          decodedState[key] = value;
        }
      }

      // Ensure totalSupply is always a valid BigInt
      let totalSupply = BigInt(0);
      if (decodedState.totalSupply !== undefined && decodedState.totalSupply !== null) {
        if (typeof decodedState.totalSupply === 'bigint') {
          totalSupply = decodedState.totalSupply;
        } else {
          try {
            totalSupply = BigInt(decodedState.totalSupply);
          } catch (error) {
            totalSupply = BigInt(0);
          }
        }
      }

      return {
        contractId,
        contractName: contractContext.contract.name,
        totalSupply,
        name: decodedState.name || contractContext.contract.name,
        symbol: decodedState.symbol || 'YBT',
        decimals: Number(decodedState.decimals || 9),
        yieldBearingSource: Number(decodedState.yield_bearing_source || contractContext.slotMachineAppId),
        owner: decodedState.owner || ''
      };
    } catch (error) {
      console.error(`Error fetching YBT global state for contract ${contractId}:`, error);
      throw new Error(`Failed to fetch YBT contract state for ${contractContext.contract.name}`);
    }
  }

  /**
   * Get user shares for specific contract
   */
  async getUserShares(contractId: string, address: string): Promise<bigint> {
    const contractContext = this.getContractContext(contractId);
    if (!contractContext) {
      throw new Error(`Contract ${contractId} not found`);
    }

    try {
      // Create ulujs CONTRACT instance for read-only call
      const ci = new CONTRACT(
        contractContext.ybtAppId,
        this.algodClient,
        undefined,
        this.ybtABI,
        {
          addr: address,
          sk: new Uint8Array(0)
        }
      );

      const result = await ci.arc200_balanceOf(address);
      
      if (!result.success) {
        return BigInt(0);
      }

      return BigInt(result.returnValue || 0);
    } catch (error) {
      console.error(`Error fetching user shares for contract ${contractId}:`, error);
      return BigInt(0);
    }
  }

  /**
   * Get deposit cost for specific contract
   */
  async getDepositCost(contractId: string): Promise<bigint> {
    const contractContext = this.getContractContext(contractId);
    if (!contractContext) {
      throw new Error(`Contract ${contractId} not found`);
    }

    try {
      const context = await this.getWalletContext();
      if (!context) {
        throw new Error('No wallet connected');
      }

      const ci = new CONTRACT(
        contractContext.ybtAppId,
        this.algodClient,
        undefined,
        this.ybtABI,
        {
          addr: context.address,
          sk: new Uint8Array(0)
        }
      );

      const bal_result = await ci.arc200_balanceOf(context.address);
      if (!bal_result.success && bal_result.returnValue > BigInt(0)) {
        return BigInt(0);
      }

      const result = await ci.deposit_cost();
      
      if (!result.success) {
        throw new Error(`Deposit cost call failed: ${result.error || 'Unknown error'}`);
      }

      return BigInt(result.returnValue || 0);
    } catch (error) {
      console.error(`Error getting deposit cost for contract ${contractId}:`, error);
      throw new Error(`Failed to get deposit cost for ${contractContext.contract.name}`);
    }
  }

  /**
   * Deposit to specific contract
   */
  async deposit(params: YBTDepositParamsWithContract): Promise<YBTTransactionResultWithContract> {
    const contractContext = this.getContractContext(params.contractId);
    if (!contractContext) {
      throw new Error(`Contract ${params.contractId} not found`);
    }

    try {
      const context = await this.getWalletContext();
      if (!context) {
        throw new Error('No wallet connected');
      }

      const ci = new CONTRACT(
        contractContext.ybtAppId,
        this.algodClient,
        undefined,
        this.ybtABI,
        {
          addr: context.address,
          sk: new Uint8Array(0)
        }
      );

      ci.setPaymentAmount(Number(params.amount));
      ci.setFee(4000);

      const result = await ci.deposit();
      
      if (!result.success) {
        throw new Error(`Deposit failed: ${result.error || 'Unknown error'}`);
      }

      if (!result.txns || result.txns.length === 0) {
        throw new Error('No transactions generated by ulujs');
      }

      const sendResult = await this.signAndSendTransactions(result.txns, context);

      if (!sendResult || !sendResult.txId) {
        throw new Error('Transaction signing failed or was cancelled');
      }

      const txId = sendResult.txId;
      const sharesReceived = result.returnValue ? BigInt(result.returnValue) : BigInt(0);

      await this.waitForConfirmation(txId);
      this.refreshBalance();

      return {
        contractId: params.contractId,
        txId,
        sharesReceived,
        success: true
      };
    } catch (error) {
      console.error(`Error depositing to contract ${params.contractId}:`, error);
      return {
        contractId: params.contractId,
        txId: '',
        success: false,
        error: error instanceof Error ? error.message : `Deposit failed for ${contractContext.contract.name}`
      };
    }
  }

  /**
   * Withdraw from specific contract
   */
  async withdraw(params: YBTWithdrawParamsWithContract): Promise<YBTTransactionResultWithContract> {
    const contractContext = this.getContractContext(params.contractId);
    if (!contractContext) {
      throw new Error(`Contract ${params.contractId} not found`);
    }

    try {
      const context = await this.getWalletContext();
      if (!context) {
        throw new Error('No wallet connected');
      }

      const ci = new CONTRACT(
        contractContext.ybtAppId,
        this.algodClient,
        undefined,
        this.ybtABI,
        {
          addr: context.address,
          sk: new Uint8Array(0)
        }
      );

      ci.setFee(7000);

      const result = await ci.withdraw(BigInt(params.shares));
      
      if (!result.success) {
        throw new Error(`Withdrawal failed: ${result.error || 'Unknown error'}`);
      }

      if (!result.txns || result.txns.length === 0) {
        throw new Error('No transactions generated by ulujs');
      }

      const sendResult = await this.signAndSendTransactions(result.txns, context);

      if (!sendResult || !sendResult.txId) {
        throw new Error('Transaction signing failed or was cancelled');
      }

      const txId = sendResult.txId;
      const amountWithdrawn = result.returnValue ? BigInt(result.returnValue) : BigInt(0);

      await this.waitForConfirmation(txId);
      this.refreshBalance();

      return {
        contractId: params.contractId,
        txId,
        amountWithdrawn,
        success: true
      };
    } catch (error) {
      console.error(`Error withdrawing from contract ${params.contractId}:`, error);
      return {
        contractId: params.contractId,
        txId: '',
        success: false,
        error: error instanceof Error ? error.message : `Withdrawal failed for ${contractContext.contract.name}`
      };
    }
  }

  /**
   * Calculate share percentage (same as original)
   */
  calculateSharePercentage(userShares: bigint, totalSupply: bigint): number {
    try {
      let userSharesBigInt: bigint;
      let totalSupplyBigInt: bigint;
      
      if (typeof userShares === 'bigint') {
        userSharesBigInt = userShares;
      } else if (typeof userShares === 'number') {
        userSharesBigInt = BigInt(userShares);
      } else if (typeof userShares === 'string' && /^\d+$/.test(userShares)) {
        userSharesBigInt = BigInt(userShares);
      } else {
        console.warn('Invalid userShares value:', userShares);
        userSharesBigInt = 0n;
      }
      
      if (typeof totalSupply === 'bigint') {
        totalSupplyBigInt = totalSupply;
      } else if (typeof totalSupply === 'number') {
        totalSupplyBigInt = BigInt(totalSupply);
      } else if (typeof totalSupply === 'string' && /^\d+$/.test(totalSupply)) {
        totalSupplyBigInt = BigInt(totalSupply);
      } else {
        console.warn('Invalid totalSupply value:', totalSupply);
        totalSupplyBigInt = 0n;
      }

      if (totalSupplyBigInt === 0n) return 0;
      return Number((userSharesBigInt * 10000n) / totalSupplyBigInt) / 100;
    } catch (error) {
      console.error('Error calculating share percentage:', error, { userShares, totalSupply });
      return 0;
    }
  }

  /**
   * Format shares (same as original)
   */
  formatShares(shares: bigint, decimals: number): string {
    const divisor = BigInt(10 ** decimals);
    const wholePart = shares / divisor;
    const fractionalPart = shares % divisor;
    
    if (fractionalPart === BigInt(0)) {
      return wholePart.toString();
    }
    
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmedFractional = fractionalStr.replace(/0+$/, '');
    
    return `${wholePart}.${trimmedFractional}`;
  }

  /**
   * Get application escrow address (same as original)
   */
  getApplicationEscrowAddress(appId: number): string {
    try {
      return algosdk.getApplicationAddress(appId);
    } catch (error) {
      console.error('Error getting application escrow address:', error);
      return '';
    }
  }

  /**
   * Get escrow VOI balance (same as original)
   */
  async getEscrowVoiBalance(appId: number): Promise<bigint> {
    try {
      const escrowAddress = this.getApplicationEscrowAddress(appId);
      if (!escrowAddress) {
        return BigInt(0);
      }

      const accountInfo = await this.algodClient.accountInformation(escrowAddress).do();
      return BigInt((accountInfo.amount - accountInfo['min-balance']) || 0);
    } catch (error) {
      console.error('Error fetching escrow VOI balance:', error);
      return BigInt(0);
    }
  }

  /**
   * Get contract total value for specific contract
   */
  async getContractTotalValue(contractId: string): Promise<bigint> {
    const contractContext = this.getContractContext(contractId);
    if (!contractContext) {
      throw new Error(`Contract ${contractId} not found`);
    }

    try {
      const globalState = await this.getGlobalState(contractId);
      if (!globalState.yieldBearingSource || globalState.yieldBearingSource === 0) {
        return BigInt(0);
      }

      // Use the contract's authoritative balance tracking
      const { algorandService } = await import('./algorand');
      const balances = await algorandService.getBalances({
        appId: globalState.yieldBearingSource,
        debug: false
      });

      return BigInt(Math.round(balances.balanceTotal * 1e6));
    } catch (error) {
      console.error(`Error getting contract total value for ${contractId}:`, error);
      // Fallback to escrow balance
      try {
        return await this.getEscrowVoiBalance(contractContext.slotMachineAppId);
      } catch (fallbackError) {
        console.error('Error with fallback method:', fallbackError);
        return BigInt(0);
      }
    }
  }

  /**
   * Calculate user portfolio value for specific contract
   */
  calculateUserPortfolioValue(userShares: bigint, totalSupply: bigint, contractValue: bigint): bigint {
    try {
      if (totalSupply === BigInt(0)) {
        return BigInt(0);
      }
      
      return (userShares * contractValue) / totalSupply;
    } catch (error) {
      console.error('Error calculating user portfolio value:', error);
      return BigInt(0);
    }
  }

  /**
   * Validate staking amount (same as original)
   */
  validateStakingAmount(amount: bigint, balance: bigint): { valid: boolean; error?: string } {
    const reserveAmount = BigInt(BETTING_CONSTANTS.STAKING_RESERVE_AMOUNT);
    
    if (balance <= reserveAmount) {
      return {
        valid: false,
        error: `Insufficient balance. You need at least ${(Number(reserveAmount) / 1_000_000).toFixed(6)} VOI in your wallet.`
      };
    }
    
    const maxStakeAmount = balance - reserveAmount;
    
    if (amount > maxStakeAmount) {
      return {
        valid: false,
        error: `Amount exceeds available balance. Maximum stakeable: ${(Number(maxStakeAmount) / 1_000_000).toFixed(6)} VOI (keeping 1 VOI for transaction fees).`
      };
    }
    
    if (amount <= BigInt(0)) {
      return {
        valid: false,
        error: 'Stake amount must be greater than 0.'
      };
    }
    
    return { valid: true };
  }

  /**
   * Get all contracts user has positions in
   */
  async getUserContractPositions(address: string): Promise<Array<{
    contractId: string;
    shares: bigint;
    globalState: YBTGlobalStateWithContract;
    portfolioValue: bigint;
  }>> {
    const contracts = contractRegistry.getAllContracts();
    const positions = [];

    for (const contract of contracts) {
      try {
        const shares = await this.getUserShares(contract.id, address);
        if (shares > 0) {
          const globalState = await this.getGlobalState(contract.id);
          const contractValue = await this.getContractTotalValue(contract.id);
          const portfolioValue = this.calculateUserPortfolioValue(
            shares, 
            globalState.totalSupply, 
            contractValue
          );

          positions.push({
            contractId: contract.id,
            shares,
            globalState,
            portfolioValue
          });
        }
      } catch (error) {
        console.error(`Error getting position for contract ${contract.id}:`, error);
        // Continue with other contracts
      }
    }

    return positions;
  }

  /**
   * Get aggregated portfolio value across all contracts
   */
  async getAggregatedPortfolioValue(address: string): Promise<bigint> {
    const positions = await this.getUserContractPositions(address);
    return positions.reduce((total, pos) => total + pos.portfolioValue, BigInt(0));
  }
}

// Create singleton instance
export const multiContractYBTService = new MultiContractYBTService();