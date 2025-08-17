import { writable, derived } from 'svelte/store';
import type { SlotSymbol, GameGrid, SpinAnimation, PaylineHighlight } from '$lib/types/symbols';
import { getSymbol, getRandomSymbol } from '$lib/constants/symbols';

interface GameState {
  grid: GameGrid;
  isSpinning: boolean;
  spinAnimations: SpinAnimation[];
  paylineHighlights: PaylineHighlight[];
  lastWin: number;
  autoPlay: boolean;
  selectedPaylines: number;
  betPerLine: number;
  currentSpinId: string | null; // Track which spin is currently displayed
  waitingForOutcome: boolean; // True when spinning continuously waiting for outcome
}

function createGameStore() {
  // Initialize with empty grid
  const initialGrid: GameGrid = {
    reels: Array(5).fill(null).map(() => 
      Array(100).fill(null).map(() => getRandomSymbol())
    ),
    visibleGrid: Array(5).fill(null).map(() => 
      Array(3).fill(null).map(() => getSymbol('_'))
    )
  };

  const { subscribe, set, update } = writable<GameState>({
    grid: initialGrid,
    isSpinning: false,
    spinAnimations: [],
    paylineHighlights: [],
    lastWin: 0,
    autoPlay: false,
    selectedPaylines: 1,
    betPerLine: 1000000, // 1 VOI in microVOI
    currentSpinId: null,
    waitingForOutcome: false
  });

  return {
    subscribe,
    
    // Initialize game with random symbols
    initializeGrid() {
      update(state => ({
        ...state,
        grid: {
          reels: Array(5).fill(null).map(() => 
            Array(100).fill(null).map(() => getRandomSymbol())
          ),
          visibleGrid: Array(5).fill(null).map(() => 
            Array(3).fill(null).map(() => getRandomSymbol())
          )
        }
      }));
    },

    // Start spin animation with spin ID tracking
    startSpin(spinId: string, finalSymbols?: string[][]) {
      update(state => {
        // If there's already a spin for this ID that's waiting for outcome, don't restart
        if (state.currentSpinId === spinId && state.waitingForOutcome) {
          return state;
        }

        // Generate final symbols if not provided
        const finalGrid = finalSymbols 
          ? finalSymbols.map(reel => reel.map(symbolId => getSymbol(symbolId)))
          : Array(5).fill(null).map(() => 
              Array(3).fill(null).map(() => getRandomSymbol())
            );

        // Create staggered spin animations
        const animations: SpinAnimation[] = Array(5).fill(null).map((_, index) => ({
          reelIndex: index,
          duration: 1000 + (index * 200), // Staggered timing
          delay: index * 100,
          finalSymbols: finalGrid[index]
        }));

        return {
          ...state,
          isSpinning: true,
          currentSpinId: spinId,
          waitingForOutcome: true, // Keep spinning until outcome is known
          spinAnimations: animations,
          paylineHighlights: [] // Clear previous highlights
        };
      });
    },

    // Complete spin animation with actual outcome
    completeSpin(spinId: string, finalSymbols: string[][]) {
      update(state => {
        // Only complete if this is the current spin
        if (state.currentSpinId !== spinId) {
          return state;
        }

        const newVisibleGrid = finalSymbols.map(reel => 
          reel.map(symbolId => getSymbol(symbolId))
        );

        return {
          ...state,
          isSpinning: false,
          waitingForOutcome: false,
          spinAnimations: [],
          grid: {
            ...state.grid,
            visibleGrid: newVisibleGrid
          }
        };
      });
    },

    // Continue spinning animation (for continuous spin effect)
    continueSpinning(spinId: string) {
      update(state => {
        // Only continue if this is the current spin and we're waiting for outcome
        if (state.currentSpinId !== spinId || !state.waitingForOutcome) {
          return state;
        }

        // Generate new random symbols for continuous spinning
        const randomGrid = Array(5).fill(null).map(() => 
          Array(3).fill(null).map(() => getRandomSymbol())
        );

        // Restart spin animations
        const animations: SpinAnimation[] = Array(5).fill(null).map((_, index) => ({
          reelIndex: index,
          duration: 1000 + (index * 200),
          delay: index * 100,
          finalSymbols: randomGrid[index]
        }));

        return {
          ...state,
          isSpinning: true,
          spinAnimations: animations,
          grid: {
            ...state.grid,
            visibleGrid: randomGrid
          }
        };
      });
    },

    // Highlight paylines for wins
    highlightPaylines(paylines: PaylineHighlight[]) {
      update(state => ({
        ...state,
        paylineHighlights: paylines
      }));
    },

    // Clear payline highlights
    clearHighlights() {
      update(state => ({
        ...state,
        paylineHighlights: []
      }));
    },

    // Update bet settings
    updateBet(betPerLine: number, selectedPaylines: number) {
      update(state => ({
        ...state,
        betPerLine: Math.max(betPerLine, 1000000), // Minimum 1 VOI
        selectedPaylines: Math.max(1, Math.min(selectedPaylines, 20))
      }));
    },

    // Toggle auto play
    toggleAutoPlay() {
      update(state => ({
        ...state,
        autoPlay: !state.autoPlay
      }));
    },

    // Reset game state
    reset() {
      update(state => ({
        ...state,
        isSpinning: false,
        waitingForOutcome: false,
        currentSpinId: null,
        spinAnimations: [],
        paylineHighlights: [],
        lastWin: 0,
        autoPlay: false
      }));
    },

    // Check if a new spin can take over (for display priority)
    canTakeOverDisplay(newSpinId: string) {
      let canTakeOver = false;
      const unsubscribe = subscribe(state => {
        // Can take over if no current spin, or if we're not waiting for outcome
        canTakeOver = !state.currentSpinId || !state.waitingForOutcome;
      });
      unsubscribe();
      return canTakeOver;
    }
  };
}

export const gameStore = createGameStore();

// Derived stores for convenience
export const isSpinning = derived(gameStore, $game => $game.isSpinning);
export const currentGrid = derived(gameStore, $game => $game.grid.visibleGrid);
export const totalBet = derived(gameStore, $game => $game.betPerLine * $game.selectedPaylines);
export const waitingForOutcome = derived(gameStore, $game => $game.waitingForOutcome);
export const currentSpinId = derived(gameStore, $game => $game.currentSpinId);