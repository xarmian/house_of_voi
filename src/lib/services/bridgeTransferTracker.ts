import { algorandBridgeMonitor, type AlgorandTransaction } from './algorandBridgeMonitor';
import { balanceManager } from './balanceManager';
import type { BalanceChangeEventDetail } from './balanceManager';
import { algorandService } from './algorand';

export type BridgeTransferState = 'waiting' | 'detected' | 'bridging' | 'completed' | 'failed' | 'timeout';

export interface BridgeTransfer {
  id: string;
  voiAddress: string;
  expectedAmount: number; // Amount expected to receive in Voi (after bridge fee)
  state: BridgeTransferState;
  createdAt: number;
  algorandTx?: AlgorandTransaction;
  voiTxId?: string;
  voiAmount?: number;
  error?: string;
  timeoutAt: number; // Timestamp when transfer should timeout
}

export interface BridgeTransferEvents {
  'transfer-updated': BridgeTransfer;
  'transfer-completed': BridgeTransfer;
  'transfer-failed': BridgeTransfer;
  'transfer-timeout': BridgeTransfer;
}

export class BridgeTransferTracker {
  private transfers = new Map<string, BridgeTransfer>();
  private eventListeners = new Map<keyof BridgeTransferEvents, Set<Function>>();
  private balanceUnsubscribers = new Map<string, () => void>();
  private timeoutHandlers = new Map<string, NodeJS.Timeout>();
  
  // Default timeout: 15 minutes
  private readonly TRANSFER_TIMEOUT = 15 * 60 * 1000;

  constructor() {
    // Listen for Algorand transactions
    algorandBridgeMonitor.on('transaction-detected', (algorandTx) => {
      this.handleAlgorandTransaction(algorandTx);
    });
  }

  /**
   * Add event listener for transfer events
   */
  on<K extends keyof BridgeTransferEvents>(
    event: K,
    callback: (data: BridgeTransferEvents[K]) => void
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof BridgeTransferEvents>(
    event: K,
    callback: (data: BridgeTransferEvents[K]) => void
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emit event to all listeners
   */
  private emit<K extends keyof BridgeTransferEvents>(
    event: K,
    data: BridgeTransferEvents[K]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in bridge transfer event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Start tracking a new bridge transfer
   */
  startTransfer(voiAddress: string, expectedAmount: number): string {
    const transferId = this.generateTransferId();
    const now = Date.now();
    
    const transfer: BridgeTransfer = {
      id: transferId,
      voiAddress,
      expectedAmount,
      state: 'waiting',
      createdAt: now,
      timeoutAt: now + this.TRANSFER_TIMEOUT
    };

    this.transfers.set(transferId, transfer);
    
    // Set up timeout handler
    const timeoutHandler = setTimeout(() => {
      this.handleTransferTimeout(transferId);
    }, this.TRANSFER_TIMEOUT);
    
    this.timeoutHandlers.set(transferId, timeoutHandler);
    
    // Start monitoring for this address if not already monitoring
    const monitorStatus = algorandBridgeMonitor.getStatus();
    if (!monitorStatus.isMonitoring || monitorStatus.voiAddress !== voiAddress) {
      algorandBridgeMonitor.startMonitoring(voiAddress);
    }

    console.log(`🚀 Started bridge transfer tracking: ${transferId}`, transfer);
    this.emit('transfer-updated', transfer);
    
    return transferId;
  }

  /**
   * Handle detected Algorand transaction
   */
  private handleAlgorandTransaction(algorandTx: AlgorandTransaction): void {
    // Find transfers waiting for this Voi address
    const waitingTransfers = Array.from(this.transfers.values()).filter(
      t => t.state === 'waiting' && t.voiAddress === algorandTx.sender // Note: this logic may need adjustment
    );

    // For now, match to the most recent waiting transfer for any address
    // In a real implementation, you'd parse the note to get the destination address
    const waitingTransfer = Array.from(this.transfers.values()).find(
      t => t.state === 'waiting'
    );

    if (!waitingTransfer) {
      console.log('No waiting transfers found for Algorand transaction:', algorandTx.txId);
      return;
    }

    // Update transfer with Algorand transaction details
    waitingTransfer.algorandTx = algorandTx;
    waitingTransfer.state = 'detected';
    
    console.log(`✅ Algorand transaction detected for transfer ${waitingTransfer.id}:`, algorandTx);
    
    // STOP monitoring Algorand now that we detected the transaction
    algorandBridgeMonitor.stopMonitoring();
    console.log('🛑 Stopped monitoring Algorand bridge address');
    
    this.emit('transfer-updated', waitingTransfer);
    
    // Start monitoring Voi gaming wallet balance for completion
    this.startVoiBalanceMonitoring(waitingTransfer.id);
    
    // Transition to bridging state
    setTimeout(() => {
      if (waitingTransfer.state === 'detected') {
        waitingTransfer.state = 'bridging';
        this.emit('transfer-updated', waitingTransfer);
      }
    }, 2000); // Wait 2 seconds before showing bridging state
  }

  /**
   * Start monitoring Voi gaming wallet balance for transfer completion
   */
  private startVoiBalanceMonitoring(transferId: string): void {
    const transfer = this.transfers.get(transferId);
    if (!transfer) return;

    console.log(`👁️ Starting Voi gaming wallet balance monitoring for transfer ${transferId}`);

    // Subscribe to balance changes for this address
    const unsubscribe = balanceManager.onBalanceChange(
      (event: BalanceChangeEventDetail) => {
        this.handleVoiBalanceChange(transferId, event);
      }
    );
    
    this.balanceUnsubscribers.set(transferId, unsubscribe);
    
    // Start monitoring the Voi gaming wallet if not already
    balanceManager.startMonitoring(transfer.voiAddress, { context: 'gaming' });
  }

  /**
   * Handle Voi balance change
   */
  private handleVoiBalanceChange(transferId: string, event: BalanceChangeEventDetail): void {
    const transfer = this.transfers.get(transferId);
    if (!transfer || (transfer.state !== 'bridging' && transfer.state !== 'detected')) {
      return;
    }

    console.log(`🔍 Checking balance change for transfer ${transferId}:`, {
      eventDelta: event.delta,
      eventAddress: event.address,
      transferAddress: transfer.voiAddress,
      expectedAmount: transfer.expectedAmount,
      transferState: transfer.state
    });

    // Check if this balance change could be from our bridge transfer
    if (event.delta > 0 && event.address === transfer.voiAddress) {
      const changeInMicroVoi = event.delta; // delta is already in microVOI
      
      // Allow for some tolerance in amount matching (bridge fees, etc.)
      const tolerance = 0.01; // 1% tolerance for safety
      const expectedMin = transfer.expectedAmount * (1 - tolerance);
      const expectedMax = transfer.expectedAmount * (1 + tolerance);
      
      console.log(`💰 Balance change match check:`, {
        changeInMicroVoi,
        expectedMin,
        expectedMax,
        matches: changeInMicroVoi >= expectedMin && changeInMicroVoi <= expectedMax
      });
      
      if (changeInMicroVoi >= expectedMin && changeInMicroVoi <= expectedMax) {
        // This looks like our bridge transfer completed
        transfer.state = 'completed';
        transfer.voiAmount = changeInMicroVoi;
        
        // Look up the Voi transaction ID from indexer
        this.lookupVoiTransaction(transferId, changeInMicroVoi, event.timestamp);
        
        console.log(`🎉 Bridge transfer completed: ${transferId}`, transfer);
        this.cleanupTransfer(transferId);
        this.emit('transfer-completed', transfer);
        this.emit('transfer-updated', transfer);
      }
    }
  }

  /**
   * Look up Voi transaction details from the indexer
   */
  private async lookupVoiTransaction(transferId: string, amount: number, timestamp: number): Promise<void> {
    const transfer = this.transfers.get(transferId);
    if (!transfer) return;

    try {
      console.log(`🔍 Looking up Voi transaction for transfer ${transferId}`, {
        amount,
        timestamp,
        address: transfer.voiAddress
      });
      
      // We need to use the Voi indexer, not Algorand indexer
      // For now, let's use a simpler approach - search recent transactions to the address
      const voiIndexerUrl = 'https://mainnet-idx.voi.nodely.dev'; // Voi indexer URL
      
      // Search for recent transactions to the gaming wallet
      const searchUrl = `${voiIndexerUrl}/v2/transactions?address=${transfer.voiAddress}&address-role=receiver&limit=20`;
      
      console.log(`🌐 Querying Voi indexer: ${searchUrl}`);
      
      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.transactions && data.transactions.length > 0) {
        // Find transaction with matching amount around the timestamp
        const timestampSeconds = Math.floor(timestamp / 1000);
        
        const matchingTx = data.transactions.find((tx: any) => {
          // Check if this is a payment transaction
          if (tx['payment-transaction']) {
            const txAmount = tx['payment-transaction'].amount;
            const txTimestamp = tx['round-time'];
            
            // Check amount match with tolerance
            const tolerance = amount * 0.01; // 1% tolerance
            const amountMatch = Math.abs(txAmount - amount) <= tolerance;
            
            // Check timestamp match (within 5 minutes)
            const timeMatch = Math.abs(txTimestamp - timestampSeconds) <= 300;
            
            console.log(`🔍 Checking transaction ${tx.id}:`, {
              txAmount,
              expectedAmount: amount,
              amountMatch,
              txTimestamp,
              expectedTimestamp: timestampSeconds,
              timeMatch
            });
            
            return amountMatch && timeMatch;
          }
          return false;
        });

        if (matchingTx) {
          transfer.voiTxId = matchingTx.id;
          console.log(`✅ Found matching Voi transaction: ${matchingTx.id}`);
          this.emit('transfer-updated', transfer);
        } else {
          console.log('⚠️ No matching Voi transaction found');
          transfer.voiTxId = 'not-found';
          this.emit('transfer-updated', transfer);
        }
      } else {
        console.log('⚠️ No transactions found for address');
        transfer.voiTxId = 'not-found';
        this.emit('transfer-updated', transfer);
      }
    } catch (error) {
      console.error('❌ Error looking up Voi transaction:', error);
      transfer.voiTxId = 'lookup-failed';
      this.emit('transfer-updated', transfer);
    }
  }

  /**
   * Handle transfer timeout
   */
  private handleTransferTimeout(transferId: string): void {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.state === 'completed') {
      return;
    }

    transfer.state = 'timeout';
    transfer.error = 'Transfer timed out after 15 minutes';
    
    console.log(`⏰ Bridge transfer timed out: ${transferId}`);
    this.cleanupTransfer(transferId);
    this.emit('transfer-timeout', transfer);
    this.emit('transfer-updated', transfer);
  }

  /**
   * Clean up transfer resources
   */
  private cleanupTransfer(transferId: string): void {
    // Clear timeout handler
    const timeoutHandler = this.timeoutHandlers.get(transferId);
    if (timeoutHandler) {
      clearTimeout(timeoutHandler);
      this.timeoutHandlers.delete(transferId);
    }

    // Unsubscribe from balance changes
    const unsubscribe = this.balanceUnsubscribers.get(transferId);
    if (unsubscribe) {
      unsubscribe();
      this.balanceUnsubscribers.delete(transferId);
    }
  }

  /**
   * Get transfer by ID
   */
  getTransfer(transferId: string): BridgeTransfer | null {
    return this.transfers.get(transferId) || null;
  }

  /**
   * Get all transfers for a Voi address
   */
  getTransfersForAddress(voiAddress: string): BridgeTransfer[] {
    return Array.from(this.transfers.values()).filter(t => t.voiAddress === voiAddress);
  }

  /**
   * Cancel a transfer
   */
  cancelTransfer(transferId: string): void {
    const transfer = this.transfers.get(transferId);
    if (!transfer) return;

    if (transfer.state === 'completed') {
      console.warn('Cannot cancel completed transfer');
      return;
    }

    transfer.state = 'failed';
    transfer.error = 'Transfer cancelled by user';
    
    this.cleanupTransfer(transferId);
    this.emit('transfer-failed', transfer);
    this.emit('transfer-updated', transfer);
  }

  /**
   * Clean up all transfers and stop monitoring
   */
  cleanup(): void {
    // Clear all timeouts
    this.timeoutHandlers.forEach(handler => clearTimeout(handler));
    this.timeoutHandlers.clear();

    // Unsubscribe from all balance changes
    this.balanceUnsubscribers.forEach(unsubscribe => unsubscribe());
    this.balanceUnsubscribers.clear();

    // Clear transfers
    this.transfers.clear();

    // Stop Algorand monitoring
    algorandBridgeMonitor.stopMonitoring();
  }

  /**
   * Generate unique transfer ID
   */
  private generateTransferId(): string {
    return `bridge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Create singleton instance
export const bridgeTransferTracker = new BridgeTransferTracker();