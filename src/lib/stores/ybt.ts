import { writable, derived, get } from 'svelte/store';
import { walletAddress } from './walletAdapter';
import { selectedWallet } from 'avm-wallet-svelte';
import { walletStore, walletAddress as gamingWalletAddress } from './wallet';
import { ybtService } from '$lib/services/ybt';
import type { YBTState, YBTGlobalState } from '$lib/types/ybt';
import { browser } from '$app/environment';

function createYBTStore() {
  const { subscribe, set, update } = writable<YBTState>({
    userShares: BigInt(0),
    totalSupply: BigInt(0),
    sharePercentage: 0,
    isLoading: false,
    error: null,
    lastUpdated: null
  });

  let refreshInterval: NodeJS.Timeout | null = null;
  let isRefreshing = false;
  let refreshPromise: Promise<void> | null = null;

  const startAutoRefresh = () => {
    // Auto refresh disabled - only refresh on manual actions or wallet changes
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = null;
  };

  const stopAutoRefresh = () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  };

  const refreshData = async (address?: string) => {
    if (!browser) return;
    
    // Prevent concurrent refreshes
    if (isRefreshing) {
      return refreshPromise; // Return existing refresh promise
    }

    // If no address provided, get it from the unified YBT service context
    if (!address) {
      try {
        // Use a private method to get current wallet context
        const context = await ybtService.getWalletContext();
        if (!context) return;
        address = context.address;
      } catch (error) {
        console.error('Failed to get wallet context:', error);
        return;
      }
    }

    if (!address) return;

    isRefreshing = true;
    
    refreshPromise = (async () => {
      const currentState = get({ subscribe });
      
      // Only set loading if not already loading to prevent unnecessary updates
      if (!currentState.isLoading) {
        update(state => ({ ...state, isLoading: true, error: null }));
      }

      try {
        // Fetch global state and user shares in parallel
        const [globalState, userShares] = await Promise.all([
          ybtService.getGlobalState(),
          ybtService.getUserShares(address!)
        ]);

        const sharePercentage = ybtService.calculateSharePercentage(userShares, globalState.totalSupply);
        
        // Only update if data actually changed (state diffing)
        const hasChanges = (
          userShares !== currentState.userShares ||
          globalState.totalSupply !== currentState.totalSupply ||
          Math.abs(sharePercentage - currentState.sharePercentage) > 0.0001 // Small threshold for floating point comparison
        );
        
        if (hasChanges || currentState.isLoading || currentState.error) {
          update(state => ({
            ...state,
            userShares,
            totalSupply: globalState.totalSupply,
            sharePercentage,
            isLoading: false,
            error: null,
            lastUpdated: Date.now()
          }));
        } else {
          // Just clear loading state if no data changes
          update(state => ({
            ...state,
            isLoading: false,
            error: null,
            lastUpdated: Date.now()
          }));
        }
      } catch (error) {
        console.error('Error refreshing YBT data:', error);
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to refresh YBT data'
        }));
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    })();
    
    return refreshPromise;
  };
  
  // Helper function to get current state
  function get<T>(store: { subscribe: (fn: (value: T) => void) => () => void }): T {
    let value: T;
    store.subscribe((v) => value = v)();
    return value!;
  }

  let currentAddress = '';
  let thirdPartyWalletSubscription: (() => void) | null = null;
  let gamingWalletSubscription: (() => void) | null = null;

  let addressChangeTimer: NodeJS.Timeout | null = null;
  
  const handleAddressChange = (address: string | null, source: string) => {
    // Debounce address changes to prevent rapid fire updates
    if (addressChangeTimer) {
      clearTimeout(addressChangeTimer);
    }
    
    addressChangeTimer = setTimeout(() => {
      actualAddressChange(address, source);
      addressChangeTimer = null;
    }, 500); // Longer debounce to prevent flickering
  };
  
  const actualAddressChange = (address: string | null, source: string) => {
    // Get the current active wallet context to determine which address to use
    ybtService.getWalletContext().then(context => {
      const activeAddress = context?.address || null;
      
      // Only refresh if the active address actually changed
      if (activeAddress !== currentAddress) {
        currentAddress = activeAddress || '';
        
        if (activeAddress) {
          refreshData(activeAddress);
          // No auto refresh - only refresh on wallet change
        } else {
          stopAutoRefresh();
          // Only reset state if not currently loading to prevent interruption
          if (!isRefreshing) {
            set({
              userShares: BigInt(0),
              totalSupply: BigInt(0),
              sharePercentage: 0,
              isLoading: false,
              error: null,
              lastUpdated: null
            });
          }
        }
      }
    }).catch(error => {
      console.error('Error handling address change:', error);
    });
  };

  // Subscribe to both wallet changes to refresh YBT data
  if (browser) {
    // Clean up existing subscriptions
    if (thirdPartyWalletSubscription) {
      thirdPartyWalletSubscription();
    }
    if (gamingWalletSubscription) {
      gamingWalletSubscription();
    }
    
    // Subscribe to third-party wallet changes
    thirdPartyWalletSubscription = walletAddress.subscribe((address) => {
      handleAddressChange(address, 'third-party');
    });
    
    // Subscribe to gaming wallet changes
    gamingWalletSubscription = gamingWalletAddress.subscribe((address) => {
      handleAddressChange(address, 'gaming');
    });
  }

  return {
    subscribe,

    async refresh() {
      // Use current wallet context instead of just third-party wallet
      const context = await ybtService.getWalletContext();
      if (context) {
        // Force update current address tracking to ensure refresh happens
        currentAddress = context.address;
        return await refreshData(context.address);
      } else {
        // Reset state when no wallet context is available
        currentAddress = '';
        // Only reset if not currently loading
        const currentState = get({ subscribe });
        if (!currentState.isLoading) {
          set({
            userShares: BigInt(0),
            totalSupply: BigInt(0),
            sharePercentage: 0,
            isLoading: false,
            error: null,
            lastUpdated: null
          });
        }
      }
    },

    async initialize() {
      if (!browser) return;
      
      // Use current wallet context instead of just third-party wallet
      const context = await ybtService.getWalletContext();
      if (context) {
        await refreshData(context.address);
        // No auto refresh - only refresh on initialization
      }
    },

    clearError() {
      update(state => ({ ...state, error: null }));
    },

    reset() {
      stopAutoRefresh();
      isRefreshing = false;
      refreshPromise = null;
      currentAddress = '';
      
      // Clear address change timer
      if (addressChangeTimer) {
        clearTimeout(addressChangeTimer);
        addressChangeTimer = null;
      }
      
      set({
        userShares: BigInt(0),
        totalSupply: BigInt(0),
        sharePercentage: 0,
        isLoading: false,
        error: null,
        lastUpdated: null
      });
    }
  };
}

export const ybtStore = createYBTStore();

// Derived stores for convenience
export const userShares = derived(
  ybtStore,
  $ybt => $ybt.userShares
);

export const sharePercentage = derived(
  ybtStore,
  $ybt => $ybt.sharePercentage
);

export const totalSupply = derived(
  ybtStore,
  $ybt => $ybt.totalSupply
);

export const isYBTLoading = derived(
  ybtStore,
  $ybt => $ybt.isLoading
);

