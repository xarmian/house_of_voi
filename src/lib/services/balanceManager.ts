import { algorandService } from './algorand';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { queueStore } from '$lib/stores/queue';

export interface BalanceChangeEvent {
  address: string;
  previousBalance: number;
  newBalance: number;
  delta: number;
  timestamp: number;
}

export interface BalanceChangeEventDetail extends BalanceChangeEvent {
  isIncrease: boolean;
  isSignificant: boolean; // > 1 VOI
}

export interface BalanceMonitoringContext {
  contexts: Set<'gaming' | 'house'>;
  startedAt: number;
}

export interface BalanceMonitoringOptions {
  context?: 'gaming' | 'house';
}

export interface BalanceData {
  address: string;
  balance: number;
  lastUpdated: number;
}

export interface PendingTransaction {
  transactionId: string;
  address: string;
  amount: number;
  timestamp: number;
  type: 'deduction' | 'addition';
}

class BalanceManager {
  private balanceCache = new Map<string, BalanceData>();
  private refreshInterval: NodeJS.Timeout | null = null;
  private activeRequests = new Map<string, Promise<number>>();
  private balanceChangeListeners: ((event: BalanceChangeEventDetail) => void)[] = [];
  private balanceHistory: BalanceChangeEvent[] = [];
  private activeAddresses = new Map<string, BalanceMonitoringContext>();
  private currentRefreshInterval = 5000; // Default to gaming interval
  
  // Track pending transactions to prevent balance polling from overwriting optimistic updates
  private pendingTransactions = new Map<string, PendingTransaction>();
  
  
  // Configuration
  private readonly GAMING_REFRESH_INTERVAL = 10000; // 10 seconds for gaming
  private readonly HOUSE_REFRESH_INTERVAL = 60000; // 60 seconds for house page
  private readonly MIN_REQUEST_INTERVAL = 500; // Minimum 500ms between requests for same address
  private readonly CACHE_EXPIRE_TIME = 4000; // 4 seconds cache expiry

  /**
   * Start monitoring balance for an address
   */
  startMonitoring(address: string, options: BalanceMonitoringOptions = {}): void {
    if (!address || !browser) return;
    
    const context = options.context || 'gaming';
    
    // Check if already monitoring this address
    if (this.activeAddresses.has(address)) {
      // Add context to existing monitoring
      const existing = this.activeAddresses.get(address)!;
      existing.contexts.add(context);
      this.updateRefreshInterval();
      return;
    }
    
    this.activeAddresses.set(address, { 
      contexts: new Set([context]), 
      startedAt: Date.now() 
    });
    
    // Initial balance fetch
    this.getBalance(address);
    
    // Start or update refresh interval
    this.updateRefreshInterval();
  }

  /**
   * Stop monitoring balance for an address
   */
  stopMonitoring(address: string, context?: 'gaming' | 'house'): void {
    if (!address) return;
    
    if (!this.activeAddresses.has(address)) {
      console.log(`BalanceManager: Address ${address} was not being monitored`);
      return;
    }
    
    const contextInfo = this.activeAddresses.get(address)!;
    
    if (context) {
      // Remove specific context
      contextInfo.contexts.delete(context);
      
      // If no contexts remain, remove the address entirely
      if (contextInfo.contexts.size === 0) {
        console.log(`BalanceManager: Stopping all monitoring for ${address} (remaining addresses: ${this.activeAddresses.size - 1})`);
        this.activeAddresses.delete(address);
        this.balanceCache.delete(address);
        this.activeRequests.delete(address);
      } else {
        console.log(`BalanceManager: Removed ${context} context for ${address} (${contextInfo.contexts.size} contexts remaining)`);
      }
    } else {
      // Remove all contexts (legacy behavior)
      console.log(`BalanceManager: Stopping all monitoring for ${address} (remaining addresses: ${this.activeAddresses.size - 1})`);
      this.activeAddresses.delete(address);
      this.balanceCache.delete(address);
      this.activeRequests.delete(address);
    }
    
    // Update refresh interval based on remaining contexts
    if (this.activeAddresses.size === 0) {
      this.stopRefreshInterval();
      console.log('BalanceManager: No more addresses to monitor, stopping refresh interval');
    } else {
      this.updateRefreshInterval();
    }
  }

  /**
   * Get balance for an address with caching and deduplication
   */
  async getBalance(address: string, forceRefresh = false): Promise<number> {
    if (!address || !algorandService) {
      return 0;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = this.balanceCache.get(address);
      const now = Date.now();
      
      if (cached) {
        const timeSinceUpdate = now - cached.lastUpdated;
        
        if (timeSinceUpdate < this.CACHE_EXPIRE_TIME) {
          return cached.balance;
        }
        
        // Check if request is too recent
        if (timeSinceUpdate < this.MIN_REQUEST_INTERVAL) {
          return cached.balance;
        }
      }
    }

    // Check if request is already in progress
    const existingRequest = this.activeRequests.get(address);
    if (existingRequest) {
      return existingRequest;
    }

    // Create new request
    const request = this.fetchBalanceFromBlockchain(address);
    this.activeRequests.set(address, request);

    try {
      const balance = await request;
      return balance;
    } finally {
      this.activeRequests.delete(address);
    }
  }

  /**
   * Check if there are active spins that should block balance polling
   */
  private shouldBlockPolling(): boolean {
    // Import queue store to check for active spins
    try {
      const queue = get(queueStore);

      // Only block polling while transactions are being constructed/submitted locally.
      // Do NOT block during 'waiting' (on-chain) so we can observe confirmed debits promptly.
      const blockingSpins = queue.spins.filter((spin: any) =>
        ['pending', 'submitting'].includes(spin.status)
      );

      const wasBlocked = this.refreshInterval === null;
      const shouldBlock = blockingSpins.length > 0;

      if (shouldBlock) {
        console.log(`⏸️ Temporarily pausing balance polling - ${blockingSpins.length} spin(s) submitting`);
      } else if (wasBlocked && !shouldBlock) {
        console.log(`▶️ Resuming balance polling`);
        setTimeout(() => this.updateRefreshInterval(), 100);
      }

      return shouldBlock;
    } catch {
      // If we can't check, don't block
    }

    return false;
  }

  /**
   * Fetch balance from blockchain and update cache
   */
  private async fetchBalanceFromBlockchain(address: string): Promise<number> {
    // Allow fetching during 'waiting' so we can reflect confirmed debits/credits promptly.
    // We still briefly pause during 'pending'/'submitting' via shouldBlockPolling() at the interval level.
    try {
      const blockchainBalance = await algorandService.getBalance(address);
      const now = Date.now();
      
      // Get previous balance for change detection
      const previousData = this.balanceCache.get(address);
      const previousBalance = previousData?.balance || 0;
      
      // No pending transactions - safe to update normally
      this.balanceCache.set(address, {
        address,
        balance: blockchainBalance,
        lastUpdated: now
      });
      
      // Emit balance change event if balance actually changed
      if (previousBalance !== blockchainBalance) {
        const delta = blockchainBalance - previousBalance;
        console.log(`BalanceManager: Balance change detected for ${address}: ${delta > 0 ? '+' : ''}${delta} microVOI (${(delta / 1000000).toFixed(6)} VOI)`);
        
        // If this is a deduction, release matching reserved funds BEFORE emitting the balance change
        if (delta < 0) {
          this.releaseReservedForDeductions(address, Math.abs(delta));
        } else if (delta > 0) {
          // Clear any pending addition markers that correspond to the credit
          this.clearPendingAdditions(address, delta);
        }
        
        const changeEvent: BalanceChangeEvent = {
          address,
          previousBalance,
          newBalance: blockchainBalance,
          delta,
          timestamp: now
        };
        
        this.emitBalanceChange(changeEvent);
      }
      
      return blockchainBalance;
    } catch (error) {
      console.error(`BalanceManager: Error fetching balance for ${address}:`, error);
      
      // Return cached balance if available, otherwise 0
      const cached = this.balanceCache.get(address);
      return cached?.balance || 0;
    }
  }

  /**
   * Release reserved funds for spins whose pending txs have confirmed and produced a debit
   */
  private releaseReservedForDeductions(address: string, deductedAmount: number) {
    try {
      const pending = Array.from(this.pendingTransactions.values())
        .filter(tx => tx.address === address && tx.type === 'deduction')
        .sort((a, b) => a.timestamp - b.timestamp);

      if (pending.length === 0) {
        // Fallback heuristic: try to release based on queue estimates when no txs are tracked
        this.heuristicReserveRelease(address, deductedAmount);
        return;
      }

      const queue = get(queueStore);

      let released = 0;
      const tolerance = Math.max(10_000, Math.floor(deductedAmount * 0.05)); // 10k micro or 5%

      for (const tx of pending) {
        if (released >= deductedAmount - tolerance) break;

        // Find the spin by txId
        const spin = queue.spins.find((s: any) => s.txId === tx.transactionId || s.data?.txId === tx.transactionId);
        if (!spin) continue;

        // Release the bet amount reservation (display-oriented). Full fee effects are shown by the balance delta itself.
        const releaseAmount = spin.totalBet || tx.amount;
        console.log(`🎯 Confirmed debit for tx ${tx.transactionId.slice(-8)} - releasing ${(releaseAmount / 1_000_000).toFixed(6)} VOI bet reservation for spin ${spin.id.slice(-8)}`);
        queueStore.forceReleaseReservedFunds(spin.id);
        this.removePendingTransaction(tx.transactionId);
        released += releaseAmount;
      }

      // If we still haven't accounted for the whole deduction, try heuristic release to close the gap
      if (released < deductedAmount - tolerance) {
        this.heuristicReserveRelease(address, deductedAmount - released);
      }
    } catch (error) {
      console.error('Error releasing reserved funds for deductions:', error);
    }
  }

  /**
   * Heuristic release when we don't have exact tx linkage (best-effort)
   */
  private heuristicReserveRelease(address: string, amountToRelease: number) {
    try {
      const queue = get(queueStore);

      let remaining = amountToRelease;
      const tolerance = Math.max(10_000, Math.floor(amountToRelease * 0.05));

      // Release from the oldest reserved spins first (PENDING/SUBMITTING/WAITING)
      const candidates = queue.spins
        .filter((spin: any) => ['pending', 'submitting', 'waiting'].includes(spin.status))
        .sort((a: any, b: any) => a.timestamp - b.timestamp);

      for (const spin of candidates) {
        if (remaining <= tolerance) break;
        const betOnly = spin.totalBet || 0;
        if (!betOnly) continue;
        queueStore.forceReleaseReservedFunds(spin.id);
        remaining -= betOnly;
      }
    } catch (error) {
      console.error('Error in heuristic reserve release:', error);
    }
  }

  /**
   * Remove pending addition markers when a credit posts on-chain
   */
  private clearPendingAdditions(address: string, creditedAmount: number) {
    const additions = Array.from(this.pendingTransactions.values())
      .filter(tx => tx.address === address && tx.type === 'addition')
      .sort((a, b) => a.timestamp - b.timestamp);

    let cleared = 0;
    const tolerance = Math.max(10_000, Math.floor(creditedAmount * 0.05));

    for (const tx of additions) {
      if (cleared >= creditedAmount - tolerance) break;
      this.removePendingTransaction(tx.transactionId);
      cleared += tx.amount;
    }
  }

  /**
   * Emit balance change events to listeners
   */
  private emitBalanceChange(event: BalanceChangeEvent): void {
    const eventDetail: BalanceChangeEventDetail = {
      ...event,
      isIncrease: event.delta > 0,
      isSignificant: event.delta > 3_000_000 // > 1 VOI
    };
    
    // Add to history (keep last 50 changes)
    this.balanceHistory.push(event);
    if (this.balanceHistory.length > 50) {
      this.balanceHistory.shift();
    }
    
    // Notify listeners
    this.balanceChangeListeners.forEach(listener => {
      try {
        listener(eventDetail);
      } catch (error) {
        console.error('BalanceManager: Error in balance change listener:', error);
      }
    });
  }

  /**
   * Update refresh interval based on current monitoring contexts
   */
  private updateRefreshInterval(): void {
    // Only pause during short local submission phases; allow polling during 'waiting'.
    if (this.shouldBlockPolling()) {
      console.log(`⏹️ Stopping balance polling timer during submission`);
      this.stopRefreshInterval();
      return;
    }
    
    // Determine the fastest required refresh rate
    let fastestInterval = this.HOUSE_REFRESH_INTERVAL;
    
    for (const [address, contextInfo] of this.activeAddresses) {
      if (contextInfo.contexts.has('gaming')) {
        fastestInterval = this.GAMING_REFRESH_INTERVAL;
        break; // Gaming is fastest, no need to check further
      }
    }
    
    // Only restart interval if the rate changed
    if (this.currentRefreshInterval !== fastestInterval) {
      this.currentRefreshInterval = fastestInterval;
      this.stopRefreshInterval();
      this.startRefreshInterval();
    } else if (!this.refreshInterval) {
      this.startRefreshInterval();
    }
  }
  
  /**
   * Start the refresh interval
   */
  private startRefreshInterval(): void {
    if (this.refreshInterval || !browser) return;
    
    console.log(`BalanceManager: Starting refresh interval (${this.currentRefreshInterval}ms)`);
    
    this.refreshInterval = setInterval(async () => {
      // Refresh balances for all monitored addresses
      const addresses = Array.from(this.activeAddresses.keys());
      
      if (addresses.length === 0) {
        this.stopRefreshInterval();
        return;
      }
      
      // Refresh addresses in parallel but with some spacing to avoid overwhelming the API
      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        
        // Small delay between requests to spread load
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.getBalance(address).catch(error => {
          console.error('BalanceManager: Failed to refresh balance:', error);
        });
      }
    }, this.currentRefreshInterval);
  }

  /**
   * Stop the refresh interval
   */
  private stopRefreshInterval(): void {
    if (this.refreshInterval) {
      console.log('BalanceManager: Stopping refresh interval');
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    } else {
      console.log('BalanceManager: No refresh interval to stop');
    }
  }

  /**
   * Add a balance change listener
   */
  onBalanceChange(listener: (event: BalanceChangeEventDetail) => void): () => void {
    this.balanceChangeListeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.balanceChangeListeners.indexOf(listener);
      if (index > -1) {
        this.balanceChangeListeners.splice(index, 1);
      }
    };
  }

  /**
   * Get balance history
   */
  getBalanceHistory(): BalanceChangeEvent[] {
    return [...this.balanceHistory];
  }

  /**
   * Get recent balance increases
   */
  getRecentBalanceIncreases(limitToLast: number = 10): BalanceChangeEvent[] {
    return this.balanceHistory
      .filter(event => event.delta > 0)
      .slice(-limitToLast);
  }

  /**
   * Get cached balance without triggering a new request
   */
  getCachedBalance(address: string): number {
    const cached = this.balanceCache.get(address);
    return cached?.balance || 0;
  }

  /**
   * Track a pending transaction to prevent balance polling from overwriting optimistic updates
   */
  trackPendingTransaction(transactionId: string, amount: number, address: string, type: 'deduction' | 'addition' = 'deduction'): void {
    console.log(`📝 Tracking pending ${type}: ${transactionId.slice(-8)} for ${(amount / 1000000).toFixed(6)} VOI`);
    
    this.pendingTransactions.set(transactionId, {
      transactionId,
      address,
      amount,
      timestamp: Date.now(),
      type
    });

    // Clean up old pending transactions (older than 5 minutes)
    const cutoffTime = Date.now() - (5 * 60 * 1000);
    for (const [id, transaction] of this.pendingTransactions) {
      if (transaction.timestamp < cutoffTime) {
        console.log(`🧹 Cleaning up old pending transaction: ${id.slice(-8)}`);
        this.pendingTransactions.delete(id);
      }
    }
  }

  /**
   * Remove a pending transaction (when it's confirmed or failed)
   */
  removePendingTransaction(transactionId: string): void {
    if (this.pendingTransactions.has(transactionId)) {
      console.log(`✅ Removing pending transaction: ${transactionId.slice(-8)}`);
      this.pendingTransactions.delete(transactionId);
    }
  }

  /**
   * Check if there are pending transactions for an address
   */
  hasPendingTransactions(address: string): boolean {
    return Array.from(this.pendingTransactions.values()).some(tx => tx.address === address);
  }

  /**
   * Get total pending amount for an address
   */
  getPendingAmount(address: string): { deductions: number; additions: number } {
    let deductions = 0;
    let additions = 0;
    
    for (const transaction of this.pendingTransactions.values()) {
      if (transaction.address === address) {
        if (transaction.type === 'deduction') {
          deductions += transaction.amount;
        } else {
          additions += transaction.amount;
        }
      }
    }
    
    return { deductions, additions };
  }


  /**
   * Clear all data and stop monitoring
   */
  reset(): void {
    console.log('BalanceManager: Resetting');
    this.stopRefreshInterval();
    this.activeAddresses.clear();
    this.balanceCache.clear();
    this.activeRequests.clear();
    this.balanceHistory = [];
    this.pendingTransactions.clear();
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      activeAddresses: Array.from(this.activeAddresses),
      cachedAddresses: Array.from(this.balanceCache.keys()),
      activeRequests: Array.from(this.activeRequests.keys()),
      isRefreshActive: this.refreshInterval !== null,
      refreshInterval: this.currentRefreshInterval
    };
  }
}

// Export singleton instance
export const balanceManager = new BalanceManager();
