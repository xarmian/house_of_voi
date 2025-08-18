import algosdk from 'algosdk';
import * as algokit from '@algorandfoundation/algokit-utils';
import { YieldBearingTokenClient } from '../../clients/YieldBearingTokenClient.js';
import { NETWORK_CONFIG, CONTRACT_CONFIG } from '$lib/constants/network';
import type { WalletAccount } from '$lib/types/wallet';
import type { 
  YBTGlobalState, 
  YBTTransactionResult, 
  YBTDepositParams, 
  YBTWithdrawParams 
} from '$lib/types/ybt';

class YBTService {
  private algodClient: algosdk.Algodv2;
  private ybtClient: YieldBearingTokenClient | null = null;

  constructor() {
    // Initialize Algorand client
    this.algodClient = new algosdk.Algodv2(
      NETWORK_CONFIG.token,
      NETWORK_CONFIG.nodeUrl,
      NETWORK_CONFIG.port
    );
  }

  private async getYBTClient(): Promise<YieldBearingTokenClient> {
    if (!this.ybtClient) {
      this.ybtClient = new YieldBearingTokenClient(
        {
          resolveBy: 'id',
          id: CONTRACT_CONFIG.ybtAppId,
        },
        this.algodClient
      );
    }

    return this.ybtClient;
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
          decodedState[key] = new TextDecoder().decode(valueBytes);
        } else if (item.value.type === 2) {
          // Uint
          decodedState[key] = BigInt(item.value.uint);
        }
      }

      return {
        totalSupply: decodedState.totalSupply || BigInt(0),
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
      const client = await this.getYBTClient();
      const appInfo = await this.algodClient.getApplicationByID(CONTRACT_CONFIG.ybtAppId).do();
      
      // Check if user has opted into the app
      const accountInfo = await this.algodClient.accountInformation(address).do();
      const appLocalState = accountInfo['apps-local-state']?.find(
        (app: any) => app.id === CONTRACT_CONFIG.ybtAppId
      );

      if (!appLocalState) {
        return BigInt(0);
      }

      // Decode local state to get user's shares
      const localState = appLocalState['key-value'] || [];
      let shares = BigInt(0);
      
      for (const item of localState) {
        const key = Buffer.from(item.key, 'base64').toString();
        if (key === 'balance' && item.value.type === 2) {
          shares = BigInt(item.value.uint);
          break;
        }
      }

      return shares;
    } catch (error) {
      console.error('Error fetching user shares:', error);
      return BigInt(0);
    }
  }

  async getDepositCost(): Promise<bigint> {
    try {
      const client = await this.getYBTClient();
      const result = await client.depositCost({});
      return BigInt(result.return || 0);
    } catch (error) {
      console.error('Error getting deposit cost:', error);
      throw new Error('Failed to get deposit cost');
    }
  }

  async deposit(account: WalletAccount, params: YBTDepositParams): Promise<YBTTransactionResult> {
    try {
      const client = await this.getYBTClient();
      const accountKey = algosdk.mnemonicToSecretKey(account.mnemonic);
      
      // Check if user is opted into the app
      const accountInfo = await this.algodClient.accountInformation(account.address).do();
      const isOptedIn = accountInfo['apps-local-state']?.some(
        (app: any) => app.id === CONTRACT_CONFIG.ybtAppId
      );

      let optInTxn = null;
      if (!isOptedIn) {
        // Create opt-in transaction
        const suggestedParams = await this.algodClient.getTransactionParams().do();
        optInTxn = algosdk.makeApplicationOptInTxnFromObject({
          from: account.address,
          appIndex: CONTRACT_CONFIG.ybtAppId,
          suggestedParams
        });
      }

      // Get deposit cost
      const depositCost = await this.getDepositCost();

      // Create deposit call
      const depositResult = await client.deposit(
        {},
        {
          sender: {
            addr: account.address,
            signer: (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => {
              return Promise.resolve(
                indexesToSign.map(i => algosdk.signTransaction(txnGroup[i], accountKey.sk).blob)
              );
            }
          },
          ...(optInTxn && { extraTxns: [optInTxn] })
        }
      );

      return {
        txId: depositResult.transaction.txID(),
        sharesReceived: BigInt(depositResult.return || 0),
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

  async withdraw(account: WalletAccount, params: YBTWithdrawParams): Promise<YBTTransactionResult> {
    try {
      const client = await this.getYBTClient();
      const accountKey = algosdk.mnemonicToSecretKey(account.mnemonic);
      
      const withdrawResult = await client.withdraw(
        {
          amount: params.shares
        },
        {
          sender: {
            addr: account.address,
            signer: (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => {
              return Promise.resolve(
                indexesToSign.map(i => algosdk.signTransaction(txnGroup[i], accountKey.sk).blob)
              );
            }
          }
        }
      );

      return {
        txId: withdrawResult.transaction.txID(),
        amountWithdrawn: BigInt(withdrawResult.return || 0),
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
    if (totalSupply === BigInt(0)) return 0;
    return Number((userShares * BigInt(10000)) / totalSupply) / 100; // Calculate percentage with 2 decimal places
  }

  formatShares(shares: bigint, decimals: number = 9): string {
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
}

export const ybtService = new YBTService();