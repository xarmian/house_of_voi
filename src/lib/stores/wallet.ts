import { writable, derived, get, readable } from 'svelte/store';
import type { WalletState, WalletAccount } from '$lib/types/wallet';
import { walletService } from '$lib/services/wallet';
import { algorandService } from '$lib/services/algorand';
import { balanceManager, type BalanceChangeEventDetail } from '$lib/services/balanceManager';
import { browser } from '$app/environment';
import { page } from '$app/stores';

// Balance change events are now handled by balanceManager
export type { BalanceChangeEvent, BalanceChangeEventDetail } from '$lib/services/balanceManager';

function createWalletStore() {
  const { subscribe, set, update } = writable<WalletState>({
    account: null,
    balance: 0,
    isConnected: false,
    isGuest: true, // Start in guest mode by default
    isLoading: false,
    isLocked: false,
    error: null,
    lastUpdated: null,
    availableWallets: [],
    activeWalletAddress: null
  });

  // Balance change tracking is now handled by balanceManager
  let balanceChangeUnsubscribe: (() => void) | null = null;
  let currentMonitoredAddress: string | null = null;
  let pageUnsubscribe: (() => void) | null = null;
  let currentContext: 'gaming' | 'house' = 'gaming';

  // Get appropriate context for gaming wallet based on current route
  const getContextForRoute = (): 'gaming' | 'house' => {
    const routeId = get(page).route?.id;
    if (routeId?.startsWith('/app')) {
      return 'gaming'; // Fast refresh for active gaming
    } else if (routeId?.startsWith('/house')) {
      return 'house'; // Slower refresh for portfolio view
    }
    return 'gaming'; // Default to gaming
  };

  const startBalanceMonitoring = (address: string) => {
    // Stop any existing monitoring first
    stopBalanceMonitoring();
    
    currentMonitoredAddress = address;
    currentContext = getContextForRoute();
    
    // Start monitoring with the appropriate context
    balanceManager.startMonitoring(address, { context: currentContext });
    
    // Subscribe to balance change events
    balanceChangeUnsubscribe = balanceManager.onBalanceChange((event) => {
      // Only update if this event is for the monitored gaming wallet address
      if (event.address === currentMonitoredAddress) {
        // Update the store when balance changes
        update(state => ({
          ...state,
          balance: event.newBalance,
          lastUpdated: event.timestamp
        }));
      }
    });

    // Subscribe to route changes to update context for gaming wallet
    if (browser && !pageUnsubscribe) {
      pageUnsubscribe = page.subscribe(($page) => {
        if (currentMonitoredAddress) {
          const newContext = getContextForRoute();
          if (newContext !== currentContext) {
            // Stop monitoring with old context
            balanceManager.stopMonitoring(currentMonitoredAddress, currentContext);
            // Start monitoring with new context
            currentContext = newContext;
            balanceManager.startMonitoring(currentMonitoredAddress, { context: currentContext });
          }
        }
      });
    }
  };

  const stopBalanceMonitoring = () => {
    // Stop balance monitoring in the manager with current context
    if (currentMonitoredAddress) {
      balanceManager.stopMonitoring(currentMonitoredAddress, currentContext);
      currentMonitoredAddress = null;
    }
    
    // Unsubscribe from events
    if (balanceChangeUnsubscribe) {
      balanceChangeUnsubscribe();
      balanceChangeUnsubscribe = null;
    }

    // Unsubscribe from route changes
    if (pageUnsubscribe) {
      pageUnsubscribe();
      pageUnsubscribe = null;
    }
  };

  return {
    subscribe,

    async initialize() {
      if (!browser) return;

      // Don't re-initialize if wallet is already connected - this prevents
      // the wallet from appearing "locked" during navigation
      const currentState = get({ subscribe });
      if (currentState.isConnected && currentState.account) {
        return;
      }

      try {
        // Load all available wallets
        const availableWallets = walletService.getAllWallets();
        const activeWalletAddress = walletService.getActiveWalletAddress();

        if (availableWallets.length > 0 && activeWalletAddress) {
          // Find active wallet
          const activeWallet = availableWallets.find(w => w.address === activeWalletAddress);

          // Check if active wallet is passwordless and try to auto-unlock
          if (activeWallet?.isPasswordless) {
            try {
              const account = await walletService.retrieveWalletFromCollection(activeWalletAddress, '');

              if (account && algorandService) {
                const balance = await balanceManager.getBalance(account.address);

                set({
                  account,
                  balance,
                  isConnected: true,
                  isGuest: false,
                  isLoading: false,
                  isLocked: false,
                  error: null,
                  lastUpdated: Date.now(),
                  availableWallets,
                  activeWalletAddress
                });

                startBalanceMonitoring(account.address);
                return; // Successfully auto-unlocked
              }
            } catch (error) {
              console.error('Failed to auto-unlock passwordless wallet:', error);
              // Fall through to guest mode
            }
          }

          // Wallet exists but stay in guest mode until user initiates setup
          set({
            account: null,
            balance: 0,
            isConnected: false,
            isGuest: true,
            isLoading: false,
            isLocked: false,
            error: null,
            lastUpdated: null,
            availableWallets,
            activeWalletAddress
          });
        } else {
          // No wallet exists - stay in guest mode
          set({
            account: null,
            balance: 0,
            isConnected: false,
            isGuest: true,
            isLoading: false,
            isLocked: false,
            error: null,
            lastUpdated: null,
            availableWallets: [],
            activeWalletAddress: null
          });
        }
      } catch (error) {
        set({
          account: null,
          balance: 0,
          isConnected: false,
          isGuest: true,
          isLoading: false,
          isLocked: false,
          error: error instanceof Error ? error.message : 'Failed to initialize wallet',
          lastUpdated: null,
          availableWallets: [],
          activeWalletAddress: null
        });
      }
    },

    async startWalletSetup() {
      if (!browser) return;

      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        // Check for existing wallets
        const availableWallets = walletService.getAllWallets();

        if (availableWallets.length > 0) {
          // Wallets exist - transition to locked state to prompt for password
          update(state => ({
            ...state,
            isGuest: false,
            isLocked: true,
            isLoading: false,
            availableWallets
          }));
          return 'existing';
        } else {
          // No wallet exists - transition to setup mode
          update(state => ({
            ...state,
            isGuest: false,
            isLoading: false,
            availableWallets: []
          }));
          return 'new';
        }
      } catch (error) {
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to start wallet setup'
        }));
        return 'error';
      }
    },

    async refreshBalance() {
      update(state => {
        if (!state.account) return state;
        
        balanceManager.getBalance(state.account.address, true)
          .then(newBalance => {
            update(s => ({ ...s, balance: newBalance, lastUpdated: Date.now() }));
          })
          .catch(error => {
            console.error('Error refreshing balance:', error);
            update(s => ({ ...s, error: 'Failed to refresh balance' }));
          });
        
        return state;
      });
    },

    // Optimistic balance update (immediate) - used to prevent race conditions
    updateBalance(newBalance: number) {
      update(state => ({
        ...state,
        balance: newBalance,
        lastUpdated: Date.now()
      }));
    },

    async exportPrivateKey(): Promise<string | null> {
      return new Promise((resolve) => {
        update(state => {
          if (!state.account) {
            resolve(null);
            return state;
          }
          
          // Show confirmation dialog
          const confirmed = confirm(
            'Are you sure you want to export your private key? ' +
            'Keep it secure and never share it with anyone!'
          );
          
          if (confirmed) {
            resolve(state.account.privateKey);
          } else {
            resolve(null);
          }
          
          return state;
        });
      });
    },

    async exportMnemonic(): Promise<string | null> {
      return new Promise((resolve) => {
        update(state => {
          if (!state.account) {
            resolve(null);
            return state;
          }
          
          // Show confirmation dialog
          const confirmed = confirm(
            'Are you sure you want to export your recovery phrase? ' +
            'Write it down and store it safely!'
          );
          
          if (confirmed) {
            resolve(state.account.mnemonic);
          } else {
            resolve(null);
          }
          
          return state;
        });
      });
    },

    lock() {
      walletService.lockWallet();
      stopBalanceMonitoring();

      update(state => ({
        ...state,
        isGuest: true,
        isConnected: false,
        isLocked: false,
        account: state.account ? { ...state.account, privateKey: '', mnemonic: '' } : null,
        // Keep wallet list and active address when locking
        availableWallets: walletService.getAllWallets(),
        activeWalletAddress: walletService.getActiveWalletAddress()
      }));
    },

    async unlock(password: string, address?: string) {
      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        // Get the target wallet address (use provided or active)
        const targetAddress = address || walletService.getActiveWalletAddress();

        if (!targetAddress) {
          throw new Error('No wallet address specified');
        }

        const account = await walletService.retrieveWalletFromCollection(targetAddress, password);

        if (account) {
          if (!algorandService) {
            throw new Error('AlgorandService not available');
          }
          const balance = await balanceManager.getBalance(account.address);
          const availableWallets = walletService.getAllWallets();

          // Set as active wallet
          walletService.setActiveWallet(account.address);

          set({
            account,
            balance,
            isConnected: true,
            isGuest: false,
            isLoading: false,
            isLocked: false,
            error: null,
            lastUpdated: Date.now(),
            availableWallets,
            activeWalletAddress: account.address
          });

          startBalanceMonitoring(account.address);
        } else {
          throw new Error('Failed to unlock wallet');
        }
      } catch (error) {
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to unlock wallet'
        }));
        throw error; // Re-throw to ensure UI shows the error
      }
    },

    disconnect() {
      walletService.clearAllWallets();
      stopBalanceMonitoring();

      set({
        account: null,
        balance: 0,
        isConnected: false,
        isGuest: true, // Return to guest mode
        isLoading: false,
        isLocked: false,
        error: null,
        lastUpdated: null,
        availableWallets: [],
        activeWalletAddress: null
      });
    },

    clearError() {
      update(state => ({ ...state, error: null }));
    },

    async createWallet(password: string, nickname?: string) {
      if (!browser) return;

      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        // Generate new wallet
        const account = await walletService.generateWallet();

        // Check if this is the first wallet
        const isFirstWallet = walletService.getWalletCount() === 0;

        if (isFirstWallet) {
          // Clear legacy storage first
          walletService.clearWallet();
          stopBalanceMonitoring();
        }

        // Add wallet to collection
        await walletService.addWalletToCollection(account, password, {
          origin: 'generated',
          nickname
        });

        // Set as active and connect
        walletService.setActiveWallet(account.address);
        const availableWallets = walletService.getAllWallets();

        set({
          account,
          balance: 0,
          isConnected: true,
          isGuest: false,
          isLoading: false,
          isLocked: false,
          error: null,
          lastUpdated: Date.now(),
          availableWallets,
          activeWalletAddress: account.address
        });

        startBalanceMonitoring(account.address);

      } catch (error) {
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to create wallet'
        }));
        throw error;
      }
    },

    async importWallet(mnemonic: string, password: string, nickname?: string) {
      if (!browser) return;

      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        // Import wallet from mnemonic
        const account = await walletService.importWallet(mnemonic);

        // Check if wallet already exists
        if (walletService.hasWalletInCollection(account.address)) {
          throw new Error('This wallet already exists in your collection');
        }

        // Check if this is the first wallet
        const isFirstWallet = walletService.getWalletCount() === 0;

        if (isFirstWallet) {
          // Clear legacy storage first
          walletService.clearWallet();
          stopBalanceMonitoring();
        }

        // Add wallet to collection
        await walletService.addWalletToCollection(account, password, {
          origin: 'imported',
          nickname
        });

        // Get balance for the imported wallet
        if (!algorandService) {
          throw new Error('AlgorandService not available');
        }
        const balance = await balanceManager.getBalance(account.address);

        // Set as active and connect
        walletService.setActiveWallet(account.address);
        const availableWallets = walletService.getAllWallets();

        set({
          account,
          balance,
          isConnected: true,
          isGuest: false,
          isLoading: false,
          isLocked: false,
          error: null,
          lastUpdated: Date.now(),
          availableWallets,
          activeWalletAddress: account.address
        });

        startBalanceMonitoring(account.address);

      } catch (error) {
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to import wallet'
        }));
        throw error; // Re-throw to ensure the modal shows the error
      }
    },

    async resetWallet() {
      if (!browser) return;

      // Clear all wallets and go back to setup mode
      walletService.clearAllWallets();
      stopBalanceMonitoring();

      set({
        account: null,
        balance: 0,
        isConnected: false,
        isGuest: true, // Return to guest mode
        isLoading: false,
        isLocked: false,
        error: null,
        lastUpdated: null,
        availableWallets: [],
        activeWalletAddress: null
      });
    },

    async changePassword(newPassword: string) {
      if (!browser) return;

      let currentAccount: WalletAccount | null = null;

      update(state => {
        currentAccount = state.account;
        return { ...state, isLoading: true, error: null };
      });

      try {
        if (!currentAccount) {
          throw new Error('No wallet account available');
        }

        // Re-encrypt wallet with new password
        await walletService.changeWalletPassword(currentAccount, newPassword);

        update(state => ({
          ...state,
          isLoading: false,
          error: null
        }));
      } catch (error) {
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to change password'
        }));
        throw error;
      }
    },

    async loginWithCDP(email: string, otpCode: string, nickname?: string) {
      if (!browser) return;

      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        // Import CDP wallet service
        const { cdpWalletService } = await import('$lib/services/cdpWallet');

        // Authenticate with CDP and derive Voi wallet
        const voiWallet = await cdpWalletService.authenticateAndDeriveWallet(email, otpCode);

        // Check if wallet already exists
        if (walletService.hasWalletInCollection(voiWallet.address)) {
          // Wallet exists, just switch to it
          const result = await this.switchWallet(voiWallet.address, '');
          updateCDPUserEmail();
          return;
        }

        // Check if this is the first wallet
        const isFirstWallet = walletService.getWalletCount() === 0;

        if (isFirstWallet) {
          // Clear legacy storage first
          walletService.clearWallet();
          stopBalanceMonitoring();
        }

        // Add wallet to collection with empty password (passwordless for CDP login)
        await walletService.addWalletToCollection(voiWallet, '', {
          origin: 'cdp',
          nickname
        });

        // Get balance for the derived wallet
        if (!algorandService) {
          throw new Error('AlgorandService not available');
        }
        const balance = await balanceManager.getBalance(voiWallet.address);

        // Set as active and connect
        walletService.setActiveWallet(voiWallet.address);
        const availableWallets = walletService.getAllWallets();

        set({
          account: voiWallet,
          balance,
          isConnected: true,
          isGuest: false,
          isLoading: false,
          isLocked: false,
          error: null,
          lastUpdated: Date.now(),
          availableWallets,
          activeWalletAddress: voiWallet.address
        });

        startBalanceMonitoring(voiWallet.address);

        // Update CDP email after successful login
        updateCDPUserEmail();

      } catch (error) {
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to login with email'
        }));
        throw error;
      }
    },

    async logoutCDP() {
      if (!browser) return;

      try {
        const currentState = get({ subscribe });

        // Import CDP wallet service
        const { cdpWalletService } = await import('$lib/services/cdpWallet');

        // Sign out from CDP
        await cdpWalletService.signOut();

        // Remove current CDP wallet from collection (if it's CDP)
        if (currentState.account && currentState.account.origin === 'cdp') {
          walletService.removeWalletFromCollection(currentState.account.address);
        }

        stopBalanceMonitoring();

        // Clear CDP email
        cdpUserEmail.set(null);

        // Get remaining wallets
        const availableWallets = walletService.getAllWallets();

        if (availableWallets.length > 0) {
          // Switch to guest mode with available wallets
          set({
            account: null,
            balance: 0,
            isConnected: false,
            isGuest: true,
            isLoading: false,
            isLocked: false,
            error: null,
            lastUpdated: null,
            availableWallets,
            activeWalletAddress: walletService.getActiveWalletAddress()
          });
        } else {
          // No wallets left
          set({
            account: null,
            balance: 0,
            isConnected: false,
            isGuest: true,
            isLoading: false,
            isLocked: false,
            error: null,
            lastUpdated: null,
            availableWallets: [],
            activeWalletAddress: null
          });
        }
      } catch (error) {
        console.error('Failed to logout from CDP:', error);

        const currentState = get({ subscribe });

        // Still try to remove CDP wallet even if logout fails
        if (currentState.account && currentState.account.origin === 'cdp') {
          walletService.removeWalletFromCollection(currentState.account.address);
        }

        stopBalanceMonitoring();

        // Clear CDP email
        cdpUserEmail.set(null);

        const availableWallets = walletService.getAllWallets();

        set({
          account: null,
          balance: 0,
          isConnected: false,
          isGuest: true,
          isLoading: false,
          isLocked: false,
          error: null,
          lastUpdated: null,
          availableWallets,
          activeWalletAddress: walletService.getActiveWalletAddress()
        });
      }
    },

    // Balance change event management - delegated to balanceManager
    onBalanceChange(listener: (event: BalanceChangeEventDetail) => void): () => void {
      return balanceManager.onBalanceChange(listener);
    },

    getBalanceHistory() {
      return balanceManager.getBalanceHistory();
    },

    getRecentBalanceIncreases(limitToLast: number = 10) {
      return balanceManager.getRecentBalanceIncreases(limitToLast);
    },

    // ============================================================================
    // MULTI-WALLET MANAGEMENT METHODS
    // ============================================================================

    /**
     * Switch to a different wallet
     */
    async switchWallet(address: string, password?: string) {
      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        // Stop monitoring current wallet
        stopBalanceMonitoring();

        // Find the wallet in collection
        const wallets = walletService.getAllWallets();
        const targetWallet = wallets.find(w => w.address === address);

        if (!targetWallet) {
          throw new Error('Wallet not found');
        }

        // Determine if password is needed
        const needsPassword = !targetWallet.isPasswordless;

        if (needsPassword && !password) {
          // Return to locked state for this wallet
          walletService.setActiveWallet(address);
          update(state => ({
            ...state,
            isGuest: false,
            isLocked: true,
            isLoading: false,
            activeWalletAddress: address,
            availableWallets: wallets
          }));
          return 'needs_password';
        }

        // Unlock the wallet
        const account = await walletService.retrieveWalletFromCollection(
          address,
          password || ''
        );

        if (!account || !algorandService) {
          throw new Error('Failed to unlock wallet');
        }

        const balance = await balanceManager.getBalance(account.address);

        // Set as active
        walletService.setActiveWallet(account.address);

        set({
          account,
          balance,
          isConnected: true,
          isGuest: false,
          isLoading: false,
          isLocked: false,
          error: null,
          lastUpdated: Date.now(),
          availableWallets: walletService.getAllWallets(),
          activeWalletAddress: account.address
        });

        startBalanceMonitoring(account.address);

        return 'success';
      } catch (error) {
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to switch wallet'
        }));
        throw error;
      }
    },

    /**
     * Add a new wallet to the collection
     */
    async addWallet(account: WalletAccount, password: string, nickname?: string) {
      if (!browser) return;

      try {
        await walletService.addWalletToCollection(account, password, {
          origin: account.origin,
          nickname
        });

        // Refresh available wallets
        update(state => ({
          ...state,
          availableWallets: walletService.getAllWallets()
        }));
      } catch (error) {
        console.error('Failed to add wallet:', error);
        throw error;
      }
    },

    /**
     * Remove a wallet from the collection
     */
    async removeWallet(address: string) {
      if (!browser) return;

      try {
        const currentState = get({ subscribe });

        // Prevent removing the last wallet if it's active
        if (currentState.availableWallets.length === 1 && currentState.activeWalletAddress === address) {
          throw new Error('Cannot remove the only wallet. Disconnect instead.');
        }

        const removed = walletService.removeWalletFromCollection(address);

        if (!removed) {
          throw new Error('Failed to remove wallet');
        }

        // If we removed the active wallet, switch to another
        if (currentState.activeWalletAddress === address) {
          stopBalanceMonitoring();

          const availableWallets = walletService.getAllWallets();

          if (availableWallets.length > 0) {
            // Set guest mode and show wallet selection
            set({
              account: null,
              balance: 0,
              isConnected: false,
              isGuest: true,
              isLoading: false,
              isLocked: false,
              error: null,
              lastUpdated: null,
              availableWallets,
              activeWalletAddress: walletService.getActiveWalletAddress()
            });
          } else {
            // No wallets left
            set({
              account: null,
              balance: 0,
              isConnected: false,
              isGuest: true,
              isLoading: false,
              isLocked: false,
              error: null,
              lastUpdated: null,
              availableWallets: [],
              activeWalletAddress: null
            });
          }
        } else {
          // Just update the available wallets list
          update(state => ({
            ...state,
            availableWallets: walletService.getAllWallets()
          }));
        }
      } catch (error) {
        console.error('Failed to remove wallet:', error);
        throw error;
      }
    },

    /**
     * Rename a wallet
     */
    async renameWallet(address: string, nickname: string) {
      if (!browser) return;

      try {
        const updated = walletService.updateWalletNickname(address, nickname);

        if (!updated) {
          throw new Error('Failed to update wallet nickname');
        }

        // Refresh available wallets and update current account if needed
        update(state => {
          const availableWallets = walletService.getAllWallets();
          const updatedState = {
            ...state,
            availableWallets
          };

          // Update current account nickname if it's the active wallet
          if (state.account && state.account.address === address) {
            updatedState.account = {
              ...state.account,
              nickname
            };
          }

          return updatedState;
        });
      } catch (error) {
        console.error('Failed to rename wallet:', error);
        throw error;
      }
    },

    /**
     * Get all available wallets
     */
    getAvailableWallets() {
      return walletService.getAllWallets();
    },

    /**
     * Refresh available wallets list
     */
    refreshWalletList() {
      update(state => ({
        ...state,
        availableWallets: walletService.getAllWallets()
      }));
    }
  };
}

export const walletStore = createWalletStore();

// Derived stores for convenience
export const walletAddress = derived(
  walletStore,
  $wallet => $wallet.account?.address || null
);

export const walletBalance = derived(
  walletStore,
  $wallet => $wallet.balance
);

export const isWalletConnected = derived(
  walletStore,
  $wallet => $wallet.isConnected && !$wallet.isLocked
);

export const isWalletGuest = derived(
  walletStore,
  $wallet => $wallet.isGuest
);

export const isNewUser = derived(
  walletStore,
  $wallet => {
    if (!browser) return false;
    return $wallet.isGuest && !walletService.hasStoredWallet();
  }
);

export const hasExistingWallet = derived(
  walletStore,
  $wallet => {
    if (!browser) return false;
    return walletService.hasStoredWallet();
  }
);

// Check if current wallet is a CDP wallet by checking CDP sign-in status
// This is checked once when wallet state changes, not on an interval
export const isCDPWallet = derived(
  walletStore,
  ($wallet) => {
    if (!browser) {
      return false;
    }

    if ($wallet.account?.origin === 'cdp') {
      return true;
    }

    const publicData = walletService.getPublicWalletData();
    if (publicData?.origin === 'cdp') {
      return true;
    }

    // Legacy fallback: passwordless wallets without explicit origin were CDP
    if (!publicData?.origin && walletService.isPasswordlessWallet()) {
      return true;
    }

    return false;
  }
);

// Get CDP user email - only checked when components explicitly need it
export const cdpUserEmail = writable<string | null>(null);

let lastFetchedCdpWalletAddress: string | null = null;
let cdpEmailFetchPromise: Promise<string | null> | null = null;

// Helper function to fetch and update CDP email with deduplication
export async function updateCDPUserEmail({
  address,
  force = false
}: {
  address?: string | null;
  force?: boolean;
} = {}): Promise<string | null> {
  if (!browser) return null;

  const walletState = get(walletStore);
  const activeAddress = address ?? walletState.account?.address ?? null;

  if (!activeAddress) {
    cdpUserEmail.set(null);
    lastFetchedCdpWalletAddress = null;
    return null;
  }

  const publicData = walletService.getPublicWalletData();
  const walletOrigin =
    walletState.account?.origin ??
    publicData?.origin ??
    (publicData?.isPasswordless ? 'cdp' : undefined);

  if (walletOrigin !== 'cdp') {
    cdpUserEmail.set(null);
    lastFetchedCdpWalletAddress = null;
    return null;
  }

  const currentEmail = get(cdpUserEmail);
  if (!force && activeAddress === lastFetchedCdpWalletAddress && currentEmail) {
    return currentEmail;
  }

  if (cdpEmailFetchPromise) {
    if (!force) {
      return cdpEmailFetchPromise;
    }
    try {
      await cdpEmailFetchPromise;
    } catch {
      // Ignore previous failure and continue with forced refresh
    }
  }

  cdpEmailFetchPromise = (async () => {
    try {
      const { cdpWalletService } = await import('$lib/services/cdpWallet');

      const initialized = await cdpWalletService.initializeCDP();
      if (!initialized) {
        cdpUserEmail.set(null);
        lastFetchedCdpWalletAddress = null;
        return null;
      }

      const isSignedIn = await cdpWalletService.isSignedIn();
      if (!isSignedIn) {
        cdpUserEmail.set(null);
        lastFetchedCdpWalletAddress = null;
        return null;
      }

      const user = await cdpWalletService.getCurrentUser();
      // Email is nested in authenticationMethods
      const email = (user as any)?.authenticationMethods?.email?.email ?? null;

      cdpUserEmail.set(email);
      lastFetchedCdpWalletAddress = activeAddress;
      return email;
    } catch (error) {
      console.error('Error getting CDP user:', error);
      cdpUserEmail.set(null);
      lastFetchedCdpWalletAddress = null;
      return null;
    }
  })();

  try {
    return await cdpEmailFetchPromise;
  } finally {
    cdpEmailFetchPromise = null;
  }
}

if (browser) {
  walletStore.subscribe(($wallet) => {
    const isConnected = $wallet.isConnected && !$wallet.isLocked;
    const connectedAddress = isConnected ? $wallet.account?.address ?? null : null;
    const publicData = walletService.getPublicWalletData();
    const walletOrigin =
      $wallet.account?.origin ??
      publicData?.origin ??
      (publicData?.isPasswordless ? 'cdp' : undefined);
    const isWalletCDP = walletOrigin === 'cdp';

    if (isConnected && isWalletCDP && connectedAddress) {
      const email = get(cdpUserEmail);
      if (
        connectedAddress !== lastFetchedCdpWalletAddress ||
        (!email && !cdpEmailFetchPromise)
      ) {
        updateCDPUserEmail({ address: connectedAddress });
      }
    } else {
      if (get(cdpUserEmail) !== null) {
        cdpUserEmail.set(null);
      }
      if (!isConnected) {
        lastFetchedCdpWalletAddress = null;
      }
    }
  });
}
