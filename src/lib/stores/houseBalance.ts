import { writable, derived, get } from 'svelte/store';
import { houseBalanceService, type HouseBalanceData } from '$lib/services/houseBalance';
import { formatVOI } from '$lib/constants/betting';

// Default house balance state
const defaultHouseBalance: HouseBalanceData = {
  available: 0,
  total: 0,
  locked: 0,
  isOperational: false,
  lastUpdated: 0
};

// Core house balance store
export const houseBalanceStore = writable<HouseBalanceData>(defaultHouseBalance);

// Loading state for balance operations
export const isLoadingHouseBalance = writable<boolean>(false);

// Error state for balance operations
export const houseBalanceError = writable<string | null>(null);

// Derived store for operational status
export const isSlotMachineOperational = derived(
  houseBalanceStore,
  ($houseBalance) => $houseBalance.isOperational
);

// Derived store for formatted balance display
export const formattedHouseBalance = derived(
  houseBalanceStore,
  ($houseBalance) => ({
    available: formatVOI($houseBalance.available),
    total: formatVOI($houseBalance.total),
    locked: formatVOI($houseBalance.locked)
  })
);

// Derived store for operational status message
export const operationalStatusMessage = derived(
  [houseBalanceStore, isLoadingHouseBalance],
  ([$houseBalance, $isLoading]) => {
    if ($isLoading) {
      return 'Checking operational status...';
    }
    
    if (!$houseBalance.isOperational) {
      const minRequired = formatVOI(houseBalanceService.getMinimumOperationalBalance());
      const current = formatVOI($houseBalance.available);
      return `Slot machine is temporarily out of service for maintenance. House balance is below minimum operational requirement. Please try again later.`;
    }
    
    return 'Slot machine is operational';
  }
);

// Derived store to check if balance data is stale (older than 5 minutes)
export const isBalanceDataStale = derived(
  houseBalanceStore,
  ($houseBalance) => {
    const fiveMinutes = 5 * 60 * 1000;
    return Date.now() - $houseBalance.lastUpdated > fiveMinutes;
  }
);

class HouseBalanceStoreManager {
  private refreshInterval: NodeJS.Timeout | null = null;
  private refreshIntervalMs = 60000; // 1 minute

  /**
   * Initialize the house balance store and start periodic updates
   */
  async initialize(): Promise<void> {
    await this.refreshBalance();
    this.startPeriodicRefresh();
  }

  /**
   * Refresh the house balance from the service
   */
  async refreshBalance(): Promise<void> {
    try {
      isLoadingHouseBalance.set(true);
      houseBalanceError.set(null);
      
      const balance = await houseBalanceService.refreshHouseBalance();
      houseBalanceStore.set(balance);
    } catch (error) {
      console.error('Failed to refresh house balance:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to check house balance';
      houseBalanceError.set(errorMessage);
    } finally {
      isLoadingHouseBalance.set(false);
    }
  }

  /**
   * Get current balance without triggering a refresh
   */
  async getCurrentBalance(): Promise<HouseBalanceData> {
    try {
      const balance = await houseBalanceService.getHouseBalance();
      houseBalanceStore.set(balance);
      return balance;
    } catch (error) {
      console.error('Failed to get current house balance:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to get house balance';
      houseBalanceError.set(errorMessage);
      return get(houseBalanceStore);
    }
  }

  /**
   * Check if the slot machine is operational
   */
  async checkOperationalStatus(): Promise<boolean> {
    const balance = await this.getCurrentBalance();
    return balance.isOperational;
  }

  /**
   * Start periodic refresh of house balance
   */
  private startPeriodicRefresh(): void {
    // Clear any existing interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // Set up new interval
    this.refreshInterval = setInterval(async () => {
      try {
        await this.getCurrentBalance(); // Use cached version for periodic updates
      } catch (error) {
        console.error('Periodic house balance refresh failed:', error);
      }
    }, this.refreshIntervalMs);
  }

  /**
   * Stop periodic refresh
   */
  stopPeriodicRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Force a fresh balance check (bypasses cache)
   */
  async forceRefresh(): Promise<void> {
    await this.refreshBalance();
  }

  /**
   * Reset the store to default state
   */
  reset(): void {
    houseBalanceStore.set(defaultHouseBalance);
    isLoadingHouseBalance.set(false);
    houseBalanceError.set(null);
    this.stopPeriodicRefresh();
  }
}

// Export singleton instance
export const houseBalanceManager = new HouseBalanceStoreManager();

// Export store actions for components
export const houseBalanceActions = {
  initialize: () => houseBalanceManager.initialize(),
  refresh: () => houseBalanceManager.refreshBalance(),
  forceRefresh: () => houseBalanceManager.forceRefresh(),
  checkOperational: () => houseBalanceManager.checkOperationalStatus(),
  reset: () => houseBalanceManager.reset()
};