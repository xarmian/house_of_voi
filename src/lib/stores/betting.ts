import { writable, derived } from 'svelte/store';
import { walletBalance } from '$lib/stores/wallet';
import type { BettingState, BetValidationResult, BettingLimits } from '$lib/types/betting';
import { 
  BETTING_CONSTANTS, 
  BETTING_ERRORS, 
  formatVOI, 
  parseVOI,
  isValidBetAmount,
  isValidPaylineCount
} from '$lib/constants/betting';

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

    // Validate wallet balance
    if (totalBet > walletBalance) {
      errors.push(BETTING_ERRORS.INSUFFICIENT_BALANCE);
    }

    // Warnings for high bets
    if (totalBet > walletBalance * 0.5) {
      warnings.push('This bet is more than 50% of your balance');
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
  $betting => formatVOI($betting.betPerLine)
);

export const totalBetVOI = derived(
  bettingStore,
  $betting => formatVOI($betting.totalBet)
);

export const canAffordBet = derived(
  [bettingStore, walletBalance],
  ([$betting, $balance]) => $betting.totalBet <= $balance
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