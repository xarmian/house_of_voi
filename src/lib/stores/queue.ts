// Phase 6: Game Queue Store
// Mobile-first queue management with persistence and real-time updates

import { writable, derived } from 'svelte/store';
import type { QueuedSpin, QueueState, QueueStats, SpinUpdate } from '$lib/types/queue';
import { SpinStatus } from '$lib/types/queue';
import { browser } from '$app/environment';
import { estimateSpinTransactionCost, filterActivePendingSpins } from '$lib/utils/balanceUtils';

const STORAGE_KEY = 'hov_queue';
const MAX_QUEUE_SIZE = 50;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 5000; // 5 seconds

function createQueueStore() {
  // Initialize with stored data if available
  const initialState: QueueState = {
    spins: [],
    isProcessing: false,
    totalPendingValue: 0,
    totalReservedBalance: 0,
    lastUpdated: Date.now()
  };

  const { subscribe, set, update } = writable<QueueState>(
    browser ? loadQueueFromStorage() || initialState : initialState
  );

  // Auto-save to localStorage when queue changes
  if (browser) {
    subscribe(state => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...state,
        // Don't persist processing state
        isProcessing: false
      }));
    });
  }

  function loadQueueFromStorage(): QueueState | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Clean up old spins (older than 24 hours)
        const cutoff = Date.now() - (24 * 60 * 60 * 1000);
        const filteredSpins = parsed.spins.filter((spin: QueuedSpin) => 
          spin.timestamp > cutoff
        );
        
        // Calculate reserved balance from active pending spins
        const activePendingSpins = filterActivePendingSpins(filteredSpins);
        const totalReservedBalance = activePendingSpins.reduce((total, spin) => {
          return total + (spin.estimatedTotalCost || estimateSpinTransactionCost(spin.betPerLine, spin.selectedPaylines));
        }, 0);
        
        return {
          ...parsed,
          spins: filteredSpins,
          totalReservedBalance: totalReservedBalance || 0, // Ensure this field exists
          lastUpdated: Date.now()
        };
      }
    } catch (error) {
      console.error('Error loading queue from storage:', error);
    }
    return null;
  }

  function generateSpinId(): string {
    return `spin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  return {
    subscribe,

    // Add new spin to queue
    addSpin(betPerLine: number, selectedPaylines: number, totalBet: number, estimatedTotalCost?: number): string {
      const spinId = generateSpinId();
      
      update(state => {
        // Remove oldest spins if queue is full
        const spins = state.spins.length >= MAX_QUEUE_SIZE 
          ? state.spins.slice(-(MAX_QUEUE_SIZE - 1))
          : [...state.spins];

        // Calculate estimated total cost if not provided
        const totalCostEstimate = estimatedTotalCost || estimateSpinTransactionCost(betPerLine, selectedPaylines);

        const newSpin: QueuedSpin = {
          id: spinId,
          timestamp: Date.now(),
          status: SpinStatus.PENDING,
          betPerLine,
          selectedPaylines,
          totalBet,
          estimatedTotalCost: totalCostEstimate,
          retryCount: 0
        };

        spins.push(newSpin);

        return {
          ...state,
          spins,
          totalPendingValue: state.totalPendingValue + totalBet,
          totalReservedBalance: state.totalReservedBalance + totalCostEstimate,
          lastUpdated: Date.now()
        };
      });

      return spinId;
    },

    // Update spin status and data
    updateSpin(spinUpdate: SpinUpdate) {
      update(state => {
        const spinIndex = state.spins.findIndex(spin => spin.id === spinUpdate.id);
        if (spinIndex === -1) return state;

        const spin = state.spins[spinIndex];
        const oldStatus = spin.status;
        const newSpin = { ...spin, status: spinUpdate.status, ...spinUpdate.data };

        // Update total pending value
        let totalPendingValue = state.totalPendingValue;
        if (oldStatus === SpinStatus.PENDING && spinUpdate.status !== SpinStatus.PENDING) {
          totalPendingValue -= spin.totalBet;
        }

        // Update reserved balance - release funds when spin leaves pending/active states
        // Only PENDING and SUBMITTING states should have funds reserved (not submitted to blockchain yet)
        let totalReservedBalance = state.totalReservedBalance;
        const isActivePendingStatus = (status: SpinStatus) => 
          [SpinStatus.PENDING, SpinStatus.SUBMITTING].includes(status);
        
        const wasActivePending = isActivePendingStatus(oldStatus);
        const isActivePending = isActivePendingStatus(spinUpdate.status);
        
        if (wasActivePending && !isActivePending) {
          // Spin is no longer active pending - release reserved funds
          totalReservedBalance -= (spin.estimatedTotalCost || spin.totalBet);
        } else if (!wasActivePending && isActivePending) {
          // Spin became active pending (e.g., retry) - reserve funds again
          totalReservedBalance += (newSpin.estimatedTotalCost || newSpin.totalBet);
        }

        const newSpins = [...state.spins];
        newSpins[spinIndex] = newSpin;

        return {
          ...state,
          spins: newSpins,
          totalPendingValue,
          totalReservedBalance,
          lastUpdated: Date.now()
        };
      });
    },

    // Remove spin from queue
    removeSpin(spinId: string) {
      update(state => {
        const spinIndex = state.spins.findIndex(spin => spin.id === spinId);
        if (spinIndex === -1) return state;

        const spin = state.spins[spinIndex];
        const newSpins = state.spins.filter(s => s.id !== spinId);

        // Update total pending value
        let totalPendingValue = state.totalPendingValue;
        if (spin.status === SpinStatus.PENDING) {
          totalPendingValue -= spin.totalBet;
        }

        // Update reserved balance - release funds for removed active pending spins
        // Only PENDING and SUBMITTING states should have funds reserved (not submitted to blockchain yet)
        let totalReservedBalance = state.totalReservedBalance;
        const isActivePendingStatus = [SpinStatus.PENDING, SpinStatus.SUBMITTING].includes(spin.status);
        if (isActivePendingStatus) {
          totalReservedBalance -= (spin.estimatedTotalCost || spin.totalBet);
        }

        return {
          ...state,
          spins: newSpins,
          totalPendingValue,
          totalReservedBalance,
          lastUpdated: Date.now()
        };
      });
    },

    // Mark spin for retry
    retrySpin(spinId: string) {
      update(state => {
        const spinIndex = state.spins.findIndex(spin => spin.id === spinId);
        if (spinIndex === -1) return state;

        const spin = state.spins[spinIndex];
        if (spin.retryCount >= MAX_RETRY_ATTEMPTS) {
          return state; // Max retries reached
        }

        const newSpins = [...state.spins];
        newSpins[spinIndex] = {
          ...spin,
          status: SpinStatus.PENDING,
          retryCount: spin.retryCount + 1,
          lastRetry: Date.now(),
          error: undefined
        };

        return {
          ...state,
          spins: newSpins,
          lastUpdated: Date.now()
        };
      });
    },

    // Set processing state
    setProcessing(isProcessing: boolean) {
      update(state => ({
        ...state,
        isProcessing
      }));
    },

    // Clear completed spins older than specified time
    clearOldSpins(olderThanMs: number = 60 * 60 * 1000) { // Default: 1 hour
      const cutoff = Date.now() - olderThanMs;
      
      update(state => ({
        ...state,
        spins: state.spins.filter(spin => 
          spin.timestamp > cutoff || 
          ![SpinStatus.COMPLETED, SpinStatus.FAILED, SpinStatus.EXPIRED].includes(spin.status)
        ),
        lastUpdated: Date.now()
      }));
    },

    // Clear all spins
    clear() {
      set({
        spins: [],
        isProcessing: false,
        totalPendingValue: 0,
        totalReservedBalance: 0,
        lastUpdated: Date.now()
      });
    },

    // Get specific spin
    getSpin(spinId: string): QueuedSpin | null {
      let foundSpin: QueuedSpin | null = null;
      
      update(state => {
        foundSpin = state.spins.find(spin => spin.id === spinId) || null;
        return state;
      });
      
      return foundSpin;
    }
  };
}

export const queueStore = createQueueStore();

// Derived stores for convenience
export const queueStats = derived(
  queueStore,
  ($queue): QueueStats => {
    const spins = $queue.spins;
    
    return {
      totalSpins: spins.length,
      pendingSpins: spins.filter(s => [SpinStatus.PENDING, SpinStatus.SUBMITTING, SpinStatus.WAITING, SpinStatus.PROCESSING].includes(s.status)).length,
      completedSpins: spins.filter(s => s.status === SpinStatus.COMPLETED).length,
      failedSpins: spins.filter(s => [SpinStatus.FAILED, SpinStatus.EXPIRED].includes(s.status)).length,
      totalWagered: spins.reduce((sum, spin) => sum + spin.totalBet, 0),
      totalWinnings: spins.reduce((sum, spin) => sum + (spin.winnings || 0), 0),
      netProfit: spins.reduce((sum, spin) => sum + (spin.winnings || 0) - spin.totalBet, 0)
    };
  }
);

export const pendingSpins = derived(
  queueStore,
  $queue => $queue.spins.filter(spin => 
    [SpinStatus.PENDING, SpinStatus.SUBMITTING, SpinStatus.WAITING, SpinStatus.PROCESSING].includes(spin.status)
  )
);

export const readyToClaim = derived(
  queueStore,
  $queue => $queue.spins.filter(spin => spin.status === SpinStatus.READY_TO_CLAIM)
);

export const recentSpins = derived(
  queueStore,
  $queue => $queue.spins
    .filter(spin => spin.status !== SpinStatus.PENDING)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10)
);

export const reservedBalance = derived(
  queueStore,
  $queue => $queue.totalReservedBalance
);

export const availableBalance = derived(
  [queueStore],
  ([$queue]) => {
    // This will be combined with wallet balance in components
    return {
      reservedBalance: $queue.totalReservedBalance,
      activePendingSpins: filterActivePendingSpins($queue.spins)
    };
  }
);