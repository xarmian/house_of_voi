import { algorandService } from './algorand';
import { browser } from '$app/environment';

export interface BalanceChangeEvent {
  previousBalance: number;
  newBalance: number;
  delta: number;
  timestamp: number;
}

export interface BalanceChangeEventDetail extends BalanceChangeEvent {
  isIncrease: boolean;
  isSignificant: boolean; // > 1 VOI
}

export interface BalanceData {
  address: string;
  balance: number;
  lastUpdated: number;
}

class BalanceManager {
  private balanceCache = new Map<string, BalanceData>();
  private refreshInterval: NodeJS.Timeout | null = null;
  private activeRequests = new Map<string, Promise<number>>();
  private balanceChangeListeners: ((event: BalanceChangeEventDetail) => void)[] = [];
  private balanceHistory: BalanceChangeEvent[] = [];
  private activeAddresses = new Set<string>();
  
  // Configuration
  private readonly REFRESH_INTERVAL = 5000; // 5 seconds as requested
  private readonly MIN_REQUEST_INTERVAL = 500; // Minimum 500ms between requests for same address
  private readonly CACHE_EXPIRE_TIME = 4000; // 4 seconds cache expiry (less than refresh interval)

  /**
   * Start monitoring balance for an address
   */
  startMonitoring(address: string): void {
    if (!address || !browser) return;
    
    // Check if already monitoring this address
    if (this.activeAddresses.has(address)) {
      return;
    }
    
    this.activeAddresses.add(address);
    
    // Initial balance fetch
    this.getBalance(address);
    
    // Start refresh interval if not already running
    this.startRefreshInterval();
  }

  /**
   * Stop monitoring balance for an address
   */
  stopMonitoring(address: string): void {
    if (!address) return;
    
    if (!this.activeAddresses.has(address)) {
      console.log(`BalanceManager: Address ${address} was not being monitored`);
      return;
    }
    
    console.log(`BalanceManager: Stopping monitoring for ${address} (remaining addresses: ${this.activeAddresses.size - 1})`);
    this.activeAddresses.delete(address);
    this.balanceCache.delete(address);
    this.activeRequests.delete(address);
    
    // Stop refresh interval if no addresses are being monitored
    if (this.activeAddresses.size === 0) {
      console.log('BalanceManager: No more addresses to monitor, stopping refresh interval');
      this.stopRefreshInterval();
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
   * Fetch balance from blockchain and update cache
   */
  private async fetchBalanceFromBlockchain(address: string): Promise<number> {
    try {
      const newBalance = await algorandService.getBalance(address);
      const now = Date.now();
      
      // Get previous balance for change detection
      const previousData = this.balanceCache.get(address);
      const previousBalance = previousData?.balance || 0;
      
      // Update cache
      this.balanceCache.set(address, {
        address,
        balance: newBalance,
        lastUpdated: now
      });
      
      // Emit balance change event if balance actually changed
      if (previousBalance !== newBalance) {
        const delta = newBalance - previousBalance;
        console.log(`BalanceManager: Balance change detected for ${address}: ${delta > 0 ? '+' : ''}${delta} microVOI (${(delta / 1000000).toFixed(6)} VOI)`);
        
        const changeEvent: BalanceChangeEvent = {
          previousBalance,
          newBalance,
          delta,
          timestamp: now
        };
        
        this.emitBalanceChange(changeEvent);
      }
      
      return newBalance;
    } catch (error) {
      console.error(`BalanceManager: Error fetching balance for ${address}:`, error);
      
      // Return cached balance if available, otherwise 0
      const cached = this.balanceCache.get(address);
      return cached?.balance || 0;
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
   * Start the refresh interval
   */
  private startRefreshInterval(): void {
    if (this.refreshInterval || !browser) return;
    
    console.log(`BalanceManager: Starting refresh interval (${this.REFRESH_INTERVAL}ms)`);
    
    this.refreshInterval = setInterval(async () => {
      // Refresh balances for all monitored addresses
      const addresses = Array.from(this.activeAddresses);
      
      
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
    }, this.REFRESH_INTERVAL);
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
   * Clear all data and stop monitoring
   */
  reset(): void {
    console.log('BalanceManager: Resetting');
    this.stopRefreshInterval();
    this.activeAddresses.clear();
    this.balanceCache.clear();
    this.activeRequests.clear();
    this.balanceHistory = [];
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
      refreshInterval: this.REFRESH_INTERVAL
    };
  }
}

// Export singleton instance
export const balanceManager = new BalanceManager();