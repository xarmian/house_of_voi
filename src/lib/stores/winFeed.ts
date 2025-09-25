/**
 * Win Feed Store
 * Manages state for win feed system and integrates with winFeedService
 */

import { writable, derived, get } from 'svelte/store';
import { winFeedService, type WinEvent } from '$lib/services/winFeedService';
import { feedPreferences } from './preferences';
import { toastStore } from './toast';
import { walletStore } from './wallet';
import { browser } from '$app/environment';
import { PUBLIC_DEBUG_MODE } from '$env/static/public';
import { BLOCKCHAIN_CONFIG } from '$lib/constants/network';
import { formatVOI } from '$lib/constants/betting';
import { ensureBase32TxId } from '$lib/utils/transactionUtils';
import { nameResolutionService } from '$lib/services/nameResolution';

export interface WinFeedState {
  isActive: boolean;
  isConnected: boolean;
  recentWins: WinEvent[];
  totalWinsShown: number;
  lastActivityTime: Date | null;
  connectionError: string | null;
}

const initialState: WinFeedState = {
  isActive: false,
  isConnected: false,
  recentWins: [],
  totalWinsShown: 0,
  lastActivityTime: null,
  connectionError: null
};

function createWinFeedStore() {
  const { subscribe, set, update } = writable<WinFeedState>(initialState);
  let unsubscribeWinEvents: (() => void) | null = null;
  let unsubscribePreferences: (() => void) | null = null;
  let initializationPromise: Promise<void> | null = null;

  const store = {
    subscribe,

    /**
     * Initialize the win feed system
     */
    async initialize(): Promise<void> {
      if (initializationPromise) return initializationPromise;
      if (!browser) return;

      initializationPromise = this._initialize();
      return initializationPromise;
    },

    async _initialize(): Promise<void> {
      try {
        // Subscribe to preference changes
        unsubscribePreferences = feedPreferences.subscribe(async (prefs) => {
          if (prefs.enabled && !get({ subscribe }).isActive) {
            await this.start();
          } else if (!prefs.enabled && get({ subscribe }).isActive) {
            this.stop();
          }
        });

        // Check if feed should be active based on current preferences
        const currentPrefs = get(feedPreferences);
        if (currentPrefs.enabled) {
          await this.start();
        }

        if (PUBLIC_DEBUG_MODE === 'true') {
          console.log('✅ Win Feed Store initialized');
        }
      } catch (error) {
        console.error('Failed to initialize Win Feed Store:', error);
        update(state => ({
          ...state,
          connectionError: error instanceof Error ? error.message : 'Initialization failed'
        }));
      }
    },

    /**
     * Start the win feed
     */
    async start(): Promise<void> {
      if (get({ subscribe }).isActive) return;

      try {
        update(state => ({
          ...state,
          isActive: true,
          connectionError: null
        }));

        // Initialize the win feed service
        await winFeedService.initialize();

        // Subscribe to win events
        unsubscribeWinEvents = winFeedService.onWinEvent((winEvent) => {
          // Handle async name resolution without blocking
          this.handleWinEvent(winEvent).catch(error => {
            console.error('Failed to handle win event:', error);
          });
        });

        update(state => ({
          ...state,
          isConnected: true,
          lastActivityTime: new Date()
        }));

        if (PUBLIC_DEBUG_MODE === 'true') {
          console.log('Win feed started');
        }
      } catch (error) {
        console.error('Failed to start win feed:', error);
        update(state => ({
          ...state,
          isActive: false,
          connectionError: error instanceof Error ? error.message : 'Failed to start'
        }));
      }
    },

    /**
     * Stop the win feed
     */
    stop(): void {
      if (unsubscribeWinEvents) {
        unsubscribeWinEvents();
        unsubscribeWinEvents = null;
      }

      update(state => ({
        ...state,
        isActive: false,
        isConnected: false
      }));

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log('Win feed stopped');
      }
    },

    /**
     * Handle incoming win events
     */
    async handleWinEvent(winEvent: WinEvent): Promise<void> {
      const prefs = get(feedPreferences);
      const currentState = get({ subscribe });

      // Add to recent wins (keep last 50 for memory management)
      update(state => {
        const recentWins = [winEvent, ...state.recentWins].slice(0, 50);
        return {
          ...state,
          recentWins,
          totalWinsShown: state.totalWinsShown + 1,
          lastActivityTime: new Date()
        };
      });

      // Create and show win toast with name resolution
      await this.showWinToast(winEvent, prefs);

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log('Win event handled:', {
          txid: winEvent.txid,
          payout: Number(winEvent.payout) / 1000000,
          who: winEvent.who
        });
      }
    },

    /**
     * Show a win toast notification
     */
    async showWinToast(winEvent: WinEvent, prefs: any): Promise<void> {
      const payoutVOI = Number(winEvent.payout) / 1000000;
      const betAmountVOI = Number(winEvent.amount) / 1000000;
      const lines = Number(winEvent.max_payline_index) + 1;
      const multiplier = payoutVOI / (betAmountVOI * lines);
      
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log('Toast calculation:', {
          payout: Number(winEvent.payout),
          payoutVOI,
          amount: Number(winEvent.amount), 
          betAmountVOI,
          max_payline_index: Number(winEvent.max_payline_index),
          lines,
          multiplier
        });
      }
      
      // Validate the data before creating toast
      if (!payoutVOI || !betAmountVOI || !lines || !isFinite(multiplier)) {
        console.error('Invalid win event data for toast:', winEvent);
        return;
      }
      
      // Format winner address with name resolution
      const winner = await this.formatWinnerAddress(winEvent.who);

      // Create win toast using the convenience method
      const toastId = toastStore.win(
        `${winner} won ${payoutVOI.toFixed(0)} VOI!`,
        `${multiplier.toFixed(1)}x multiplier on ${betAmountVOI.toFixed(1)} × ${lines} lines`,
        {
          payout: payoutVOI,
          betAmount: betAmountVOI,
          lines,
          multiplier,
          winner: winEvent.who,
          txid: winEvent.txid,
          timestamp: winEvent.created_at
        },
        prefs.displayDuration || 6000,
        () => this.viewTransaction(winEvent.txid)
      );
    },

    /**
     * Format winner address for display with name resolution
     */
    async formatWinnerAddress(address: string): Promise<string> {
      const currentWallet = get(walletStore);

      // Check if it's the current user
      if (currentWallet?.address === address) {
        return 'You';
      }

      try {
        // Attempt name resolution (with caching)
        const resolved = await nameResolutionService.resolveAddress(address);

        if (resolved.hasName && resolved.name) {
          return resolved.name;
        }

        // Fallback to shortened address
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
      } catch (error) {
        // If name resolution fails, fallback to shortened address
        console.warn('Name resolution failed for win feed:', error);
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
      }
    },

    /**
     * Open transaction in blockchain explorer
     */
    viewTransaction(txid: string): void {
      try {
        const base32TxId = ensureBase32TxId(txid);
        const explorerUrl = `${BLOCKCHAIN_CONFIG.explorerUrl}/transaction/${base32TxId}`;
        window.open(explorerUrl, '_blank', 'noopener,noreferrer');
      } catch (error) {
        console.error('Failed to open transaction:', error);
      }
    },

    /**
     * Get current activity statistics
     */
    getActivityStats(): {
      eventsPerMinute: number;
      currentThreshold: number;
      recentEventCount: number;
    } {
      if (!winFeedService.isReady()) {
        return {
          eventsPerMinute: 0,
          currentThreshold: get(feedPreferences).minPayout || 5,
          recentEventCount: 0
        };
      }
      
      return winFeedService.getActivityLevel();
    },

    /**
     * Clear recent wins history
     */
    clearHistory(): void {
      update(state => ({
        ...state,
        recentWins: [],
        totalWinsShown: 0
      }));
    },

    /**
     * Toggle feed on/off
     */
    async toggle(): Promise<void> {
      const currentState = get({ subscribe });
      
      if (currentState.isActive) {
        this.stop();
        // Also update preferences to persist the change
        const { preferencesStore } = await import('./preferences');
        preferencesStore.updateFeedPreferences({ enabled: false });
      } else {
        const { preferencesStore } = await import('./preferences');
        preferencesStore.updateFeedPreferences({ enabled: true });
        // The start will be triggered by the preference change subscription
      }
    },

    /**
     * Cleanup and destroy
     */
    destroy(): void {
      this.stop();
      
      if (unsubscribePreferences) {
        unsubscribePreferences();
        unsubscribePreferences = null;
      }

      winFeedService.destroy();
      set(initialState);
      initializationPromise = null;

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log('Win Feed Store destroyed');
      }
    }
  };

  return store;
}

// Create the store instance
export const winFeedStore = createWinFeedStore();

// Derived stores for easy access to specific state
export const isWinFeedActive = derived(winFeedStore, $store => $store.isActive);
export const winFeedConnection = derived(winFeedStore, $store => ({
  isConnected: $store.isConnected,
  error: $store.connectionError
}));
export const recentWins = derived(winFeedStore, $store => $store.recentWins);
export const winFeedStats = derived(winFeedStore, $store => ({
  totalWinsShown: $store.totalWinsShown,
  lastActivityTime: $store.lastActivityTime
}));

// Cleanup on page unload for additional safety
if (browser) {
  const handleBeforeUnload = () => {
    winFeedStore.destroy();
  };
  
  window.addEventListener('beforeunload', handleBeforeUnload);
  
  // Also cleanup on page hide (for mobile browsers)
  window.addEventListener('pagehide', handleBeforeUnload);
}