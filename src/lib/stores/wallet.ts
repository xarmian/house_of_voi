import { writable, derived } from 'svelte/store';
import type { WalletState, WalletAccount } from '$lib/types/wallet';
import { walletService } from '$lib/services/wallet';
import { algorandService } from '$lib/services/algorand';
import { browser } from '$app/environment';

function createWalletStore() {
  const { subscribe, set, update } = writable<WalletState>({
    account: null,
    balance: 0,
    isConnected: false,
    isGuest: true, // Start in guest mode by default
    isLoading: false,
    isLocked: false,
    error: null,
    lastUpdated: null
  });

  // Auto-refresh balance every 30 seconds when connected
  let balanceRefreshInterval: NodeJS.Timeout | null = null;

  const startBalanceRefresh = (address: string) => {
    if (balanceRefreshInterval) clearInterval(balanceRefreshInterval);
    
    balanceRefreshInterval = setInterval(async () => {
      try {
        if (!algorandService) {
          console.error('AlgorandService not available');
          return;
        }
        const balance = await algorandService.getBalance(address);
        update(state => ({ ...state, balance, lastUpdated: Date.now() }));
      } catch (error) {
        console.error('Error refreshing balance:', error);
      }
    }, 30000); // 30 seconds
  };

  const stopBalanceRefresh = () => {
    if (balanceRefreshInterval) {
      clearInterval(balanceRefreshInterval);
      balanceRefreshInterval = null;
    }
  };

  return {
    subscribe,
    
    async initialize() {
      if (!browser) return;
      
      try {
        if (walletService.hasStoredWallet()) {
          // Check if wallet is passwordless and try to auto-unlock
          if (walletService.isPasswordlessWallet()) {
            try {
              const account = await walletService.retrieveWallet(''); // Empty password
              
              if (account && algorandService) {
                const balance = await algorandService.getBalance(account.address);
                
                set({
                  account,
                  balance,
                  isConnected: true,
                  isGuest: false,
                  isLoading: false,
                  isLocked: false,
                  error: null,
                  lastUpdated: Date.now()
                });
                
                startBalanceRefresh(account.address);
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
            lastUpdated: null
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
            lastUpdated: null
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
          lastUpdated: null
        });
      }
    },

    async startWalletSetup() {
      if (!browser) return;
      
      update(state => ({ ...state, isLoading: true, error: null }));
      
      try {
        // Check for existing wallet when user actually wants to set up
        if (walletService.hasStoredWallet()) {
          // Wallet exists - transition to locked state to prompt for password
          update(state => ({
            ...state,
            isGuest: false,
            isLocked: true,
            isLoading: false
          }));
          return 'existing';
        } else {
          // No wallet exists - transition to setup mode
          update(state => ({
            ...state,
            isGuest: false,
            isLoading: false
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
        if (!state.account || !algorandService) return state;
        
        algorandService.getBalance(state.account.address)
          .then(balance => {
            update(s => ({ ...s, balance, lastUpdated: Date.now() }));
          })
          .catch(error => {
            console.error('Error refreshing balance:', error);
            update(s => ({ ...s, error: 'Failed to refresh balance' }));
          });
        
        return state;
      });
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
      stopBalanceRefresh();
      
      update(state => ({
        ...state,
        isLocked: true,
        account: state.account ? { ...state.account, privateKey: '', mnemonic: '' } : null
      }));
    },

    async unlock(password: string) {
      update(state => ({ ...state, isLoading: true, error: null }));
      
      try {
        const account = await walletService.retrieveWallet(password);
        
        if (account) {
          if (!algorandService) {
            throw new Error('AlgorandService not available');
          }
          const balance = await algorandService.getBalance(account.address);
          
          set({
            account,
            balance,
            isConnected: true,
            isGuest: false,
            isLoading: false,
            isLocked: false,
            error: null,
            lastUpdated: Date.now()
          });
          
          startBalanceRefresh(account.address);
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
      walletService.clearWallet();
      stopBalanceRefresh();
      
      set({
        account: null,
        balance: 0,
        isConnected: false,
        isGuest: true, // Return to guest mode
        isLoading: false,
        isLocked: false,
        error: null,
        lastUpdated: null
      });
    },

    clearError() {
      update(state => ({ ...state, error: null }));
    },

    async createWallet(password: string) {
      if (!browser) return;
      
      update(state => ({ ...state, isLoading: true, error: null }));
      
      try {
        // Generate new wallet
        const account = await walletService.generateWallet();
        
        // Clear existing wallet first
        walletService.clearWallet();
        stopBalanceRefresh();
        
        // Store the new wallet with password
        await walletService.storeWallet(account, password);
        
        set({
          account,
          balance: 0,
          isConnected: true,
          isGuest: false,
          isLoading: false,
          isLocked: false,
          error: null,
          lastUpdated: Date.now()
        });
        
        startBalanceRefresh(account.address);
        
      } catch (error) {
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to create wallet'
        }));
        throw error;
      }
    },

    async importWallet(mnemonic: string, password: string) {
      if (!browser) return;
      
      update(state => ({ ...state, isLoading: true, error: null }));
      
      try {
        // Import wallet from mnemonic
        const account = await walletService.importWallet(mnemonic);
        
        // Clear existing wallet first
        walletService.clearWallet();
        stopBalanceRefresh();
        
        // Store the imported wallet with password
        await walletService.storeWallet(account, password);
        
        // Get balance for the imported wallet
        if (!algorandService) {
          throw new Error('AlgorandService not available');
        }
        const balance = await algorandService.getBalance(account.address);
        
        set({
          account,
          balance,
          isConnected: true,
          isGuest: false,
          isLoading: false,
          isLocked: false,
          error: null,
          lastUpdated: Date.now()
        });
        
        startBalanceRefresh(account.address);
        
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
      
      // Clear existing wallet and go back to setup mode
      walletService.clearWallet();
      stopBalanceRefresh();
      
      set({
        account: null,
        balance: 0,
        isConnected: false,
        isGuest: true, // Return to guest mode
        isLoading: false,
        isLocked: false,
        error: null,
        lastUpdated: null
      });
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