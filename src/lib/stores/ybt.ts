import { writable, derived, get } from 'svelte/store';
import { walletAddress } from './walletAdapter';
import { selectedWallet } from 'avm-wallet-svelte';
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

  const startAutoRefresh = () => {
    if (refreshInterval) clearInterval(refreshInterval);
    
    refreshInterval = setInterval(() => {
      // Only refresh if we have a connected wallet
      const currentWallet = get(selectedWallet);
      if (currentWallet && currentWallet.address) {
        refreshData(currentWallet.address);
      }
    }, 60000); // Refresh every 60 seconds
  };

  const stopAutoRefresh = () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  };

  const refreshData = async (address?: string) => {
    if (!browser || !address) return;

    update(state => ({ ...state, isLoading: true, error: null }));

    try {
      // Fetch global state and user shares in parallel
      const [globalState, userShares] = await Promise.all([
        ybtService.getGlobalState(),
        ybtService.getUserShares(address)
      ]);

      const sharePercentage = ybtService.calculateSharePercentage(userShares, globalState.totalSupply);

      update(state => ({
        ...state,
        userShares,
        totalSupply: globalState.totalSupply,
        sharePercentage,
        isLoading: false,
        error: null,
        lastUpdated: Date.now()
      }));
    } catch (error) {
      console.error('Error refreshing YBT data:', error);
      update(state => ({
        ...state,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh YBT data'
      }));
    }
  };

  let currentAddress = '';
  let addressSubscription: (() => void) | null = null;

  // Subscribe to wallet changes to refresh YBT data
  if (browser) {
    if (addressSubscription) {
      addressSubscription();
    }
    
    addressSubscription = walletAddress.subscribe((address) => {
      // Only refresh if address actually changed
      if (address !== currentAddress) {
        currentAddress = address || '';
        
        if (address) {
          refreshData(address);
          startAutoRefresh();
        } else {
          stopAutoRefresh();
          // Reset state when wallet disconnects
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
    });
  }

  return {
    subscribe,

    async refresh() {
      const currentWallet = get(selectedWallet);
      if (currentWallet) {
        await refreshData(currentWallet.address);
      }
    },

    async initialize() {
      if (!browser) return;
      
      const currentWallet = get(selectedWallet);
      if (currentWallet) {
        await refreshData(currentWallet.address);
        startAutoRefresh();
      }
    },

    clearError() {
      update(state => ({ ...state, error: null }));
    },

    reset() {
      stopAutoRefresh();
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

