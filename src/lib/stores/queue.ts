// Phase 6: Game Queue Store
// Mobile-first queue management with persistence and real-time updates

import { writable, derived } from 'svelte/store';
import type { QueuedSpin, QueueState, QueueStats, SpinUpdate } from '$lib/types/queue';
import { SpinStatus } from '$lib/types/queue';
import { browser } from '$app/environment';
import { estimateSpinTransactionCost, filterActivePendingSpins } from '$lib/utils/balanceUtils';

const STORAGE_KEY = 'hov_queue';
const MAX_QUEUE_SIZE = 100;
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
        // Keep only the most recent 100 spins
        let limitedSpins = parsed.spins
          .sort((a: QueuedSpin, b: QueuedSpin) => b.timestamp - a.timestamp)
          .slice(0, MAX_QUEUE_SIZE);
        
        // On load, normalize all spins to terminal UI state:
        // - Any non-terminal becomes COMPLETED
        // - All spins are marked revealed so UI does not show "Confirming" for past sessions
        limitedSpins = limitedSpins.map((spin: QueuedSpin) => {
          const isTerminal = [SpinStatus.COMPLETED, SpinStatus.FAILED, SpinStatus.EXPIRED].includes(spin.status);
          if (!isTerminal) {
            return {
              ...spin,
              status: SpinStatus.COMPLETED,
              revealed: true,
              isAutoClaimInProgress: undefined,
              error: undefined
            } as QueuedSpin;
          }
          // Ensure terminal spins are also flagged as revealed for UI purposes
          return {
            ...spin,
            revealed: true
          } as QueuedSpin;
        });
        
        // Calculate reserved balance from active pending spins
        const activePendingSpins = filterActivePendingSpins(limitedSpins);
        const totalReservedBalance = activePendingSpins.reduce((total, spin) => {
          return total + (spin.estimatedTotalCost || estimateSpinTransactionCost(spin.betPerLine, spin.selectedPaylines));
        }, 0);
        
        return {
          ...parsed,
          spins: limitedSpins,
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
    addSpin(betPerLine: number, selectedPaylines: number, totalBet: number, estimatedTotalCost?: number, contractId?: string): string {
      const spinId = generateSpinId();
      
      update(state => {
        let spins = [...state.spins];
        let totalPendingValue = state.totalPendingValue;
        let totalReservedBalance = state.totalReservedBalance;

        // Remove oldest spins if queue is at capacity
        while (spins.length >= MAX_QUEUE_SIZE) {
          // Sort by timestamp to find the actual oldest spin
          spins.sort((a, b) => a.timestamp - b.timestamp);
          const removedSpin = spins.shift(); // Remove oldest spin by timestamp
          if (removedSpin) {
            // Update pending value if the removed spin was pending
            if (removedSpin.status === SpinStatus.PENDING) {
              totalPendingValue -= removedSpin.totalBet;
            }
            // Update reserved balance if the removed spin had reserved funds
            const isActivePendingStatus = [SpinStatus.PENDING, SpinStatus.SUBMITTING].includes(removedSpin.status);
            if (isActivePendingStatus) {
              totalReservedBalance -= (removedSpin.estimatedTotalCost || removedSpin.totalBet);
            }
          }
        }

        // Calculate estimated total cost if not provided (kept for validation),
        // but reserve ONLY the bet amount for display/available credits
        const totalCostEstimate = estimatedTotalCost || estimateSpinTransactionCost(betPerLine, selectedPaylines);

        const newSpin: QueuedSpin = {
          id: spinId,
          timestamp: Date.now(),
          status: SpinStatus.PENDING,
          contractId,
          betPerLine,
          selectedPaylines,
          totalBet,
          estimatedTotalCost: totalCostEstimate,
          retryCount: 0
        };

        spins.push(newSpin);

        const newReservedBalance = totalReservedBalance + totalBet;
        console.log(`💰 NEW SPIN QUEUED: ${(totalBet / 1000000).toFixed(6)} VOI bet reservation for spin ${spinId.slice(-8)}. Total reserved now: ${(newReservedBalance / 1000000).toFixed(6)} VOI`);

        return {
          ...state,
          spins,
          totalPendingValue: totalPendingValue + totalBet,
          // Reserve only the bet amount during PENDING/SUBMITTING
          totalReservedBalance: newReservedBalance,
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
        // Keep funds reserved until the spin is actually processed (PROCESSING or later)
        let totalReservedBalance = state.totalReservedBalance;
        const needsReservedFunds = (status: SpinStatus) => 
          [SpinStatus.PENDING, SpinStatus.SUBMITTING].includes(status);
        
        const wasReserved = needsReservedFunds(oldStatus);
        const shouldBeReserved = needsReservedFunds(spinUpdate.status);
        
        // Handle reserved funds for spin status changes
        if (!wasReserved && shouldBeReserved) {
          // Spin now needs reserved funds - reserve them
          const reservedAmount = newSpin.totalBet;
          totalReservedBalance += reservedAmount;
          console.log(`💰 RESERVING funds: ${(reservedAmount / 1000000).toFixed(6)} VOI for spin ${spin.id.slice(-8)}. Total reserved now: ${(totalReservedBalance / 1000000).toFixed(6)} VOI`);
        } else if (wasReserved && !shouldBeReserved) {
          // Spin no longer needs reserved funds
          const releaseAmount = spin.totalBet;
          
          // For failed/expired spins, immediately release reserved funds since no blockchain transaction occurred
          // For completed spins, also release since the transaction cycle is finished
          if ([SpinStatus.FAILED, SpinStatus.EXPIRED, SpinStatus.COMPLETED].includes(spinUpdate.status)) {
            totalReservedBalance = Math.max(0, totalReservedBalance - releaseAmount);
            console.log(`💸 RELEASING reserved funds: ${(releaseAmount / 1000000).toFixed(6)} VOI for ${spinUpdate.status} spin ${spin.id.slice(-8)}. Total reserved now: ${(totalReservedBalance / 1000000).toFixed(6)} VOI`);
          } else {
            // For other status changes (e.g., WAITING, PROCESSING), let balance manager handle when blockchain deduction occurs
            console.log(`⏳ Spin ${spin.id.slice(-8)} no longer needs reserved funds (${oldStatus} → ${spinUpdate.status}) - letting balance manager handle release`);
          }
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
          totalReservedBalance -= spin.totalBet;
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

    // Force release reserved funds for a specific spin (called by balance manager)
    forceReleaseReservedFunds(spinId: string) {
      update(state => {
        const spinIndex = state.spins.findIndex(s => s.id === spinId);
        if (spinIndex === -1) return state;
        
        const spin = state.spins[spinIndex];
        
        // Don't double-release for terminal spins - they should have already released their funds
        const terminalStates = [SpinStatus.COMPLETED, SpinStatus.FAILED, SpinStatus.EXPIRED];
        if (terminalStates.includes(spin.status)) {
          console.log(`⚠️ Attempted to force release funds for ${spin.status} spin ${spin.id.slice(-8)} - already released`);
          return state;
        }
        
        const releasedAmount = spin.totalBet;
        const newReservedBalance = Math.max(0, state.totalReservedBalance - releasedAmount);
        
        console.log(`🔀 FORCE RELEASING bet reservation: ${(releasedAmount / 1000000).toFixed(6)} VOI for spin ${spin.id.slice(-8)}. Total reserved now: ${(newReservedBalance / 1000000).toFixed(6)} VOI`);
        
        return {
          ...state,
          totalReservedBalance: newReservedBalance,
          lastUpdated: Date.now()
        };
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
    },

    // Validate reserved balance consistency (debug helper)
    validateReservedBalance() {
      update(state => {
        const activeReservations = state.spins
          .filter(spin => [SpinStatus.PENDING, SpinStatus.SUBMITTING].includes(spin.status))
          .reduce((total, spin) => total + spin.totalBet, 0);
        
        if (activeReservations !== state.totalReservedBalance) {
          console.warn(`⚠️ RESERVATION MISMATCH: Expected ${(activeReservations / 1000000).toFixed(6)} VOI but have ${(state.totalReservedBalance / 1000000).toFixed(6)} VOI reserved`);
          console.warn('Active reservations by spin:', state.spins
            .filter(spin => [SpinStatus.PENDING, SpinStatus.SUBMITTING].includes(spin.status))
            .map(spin => `${spin.id.slice(-8)}: ${(spin.totalBet / 1000000).toFixed(6)} VOI (${spin.status})`)
          );
          
          // Auto-correct the reserved balance
          return {
            ...state,
            totalReservedBalance: Math.max(0, activeReservations),
            lastUpdated: Date.now()
          };
        }
        
        console.log(`✅ Reserved balance validated: ${(state.totalReservedBalance / 1000000).toFixed(6)} VOI`);
        return state;
      });
    }
  };
}

export const queueStore = createQueueStore();

// Export debug helpers to global window for troubleshooting
if (typeof window !== 'undefined') {
  (window as any).validateQueueReservations = () => queueStore.validateReservedBalance();
  (window as any).debugQueueState = () => {
    let state: any;
    const unsub = queueStore.subscribe(s => { state = s; });
    unsub();
    console.log('Queue State:', {
      totalSpins: state.spins.length,
      pendingSpins: state.spins.filter((s: any) => s.status === 'pending').length,
      completedSpins: state.spins.filter((s: any) => s.status === 'completed').length,
      totalReservedBalance: `${(state.totalReservedBalance / 1000000).toFixed(6)} VOI`,
      spins: state.spins.map((s: any) => ({
        id: s.id.slice(-8),
        status: s.status,
        totalBet: `${(s.totalBet / 1000000).toFixed(6)} VOI`,
        winnings: s.winnings ? `${(s.winnings / 1000000).toFixed(6)} VOI` : '0'
      }))
    });
  };
}

// Derived stores for convenience
export const queueStats = derived(
  queueStore,
  ($queue): QueueStats => {
    const spins = $queue.spins;
    
    // Only count spins that actually executed or are in progress (exclude failed/expired)
    const validSpins = spins.filter(s => 
      ![SpinStatus.FAILED, SpinStatus.EXPIRED].includes(s.status)
    );
    
    return {
      totalSpins: spins.length,
      pendingSpins: spins.filter(s => [SpinStatus.PENDING, SpinStatus.SUBMITTING, SpinStatus.WAITING, SpinStatus.PROCESSING].includes(s.status)).length,
      completedSpins: spins.filter(s => s.status === SpinStatus.COMPLETED).length,
      failedSpins: spins.filter(s => [SpinStatus.FAILED, SpinStatus.EXPIRED].includes(s.status)).length,
      totalWagered: validSpins.reduce((sum, spin) => sum + spin.totalBet, 0),
      totalWinnings: validSpins.reduce((sum, spin) => sum + (spin.winnings || 0), 0),
      netProfit: validSpins.reduce((sum, spin) => sum + (spin.winnings || 0) - spin.totalBet, 0)
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

// Get all non-pending spins for pagination
export const allSpins = derived(
  queueStore,
  $queue => $queue.spins
    .filter(spin => spin.status !== SpinStatus.PENDING)
    .sort((a, b) => b.timestamp - a.timestamp)
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
