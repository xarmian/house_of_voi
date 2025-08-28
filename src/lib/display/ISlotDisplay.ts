/**
 * Display interface for slot machine
 * Defines the contract between game logic and display layer
 * Can be implemented by WebGL, Canvas, DOM, or any other rendering technology
 */

export interface DisplayConfig {
  width: number;
  height: number;
  theme: string;
  reelCount: number;
  visibleSymbols: number;
  enableParticles: boolean;
  enableMotionBlur: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
}

export interface ReelConfig {
  symbols: string[];
  position: number; // Current scroll position
  targetPosition?: number; // Target position for stopping
  spinning: boolean;
}

export interface WinData {
  amount: number;
  multiplier: number;
  level: 'small' | 'medium' | 'large' | 'jackpot';
  winningSymbols: string[];
  gridOutcome: string[][];
  paylines: PaylineData[];
}

export interface PaylineData {
  index: number;
  positions: number[]; // Row index for each reel
  symbol: string;
  count: number;
  winAmount: number;
}

export interface ParticleConfig {
  type: 'explosion' | 'coin-rain' | 'symbol-burst' | 'sparkles';
  count: number;
  colors: string[];
  duration: number;
  intensity: 'low' | 'medium' | 'high' | 'extreme';
}

export interface SpinAnimationConfig {
  duration: number;
  staggerDelay: number; // Delay between reel stops
  easing: 'linear' | 'ease-out' | 'bounce';
  blur: boolean;
}

/**
 * Main display interface that all rendering implementations must implement
 */
export interface ISlotDisplay {
  /**
   * Initialize the display system
   */
  initialize(container: HTMLElement, config: DisplayConfig): Promise<void>;
  
  /**
   * Clean up resources and destroy the display
   */
  destroy(): void;
  
  /**
   * Update display configuration
   */
  updateConfig(config: Partial<DisplayConfig>): void;
  
  // === REEL OPERATIONS ===
  
  /**
   * Set the reel data (symbols for each reel)
   */
  setReelData(reels: string[][]): void;
  
  /**
   * Set payline definitions from contract
   */
  setPaylines(paylines: number[][]): void;
  
  /**
   * Show selected paylines for a duration when user changes line count
   */
  showSelectedPaylines(lineCount: number): void;
  
  /**
   * Start spinning all reels
   */
  startSpin(spinId: string, config?: SpinAnimationConfig): void;
  
  /**
   * Stop a specific reel with given outcome
   */
  stopReel(reelIndex: number, outcome: string[], delay?: number): void;
  
  /**
   * Show the final outcome (all reels stopped)
   */
  showOutcome(grid: string[][], spinId: string): void;
  
  /**
   * Reset reels to initial state
   */
  resetReels(): void;
  
  // === VISUAL EFFECTS ===
  
  /**
   * Show win celebration effects
   */
  showWinCelebration(winData: WinData): void;
  
  /**
   * Highlight winning paylines
   */
  highlightPaylines(paylines: PaylineData[], duration?: number): void;
  
  /**
   * Show particle effects
   */
  showParticles(config: ParticleConfig): void;
  
  /**
   * Apply screen effects (shake, flash, etc.)
   */
  applyScreenEffect(effect: 'shake' | 'flash' | 'zoom', intensity?: number): void;
  
  /**
   * Hide all effects and reset to normal state
   */
  clearEffects(): void;
  
  // === STATE QUERIES ===
  
  /**
   * Check if display is ready to accept commands
   */
  isReady(): boolean;
  
  /**
   * Check if currently animating
   */
  isAnimating(): boolean;
  
  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): DisplayPerformanceMetrics;
  
  // === EVENT SYSTEM ===
  
  /**
   * Listen for events from the display
   */
  on(event: DisplayEvent, callback: (data?: any) => void): void;
  
  /**
   * Stop listening for events
   */
  off(event: DisplayEvent, callback: (data?: any) => void): void;
  
  /**
   * Emit an event (for internal use)
   */
  emit(event: DisplayEvent, data?: any): void;
}

/**
 * Events that displays can emit to communicate with game logic
 */
export type DisplayEvent = 
  | 'ready'           // Display is initialized and ready
  | 'spin-requested'  // User requested a spin
  | 'bet-changed'     // User changed bet amount
  | 'paylines-changed' // User changed selected paylines
  | 'spin-complete'   // Spin animation is complete
  | 'effect-complete' // Effect animation is complete
  | 'error'           // Display error occurred
  | 'performance-warning'; // Performance issue detected

/**
 * Performance metrics for monitoring display health
 */
export interface DisplayPerformanceMetrics {
  fps: number;
  frameTime: number; // ms per frame
  memoryUsage: number; // MB
  drawCalls: number;
  particleCount: number;
  warningFlags: PerformanceWarning[];
}

export type PerformanceWarning = 
  | 'low-fps'
  | 'high-memory'
  | 'too-many-particles'
  | 'gpu-timeout';

/**
 * Base class for display implementations
 * Provides common functionality like event management
 */
export abstract class BaseSlotDisplay implements ISlotDisplay {
  protected container: HTMLElement | null = null;
  protected config: DisplayConfig | null = null;
  protected eventListeners: Map<DisplayEvent, Function[]> = new Map();
  protected initialized = false;
  
  abstract initialize(container: HTMLElement, config: DisplayConfig): Promise<void>;
  abstract destroy(): void;
  abstract updateConfig(config: Partial<DisplayConfig>): void;
  abstract setReelData(reels: string[][]): void;
  abstract setPaylines(paylines: number[][]): void;
  abstract showSelectedPaylines(lineCount: number): void;
  abstract startSpin(spinId: string, config?: SpinAnimationConfig): void;
  abstract stopReel(reelIndex: number, outcome: string[], delay?: number): void;
  abstract showOutcome(grid: string[][], spinId: string): void;
  abstract resetReels(): void;
  abstract showWinCelebration(winData: WinData): void;
  abstract highlightPaylines(paylines: PaylineData[], duration?: number): void;
  abstract showParticles(config: ParticleConfig): void;
  abstract applyScreenEffect(effect: 'shake' | 'flash' | 'zoom', intensity?: number): void;
  abstract clearEffects(): void;
  abstract isAnimating(): boolean;
  abstract getPerformanceMetrics(): DisplayPerformanceMetrics;
  
  isReady(): boolean {
    return this.initialized && this.container !== null && this.config !== null;
  }
  
  on(event: DisplayEvent, callback: (data?: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }
  
  off(event: DisplayEvent, callback: (data?: any) => void): void {
    const callbacks = this.eventListeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }
  
  emit(event: DisplayEvent, data?: any): void {
    const callbacks = this.eventListeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in display event callback for ${event}:`, error);
        }
      });
    }
  }
  
  protected validateConfig(config: DisplayConfig): void {
    if (config.width <= 0 || config.height <= 0) {
      throw new Error('Display dimensions must be positive');
    }
    if (config.reelCount <= 0 || config.visibleSymbols <= 0) {
      throw new Error('Reel configuration must be positive');
    }
  }
}

/**
 * Factory for creating display instances
 */
export type DisplayType = 'webgl' | 'canvas' | 'dom' | 'hybrid';

export interface DisplayFactory {
  create(type: DisplayType): ISlotDisplay;
  getAvailableTypes(): DisplayType[];
  getBestTypeForDevice(): DisplayType;
}