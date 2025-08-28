<!--
ModernSlotMachine - Example integration of the new WebGL display architecture
This component demonstrates how to use the DisplayAdapter with the SlotMachineEngine
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import DisplayAdapter from './DisplayAdapter.svelte';
  import BettingControls from './BettingControls.svelte';
  import GameQueue from './GameQueue.svelte';
  import { bettingStore } from '$lib/stores/betting';
  import { themeStore, currentTheme } from '$lib/stores/theme';
  
  // Component props
  export let width = 600;
  export let height = 400;
  export let compact = false;
  export let disabled = false;
  
  // Component state
  let displayAdapter: DisplayAdapter;
  let displayReady = false;
  let currentlyAnimating = false;
  let performanceMetrics: any = null;
  
  // Refs for controlling display
  let displayWidth = width;
  let displayHeight = height;
  
  // Update performance metrics periodically
  let metricsInterval: NodeJS.Timeout;
  
  onMount(() => {
    // Update metrics every second
    metricsInterval = setInterval(() => {
      if (displayAdapter && displayReady) {
        performanceMetrics = displayAdapter.getPerformanceMetrics();
        currentlyAnimating = displayAdapter.isAnimating();
      }
    }, 1000);
    
    return () => {
      if (metricsInterval) {
        clearInterval(metricsInterval);
      }
    };
  });
  
  // Handle spin requests from betting controls
  function handleSpin(event: CustomEvent) {
    if (displayAdapter && displayReady) {
      displayAdapter.requestSpin();
    }
  }
  
  // Theme switching
  function handleThemeClick() {
    themeStore.nextTheme();
  }
  
  // Reset function
  function handleReset() {
    if (displayAdapter) {
      displayAdapter.reset();
    }
  }
  
  // Check display readiness
  function checkDisplayReady() {
    if (displayAdapter) {
      displayReady = displayAdapter.isReady();
    }
  }
  
  // Call check function periodically until ready
  $: if (displayAdapter && !displayReady) {
    const checkInterval = setInterval(() => {
      checkDisplayReady();
      if (displayReady) {
        clearInterval(checkInterval);
      }
    }, 100);
  }
</script>

<div class="modern-slot-machine" class:compact>
  <!-- Header with theme controls -->
  <div class="machine-header">
    <h2 class="machine-title">
      🎰 Modern Slot Machine
      <span class="tech-badge">WebGL</span>
    </h2>
    
    <div class="header-controls">
      <button 
        class="theme-btn"
        on:click={handleThemeClick}
        title="Switch theme: {$currentTheme.displayName}"
      >
        🎨 Theme
      </button>
      
      <button 
        class="reset-btn"
        on:click={handleReset}
        disabled={!displayReady}
        title="Reset game"
      >
        🔄 Reset
      </button>
    </div>
  </div>
  
  <!-- Status indicators -->
  <div class="status-bar">
    <div class="status-item" class:active={displayReady}>
      <span class="status-icon">{displayReady ? '✅' : '⏳'}</span>
      <span class="status-text">
        {displayReady ? 'Display Ready' : 'Initializing...'}
      </span>
    </div>
    
    <div class="status-item" class:active={currentlyAnimating}>
      <span class="status-icon">{currentlyAnimating ? '🎬' : '⏸️'}</span>
      <span class="status-text">
        {currentlyAnimating ? 'Animating' : 'Idle'}
      </span>
    </div>
    
    {#if performanceMetrics}
      <div class="status-item performance">
        <span class="status-icon">📊</span>
        <span class="status-text">
          {performanceMetrics.fps} FPS
        </span>
      </div>
    {/if}
  </div>
  
  <!-- Main display area -->
  <div class="display-area">
    <DisplayAdapter
      bind:this={displayAdapter}
      {width}
      {height}
      displayType="webgl"
      {disabled}
      {compact}
      theme={$currentTheme.name}
    />
  </div>
  
  <!-- Controls area -->
  <div class="controls-area">
    {#if !compact}
      <!-- Full controls layout -->
        <div class="betting-section">
          <BettingControls 
            on:spin={handleSpin}
            {compact}
            disabled={disabled || !displayReady}
          />
        </div>
    {:else}
      <!-- Compact layout -->
      <div class="controls-compact">
        <BettingControls 
          on:spin={handleSpin}
          {compact}
          disabled={disabled || !displayReady}
        />
      </div>
    {/if}
  </div>
  
  <!-- Performance debug panel (development only) -->
  {#if performanceMetrics && import.meta.env.DEV}
    <div class="debug-panel">
      <div class="debug-title">🔧 Performance Metrics</div>
      <div class="debug-metrics">
        <div class="metric">
          <span class="metric-label">FPS:</span>
          <span class="metric-value" class:warning={performanceMetrics.fps < 30}>
            {performanceMetrics.fps}
          </span>
        </div>
        <div class="metric">
          <span class="metric-label">Frame Time:</span>
          <span class="metric-value">
            {performanceMetrics.frameTime.toFixed(1)}ms
          </span>
        </div>
        <div class="metric">
          <span class="metric-label">Memory:</span>
          <span class="metric-value">
            {performanceMetrics.memoryUsage.toFixed(1)}MB
          </span>
        </div>
        <div class="metric">
          <span class="metric-label">Draw Calls:</span>
          <span class="metric-value">
            {performanceMetrics.drawCalls}
          </span>
        </div>
        <div class="metric">
          <span class="metric-label">Particles:</span>
          <span class="metric-value">
            {performanceMetrics.particleCount}
          </span>
        </div>
        {#if performanceMetrics.warningFlags.length > 0}
          <div class="metric warnings">
            <span class="metric-label">Warnings:</span>
            <div class="warning-list">
              {#each performanceMetrics.warningFlags as warning}
                <span class="warning-flag">{warning}</span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .modern-slot-machine {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    background: var(--theme-surface-primary, #1f2937);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  }
  
  .modern-slot-machine.compact {
    gap: 12px;
    padding: 16px;
  }
  
  /* Header */
  .machine-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 2px solid var(--theme-surface-border, #374151);
  }
  
  .machine-title {
    font-size: 24px;
    font-weight: bold;
    color: var(--theme-text, white);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .tech-badge {
    background: linear-gradient(45deg, #10b981, #059669);
    color: white;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .header-controls {
    display: flex;
    gap: 8px;
  }
  
  .theme-btn, .reset-btn {
    padding: 8px 12px;
    background: var(--theme-surface-secondary, #374151);
    color: var(--theme-text, white);
    border: 1px solid var(--theme-surface-border, #4b5563);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
  }
  
  .theme-btn:hover, .reset-btn:hover:not(:disabled) {
    background: var(--theme-surface-hover, #4b5563);
    border-color: var(--theme-primary, #10b981);
  }
  
  .reset-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  /* Status bar */
  .status-bar {
    display: flex;
    gap: 16px;
    align-items: center;
    padding: 8px 12px;
    background: var(--theme-surface-secondary, #374151);
    border-radius: 6px;
    border-left: 4px solid var(--theme-surface-border, #4b5563);
  }
  
  .status-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--theme-text-muted, #9ca3af);
    font-size: 14px;
    transition: color 0.2s ease;
  }
  
  .status-item.active {
    color: var(--theme-primary, #10b981);
  }
  
  .status-item.performance {
    margin-left: auto;
  }
  
  .status-icon {
    font-size: 16px;
  }
  
  /* Display area */
  .display-area {
    display: flex;
    justify-content: center;
    padding: 20px;
    background: radial-gradient(ellipse at center, var(--theme-bg-from, #111827) 0%, var(--theme-surface-primary, #1f2937) 100%);
    border-radius: 8px;
    border: 2px solid var(--theme-surface-border, #374151);
  }
  
  /* Controls area */
  .controls-area {
    margin-top: 16px;
  }
  
  .controls-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  
  .controls-compact {
    display: flex;
    justify-content: center;
  }
  
  /* Debug panel */
  .debug-panel {
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 12px;
    border-radius: 6px;
    font-size: 12px;
    font-family: 'Courier New', monospace;
    border-left: 3px solid #10b981;
  }
  
  .debug-title {
    font-weight: bold;
    margin-bottom: 8px;
    color: #10b981;
  }
  
  .debug-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
  }
  
  .metric {
    display: flex;
    justify-content: space-between;
  }
  
  .metric-label {
    color: #9ca3af;
  }
  
  .metric-value {
    font-weight: bold;
    color: white;
  }
  
  .metric-value.warning {
    color: #f59e0b;
  }
  
  .warnings {
    grid-column: 1 / -1;
    flex-direction: column;
    align-items: flex-start;
  }
  
  .warning-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  
  .warning-flag {
    background: #dc2626;
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
  }
  
  /* Responsive design */
  @media (max-width: 768px) {
    .modern-slot-machine {
      padding: 16px 12px;
      gap: 12px;
    }
    
    .machine-title {
      font-size: 20px;
    }
    
    .controls-grid {
      grid-template-columns: 1fr;
      gap: 16px;
    }
    
    .status-bar {
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .status-item.performance {
      margin-left: 0;
    }
    
    .debug-metrics {
      grid-template-columns: 1fr;
    }
  }
  
  @media (max-width: 480px) {
    .machine-header {
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
    }
    
    .header-controls {
      align-self: flex-end;
    }
    
    .display-area {
      padding: 12px;
    }
  }
</style>