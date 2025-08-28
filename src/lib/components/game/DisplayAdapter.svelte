<!--
DisplayAdapter - Integration component for slot machine display
Bridges the game engine with display implementations (WebGL, DOM, etc.)
-->

<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { SlotMachineEngine } from '$lib/core/SlotMachineEngine';
  import { WebGLSlotDisplay } from '$lib/display/webgl/WebGLSlotDisplay';
  import type { ISlotDisplay, DisplayConfig } from '$lib/display/ISlotDisplay';
  
  export type DisplayType = 'webgl' | 'canvas' | 'dom' | 'hybrid';
  import { bettingStore } from '$lib/stores/betting';
  import { gameStore } from '$lib/stores/game';
  import { animationPreferences } from '$lib/stores/animations';
  import { walletBalance } from '$lib/stores/wallet';
  
  // Component props
  export let width = 600;
  export let height = 400;
  export let displayType: DisplayType = 'webgl';
  export let disabled = false;
  export let compact = false;
  export let theme = 'default';
  
  // Component state
  let container: HTMLElement;
  let engine: SlotMachineEngine | null = null;
  let display: ISlotDisplay | null = null;
  let initialized = false;
  let error: string | null = null;
  let performanceWarnings: string[] = [];
  
  // Reactive configurations
  $: preferences = $animationPreferences;
  $: displayConfig = preferences ? createDisplayConfig(width, height, theme) : null;
  
  // Initialize when component mounts
  onMount(async () => {
    try {
      await initializeDisplay();
      await initializeEngine();
      
      // Connect engine to display
      if (engine && display) {
        await engine.initialize(display);
        initialized = true;
        
        console.log('✅ DisplayAdapter initialized successfully');
      }
    } catch (err) {
      console.error('❌ Failed to initialize DisplayAdapter:', err);
      error = err instanceof Error ? err.message : 'Unknown initialization error';
    }
  });
  
  onDestroy(() => {
    cleanup();
  });
  
  function createDisplayConfig(w: number, h: number, themeId: string): DisplayConfig {
    return {
      width: w,
      height: h,
      theme: themeId,
      reelCount: 5,
      visibleSymbols: 3,
      enableParticles: preferences.particlesEnabled,
      enableMotionBlur: preferences.motionBlurEnabled,
      reducedMotion: preferences.reducedMotion,
      highContrast: preferences.highContrast
    };
  }
  
  async function initializeDisplay(): Promise<void> {
    if (!container) {
      throw new Error('Container element not available');
    }
    
    // Create display based on type
    switch (displayType) {
      case 'webgl':
        display = new WebGLSlotDisplay();
        break;
      case 'canvas':
        throw new Error('Canvas display not implemented yet');
      case 'dom':
        throw new Error('DOM display not implemented yet');
      case 'hybrid':
        throw new Error('Hybrid display not implemented yet');
      default:
        throw new Error(`Unknown display type: ${displayType}`);
    }
    
    // Initialize display
    await display.initialize(container, displayConfig);
    
    // Set up display event listeners
    display.on('ready', handleDisplayReady);
    display.on('spin-requested', handleSpinRequested);
    display.on('error', handleDisplayError);
    display.on('performance-warning', handlePerformanceWarning);
    
    console.log(`✅ ${displayType} display initialized`);
  }
  
  async function initializeEngine(): Promise<void> {
    engine = new SlotMachineEngine({
      autoLoadReels: true,
      enableSound: true,
      debugMode: true
    });
    
    // Listen for engine state changes to update Svelte stores
    engine.getState(); // This will be reactive in a real implementation
    
    console.log('✅ Game engine initialized');
  }
  
  function cleanup(): void {
    if (engine) {
      engine.destroy();
      engine = null;
    }
    
    if (display) {
      display.destroy();
      display = null;
    }
    
    initialized = false;
    console.log('🧹 DisplayAdapter cleaned up');
  }
  
  // Display event handlers
  function handleDisplayReady(): void {
    console.log('🎰 Display is ready');
  }
  
  function handleSpinRequested(data: any): void {
    if (engine) {
      engine.requestSpin({
        betPerLine: $bettingStore.betPerLine,
        selectedPaylines: $bettingStore.selectedPaylines,
        totalBet: $bettingStore.betPerLine * $bettingStore.selectedPaylines
      });
    }
  }
  
  function handleDisplayError(error: any): void {
    console.error('Display error:', error);
    error = error.message || 'Display error occurred';
  }
  
  function handlePerformanceWarning(data: any): void {
    performanceWarnings = data.warnings || [];
    console.warn('Performance warning:', data);
  }
  
  // External API for parent components
  export function requestSpin(): void {
    if (engine && initialized) {
      engine.requestSpin({
        betPerLine: $bettingStore.betPerLine,
        selectedPaylines: $bettingStore.selectedPaylines,
        totalBet: $bettingStore.betPerLine * $bettingStore.selectedPaylines
      });
    }
  }
  
  export function reset(): void {
    if (engine) {
      engine.reset();
    }
  }
  
  export function getPerformanceMetrics(): any {
    return display?.getPerformanceMetrics() || null;
  }
  
  export function isReady(): boolean {
    return initialized && display?.isReady() === true;
  }
  
  export function isAnimating(): boolean {
    return display?.isAnimating() === true;
  }
  
  // Reactive updates
  $: if (display && displayConfig) {
    display.updateConfig(displayConfig);
  }
  
  // Update engine balance for display purposes (doesn't affect validation)
  $: if (engine && initialized && $walletBalance) {
    engine.setBalance($walletBalance);
  }
  
  // Handle betting store changes
  let bettingUnsubscribe: (() => void) | null = null;
  let lastPaylineCount = 1;
  
  $: if (engine && initialized) {
    // Clean up previous subscription
    if (bettingUnsubscribe) {
      bettingUnsubscribe();
    }
    
    // Update engine when betting changes and show paylines when line count changes
    bettingUnsubscribe = bettingStore.subscribe(bettingState => {
      // Show paylines when line count changes
      if (bettingState.selectedPaylines !== lastPaylineCount) {
        lastPaylineCount = bettingState.selectedPaylines;
        engine.showSelectedPaylines(bettingState.selectedPaylines);
      }
    });
  }
  
  onDestroy(() => {
    if (bettingUnsubscribe) {
      bettingUnsubscribe();
    }
  });
</script>

<div class="display-adapter" class:disabled>
  <!-- Display container -->
  <div 
    bind:this={container}
    class="display-container"
    style="width: {width}px; height: {height}px;"
    class:initialized
    class:has-error={!!error}
  >
    <!-- Loading state -->
    {#if !initialized && !error}
      <div class="loading-overlay">
        <div class="loading-spinner"></div>
        <div class="loading-text">
          Initializing {displayType} display...
        </div>
      </div>
    {/if}
    
    <!-- Error state -->
    {#if error}
      <div class="error-overlay">
        <div class="error-icon">⚠️</div>
        <div class="error-title">Display Error</div>
        <div class="error-message">{error}</div>
        <button 
          class="error-retry-btn"
          on:click={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    {/if}
    
    <!-- Performance warnings -->
    {#if performanceWarnings.length > 0 && initialized}
      <div class="performance-warnings">
        <div class="warning-title">Performance Issues:</div>
        {#each performanceWarnings as warning}
          <div class="warning-item">{warning}</div>
        {/each}
      </div>
    {/if}
  </div>
  
  <!-- Debug info (development only) -->
  {#if initialized && display}
    <div class="debug-info">
      <div class="debug-item">
        Display: {displayType}
      </div>
      <div class="debug-item">
        Ready: {display.isReady() ? '✅' : '❌'}
      </div>
      <div class="debug-item">
        Animating: {display.isAnimating() ? '🎬' : '⏸️'}
      </div>
      {#if display.getPerformanceMetrics}
        {@const metrics = display.getPerformanceMetrics()}
        <div class="debug-item">
          FPS: {metrics.fps}
        </div>
        <div class="debug-item">
          Draw Calls: {metrics.drawCalls}
        </div>
        <div class="debug-item">
          Particles: {metrics.particleCount}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .display-adapter {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  
  .display-adapter.disabled {
    opacity: 0.6;
    pointer-events: none;
  }
  
  .display-container {
    position: relative;
    border: 2px solid var(--theme-surface-border, #374151);
    border-radius: 8px;
    background: var(--theme-surface-primary, #1f2937);
    overflow: hidden;
  }
  
  .display-container.initialized {
    border-color: var(--theme-primary, #10b981);
    box-shadow: 0 0 10px var(--theme-primary, #10b981);
  }
  
  .display-container.has-error {
    border-color: #ef4444;
    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  }
  
  /* Loading overlay */
  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    z-index: 100;
  }
  
  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(255, 255, 255, 0.2);
    border-top: 4px solid var(--theme-primary, #10b981);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
  }
  
  .loading-text {
    font-size: 14px;
    font-weight: 500;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  /* Error overlay */
  .error-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(239, 68, 68, 0.1);
    backdrop-filter: blur(4px);
    z-index: 100;
  }
  
  .error-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }
  
  .error-title {
    font-size: 20px;
    font-weight: bold;
    color: #dc2626;
    margin-bottom: 8px;
  }
  
  .error-message {
    font-size: 14px;
    color: #7f1d1d;
    text-align: center;
    max-width: 300px;
    margin-bottom: 16px;
  }
  
  .error-retry-btn {
    padding: 8px 16px;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s;
  }
  
  .error-retry-btn:hover {
    background: #b91c1c;
  }
  
  /* Performance warnings */
  .performance-warnings {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(251, 191, 36, 0.9);
    color: #78350f;
    padding: 8px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 50;
    max-width: 200px;
  }
  
  .warning-title {
    font-weight: bold;
    margin-bottom: 4px;
  }
  
  .warning-item {
    margin-left: 8px;
  }
  
  /* Debug info */
  .debug-info {
    position: absolute;
    bottom: 8px;
    left: 8px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 8px;
    border-radius: 4px;
    font-size: 11px;
    font-family: monospace;
    z-index: 50;
    display: none; /* Only show in development */
  }
  
  /* Show debug info in development */
  :global([data-debug="true"]) .debug-info {
    display: block;
  }
  
  .debug-item {
    margin: 2px 0;
  }
  
  /* Responsive design */
  @media (max-width: 768px) {
    .display-container {
      border-width: 1px;
    }
    
    .loading-text, .error-message {
      font-size: 13px;
    }
    
    .performance-warnings {
      font-size: 11px;
      max-width: 150px;
    }
  }
</style>