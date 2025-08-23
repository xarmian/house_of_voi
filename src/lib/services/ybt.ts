import algosdk from 'algosdk';
import * as algokit from '@algorandfoundation/algokit-utils';
import { YieldBearingTokenClient, APP_SPEC as YBTAppSpec } from '../../clients/YieldBearingTokenClient.js';
import { CONTRACT } from 'ulujs';
import { NETWORK_CONFIG, CONTRACT_CONFIG } from '$lib/constants/network';
import { selectedWallet, signAndSendTransactions, signTransactions } from 'avm-wallet-svelte';
import { get } from 'svelte/store';
import type { WalletAccount } from '$lib/types/wallet';
import type { 
  YBTGlobalState, 
  YBTTransactionResult, 
  YBTDepositParams, 
  YBTWithdrawParams 
} from '$lib/types/ybt';

// Import ybtStore for triggering balance refresh
// Note: Using dynamic import to avoid circular dependency
let ybtStore: any = null;

class YBTService {
  private algodClient: algosdk.Algodv2;
  private ybtClient: YieldBearingTokenClient | null = null;
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
      this.ybtClient = new YieldBearingTokenClient(
        {
          resolveBy: 'id',
          id: CONTRACT_CONFIG.ybtAppId,
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
    return new YieldBearingTokenClient(
      {
        resolveBy: 'id',
        id: CONTRACT_CONFIG.ybtAppId,
      },
      this.algodClient
    );
  }

  async getGlobalState(): Promise<YBTGlobalState> {
    try {
      const client = await this.getYBTClient();
      const appInfo = await this.algodClient.getApplicationByID(CONTRACT_CONFIG.ybtAppId).do();
      
      const globalState = appInfo.params['global-state'] || [];
      const decodedState: any = {};
      
      // Decode global state
      for (const item of globalState) {
        const keyBytes = new Uint8Array(atob(item.key).split('').map(c => c.charCodeAt(0)));
        const key = new TextDecoder().decode(keyBytes);
        if (item.value.type === 1) {
          // Bytes
          const valueBytes = new Uint8Array(atob(item.value.bytes).split('').map(c => c.charCodeAt(0)));
          
          // Special handling for totalSupply - it's stored as bytes but should be interpreted as uint64
          if (key === 'totalSupply') {
            if (valueBytes.length <= 8) {
              // Pad to 8 bytes if needed (big-endian, so pad at the beginning)
              const paddedBytes = new Uint8Array(8);
              paddedBytes.set(valueBytes, 8 - valueBytes.length);
              
              const dataView = new DataView(paddedBytes.buffer);
              const value = dataView.getBigUint64(0, false); // false = big-endian
              decodedState[key] = value;
            } else {
              decodedState[key] = BigInt(0);
            }
          } else {
            // Regular string decoding for other byte fields
            try {
              const value = new TextDecoder().decode(valueBytes);
              decodedState[key] = value;
            } catch (decodeError) {
              // If string decoding fails, store as hex
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
        totalSupply,
        name: decodedState.name || 'Submarine Gaming Token',
        symbol: decodedState.symbol || 'GAME',
        decimals: Number(decodedState.decimals || 9),
        yieldBearingSource: Number(decodedState.yield_bearing_source || 0),
        owner: decodedState.owner || ''
      };
    } catch (error) {
      console.error('Error fetching YBT global state:', error);
      throw new Error('Failed to fetch YBT contract state');
    }
  }

  async getUserShares(address: string): Promise<bigint> {
    try {
      // Create ulujs CONTRACT instance for read-only call
      const ci = new CONTRACT(
        CONTRACT_CONFIG.ybtAppId,
        this.algodClient,
        undefined, // No indexer needed for read-only calls
        this.ybtABI,
        {
          addr: address,
          sk: new Uint8Array(0) // Empty key for read-only operations
        }
      );

      // Call arc200_balanceOf method
      const result = await ci.arc200_balanceOf(address);
      
      if (!result.success) {
        return BigInt(0);
      }

      return BigInt(result.returnValue || 0);
    } catch (error) {
      console.error('Error fetching user shares:', error);
      return BigInt(0);
    }
  }

  async getDepositCost(): Promise<bigint> {
    try {
      const wallet = get(selectedWallet);
      if (!wallet) {
        throw new Error('No wallet connected');
      }

      // Create ulujs CONTRACT instance for read-only call
      const ci = new CONTRACT(
        CONTRACT_CONFIG.ybtAppId,
        this.algodClient,
        undefined, // No indexer needed for read-only calls
        this.ybtABI,
        {
          addr: wallet.address,
          sk: new Uint8Array(0) // Empty key for read-only operations
        }
      );

      // Call deposit_cost method - this should be a read-only call
      const result = await ci.deposit_cost();
      console.log('deposit_cost result:', result);
      
      if (!result.success) {
        throw new Error(`Deposit cost call failed: ${result.error || 'Unknown error'}`);
      }

      return BigInt(result.returnValue || 0);
    } catch (error) {
      console.error('Error getting deposit cost:', error);
      throw new Error('Failed to get deposit cost');
    }
  }

  async deposit(params: YBTDepositParams): Promise<YBTTransactionResult> {
    try {
      const wallet = get(selectedWallet);
      if (!wallet) {
        throw new Error('No wallet connected');
      }

      // Create ulujs CONTRACT instance for deposit
      const ci = new CONTRACT(
        CONTRACT_CONFIG.ybtAppId,
        this.algodClient,
        undefined,
        this.ybtABI,
        {
          addr: wallet.address,
          sk: new Uint8Array(0) // Will be signed by wallet
        }
      );

      // Set payment amount for the deposit
      ci.setPaymentAmount(Number(params.amount));
      
      // Set fee to cover the app call and inner payment transaction
      // Base fee (2000) + inner transaction fee (2000) = 4000 microAlgos
      ci.setFee(4000);

      // Call deposit method using ulujs (this generates unsigned transactions)
      const result = await ci.deposit();
      
      if (!result.success) {
        throw new Error(`Deposit failed: ${result.error || 'Unknown error'}`);
      }

      // Extract unsigned transactions from ulujs result
      if (!result.txns || result.txns.length === 0) {
        throw new Error('No transactions generated by ulujs');
      }

      // Decode the unsigned transactions using the same method as algorand service
      const decodedTxns = result.txns.map((txnBlob: string) => {
        // Convert base64 string to Uint8Array (browser-compatible)
        const binaryString = atob(txnBlob);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      }).map((txnBytes: Uint8Array) => {
        // Decode the unsigned transaction
        return algosdk.decodeUnsignedTransaction(txnBytes);
      });
      
      // Send decoded transactions to wallet for signing and submission
      const signedTxns = await signTransactions([decodedTxns]);

      // Send signed transactions to node for submission
      const sendResult = await this.algodClient.sendRawTransaction(signedTxns).do();

      if (!sendResult || !sendResult.txId) {
        throw new Error('Transaction signing failed or was cancelled');
      }

      // Extract transaction information from signed result
      const txId = sendResult.txId;
      const sharesReceived = result.returnValue ? BigInt(result.returnValue) : BigInt(0);

      // Wait for transaction confirmation before refreshing balance
      await this.waitForConfirmation(txId);
      this.refreshBalance();

      return {
        txId,
        sharesReceived,
        success: true
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

  async withdraw(params: YBTWithdrawParams): Promise<YBTTransactionResult> {
    try {
      const wallet = get(selectedWallet);
      if (!wallet) {
        throw new Error('No wallet connected');
      }

      // Create ulujs CONTRACT instance for withdrawal
      const ci = new CONTRACT(
        CONTRACT_CONFIG.ybtAppId,
        this.algodClient,
        undefined,
        this.ybtABI,
        {
          addr: wallet.address,
          sk: new Uint8Array(0) // Will be signed by wallet
        }
      );

      // Set fee to cover the app call and inner payment transaction
      // Withdrawals might need higher fee due to complex inner transactions
      // Base fee (2000) + inner payment fee (2000) + buffer (2000) = 6000 microAlgos
      ci.setFee(7000);

      // Call withdraw method using ulujs with shares parameter (this generates unsigned transactions)
      const result = await ci.withdraw(BigInt(params.shares));
      
      if (!result.success) {
        throw new Error(`Withdrawal failed: ${result.error || 'Unknown error'}`);
      }

      // Extract unsigned transactions from ulujs result
      if (!result.txns || result.txns.length === 0) {
        throw new Error('No transactions generated by ulujs');
      }

      // Decode the unsigned transactions using the same method as deposit
      const decodedTxns = result.txns.map((txnBlob: string) => {
        // Convert base64 string to Uint8Array (browser-compatible)
        const binaryString = atob(txnBlob);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      }).map((txnBytes: Uint8Array) => {
        // Decode the unsigned transaction
        return algosdk.decodeUnsignedTransaction(txnBytes);
      });

      // Send decoded transactions to wallet for signing and submission
      const signedTxns = await signTransactions([decodedTxns]);

      // Send signed transactions to node for submission
      const sendResult = await this.algodClient.sendRawTransaction(signedTxns).do();

      if (!sendResult || !sendResult.txId) {
        throw new Error('Transaction signing failed or was cancelled');
      }

      // Extract transaction information from signed result
      const txId = sendResult.txId;
      const amountWithdrawn = result.returnValue ? BigInt(result.returnValue) : BigInt(0);

      // Wait for transaction confirmation before refreshing balance
      await this.waitForConfirmation(txId);
      this.refreshBalance();

      return {
        txId,
        amountWithdrawn,
        success: true
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
    try {
      // Ensure both parameters are BigInt with better validation
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

  getApplicationEscrowAddress(appId: number): string {
    try {
      // Convert app ID to escrow account address using algosdk
      return algosdk.getApplicationAddress(appId);
    } catch (error) {
      console.error('Error getting application escrow address:', error);
      return '';
    }
  }

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

  async getContractTotalValue(): Promise<bigint> {
    try {
      const globalState = await this.getGlobalState();
      if (!globalState.yieldBearingSource || globalState.yieldBearingSource === 0) {
        return BigInt(0);
      }

      return await this.getEscrowVoiBalance(globalState.yieldBearingSource);
    } catch (error) {
      console.error('Error getting contract total value:', error);
      return BigInt(0);
    }
  }

  calculateUserPortfolioValue(userShares: bigint, totalSupply: bigint, contractValue: bigint): bigint {
    try {
      if (totalSupply === BigInt(0)) {
        return BigInt(0);
      }
      
      // Calculate user's share of the total contract value
      return (userShares * contractValue) / totalSupply;
    } catch (error) {
      console.error('Error calculating user portfolio value:', error);
      return BigInt(0);
    }
  }
}

export const ybtService = new YBTService();