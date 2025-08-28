/**
 * SlotMachineEngine - Core game logic controller
 * Pure TypeScript implementation independent of display technology
 */

import { GameStateManager, type GameState, type SpinResult, type WinningPayline, DEFAULT_GAME_CONFIG } from './GameState';
import type { ISlotDisplay, DisplayEvent, WinData, PaylineData } from '../display/ISlotDisplay';
import { contractDataCache } from '../services/contractDataCache';
import { queueStore } from '../stores/queue';
import { SpinStatus } from '../types/queue';

export interface SpinRequest {
  betPerLine: number;
  selectedPaylines: number;
  totalBet: number;
}

export interface EngineConfig {
  autoLoadReels: boolean;
  enableSound: boolean;
  debugMode: boolean;
}

export class SlotMachineEngine {
  private stateManager: GameStateManager;
  private display: ISlotDisplay | null = null;
  private config: EngineConfig;
  private queueUnsubscribe: (() => void) | null = null;
  private processedSpinIds = new Set<string>();
  
  constructor(config: Partial<EngineConfig> = {}) {
    this.config = {
      autoLoadReels: true,
      enableSound: true,
      debugMode: false,
      ...config
    };
    
    this.stateManager = new GameStateManager();
    
    // Listen for state changes
    this.stateManager.on('stateChanged', this.handleStateChange.bind(this));
  }
  
  /**
   * Initialize the engine with a display implementation
   */
  async initialize(display: ISlotDisplay): Promise<void> {
    this.display = display;
    
    // Set up display event listeners
    this.display.on('spin-requested', this.handleSpinRequest.bind(this));
    this.display.on('bet-changed', this.handleBetChange.bind(this));
    this.display.on('paylines-changed', this.handlePaylinesChange.bind(this));
    this.display.on('spin-complete', this.handleSpinComplete.bind(this));
    
    // Load reel data if auto-load is enabled
    if (this.config.autoLoadReels) {
      await this.loadReelData();
    }
    
    // Subscribe to queue updates
    this.subscribeToQueue();
    
    console.log('🎰 SlotMachineEngine initialized');
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.queueUnsubscribe) {
      this.queueUnsubscribe();
    }
    this.display = null;
    this.processedSpinIds.clear();
  }
  
  /**
   * Get current game state (readonly)
   */
  getState(): Readonly<GameState> {
    return this.stateManager.getState();
  }
  
  /**
   * Load reel data from contract
   */
  async loadReelData(): Promise<void> {
    this.stateManager.setLoadingReels(true);
    
    try {
      console.log('🔄 Loading reel data from contract...');
      
      // Use a placeholder address for contract data cache
      const placeholderAddress = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const reelData = await contractDataCache.getReelData(placeholderAddress);
      
      this.stateManager.setReelData(reelData.reelData);
      
      // Update display with new reel data
      if (this.display && this.display.isReady()) {
        this.display.setReelData(this.stateManager.getState().reels);
      }
      
      // Also load paylines for the display
      await this.loadPaylines();
      
      console.log('✅ Reel data loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load reel data:', error);
      this.stateManager.setReelsError('Failed to load reel data from contract');
    }
  }
  
  /**
   * Load payline data from contract
   */
  async loadPaylines(): Promise<void> {
    try {
      console.log('🔄 Loading payline data from contract...');
      
      const placeholderAddress = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const paylines = await contractDataCache.getPaylines(placeholderAddress);
      
      // Update display with paylines
      if (this.display && this.display.isReady()) {
        console.log('🔍 DEBUG: Setting paylines on display. Sample paylines:', paylines.slice(0, 3));
        this.display.setPaylines(paylines);
      } else {
        console.log('❌ DEBUG: Display not ready when trying to set paylines');
      }
      
      console.log('✅ Paylines loaded successfully:', paylines.length, 'total');
    } catch (error) {
      console.error('❌ Failed to load paylines:', error);
    }
  }
  
  /**
   * Show selected paylines when betting changes
   */
  showSelectedPaylines(lineCount: number): void {
    if (this.display && this.display.isReady()) {
      this.display.showSelectedPaylines(lineCount);
    }
  }
  
  /**
   * Request a new spin
   */
  async requestSpin(request: SpinRequest): Promise<string | null> {
    const state = this.stateManager.getState();
    
    // Validate spin request
    if (state.isSpinning) {
      console.warn('Cannot start spin: already spinning');
      return null;
    }
    
    // Update bet settings (no balance check - queue handles validation)
    this.stateManager.setBet(request.betPerLine, request.selectedPaylines);
    
    // Add spin to queue (this will handle balance validation and blockchain processing)
    // The queue uses the existing wallet stores and canAffordBet logic
    const spinId = queueStore.addSpin(
      request.betPerLine,
      request.selectedPaylines,
      request.totalBet
    );
    
    // Start visual spinning immediately
    this.startVisualSpin(spinId);
    
    return spinId;
  }
  
  /**
   * Start visual spinning animation
   */
  private startVisualSpin(spinId: string): void {
    this.stateManager.startSpin(spinId);
    
    if (this.display && this.display.isReady()) {
      this.display.startSpin(spinId, {
        duration: 2000,
        staggerDelay: 200,
        easing: 'ease-out',
        blur: true
      });
    }
  }
  
  /**
   * Complete a spin with results
   */
  private completeSpin(spinResult: SpinResult): void {
    this.stateManager.completeSpin(spinResult);
    
    if (this.display && this.display.isReady()) {
      // Show final outcome
      this.display.showOutcome(spinResult.outcome, spinResult.spinId);
      
      // Show win effects if there are winnings
      if (spinResult.winnings > 0 && spinResult.winningPaylines.length > 0) {
        const winData: WinData = this.createWinData(spinResult);
        this.display.showWinCelebration(winData);
        
        // Highlight winning paylines
        const paylineData: PaylineData[] = spinResult.winningPaylines.map(wp => ({
          index: wp.paylineIndex,
          positions: wp.payline,
          symbol: wp.symbol,
          count: wp.count,
          winAmount: wp.winAmount
        }));
        
        this.display.highlightPaylines(paylineData, 3000);
      }
    }
  }
  
  /**
   * Create win data for display
   */
  private createWinData(spinResult: SpinResult): WinData {
    const state = this.stateManager.getState();
    const multiplier = state.totalBet > 0 ? spinResult.winnings / state.totalBet : 0;
    
    let level: 'small' | 'medium' | 'large' | 'jackpot';
    if (multiplier >= 100) level = 'jackpot';
    else if (multiplier >= 50) level = 'large';
    else if (multiplier >= 10) level = 'medium';
    else level = 'small';
    
    // Get unique winning symbols
    const winningSymbols = [...new Set(spinResult.winningPaylines.map(wp => wp.symbol))];
    
    return {
      amount: spinResult.winnings,
      multiplier,
      level,
      winningSymbols,
      gridOutcome: spinResult.outcome,
      paylines: spinResult.winningPaylines.map(wp => ({
        index: wp.paylineIndex,
        positions: wp.payline,
        symbol: wp.symbol,
        count: wp.count,
        winAmount: wp.winAmount
      }))
    };
  }
  
  /**
   * Subscribe to queue updates to monitor spin progress
   */
  private subscribeToQueue(): void {
    this.queueUnsubscribe = queueStore.subscribe(queueState => {
      if (!queueState.spins) return;
      
      // Find completed spins that haven't been processed yet
      const completedSpins = queueState.spins.filter(spin => 
        [SpinStatus.READY_TO_CLAIM, SpinStatus.COMPLETED].includes(spin.status) &&
        spin.outcome &&
        !this.processedSpinIds.has(spin.id)
      );
      
      // Process the most recent completed spin
      if (completedSpins.length > 0) {
        // Sort by timestamp to get most recent
        completedSpins.sort((a, b) => b.timestamp - a.timestamp);
        const latestSpin = completedSpins[0];
        
        // Only process if this is the current spin
        const state = this.stateManager.getState();
        if (state.currentSpinId === latestSpin.id) {
          this.processSpinResult(latestSpin);
        }
      }
      
      // Handle failed spins
      const failedSpins = queueState.spins.filter(spin =>
        [SpinStatus.FAILED, SpinStatus.EXPIRED].includes(spin.status) &&
        !this.processedSpinIds.has(spin.id)
      );
      
      for (const failedSpin of failedSpins) {
        const state = this.stateManager.getState();
        if (state.currentSpinId === failedSpin.id) {
          this.handleSpinFailure(failedSpin);
        }
      }
    });
  }
  
  /**
   * Process a completed spin from the queue
   */
  private processSpinResult(queueSpin: any): void {
    this.processedSpinIds.add(queueSpin.id);
    
    const spinResult: SpinResult = {
      spinId: queueSpin.id,
      outcome: queueSpin.outcome,
      winnings: queueSpin.winnings || 0,
      winningPaylines: [], // TODO: Detect winning paylines from outcome
      status: 'completed',
      timestamp: queueSpin.timestamp,
      betAmount: queueSpin.betPerLine * queueSpin.selectedPaylines
    };
    
    this.completeSpin(spinResult);
  }
  
  /**
   * Handle spin failure
   */
  private handleSpinFailure(failedSpin: any): void {
    this.processedSpinIds.add(failedSpin.id);
    this.stateManager.failSpin(failedSpin.error || 'Spin failed');
    
    if (this.display && this.display.isReady()) {
      this.display.clearEffects();
      this.display.resetReels();
    }
  }
  
  /**
   * Handle state changes and update display accordingly
   */
  private handleStateChange({ prevState, newState }: { prevState: GameState; newState: GameState }): void {
    // Update display if reel data changed
    if (prevState.reels !== newState.reels && this.display && this.display.isReady()) {
      this.display.setReelData(newState.reels);
    }
    
    // Log state changes in debug mode
    if (this.config.debugMode) {
      console.log('🔄 Game state changed:', {
        isSpinning: newState.isSpinning,
        currentSpinId: newState.currentSpinId,
        balance: newState.balance,
        totalBet: newState.totalBet
      });
    }
  }
  
  /**
   * Display event handlers
   */
  private handleSpinRequest(data: SpinRequest): void {
    this.requestSpin(data);
  }
  
  private handleBetChange(data: { betPerLine: number }): void {
    const state = this.stateManager.getState();
    this.stateManager.setBet(data.betPerLine, state.selectedPaylines);
  }
  
  private handlePaylinesChange(data: { paylines: number }): void {
    const state = this.stateManager.getState();
    this.stateManager.setBet(state.betPerLine, data.paylines);
  }
  
  private handleSpinComplete(data: { spinId: string }): void {
    if (this.config.debugMode) {
      console.log('🎰 Spin animation complete:', data.spinId);
    }
  }
  
  /**
   * Public API methods
   */
  
  /**
   * Set balance for display purposes only (called by wallet/balance managers)
   * Note: This does NOT affect spin validation - that's handled by wallet stores
   */
  setBalance(balance: number): void {
    this.stateManager.updateState({ balance });
  }
  
  /**
   * Toggle auto play
   */
  setAutoPlay(enabled: boolean): void {
    this.stateManager.updateState({ autoPlay: enabled });
  }
  
  /**
   * Reset game to initial state
   */
  reset(): void {
    this.stateManager.reset();
    if (this.display && this.display.isReady()) {
      this.display.resetReels();
      this.display.clearEffects();
    }
  }
  
  /**
   * Get display instance (for advanced use cases)
   */
  getDisplay(): ISlotDisplay | null {
    return this.display;
  }
}