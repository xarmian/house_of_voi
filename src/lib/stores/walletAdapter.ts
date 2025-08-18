import { derived, writable, get } from 'svelte/store';
import { selectedWallet, connectedWallets, signAndSendTransactions } from 'avm-wallet-svelte';
import { algorandService } from '$lib/services/algorand';
import type { WalletAccount, WalletState } from '$lib/types/wallet';
import { browser } from '$app/environment';

/**
 * Wallet adapter that bridges avm-wallet-svelte stores with our existing wallet interface.
 * This allows our existing services and components to work with external wallets
 * while maintaining the same interface.
 */
function createWalletAdapter() {
  const { subscribe, set, update } = writable<WalletState>({
    account: null,
    balance: 0,
    isConnected: false,
    isLoading: false,
    isLocked: false,
    error: null,
    lastUpdated: null
  });

  let balanceRefreshInterval: NodeJS.Timeout | null = null;

  // Start balance refresh for connected wallet
  const startBalanceRefresh = (address: string) => {
    if (balanceRefreshInterval) clearInterval(balanceRefreshInterval);
    
    balanceRefreshInterval = setInterval(async () => {
      try {
        if (!algorandService) {
          console.error('AlgorandService not available');
          return;
        }
        
        // Get current state to check if we should update
        const currentState = get({ subscribe });
        if (!currentState.isConnected || currentState.account?.address !== address) {
          return; // Don't update if wallet changed or disconnected
        }
        
        const balance = await algorandService.getBalance(address);
        
        // Only update if balance actually changed to prevent unnecessary reactivity
        if (currentState.balance !== balance) {
          update(state => ({ ...state, balance, lastUpdated: Date.now() }));
        }
      } catch (error) {
        console.error('Error refreshing balance:', error);
      }
    }, 60000); // 60 seconds (reduced frequency)
  };

  const stopBalanceRefresh = () => {
    if (balanceRefreshInterval) {
      clearInterval(balanceRefreshInterval);
      balanceRefreshInterval = null;
    }
  };

  let currentWalletAddress = '';
  let walletSubscription: (() => void) | null = null;

  // Subscribe to avm-wallet-svelte selectedWallet changes
  if (browser) {
    // Clean up any existing subscription
    if (walletSubscription) {
      walletSubscription();
    }
    
    walletSubscription = selectedWallet.subscribe(async (wallet) => {
      const newAddress = wallet?.address || '';
      
      // Only update if the wallet address actually changed
      if (newAddress === currentWalletAddress) {
        return;
      }
      
      currentWalletAddress = newAddress;
      
      if (wallet && wallet.address) {
        try {
          // Get balance for the connected wallet
          const balance = await algorandService.getBalance(wallet.address);
          
          // Create a WalletAccount-compatible object
          const account: WalletAccount = {
            address: wallet.address,
            privateKey: '', // External wallets don't expose private keys
            mnemonic: '', // External wallets don't expose mnemonics
            createdAt: Date.now(),
            isLocked: false
          };

          set({
            account,
            balance,
            isConnected: true,
            isLoading: false,
            isLocked: false,
            error: null,
            lastUpdated: Date.now()
          });

          startBalanceRefresh(wallet.address);
        } catch (error) {
          console.error('Error getting balance for connected wallet:', error);
          set({
            account: null,
            balance: 0,
            isConnected: false,
            isLoading: false,
            isLocked: false,
            error: 'Failed to get wallet balance',
            lastUpdated: null
          });
        }
      } else {
        // No wallet connected
        stopBalanceRefresh();
        set({
          account: null,
          balance: 0,
          isConnected: false,
          isLoading: false,
          isLocked: false,
          error: null,
          lastUpdated: null
        });
      }
    });
  }

  return {
    subscribe,
    
    // Compatibility methods for existing code
    async initialize() {
      // avm-wallet-svelte handles initialization automatically
      return;
    },

    async refreshBalance() {
      const wallet = get(selectedWallet);
      if (wallet && algorandService) {
        try {
          const balance = await algorandService.getBalance(wallet.address);
          update(state => ({ ...state, balance, lastUpdated: Date.now() }));
        } catch (error) {
          console.error('Error refreshing balance:', error);
          update(state => ({ ...state, error: 'Failed to refresh balance' }));
        }
      }
    },

    // These methods are not applicable for external wallets
    async exportPrivateKey(): Promise<string | null> {
      console.warn('Cannot export private key from external wallet');
      return null;
    },

    async exportMnemonic(): Promise<string | null> {
      console.warn('Cannot export mnemonic from external wallet');
      return null;
    },

    lock() {
      console.warn('Cannot lock external wallet from application');
    },

    async unlock() {
      console.warn('Cannot unlock external wallet from application');
    },

    disconnect() {
      // External wallet disconnection should be handled by the wallet itself
      console.warn('Disconnect should be handled by the wallet application');
    },

    clearError() {
      update(state => ({ ...state, error: null }));
    },

    // Not applicable for external wallets
    async importWallet(mnemonic: string) {
      throw new Error('Cannot import wallet when using external wallet connection');
    },

    async resetWallet() {
      throw new Error('Cannot reset external wallet from application');
    },

    // Transaction signing method that uses avm-wallet-svelte
    async signTransactions(transactions: any[]): Promise<any> {
      try {
        const result = await signAndSendTransactions([transactions]);
        return result;
      } catch (error) {
        console.error('Error signing transactions:', error);
        throw error;
      }
    },

    // Cleanup method
    destroy() {
      stopBalanceRefresh();
      if (walletSubscription) {
        walletSubscription();
        walletSubscription = null;
      }
    }
  };
}

export const walletAdapter = createWalletAdapter();

// Derived stores for compatibility with existing code
export const walletStore = walletAdapter;

export const walletAddress = derived(
  selectedWallet,
  $selectedWallet => $selectedWallet?.address || null
);

export const walletBalance = derived(
  walletAdapter,
  $wallet => $wallet.balance
);

export const isWalletConnected = derived(
  selectedWallet,
  $selectedWallet => $selectedWallet !== null
);

// Export avm-wallet-svelte stores and functions for direct use
export { selectedWallet, connectedWallets, signAndSendTransactions } from 'avm-wallet-svelte';
