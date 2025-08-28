/**
 * Pure TypeScript game state management
 * Independent of any display technology (Svelte, WebGL, etc.)
 */

export interface GameState {
  // Core reel data
  reels: string[][]; // Full reel data from contract (5 reels x 100 symbols)
  currentOutcome: string[][]; // Current visible 5x3 grid
  
  // Spin state
  isSpinning: boolean;
  currentSpinId: string | null;
  waitingForOutcome: boolean;
  
  // Betting
  betPerLine: number; // In microVOI
  selectedPaylines: number;
  totalBet: number; // betPerLine * selectedPaylines
  
  // Balance and winnings (display only - actual validation uses wallet stores)
  balance: number; // In microVOI - for display purposes only, not used for validation
  lastWinAmount: number;
  
  // Game settings
  autoPlay: boolean;
  soundEnabled: boolean;
  
  // Contract state
  contractReelsData: string; // Raw 500-character string from contract
  isLoadingReels: boolean;
  reelsError: string | null;
}

export interface SpinResult {
  spinId: string;
  outcome: string[][];
  winnings: number;
  winningPaylines: WinningPayline[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp: number;
  betAmount: number;
  error?: string;
}

export interface WinningPayline {
  paylineIndex: number;
  payline: number[]; // Row positions for each reel
  symbol: string;
  count: number;
  multiplier: number;
  winAmount: number;
}

export interface GameConfig {
  minBetPerLine: number;
  maxBetPerLine: number;
  maxPaylines: number;
  reelCount: number;
  symbolsPerReel: number;
  visibleSymbols: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  minBetPerLine: 1000000, // 1 VOI
  maxBetPerLine: 100000000, // 100 VOI
  maxPaylines: 20,
  reelCount: 5,
  symbolsPerReel: 100,
  visibleSymbols: 3
};

export const INITIAL_GAME_STATE: GameState = {
  reels: [],
  currentOutcome: Array(5).fill(null).map(() => Array(3).fill('_')),
  isSpinning: false,
  currentSpinId: null,
  waitingForOutcome: false,
  betPerLine: DEFAULT_GAME_CONFIG.minBetPerLine,
  selectedPaylines: 1,
  totalBet: DEFAULT_GAME_CONFIG.minBetPerLine,
  balance: 0,
  lastWinAmount: 0,
  autoPlay: false,
  soundEnabled: true,
  contractReelsData: '',
  isLoadingReels: false,
  reelsError: null
};

/**
 * Pure state update functions (no side effects)
 */
export class GameStateManager {
  private state: GameState;
  private listeners: Map<string, Function[]> = new Map();
  
  constructor(initialState: GameState = INITIAL_GAME_STATE) {
    this.state = { ...initialState };
  }
  
  getState(): Readonly<GameState> {
    return this.state;
  }
  
  updateState(updates: Partial<GameState>): void {
    const prevState = this.state;
    this.state = { ...this.state, ...updates };
    this.notifyListeners('stateChanged', { prevState, newState: this.state });
  }
  
  // Betting operations
  setBet(betPerLine: number, selectedPaylines: number): boolean {
    const clampedBetPerLine = Math.max(
      DEFAULT_GAME_CONFIG.minBetPerLine,
      Math.min(betPerLine, DEFAULT_GAME_CONFIG.maxBetPerLine)
    );
    const clampedPaylines = Math.max(1, Math.min(selectedPaylines, DEFAULT_GAME_CONFIG.maxPaylines));
    const totalBet = clampedBetPerLine * clampedPaylines;
    
    // Remove balance check - let the queue and betting stores handle balance validation
    // The engine is for display coordination, not financial validation
    
    this.updateState({
      betPerLine: clampedBetPerLine,
      selectedPaylines: clampedPaylines,
      totalBet
    });
    
    return true; // Always return true, queue will handle validation
  }
  
  // Spin state management
  startSpin(spinId: string): void {
    this.updateState({
      isSpinning: true,
      currentSpinId: spinId,
      waitingForOutcome: true,
      lastWinAmount: 0
    });
  }
  
  completeSpin(spinResult: SpinResult): void {
    this.updateState({
      isSpinning: false,
      waitingForOutcome: false,
      currentOutcome: spinResult.outcome,
      lastWinAmount: spinResult.winnings,
      balance: this.state.balance + spinResult.winnings
    });
  }
  
  failSpin(error: string): void {
    this.updateState({
      isSpinning: false,
      waitingForOutcome: false,
      currentSpinId: null
    });
  }
  
  // Reel data management
  setReelData(contractData: string): void {
    if (contractData.length !== 500) {
      this.updateState({
        reelsError: 'Invalid reel data length',
        isLoadingReels: false
      });
      return;
    }
    
    // Parse 500-character string into 5 reels of 100 symbols each
    const reels: string[][] = [];
    for (let reelIndex = 0; reelIndex < 5; reelIndex++) {
      const startPos = reelIndex * 100;
      const reelSymbols = contractData.slice(startPos, startPos + 100).split('');
      reels.push(reelSymbols);
    }
    
    this.updateState({
      contractReelsData: contractData,
      reels,
      isLoadingReels: false,
      reelsError: null
    });
  }
  
  setLoadingReels(loading: boolean): void {
    this.updateState({ isLoadingReels: loading });
  }
  
  setReelsError(error: string): void {
    this.updateState({ 
      reelsError: error,
      isLoadingReels: false
    });
  }
  
  // Event system
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }
  
  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }
  
  private notifyListeners(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }
  
  // Reset to initial state
  reset(): void {
    this.state = { ...INITIAL_GAME_STATE };
    this.notifyListeners('stateChanged', { 
      prevState: INITIAL_GAME_STATE, 
      newState: this.state 
    });
  }
}