import { derived, writable, get } from 'svelte/store';
import { selectedWallet, connectedWallets, signAndSendTransactions } from 'avm-wallet-svelte';
import { algorandService } from '$lib/services/algorand';
import { balanceManager } from '$lib/services/balanceManager';
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

  let balanceChangeUnsubscribe: (() => void) | null = null;
  let currentMonitoredAddress: string | null = null;

  // Start balance monitoring for connected wallet
  const startBalanceMonitoring = (address: string) => {
    // Stop any existing monitoring
    stopBalanceMonitoring();
    
    currentMonitoredAddress = address;
    
    // Start monitoring with the balance manager (house context for slower refresh)
    balanceManager.startMonitoring(address, { context: 'house' });
    
    // Subscribe to balance change events
    balanceChangeUnsubscribe = balanceManager.onBalanceChange((event) => {
      // Update the store when balance changes
      update(state => ({
        ...state,
        balance: event.newBalance,
        lastUpdated: event.timestamp
      }));
    });
  };

  const stopBalanceMonitoring = () => {
    // Stop balance monitoring in the manager
    if (currentMonitoredAddress) {
      balanceManager.stopMonitoring(currentMonitoredAddress, 'house');
      currentMonitoredAddress = null;
    }
    
    // Unsubscribe from events
    if (balanceChangeUnsubscribe) {
      balanceChangeUnsubscribe();
      balanceChangeUnsubscribe = null;
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
          const balance = await balanceManager.getBalance(wallet.address);
          
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

          startBalanceMonitoring(wallet.address);
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
        stopBalanceMonitoring();
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
      if (wallet) {
        try {
          const balance = await balanceManager.getBalance(wallet.address, true);
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
      stopBalanceMonitoring();
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
