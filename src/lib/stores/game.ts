import { writable, derived } from 'svelte/store';
import type { SlotSymbol, GameGrid, SpinAnimation, PaylineHighlight } from '$lib/types/symbols';
import { getSymbol, getDeterministicReelSymbol } from '$lib/constants/symbols';

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
  // Initialize with deterministic grid using modulo approach
  const initialGrid: GameGrid = {
    reels: Array(5).fill(null).map((_, reelIndex) => 
      Array(100).fill(null).map((_, symbolIndex) => getDeterministicReelSymbol(reelIndex, symbolIndex))
    ),
    visibleGrid: Array(5).fill(null).map((_, reelIndex) => 
      Array(3).fill(null).map((_, symbolIndex) => getDeterministicReelSymbol(reelIndex, symbolIndex))
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
    
    // Initialize game with deterministic symbols using modulo approach
    initializeGrid() {
      update(state => ({
        ...state,
        grid: {
          reels: Array(5).fill(null).map((_, reelIndex) => 
            Array(100).fill(null).map((_, symbolIndex) => getDeterministicReelSymbol(reelIndex, symbolIndex))
          ),
          visibleGrid: Array(5).fill(null).map((_, reelIndex) => 
            Array(3).fill(null).map((_, symbolIndex) => getDeterministicReelSymbol(reelIndex, symbolIndex))
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

        // Don't generate random symbols - physics engine handles animation
        // Only create animations if final symbols are provided
        const animations: SpinAnimation[] = finalSymbols 
          ? finalSymbols.map((reel, index) => ({
              reelIndex: index,
              duration: 1000 + (index * 200), // Staggered timing
              delay: index * 100,
              finalSymbols: reel.map(symbolId => getSymbol(symbolId))
            }))
          : []; // No animations during physics spinning

        // Starting spin animation
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

        console.log('🎯 Game Store: Setting final grid from outcome:', finalSymbols);
        const newVisibleGrid = finalSymbols.map((reel, reelIndex) => 
          reel.map((symbolId, symbolIndex) => {
            const symbol = getSymbol(symbolId);
            if (reelIndex === 0 && symbolIndex === 0) {
              console.log(`🔄 Symbol mapping example: '${symbolId}' → '${symbol.id}' (${symbol.displayName})`);
            }
            return symbol;
          })
        );
        console.log('🎯 Game Store: Final visible grid symbols:', newVisibleGrid.map(reel => reel.map(s => s.id)));

        // Completing spin animation
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