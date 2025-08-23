import { writable, derived } from 'svelte/store';
import { walletBalance, walletAddress } from '$lib/stores/wallet';
import { reservedBalance } from '$lib/stores/queue';
import type { BettingState, BetValidationResult, BettingLimits } from '$lib/types/betting';
import { 
  BETTING_CONSTANTS, 
  BETTING_ERRORS, 
  formatVOI, 
  parseVOI,
  isValidBetAmount,
  isValidPaylineCount
} from '$lib/constants/betting';
import { balanceCalculator } from '$lib/services/balanceCalculator';
import { validateBetSizing } from '$lib/utils/balanceUtils';
import { get } from 'svelte/store';

function createBettingStore() {
  const { subscribe, set, update } = writable<BettingState>({
    betPerLine: BETTING_CONSTANTS.DEFAULT_BET_PER_LINE,
    selectedPaylines: BETTING_CONSTANTS.DEFAULT_PAYLINES,
    totalBet: BETTING_CONSTANTS.DEFAULT_BET_PER_LINE * BETTING_CONSTANTS.DEFAULT_PAYLINES,
    isValidBet: true,
    errors: [],
    lastBet: null
  });

  function validateBet(betPerLine: number, selectedPaylines: number, walletBalance: number): BetValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate bet per line
    if (!isValidBetAmount(betPerLine)) {
      if (betPerLine < BETTING_CONSTANTS.MIN_BET_PER_LINE) {
        errors.push(`Minimum bet per line is ${formatVOI(BETTING_CONSTANTS.MIN_BET_PER_LINE)} VOI`);
      } else {
        errors.push(`Maximum bet per line is ${formatVOI(BETTING_CONSTANTS.MAX_BET_PER_LINE)} VOI`);
      }
    }

    // Validate paylines
    if (!isValidPaylineCount(selectedPaylines)) {
      errors.push(`Paylines must be between ${BETTING_CONSTANTS.MIN_PAYLINES} and ${BETTING_CONSTANTS.MAX_PAYLINES}`);
    }

    // Calculate and validate total bet
    const totalBet = betPerLine * selectedPaylines;
    if (totalBet > BETTING_CONSTANTS.MAX_TOTAL_BET) {
      errors.push(`Total bet cannot exceed ${formatVOI(BETTING_CONSTANTS.MAX_TOTAL_BET)} VOI`);
    }

    // Enhanced balance validation
    const userAddress = get(walletAddress);
    if (userAddress) {
      // Try enhanced validation first
      validateEnhancedBalance(betPerLine, selectedPaylines, walletBalance, userAddress)
        .then(result => {
          // This will be handled asynchronously, but we provide immediate feedback
          // The UI will need to re-validate when this promise resolves
        })
        .catch(error => {
          console.error('Enhanced balance validation failed:', error);
        });
    }

    // Fallback to simple validation for immediate response
    if (totalBet > walletBalance) {
      errors.push(BETTING_ERRORS.INSUFFICIENT_BALANCE);
    }

    // Validate bet sizing
    const betSizing = validateBetSizing(totalBet, walletBalance);
    warnings.push(...betSizing.warnings);
    if (!betSizing.isValid) {
      errors.push('Bet amount too large relative to wallet balance');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Enhanced balance validation (async)
  async function validateEnhancedBalance(
    betPerLine: number, 
    selectedPaylines: number, 
    walletBalance: number, 
    userAddress: string
  ): Promise<BetValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const validation = await balanceCalculator.validateSufficientBalance(
        betPerLine, 
        selectedPaylines, 
        userAddress, 
        walletBalance
      );

      if (!validation.isValid) {
        errors.push(...validation.errors);
      }

      // Add warnings for high reserved balance
      if (validation.requirement.pendingReserved > walletBalance * 0.6) {
        warnings.push(
          `High reserved balance: ${formatVOI(validation.requirement.pendingReserved)} VOI reserved for pending spins`
        );
      }

    } catch (error) {
      console.error('Enhanced balance validation failed:', error);
      // Fallback to simple validation
      const totalBet = betPerLine * selectedPaylines;
      if (totalBet * 1.5 > walletBalance) { // 50% overhead estimate
        errors.push(`Insufficient balance (estimated). Need ~${formatVOI(totalBet * 1.5)} VOI including fees`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  function updateBetInternal(betPerLine: number, selectedPaylines: number, balance: number) {
    const validation = validateBet(betPerLine, selectedPaylines, balance);
    const totalBet = betPerLine * selectedPaylines;

    update(state => ({
      ...state,
      betPerLine,
      selectedPaylines,
      totalBet,
      isValidBet: validation.isValid,
      errors: validation.errors
    }));
  }

  return {
    subscribe,

    // Set bet per line
    setBetPerLine(amount: number) {
      const validAmount = Math.max(
        BETTING_CONSTANTS.MIN_BET_PER_LINE,
        Math.min(amount, BETTING_CONSTANTS.MAX_BET_PER_LINE)
      );
      
      // Get current balance and update
      let currentBalance = 0;
      const unsubscribe = walletBalance.subscribe(balance => {
        currentBalance = balance;
      });
      unsubscribe();

      update(state => {
        const validation = validateBet(validAmount, state.selectedPaylines, currentBalance);
        const totalBet = validAmount * state.selectedPaylines;
        
        return {
          ...state,
          betPerLine: validAmount,
          selectedPaylines: state.selectedPaylines,
          totalBet,
          isValidBet: validation.isValid,
          errors: validation.errors
        };
      });
    },

    // Set bet per line from VOI string
    setBetFromVOI(voiAmount: string) {
      const microVOI = parseVOI(voiAmount);
      
      const validAmount = Math.max(
        BETTING_CONSTANTS.MIN_BET_PER_LINE,
        Math.min(microVOI, BETTING_CONSTANTS.MAX_BET_PER_LINE)
      );
      
      // Get current balance and update
      let currentBalance = 0;
      const unsubscribe = walletBalance.subscribe(balance => {
        currentBalance = balance;
      });
      unsubscribe();

      update(state => {
        const validation = validateBet(validAmount, state.selectedPaylines, currentBalance);
        const totalBet = validAmount * state.selectedPaylines;
        
        return {
          ...state,
          betPerLine: validAmount,
          selectedPaylines: state.selectedPaylines,
          totalBet,
          isValidBet: validation.isValid,
          errors: validation.errors
        };
      });
    },

    // Set selected paylines
    setPaylines(count: number) {
      const validCount = Math.max(
        BETTING_CONSTANTS.MIN_PAYLINES,
        Math.min(count, BETTING_CONSTANTS.MAX_PAYLINES)
      );
      
      // Get current balance and update
      let currentBalance = 0;
      const unsubscribe = walletBalance.subscribe(balance => {
        currentBalance = balance;
      });
      unsubscribe();

      update(state => {
        const validation = validateBet(state.betPerLine, validCount, currentBalance);
        const totalBet = state.betPerLine * validCount;
        
        return {
          ...state,
          betPerLine: state.betPerLine,
          selectedPaylines: validCount,
          totalBet,
          isValidBet: validation.isValid,
          errors: validation.errors
        };
      });
    },

    // Increase paylines
    increasePaylines() {
      update(state => {
        const newCount = Math.min(state.selectedPaylines + 1, BETTING_CONSTANTS.MAX_PAYLINES);
        
        let currentBalance = 0;
        const unsubscribe = walletBalance.subscribe(balance => {
          currentBalance = balance;
        });
        unsubscribe();

        const validation = validateBet(state.betPerLine, newCount, currentBalance);
        const totalBet = state.betPerLine * newCount;
        
        return {
          ...state,
          betPerLine: state.betPerLine,
          selectedPaylines: newCount,
          totalBet,
          isValidBet: validation.isValid,
          errors: validation.errors
        };
      });
    },

    // Decrease paylines
    decreasePaylines() {
      update(state => {
        const newCount = Math.max(state.selectedPaylines - 1, BETTING_CONSTANTS.MIN_PAYLINES);
        
        let currentBalance = 0;
        const unsubscribe = walletBalance.subscribe(balance => {
          currentBalance = balance;
        });
        unsubscribe();

        const validation = validateBet(state.betPerLine, newCount, currentBalance);
        const totalBet = state.betPerLine * newCount;
        
        return {
          ...state,
          betPerLine: state.betPerLine,
          selectedPaylines: newCount,
          totalBet,
          isValidBet: validation.isValid,
          errors: validation.errors
        };
      });
    },

    // Increase bet per line
    increaseBetPerLine() {
      update(state => {
        const increment = 1_000_000; // 1 VOI
        const newAmount = Math.min(state.betPerLine + increment, BETTING_CONSTANTS.MAX_BET_PER_LINE);
        
        let currentBalance = 0;
        const unsubscribe = walletBalance.subscribe(balance => {
          currentBalance = balance;
        });
        unsubscribe();

        const validation = validateBet(newAmount, state.selectedPaylines, currentBalance);
        const totalBet = newAmount * state.selectedPaylines;
        
        return {
          ...state,
          betPerLine: newAmount,
          selectedPaylines: state.selectedPaylines,
          totalBet,
          isValidBet: validation.isValid,
          errors: validation.errors
        };
      });
    },

    // Decrease bet per line
    decreaseBetPerLine() {
      update(state => {
        const decrement = 1_000_000; // 1 VOI
        const newAmount = Math.max(state.betPerLine - decrement, BETTING_CONSTANTS.MIN_BET_PER_LINE);
        
        let currentBalance = 0;
        const unsubscribe = walletBalance.subscribe(balance => {
          currentBalance = balance;
        });
        unsubscribe();

        const validation = validateBet(newAmount, state.selectedPaylines, currentBalance);
        const totalBet = newAmount * state.selectedPaylines;
        
        return {
          ...state,
          betPerLine: newAmount,
          selectedPaylines: state.selectedPaylines,
          totalBet,
          isValidBet: validation.isValid,
          errors: validation.errors
        };
      });
    },

    // Set paylines to maximum
    setMaxPaylines() {
      let currentBalance = 0;
      const unsubscribe = walletBalance.subscribe(balance => {
        currentBalance = balance;
      });
      unsubscribe();

      update(state => {
        const maxCount = BETTING_CONSTANTS.MAX_PAYLINES;
        const validation = validateBet(state.betPerLine, maxCount, currentBalance);
        const totalBet = state.betPerLine * maxCount;
        
        return {
          ...state,
          betPerLine: state.betPerLine,
          selectedPaylines: maxCount,
          totalBet,
          isValidBet: validation.isValid,
          errors: validation.errors
        };
      });
    },

    // Set quick bet amount
    setQuickBet(voiAmount: number) {
      const microVOI = voiAmount * 1_000_000;
      
      const validAmount = Math.max(
        BETTING_CONSTANTS.MIN_BET_PER_LINE,
        Math.min(microVOI, BETTING_CONSTANTS.MAX_BET_PER_LINE)
      );
      
      // Get current balance and update
      let currentBalance = 0;
      const unsubscribe = walletBalance.subscribe(balance => {
        currentBalance = balance;
      });
      unsubscribe();

      update(state => {
        const validation = validateBet(validAmount, state.selectedPaylines, currentBalance);
        const totalBet = validAmount * state.selectedPaylines;
        
        return {
          ...state,
          betPerLine: validAmount,
          selectedPaylines: state.selectedPaylines,
          totalBet,
          isValidBet: validation.isValid,
          errors: validation.errors
        };
      });
    },

    // Max bet (but respect total limit)
    setMaxBet() {
      let currentBalance = 0;
      const unsubscribe = walletBalance.subscribe(balance => {
        currentBalance = balance;
      });
      unsubscribe();

      update(state => {
        // Calculate max bet per line that keeps total under limit
        const maxBetPerLine = Math.min(
          BETTING_CONSTANTS.MAX_TOTAL_BET / state.selectedPaylines,
          currentBalance / state.selectedPaylines,
          BETTING_CONSTANTS.MAX_BET_PER_LINE
        );
        
        const validAmount = Math.floor(maxBetPerLine);
        const validation = validateBet(validAmount, state.selectedPaylines, currentBalance);
        const totalBet = validAmount * state.selectedPaylines;
        
        return {
          ...state,
          betPerLine: validAmount,
          selectedPaylines: state.selectedPaylines,
          totalBet,
          isValidBet: validation.isValid,
          errors: validation.errors
        };
      });
    },

    // Record bet history
    recordBet(outcome?: string) {
      update(state => ({
        ...state,
        lastBet: {
          betPerLine: state.betPerLine,
          selectedPaylines: state.selectedPaylines,
          totalBet: state.totalBet,
          timestamp: Date.now(),
          outcome
        }
      }));
    },

    // Trigger enhanced validation and update store
    async validateEnhanced() {
      const userAddress = get(walletAddress);
      if (!userAddress) return;

      const currentBalance = get(walletBalance);
      
      update(state => {
        const enhancedValidation = validateEnhancedBalance(
          state.betPerLine, 
          state.selectedPaylines, 
          currentBalance, 
          userAddress
        );

        enhancedValidation.then(result => {
          update(currentState => ({
            ...currentState,
            isValidBet: result.isValid,
            errors: [...result.errors, ...result.warnings]
          }));
        }).catch(error => {
          console.error('Enhanced validation update failed:', error);
        });

        return state;
      });
    },

    // Reset to defaults
    reset() {
      set({
        betPerLine: BETTING_CONSTANTS.DEFAULT_BET_PER_LINE,
        selectedPaylines: BETTING_CONSTANTS.DEFAULT_PAYLINES,
        totalBet: BETTING_CONSTANTS.DEFAULT_BET_PER_LINE * BETTING_CONSTANTS.DEFAULT_PAYLINES,
        isValidBet: true,
        errors: [],
        lastBet: null
      });
    }
  };
}

export const bettingStore = createBettingStore();

// Derived stores for convenience
export const betPerLineVOI = derived(
  bettingStore,
  $betting => formatVOI($betting.betPerLine, 0)
);

export const totalBetVOI = derived(
  bettingStore,
  $betting => formatVOI($betting.totalBet, 0)
);

export const canAffordBet = derived(
  [bettingStore, walletBalance, reservedBalance, walletAddress],
  ([$betting, $balance, $reserved, $address]) => {
    if (!$address || !$balance) return false;
    
    // Calculate available balance after pending spins
    const availableBalance = $balance - ($reserved || 0);
    
    // Estimate total transaction cost (bet + fees)
    const minTransactionCost = 50500 + 30000 + 28500 + 15000 + 1000000; // spin + 1 payline + box + network + buffer
    const estimatedTotalCost = $betting.totalBet + minTransactionCost;
    
    return availableBalance >= estimatedTotalCost;
  }
);

export const bettingLimits = derived(
  walletBalance,
  $balance => ({
    minBetPerLine: BETTING_CONSTANTS.MIN_BET_PER_LINE,
    maxBetPerLine: BETTING_CONSTANTS.MAX_BET_PER_LINE,
    minPaylines: BETTING_CONSTANTS.MIN_PAYLINES,
    maxPaylines: BETTING_CONSTANTS.MAX_PAYLINES,
    maxTotalBet: BETTING_CONSTANTS.MAX_TOTAL_BET,
    walletBalance: $balance
  })
);