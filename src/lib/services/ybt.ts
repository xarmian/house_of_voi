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
import { multiContractYBTService } from './ybtMultiContract';
import { contractSelectionStore, selectedContract } from '$lib/stores/multiContract';

// Wallet context types
export type WalletContextType = 'gaming' | 'third-party';

export interface WalletContext {
  type: WalletContextType;
  address: string;
  privateKey?: string; // Only for gaming wallets
}

// Import ybtStore for triggering balance refresh
// Note: Using dynamic import to avoid circular dependency
let ybtStore: any = null;

class YBTService {
  private algodClient: algosdk.Algodv2;
  private ybtClient: YieldBearingTokenClient | null = null;
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

    // Set the preferred wallet type on the multi-contract service
    multiContractYBTService.setPreferredWalletType(this.preferredWalletType);
  }

  /**
   * Get the currently selected contract ID
   */
  private getCurrentContractId(): string {
    const current = get(selectedContract);
    if (!current) {
      throw new Error('❌ No contract selected! YBT service requires a selected contract');
    }

    return current.id;
  }

  /**
   * Set preferred wallet type for operations
   */
  setPreferredWalletType(type: 'gaming' | 'third-party' | 'auto') {
    this.preferredWalletType = type;
    multiContractYBTService.setPreferredWalletType(type);
  }

  /**
   * Get wallet context from current wallet state
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
   * Sign and send transactions based on wallet context
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
   * Convert hex string to Uint8Array
   */
  private hexToUint8Array(hex: string): Uint8Array {
    return new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  }

  private async getYBTStore() {
    if (!ybtStore) {
      // Dynamic import to avoid circular dependency
      const module = await import('$lib/stores/ybt');
      ybtStore = module.ybtStore;
    }
    return ybtStore;
  }

  private async refreshBalance() {
    try {
      const store = await this.getYBTStore();
      await store.refresh();
    } catch (error) {
      // Silently handle refresh errors to not interfere with main operations
    }
  }

  private async waitForConfirmation(txId: string): Promise<void> {
    try {
      // Wait for transaction confirmation with timeout
      const maxAttempts = 10;
      const delayMs = 1000; // 1 second between attempts
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const txInfo = await this.algodClient.pendingTransactionInformation(txId).do();
          
          // Transaction is confirmed when it has a confirmed-round
          if (txInfo['confirmed-round'] && txInfo['confirmed-round'] > 0) {
            return;
          }
          
          // Wait before next attempt
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } catch (error) {
          // Transaction might not be found yet, continue waiting
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      
      // If we get here, transaction didn't confirm within timeout
      // Still refresh balance in case it confirms later
    } catch (error) {
      // Silently handle confirmation errors
    }
  }

  private async getYBTClient(): Promise<YieldBearingTokenClient> {
    if (!this.ybtClient) {
      const currentContract = get(selectedContract);
      if (!currentContract) {
        throw new Error('❌ No contract selected! Cannot create YBT client');
      }
      
      this.ybtClient = new YieldBearingTokenClient(
        {
          resolveBy: 'id',
          id: currentContract.ybtAppId,
          sender: {
            addr: get(selectedWallet)?.address || '',
            sk: new Uint8Array(0),
          }
        },
        this.algodClient
      );
    }

    return this.ybtClient;
  }

  private async getReadOnlyYBTClient(): Promise<YieldBearingTokenClient> {
    // Create a client without a sender for read-only operations
    const currentContract = get(selectedContract);
    if (!currentContract) {
      throw new Error('❌ No contract selected! Cannot create read-only YBT client');
    }
    
    return new YieldBearingTokenClient(
      {
        resolveBy: 'id',
        id: currentContract.ybtAppId,
      },
      this.algodClient
    );
  }

  async getGlobalState(contractId?: string): Promise<YBTGlobalState> {
    try {
      const targetContractId = contractId || this.getCurrentContractId();
      const globalStateWithContract = await multiContractYBTService.getGlobalState(targetContractId);
      
      // Convert to legacy format for backward compatibility
      return {
        totalSupply: globalStateWithContract.totalSupply,
        name: globalStateWithContract.name,
        symbol: globalStateWithContract.symbol,
        decimals: globalStateWithContract.decimals,
        yieldBearingSource: globalStateWithContract.yieldBearingSource,
        owner: globalStateWithContract.owner
      };
    } catch (error) {
      console.error('Error fetching YBT global state:', error);
      throw new Error('Failed to fetch YBT contract state');
    }
  }

  async getUserShares(address: string, contractId?: string): Promise<bigint> {
    try {
      const targetContractId = contractId || this.getCurrentContractId();
      return await multiContractYBTService.getUserShares(targetContractId, address);
    } catch (error) {
      console.error('Error fetching user shares:', error);
      return BigInt(0);
    }
  }

  async getDepositCost(contractId?: string): Promise<bigint> {
    try {
      const targetContractId = contractId || this.getCurrentContractId();
      return await multiContractYBTService.getDepositCost(targetContractId);
    } catch (error) {
      console.error('Error getting deposit cost:', error);
      throw new Error('Failed to get deposit cost');
    }
  }

  async deposit(params: YBTDepositParams, contractId?: string): Promise<YBTTransactionResult> {
    try {
      const targetContractId = contractId || this.getCurrentContractId();
      const result = await multiContractYBTService.deposit({
        ...params,
        contractId: targetContractId
      });
      
      // Convert from multi-contract format to legacy format
      return {
        txId: result.txId,
        sharesReceived: result.sharesReceived,
        success: result.success,
        error: result.error
      };
    } catch (error) {
      console.error('Error depositing to YBT:', error);
      return {
        txId: '',
        success: false,
        error: error instanceof Error ? error.message : 'Deposit failed'
      };
    }
  }

  async withdraw(params: YBTWithdrawParams, contractId?: string): Promise<YBTTransactionResult> {
    try {
      const targetContractId = contractId || this.getCurrentContractId();
      const result = await multiContractYBTService.withdraw({
        ...params,
        contractId: targetContractId
      });
      
      // Convert from multi-contract format to legacy format
      return {
        txId: result.txId,
        amountWithdrawn: result.amountWithdrawn,
        success: result.success,
        error: result.error
      };
    } catch (error) {
      console.error('Error withdrawing from YBT:', error);
      return {
        txId: '',
        success: false,
        error: error instanceof Error ? error.message : 'Withdrawal failed'
      };
    }
  }

  calculateSharePercentage(userShares: bigint, totalSupply: bigint): number {
    return multiContractYBTService.calculateSharePercentage(userShares, totalSupply);
  }

  formatShares(shares: bigint, decimals: number): string {
    return multiContractYBTService.formatShares(shares, decimals);
  }

  getApplicationEscrowAddress(appId: number): string {
    return multiContractYBTService.getApplicationEscrowAddress(appId);
  }

  async getEscrowVoiBalance(appId: number): Promise<bigint> {
    return await multiContractYBTService.getEscrowVoiBalance(appId);
  }

  async getContractTotalValue(contractId?: string): Promise<bigint> {
    try {
      const targetContractId = contractId || this.getCurrentContractId();
      return await multiContractYBTService.getContractTotalValue(targetContractId);
    } catch (error) {
      console.error('Error getting contract total value:', error);
      return BigInt(0);
    }
  }

  calculateUserPortfolioValue(userShares: bigint, totalSupply: bigint, contractValue: bigint): bigint {
    return multiContractYBTService.calculateUserPortfolioValue(userShares, totalSupply, contractValue);
  }

  /**
   * Validates a staking amount to ensure user keeps at least 1 VOI for transaction fees
   */
  validateStakingAmount(amount: bigint, balance: bigint): { valid: boolean; error?: string } {
    return multiContractYBTService.validateStakingAmount(amount, balance);
  }
}

export const ybtService = new YBTService();