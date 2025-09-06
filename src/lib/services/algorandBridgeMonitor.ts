import algosdk from 'algosdk';
import { ARAMID_CONFIG } from '$lib/constants/aramid';
import { isNoteForAddress } from '$lib/utils/aramidNote';
import { createEventDispatcher } from 'svelte';

export interface AlgorandTransaction {
  txId: string;
  amount: number;
  round: number;
  timestamp: number;
  sender: string;
  note?: string;
}

export interface BridgeMonitorEvents {
  'transaction-detected': AlgorandTransaction;
  'monitoring-error': { error: string; timestamp: number };
  'monitoring-started': { voiAddress: string };
  'monitoring-stopped': void;
}

export class AlgorandBridgeMonitor {
  private indexer: algosdk.Indexer;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private lastCheckedRound = 0;
  private currentVoiAddress = '';
  private eventListeners = new Map<keyof BridgeMonitorEvents, Set<Function>>();

  constructor() {
    this.indexer = new algosdk.Indexer(
      '', // No token needed for public endpoints
      ARAMID_CONFIG.algorandIndexer,
      443
    );
  }

  /**
   * Add event listener for monitoring events
   */
  on<K extends keyof BridgeMonitorEvents>(
    event: K,
    callback: (data: BridgeMonitorEvents[K]) => void
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof BridgeMonitorEvents>(
    event: K,
    callback: (data: BridgeMonitorEvents[K]) => void
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emit event to all listeners
   */
  private emit<K extends keyof BridgeMonitorEvents>(
    event: K,
    data: BridgeMonitorEvents[K]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in bridge monitor event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Start monitoring Algorand for transactions to the bridge
   */
  async startMonitoring(voiAddress: string, pollInterval = 5000): Promise<void> {
    if (this.isMonitoring) {
      console.warn('Bridge monitor is already running');
      return;
    }

    this.currentVoiAddress = voiAddress;
    this.isMonitoring = true;
    
    // Get current round to start monitoring from
    try {
      const status = await this.indexer.makeHealthCheck().do();
      this.lastCheckedRound = status.round || 0;
    } catch (error) {
      console.warn('Could not get current round, starting from 0:', error);
      this.lastCheckedRound = 0;
    }

    console.log(`🔍 Starting Algorand bridge monitoring for address: ${voiAddress}`);
    this.emit('monitoring-started', { voiAddress });

    // Start polling
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkForTransactions();
      } catch (error) {
        console.error('Error during bridge monitoring:', error);
        this.emit('monitoring-error', {
          error: error instanceof Error ? error.message : 'Unknown monitoring error',
          timestamp: Date.now()
        });
      }
    }, pollInterval);

    // Do initial check
    await this.checkForTransactions();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    console.log('⏹️ Stopping Algorand bridge monitoring');
    this.isMonitoring = false;
    this.currentVoiAddress = '';
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.emit('monitoring-stopped', undefined);
  }

  /**
   * Check for new transactions to the bridge address
   */
  private async checkForTransactions(): Promise<void> {
    if (!this.isMonitoring || !this.currentVoiAddress) {
      return;
    }

    try {
      // Search for asset transfer transactions to the bridge address
      const response = await this.indexer
        .searchForTransactions()
        .address(ARAMID_CONFIG.bridgeAddress)
        .addressRole('receiver')
        .assetID(ARAMID_CONFIG.aVoiAssetId)
        .minRound(this.lastCheckedRound)
        .limit(100) // Check up to 100 transactions
        .do();

      if (response.transactions && response.transactions.length > 0) {
        console.log(`📝 Found ${response.transactions.length} transactions to bridge`);

        for (const tx of response.transactions) {
          // Update last checked round
          if (tx['confirmed-round'] > this.lastCheckedRound) {
            this.lastCheckedRound = tx['confirmed-round'];
          }

          // Check if this transaction has a note for our Voi address
          if (tx.note && isNoteForAddress(tx.note, this.currentVoiAddress)) {
            const algorandTx: AlgorandTransaction = {
              txId: tx.id,
              amount: tx['asset-transfer-transaction']?.amount || 0,
              round: tx['confirmed-round'],
              timestamp: tx['round-time'] * 1000, // Convert to milliseconds
              sender: tx.sender,
              note: tx.note
            };

            console.log('🎯 Found matching bridge transaction:', algorandTx);
            this.emit('transaction-detected', algorandTx);
          }
        }
      } else {
        // Update last checked round even if no transactions found
        try {
          const status = await this.indexer.makeHealthCheck().do();
          if (status.round && status.round > this.lastCheckedRound) {
            this.lastCheckedRound = status.round;
          }
        } catch (error) {
          // Ignore health check errors
        }
      }
    } catch (error) {
      throw new Error(`Failed to check for bridge transactions: ${error}`);
    }
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isMonitoring: boolean;
    voiAddress: string;
    lastCheckedRound: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      voiAddress: this.currentVoiAddress,
      lastCheckedRound: this.lastCheckedRound
    };
  }

  /**
   * Manually check for a specific transaction
   */
  async getTransactionDetails(txId: string): Promise<AlgorandTransaction | null> {
    try {
      const response = await this.indexer.lookupTransactionByID(txId).do();
      const tx = response.transaction;

      if (!tx) {
        return null;
      }

      return {
        txId: tx.id,
        amount: tx['asset-transfer-transaction']?.amount || 0,
        round: tx['confirmed-round'],
        timestamp: tx['round-time'] * 1000,
        sender: tx.sender,
        note: tx.note
      };
    } catch (error) {
      console.error('Failed to get transaction details:', error);
      return null;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopMonitoring();
    this.eventListeners.clear();
  }
}

// Create singleton instance
export const algorandBridgeMonitor = new AlgorandBridgeMonitor();