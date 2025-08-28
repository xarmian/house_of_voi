/**
 * WebGL Slot Display Implementation
 * High-performance WebGL renderer for slot machine
 */

import { BaseSlotDisplay } from '../ISlotDisplay';
import type { 
  DisplayConfig, 
  WinData, 
  PaylineData, 
  ParticleConfig,
  SpinAnimationConfig,
  DisplayPerformanceMetrics,
  PerformanceWarning
} from '../ISlotDisplay';
import { WebGLRenderer } from './WebGLRenderer';
import { SymbolAtlas } from './SymbolAtlas';
import { ReelRenderer } from './ReelRenderer';
import { ParticleSystem } from './ParticleSystem';

export class WebGLSlotDisplay extends BaseSlotDisplay {
  private renderer: WebGLRenderer | null = null;
  private symbolAtlas: SymbolAtlas | null = null;
  private reelRenderer: ReelRenderer | null = null;
  private particleSystem: ParticleSystem | null = null;
  
  private canvas: HTMLCanvasElement | null = null;
  private reelData: string[][] = [];
  private currentGrid: string[][] = [];
  private isSpinning = false;
  
  // Animation state
  private lastFrameTime = 0;
  private deltaTime = 0;
  
  // Performance monitoring
  private performanceWarnings: PerformanceWarning[] = [];
  private fpsCounter = 0;
  private fpsTime = 0;
  private currentFps = 60;
  
  async initialize(container: HTMLElement, config: DisplayConfig): Promise<void> {
    this.container = container;
    this.config = config;
    this.validateConfig(config);
    
    try {
      // Create canvas
      this.canvas = document.createElement('canvas');
      this.canvas.width = config.width;
      this.canvas.height = config.height;
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.canvas.style.display = 'block';
      
      container.appendChild(this.canvas);
      
      // Initialize WebGL renderer
      this.renderer = new WebGLRenderer(this.canvas);
      
      // Initialize symbol atlas
      this.symbolAtlas = new SymbolAtlas(this.renderer);
      await this.symbolAtlas.initialize();
      
      // Initialize reel renderer
      this.reelRenderer = new ReelRenderer(this.renderer, this.symbolAtlas, config);
      
      // Initialize particle system
      this.particleSystem = new ParticleSystem(this.renderer, config);
      
      // Set up rendering
      this.setupRendering();
      
      this.initialized = true;
      this.emit('ready');
      
      console.log('🎰 WebGL slot display initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize WebGL display:', error);
      this.emit('error', error);
      throw error;
    }
  }
  
  destroy(): void {
    if (this.renderer) {
      this.renderer.stopRenderLoop();
      this.renderer.destroy();
    }
    
    if (this.canvas && this.container) {
      this.container.removeChild(this.canvas);
    }
    
    this.symbolAtlas = null;
    this.reelRenderer = null;
    this.particleSystem = null;
    this.renderer = null;
    this.canvas = null;
    this.initialized = false;
    
    console.log('🗑️ WebGL slot display destroyed');
  }
  
  updateConfig(config: Partial<DisplayConfig>): void {
    if (!this.config) return;
    
    this.config = { ...this.config, ...config };
    this.validateConfig(this.config);
    
    // Update canvas size if needed
    if ((config.width || config.height) && this.renderer) {
      this.renderer.setViewport(this.config.width, this.config.height);
    }
    
    // Update component configs
    if (this.reelRenderer) {
      this.reelRenderer.updateConfig(this.config);
    }
    
    if (this.particleSystem) {
      this.particleSystem.updateConfig(this.config);
    }
  }
  
  setReelData(reels: string[][]): void {
    this.reelData = reels;
    
    if (this.reelRenderer) {
      this.reelRenderer.setReelData(reels);
    }
    
    // Initialize with first 3 symbols of each reel
    this.currentGrid = reels.map(reel => reel.slice(0, 3));
  }
  
  setPaylines(paylines: number[][]): void {
    if (!this.reelRenderer) {
      console.warn('Cannot set paylines: reel renderer not initialized');
      return;
    }
    
    this.reelRenderer.setPaylines(paylines);
  }
  
  showSelectedPaylines(lineCount: number): void {
    if (!this.reelRenderer) {
      console.warn('Cannot show paylines: reel renderer not initialized');
      return;
    }
    
    this.reelRenderer.showSelectedPaylines(lineCount);
    this.requestRender(); // Ensure we render the paylines
  }
  
  startSpin(spinId: string, config?: SpinAnimationConfig): void {
    if (!this.reelRenderer) {
      console.warn('Cannot start spin: reel renderer not initialized');
      return;
    }
    
    this.isSpinning = true;
    
    const spinConfig = config || {
      duration: 2000,
      staggerDelay: 200,
      easing: 'ease-out',
      blur: true
    };
    
    this.reelRenderer.startSpin(spinConfig);
    this.requestRender(); // Start rendering when spinning begins
    
    console.log(`🎰 WebGL spin started: ${spinId}`);
  }
  
  stopReel(reelIndex: number, outcome: string[], delay = 0): void {
    if (!this.reelRenderer) return;
    
    setTimeout(() => {
      this.reelRenderer!.stopReel(reelIndex, outcome);
    }, delay);
  }
  
  showOutcome(grid: string[][], spinId: string): void {
    if (!this.reelRenderer) return;
    
    this.currentGrid = grid;
    this.isSpinning = false;
    
    this.reelRenderer.showFinalOutcome(grid);
    
    // Force a render to ensure final outcome is displayed
    this.requestRender();
    
    // Emit spin complete after a short delay to ensure visual completion
    setTimeout(() => {
      this.emit('spin-complete', { spinId });
    }, 500);
    
    console.log(`🎯 WebGL outcome shown for spin: ${spinId}`);
  }
  
  resetReels(): void {
    if (!this.reelRenderer) return;
    
    this.reelRenderer.reset();
    this.isSpinning = false;
    
    // Reset to initial grid
    if (this.reelData.length > 0) {
      this.currentGrid = this.reelData.map(reel => reel.slice(0, 3));
    }
  }
  
  showWinCelebration(winData: WinData): void {
    if (!this.particleSystem) return;
    
    // Create particle effects based on win level
    const particleConfig: ParticleConfig = this.createParticleConfigForWin(winData);
    this.particleSystem.createEffect(particleConfig);
    this.requestRender(); // Start rendering for particles
    
    // Show screen effects for bigger wins
    if (winData.level === 'large' || winData.level === 'jackpot') {
      this.applyScreenEffect('shake', winData.level === 'jackpot' ? 1.0 : 0.7);
    }
    
    if (winData.level === 'jackpot') {
      this.applyScreenEffect('flash', 0.8);
    }
    
    console.log(`🎉 Win celebration: ${winData.level} - ${winData.amount} microVOI`);
  }
  
  highlightPaylines(paylines: PaylineData[], duration = 3000): void {
    if (!this.reelRenderer) return;
    
    this.reelRenderer.highlightPaylines(paylines, duration);
    this.requestRender(); // Start rendering for highlights
  }
  
  showParticles(config: ParticleConfig): void {
    if (!this.particleSystem) return;
    
    this.particleSystem.createEffect(config);
    this.requestRender(); // Start rendering for particles
  }
  
  applyScreenEffect(effect: 'shake' | 'flash' | 'zoom', intensity = 1.0): void {
    if (!this.canvas) return;
    
    switch (effect) {
      case 'shake':
        this.applyScreenShake(intensity);
        break;
      case 'flash':
        this.applyScreenFlash(intensity);
        break;
      case 'zoom':
        this.applyScreenZoom(intensity);
        break;
    }
  }
  
  clearEffects(): void {
    if (this.particleSystem) {
      this.particleSystem.clearAll();
    }
    
    if (this.reelRenderer) {
      this.reelRenderer.clearHighlights();
    }
    
    // Clear any canvas effects
    if (this.canvas) {
      this.canvas.style.filter = '';
      this.canvas.style.transform = '';
    }
  }
  
  isAnimating(): boolean {
    const reelAnimating = this.reelRenderer?.isAnimating() || false;
    const particlesAnimating = this.particleSystem?.hasActiveEffects() || false;
    
    return this.isSpinning || reelAnimating || particlesAnimating;
  }
  
  getPerformanceMetrics(): DisplayPerformanceMetrics {
    const stats = this.renderer?.getStats() || {
      drawCalls: 0,
      triangles: 0,
      vertices: 0,
      textureMemory: 0,
      frameTime: 0
    };
    
    return {
      fps: this.isAnimating() ? this.currentFps : 60, // Show 60 FPS when idle (not rendering)
      frameTime: this.isAnimating() ? this.deltaTime : 0,
      memoryUsage: stats.textureMemory / (1024 * 1024), // Convert to MB
      drawCalls: stats.drawCalls,
      particleCount: this.particleSystem?.getActiveParticleCount() || 0,
      warningFlags: [...this.performanceWarnings]
    };
  }
  
  private setupRendering(): void {
    if (!this.renderer) return;
    
    // Set up render callback
    this.renderer.onRender(this.render.bind(this));
    
    // Start with one render and then use conditional rendering
    this.requestRender();
  }
  
  private requestRender(): void {
    if (!this.renderer) return;
    
    // Start render loop if not already running
    if (!this.renderer['animationFrame']) {
      this.renderer.startRenderLoop();
    }
  }
  
  private render(timestamp: number): void {
    if (!this.renderer || !this.config) return;
    
    // Calculate delta time
    this.deltaTime = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    
    // Update FPS counter
    this.updateFPS(timestamp);
    
    // Clear screen
    this.renderer.clear(0.05, 0.05, 0.1, 1.0); // Dark blue background
    
    // Update and render reels
    if (this.reelRenderer) {
      this.reelRenderer.update(this.deltaTime);
      this.reelRenderer.render();
    }
    
    // Update and render particles
    if (this.particleSystem) {
      this.particleSystem.update(this.deltaTime);
      this.particleSystem.render();
    }
    
    // Check for performance issues
    this.checkPerformance();
    
    // Stop rendering if no animations are active
    if (!this.isAnimating()) {
      setTimeout(() => {
        if (!this.isAnimating()) {
          this.renderer?.stopRenderLoop();
        }
      }, 100);
    }
  }
  
  private updateFPS(timestamp: number): void {
    this.fpsCounter++;
    
    if (timestamp - this.fpsTime >= 1000) {
      this.currentFps = Math.round(this.fpsCounter * 1000 / (timestamp - this.fpsTime));
      this.fpsCounter = 0;
      this.fpsTime = timestamp;
    }
  }
  
  private checkPerformance(): void {
    this.performanceWarnings = [];
    
    // Only check performance if actively rendering
    if (!this.isAnimating()) {
      return;
    }
    
    // Check FPS only when animating
    if (this.currentFps < 30 && this.isAnimating()) {
      this.performanceWarnings.push('low-fps');
    }
    
    // Check memory usage
    const metrics = this.getPerformanceMetrics();
    if (metrics.memoryUsage > 100) { // Over 100MB
      this.performanceWarnings.push('high-memory');
    }
    
    if (metrics.particleCount > 500) {
      this.performanceWarnings.push('too-many-particles');
    }
    
    if (this.deltaTime > 33) { // Over 33ms per frame
      this.performanceWarnings.push('gpu-timeout');
    }
    
    // Emit performance warning if issues detected
    if (this.performanceWarnings.length > 0) {
      this.emit('performance-warning', {
        warnings: this.performanceWarnings,
        metrics
      });
    }
  }
  
  private createParticleConfigForWin(winData: WinData): ParticleConfig {
    const intensity = winData.level;
    const countMultipliers = {
      small: 1,
      medium: 2,
      large: 4,
      jackpot: 8
    };
    
    return {
      type: winData.level === 'jackpot' ? 'symbol-burst' : 'explosion',
      count: 50 * countMultipliers[intensity],
      colors: this.getColorsForWinLevel(winData.level),
      duration: intensity === 'jackpot' ? 5000 : 3000,
      intensity
    };
  }
  
  private getColorsForWinLevel(level: string): string[] {
    switch (level) {
      case 'small': return ['#10b981', '#059669', '#047857'];
      case 'medium': return ['#3b82f6', '#1d4ed8', '#1e40af'];
      case 'large': return ['#8b5cf6', '#7c3aed', '#6d28d9'];
      case 'jackpot': return ['#f59e0b', '#d97706', '#b45309', '#92400e'];
      default: return ['#10b981'];
    }
  }
  
  private applyScreenShake(intensity: number): void {
    if (!this.canvas) return;
    
    const duration = 500;
    const maxOffset = 8 * intensity;
    const startTime = performance.now();
    
    const shake = () => {
      const elapsed = performance.now() - startTime;
      if (elapsed > duration) {
        this.canvas!.style.transform = '';
        return;
      }
      
      const progress = 1 - (elapsed / duration);
      const x = (Math.random() - 0.5) * maxOffset * progress;
      const y = (Math.random() - 0.5) * maxOffset * progress;
      
      this.canvas!.style.transform = `translate(${x}px, ${y}px)`;
      requestAnimationFrame(shake);
    };
    
    shake();
  }
  
  private applyScreenFlash(intensity: number): void {
    if (!this.canvas) return;
    
    const originalFilter = this.canvas.style.filter;
    this.canvas.style.filter = `brightness(${1 + intensity}) saturate(${1 + intensity * 0.5})`;
    
    setTimeout(() => {
      this.canvas!.style.filter = originalFilter;
    }, 150);
  }
  
  private applyScreenZoom(intensity: number): void {
    if (!this.canvas) return;
    
    const scale = 1 + (intensity * 0.1);
    this.canvas.style.transform = `scale(${scale})`;
    
    setTimeout(() => {
      this.canvas!.style.transform = '';
    }, 300);
  }
}