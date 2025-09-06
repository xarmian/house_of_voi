import { writable, derived, get } from 'svelte/store';
import { bridgeTransferTracker, type BridgeTransfer, type BridgeTransferState } from '$lib/services/bridgeTransferTracker';

export interface BridgeTransferStoreState {
  activeTransfer: BridgeTransfer | null;
  recentTransfers: BridgeTransfer[];
  isTransferring: boolean;
  error: string | null;
}

function createBridgeTransferStore() {
  const { subscribe, set, update } = writable<BridgeTransferStoreState>({
    activeTransfer: null,
    recentTransfers: [],
    isTransferring: false,
    error: null
  });

  // Subscribe to bridge transfer tracker events
  bridgeTransferTracker.on('transfer-updated', (transfer) => {
    update(state => {
      // Update active transfer if it matches
      if (state.activeTransfer?.id === transfer.id) {
        state.activeTransfer = transfer;
      }
      
      // Update in recent transfers list
      const index = state.recentTransfers.findIndex(t => t.id === transfer.id);
      if (index >= 0) {
        state.recentTransfers[index] = transfer;
      } else {
        // Add to recent transfers (keep last 10)
        state.recentTransfers = [transfer, ...state.recentTransfers].slice(0, 10);
      }

      // Update transferring state
      state.isTransferring = state.activeTransfer?.state === 'waiting' || 
                           state.activeTransfer?.state === 'detected' || 
                           state.activeTransfer?.state === 'bridging';
      
      return state;
    });
  });

  bridgeTransferTracker.on('transfer-completed', (transfer) => {
    update(state => {
      if (state.activeTransfer?.id === transfer.id) {
        state.isTransferring = false;
        // Keep active transfer to show success state - no timeout
      }
      return state;
    });
  });

  bridgeTransferTracker.on('transfer-failed', (transfer) => {
    update(state => {
      if (state.activeTransfer?.id === transfer.id) {
        state.isTransferring = false;
        state.error = transfer.error || 'Transfer failed';
      }
      return state;
    });
  });

  bridgeTransferTracker.on('transfer-timeout', (transfer) => {
    update(state => {
      if (state.activeTransfer?.id === transfer.id) {
        state.isTransferring = false;
        state.error = 'Transfer timed out. Please try again.';
      }
      return state;
    });
  });

  return {
    subscribe,
    
    /**
     * Start a new bridge transfer
     */
    startTransfer: (voiAddress: string, expectedAmount: number) => {
      const transferId = bridgeTransferTracker.startTransfer(voiAddress, expectedAmount);
      const transfer = bridgeTransferTracker.getTransfer(transferId);
      
      update(state => ({
        ...state,
        activeTransfer: transfer,
        isTransferring: true,
        error: null
      }));
      
      return transferId;
    },

    /**
     * Cancel active transfer
     */
    cancelActiveTransfer: () => {
      const currentState = get(bridgeTransferStore);
      if (currentState.activeTransfer) {
        bridgeTransferTracker.cancelTransfer(currentState.activeTransfer.id);
        update(state => ({
          ...state,
          activeTransfer: null,
          isTransferring: false
        }));
      }
    },

    /**
     * Clear error state
     */
    clearError: () => {
      update(state => ({ ...state, error: null }));
    },

    /**
     * Clear active transfer (e.g., when modal is closed)
     */
    clearActiveTransfer: () => {
      update(state => ({ ...state, activeTransfer: null, isTransferring: false }));
    },

    /**
     * Get transfer by ID
     */
    getTransfer: (transferId: string): BridgeTransfer | null => {
      return bridgeTransferTracker.getTransfer(transferId);
    },

    /**
     * Get transfers for address
     */
    getTransfersForAddress: (voiAddress: string): BridgeTransfer[] => {
      return bridgeTransferTracker.getTransfersForAddress(voiAddress);
    },

    /**
     * Reset to start a new transfer (clears active transfer)
     */
    resetForNewTransfer: () => {
      update(state => ({
        ...state,
        activeTransfer: null,
        isTransferring: false,
        error: null
      }));
    },

    /**
     * Clean up all transfers and monitoring
     */
    cleanup: () => {
      bridgeTransferTracker.cleanup();
      set({
        activeTransfer: null,
        recentTransfers: [],
        isTransferring: false,
        error: null
      });
    }
  };
}

export const bridgeTransferStore = createBridgeTransferStore();

// Derived stores for common use cases
export const activeTransfer = derived(
  bridgeTransferStore,
  ($store) => $store.activeTransfer
);

export const isTransferring = derived(
  bridgeTransferStore,
  ($store) => $store.isTransferring
);

export const transferError = derived(
  bridgeTransferStore,
  ($store) => $store.error
);

export const recentTransfers = derived(
  bridgeTransferStore,
  ($store) => $store.recentTransfers
);

// Helper function to get user-friendly status text
export function getTransferStatusText(state: BridgeTransferState): string {
  switch (state) {
    case 'waiting':
      return 'Waiting for Algorand transaction...';
    case 'detected':
      return 'Transaction detected!';
    case 'bridging':
      return 'Bridge transfer in progress...';
    case 'completed':
      return 'Transfer completed successfully!';
    case 'failed':
      return 'Transfer failed';
    case 'timeout':
      return 'Transfer timed out';
    default:
      return 'Unknown status';
  }
}

// Helper function to get status icon
export function getTransferStatusIcon(state: BridgeTransferState): string {
  switch (state) {
    case 'waiting':
      return '⏳';
    case 'detected':
      return '👁️';
    case 'bridging':
      return '🌉';
    case 'completed':
      return '✅';
    case 'failed':
      return '❌';
    case 'timeout':
      return '⏰';
    default:
      return '❓';
  }
}