<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import type { SlotSymbol, SpinSequence } from '$lib/types/symbols';
  import type { ReelAnimationState } from '$lib/types/animations';
  import { 
    reelAnimations, 
    animationPreferences, 
    shouldReduceAnimations,
    startPerformanceOptimization,
    cleanupAnimations
  } from '$lib/stores/animations';
  import { currentSpinId } from '$lib/stores/game';
  import { currentTheme } from '$lib/stores/theme';
  import { 
    ReelPhysicsEngine,
    DEFAULT_REEL_PHYSICS,
    calculateSymbolPositions
  } from '$lib/utils/reelPhysics';
  import { initializeAnimations } from '$lib/utils/animations';
  import { getDeterministicReelSymbol, getSymbol, getThemeSymbol } from '$lib/constants/symbols';
  import { contractDataCache } from '$lib/services/contractDataCache';
  import SymbolComponent from './Symbol.svelte';
  
  export let grid: SlotSymbol[][];
  export let isSpinning: boolean;
  
  let reelElements: HTMLElement[] = [];
  let reelContainers: HTMLElement[] = [];
  let symbolGrid: HTMLElement[][] = [];
  let isMounted = false;
  let physicsEngine: ReelPhysicsEngine | null = null;
  let gridElement: HTMLElement; // Reference to this component's grid element
  
  // Extended reel data for seamless scrolling
  let extendedReels: SlotSymbol[][] = [];
  const VISIBLE_SYMBOLS = 3;
  const EXTENDED_SYMBOLS = 100; // Use ALL contract symbols - this was the issue!
  
  // Loading state for reel data
  let isLoadingReelData = true;
  let reelDataError: string | null = null;
  
  // Contract reel data - the TRUE layout from blockchain
  let contractReelData: string = '';
  let contractReels: string[][] = []; // 5 reels, each with 100 symbols
  
  // Subscribe to animation stores (removed reactive reelStates to prevent conflicts with physics)
  $: preferences = $animationPreferences;
  $: reduceMotion = $shouldReduceAnimations;
  $: theme = $currentTheme;
  
  // Initialize extended reels immediately with deterministic data as fallback
  // This ensures the grid has content and proper height from the start
  $: if (extendedReels.length === 0) {
    console.log('🎰 ReelGrid: Initializing with deterministic fallback data');
    extendedReels = Array(5).fill(null).map((_, reelIndex) => {
      const extended: SlotSymbol[] = [];
      
      // Use deterministic symbols to ensure immediate display
      for (let i = 0; i < 100; i++) {
        const symbol = getDeterministicReelSymbol(reelIndex, i, $currentTheme);
        extended.push(symbol);
      }
      
      return extended;
    });
  }
  
  // Update with contract data when available (but keep existing data if contract fails)
  $: if (!currentlySpinning && contractReels.length > 0) {
    console.log('🔗 ReelGrid: Updating with contract reel data');
    extendedReels = contractReels.map((contractReel, reelIndex) => {
      const extended: SlotSymbol[] = [];
      
      // Use ALL 100 contract symbols directly - no truncation!
      for (let i = 0; i < contractReel.length; i++) {
        const symbolChar = contractReel[i];
        const symbol = getThemeSymbol(symbolChar, $currentTheme); // Convert character to theme-specific SlotSymbol
        extended.push(symbol);
      }
      
      return extended;
    });
  }
  
  // Track spinning state to avoid multiple triggers
  let currentlySpinning = false;
  let processingSpinId: string | null = null;
  
  // Function to fetch and parse real reel data from contract
  async function fetchContractReelData() {
    isLoadingReelData = true;
    reelDataError = null;
    
    try {
      console.log('🔄 Fetching contract reel data...');
      // For contractDataCache, we need a placeholder address
      const placeholderAddress = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const reelData = await contractDataCache.getReelData(placeholderAddress);
      
      contractReelData = reelData.reelData;
      
      // Parse 500-character string into 5 reels of 100 symbols each
      contractReels = [];
      for (let reelIndex = 0; reelIndex < 5; reelIndex++) {
        const startPos = reelIndex * 100;
        const endPos = startPos + 100;
        const reelSymbols = contractReelData.slice(startPos, endPos).split('');
        contractReels.push(reelSymbols);
      }
      
      console.log('✅ Contract reel data loaded successfully');
      isLoadingReelData = false;
      return true;
    } catch (error) {
      console.error('❌ Failed to fetch contract reel data:', error);
      reelDataError = 'Unable to load contract data. Slot machine unavailable.';
      isLoadingReelData = false;
      // DO NOT fallback - slot machine should be disabled if contract data fails
      return false;
    }
  }
  
  // COMPLETELY REMOVE REACTIVE STATEMENTS - Use direct function calls instead
  let lastProcessedSpinId: string | null = null;
  let lastProcessedOutcomeSpinId: string | null = null;
  
  // Export readiness check function for external components
  export function isReady(): boolean {
    return isMounted && 
           extendedReels.length > 0 && 
           physicsEngine !== null && 
           reelElements.length > 0 &&
           reelDataError === null; // Slot machine not ready if reel data failed to load
  }

  // Direct function that gets called from parent component
  export function startSpin(spinId: string) {
    if (!isMounted || !physicsEngine || !reelElements.length || 
        spinId === lastProcessedSpinId || currentlySpinning || reelDataError !== null) {
      return; // Don't allow spinning if reel data failed to load
    }
    lastProcessedSpinId = spinId;
    currentlySpinning = true;
    
    // SAFETY FIX: Calculate target positions within safe zone with better bounds
    const bufferSymbols = 5; // Match original buffer size to prevent gaps
    const safeZoneSymbols = EXTENDED_SYMBOLS - bufferSymbols * 2;
    const minPosition = bufferSymbols * 100;
    const maxPosition = (EXTENDED_SYMBOLS - bufferSymbols) * 100;
    
    const targetPositions = Array(5).fill(0).map(() => {
      const randomPosition = minPosition + Math.floor(Math.random() * safeZoneSymbols) * 100;
      // Ensure position is within absolute bounds
      return Math.max(minPosition, Math.min(randomPosition, maxPosition));
    });
    
    physicsEngine.startSpin(targetPositions);
  }
  
  export function startQuickDeceleration(finalGrid?: string[][]) {
    if (!finalGrid) return;
    
    physicsEngine?.stopAllReels();
    
    // Calculate target positions
    const targetPositions = finalGrid.map((outcomeReel, reelIndex) => {
      const contractReel = contractReels[reelIndex];
      if (!contractReel) return 0;
      
      for (let pos = 0; pos < contractReel.length - 2; pos++) {
        if (contractReel[pos] === outcomeReel[0] && 
            contractReel[pos + 1] === outcomeReel[1] && 
            contractReel[pos + 2] === outcomeReel[2]) {
          return pos * 102; // Convert symbol position to pixels (100px + 2px gap)
        }
      }
      return 0;
    });
    
    // Smooth CSS transition to final positions
    reelElements.forEach((element, index) => {
      if (element && reelContainers[index]) {
        // Add smooth transition
        element.style.transition = 'transform 0.8s ease-out';
        
        // Move to target position
        const targetPos = targetPositions[index] || 0;
        element.style.transform = `translate3d(0, ${-targetPos}px, 0)`;
        
        // Clear blur immediately to prevent lingering blur effect
        reelContainers[index].style.filter = '';
        reelContainers[index].style.perspective = '';
      }
    });
    
    // Set currentlySpinning = false after transition starts
    setTimeout(() => {
      currentlySpinning = false;
      
      // Remove transitions after animation completes
      reelElements.forEach((element) => {
        if (element) {
          element.style.transition = '';
        }
      });
    }, 100);
  }

  export function stopSpin() {
    if (!physicsEngine || !currentlySpinning) return;
    
    currentlySpinning = false;
    processingSpinId = null;
    physicsEngine.stopAllReels();
    
    // Clear any blur effects and reset transforms to clean final state
    reelElements.forEach((element, index) => {
      if (element && reelContainers[index]) {
        reelContainers[index].style.filter = ''; // Remove blur
        reelContainers[index].style.perspective = ''; // Remove 3D effects
      }
    });
  }
  
  export function setFinalPositions(finalGrid: string[][], spinId?: string) {
    if (!physicsEngine || !reelElements.length) return;
    
    // PREVENT CLEANUP INTERFERENCE: Don't process cleanup calls that would show blanks
    const isBlankGrid = finalGrid.every(reel => 
      reel.every(symbol => symbol === '_')
    );
    
    if (isBlankGrid && (spinId === 'cleanup' || spinId === 'cancel-previous' || spinId === 'force-stop')) {
      return;
    }
    
    // PREVENT DOUBLE POSITIONING: If startQuickDeceleration already handled this, skip
    if (!isBlankGrid && spinId && !spinId.includes('replay')) {
      return;
    }
    
    // DUPLICATE PROTECTION: Prevent repeated calls for same outcome
    if (spinId && lastProcessedOutcomeSpinId === spinId) {
      return;
    }
    lastProcessedOutcomeSpinId = spinId || null;
    
    // COMPLETELY stop physics animation and any callbacks
    physicsEngine.stopAllReels();
    
    // CRITICAL: Don't set currentlySpinning = false yet - 
    // this prevents reactive statements from interfering
    
    // Calculate correct positions based on finalGrid
    const targetPositions = finalGrid.map((outcomeReel, reelIndex) => {
      const contractReel = contractReels[reelIndex];
      if (!contractReel) return 0;
      
      // Find the outcome sequence in contract reel
      for (let pos = 0; pos < contractReel.length - 2; pos++) {
        if (contractReel[pos] === outcomeReel[0] && 
            contractReel[pos + 1] === outcomeReel[1] && 
            contractReel[pos + 2] === outcomeReel[2]) {
          return pos * 102; // Convert symbol position to pixels (100px + 2px gap)
        }
      }
      return 0; // Fallback to start if not found
    });
    
    
    // Set reels to calculated positions
    reelElements.forEach((element, reelIndex) => {
      if (element && reelContainers[reelIndex]) {
        const targetPos = targetPositions[reelIndex] || 0;
        element.style.transform = `translate3d(0, ${-targetPos}px, 0)`;
        
        // Clear visual effects
        reelContainers[reelIndex].style.filter = '';
        reelContainers[reelIndex].style.perspective = '';
        reelContainers[reelIndex].style.boxShadow = '';
        
        // Disable GPU optimization to prevent further updates
        element.style.willChange = '';
        reelContainers[reelIndex].style.willChange = '';
      }
    });
    
    // Set currentlySpinning = false immediately, then re-apply transforms after any interference
    currentlySpinning = false;
    
    // Re-apply transforms after interference
    setTimeout(() => {
      reelElements.forEach((element, reelIndex) => {
        if (element) {
          const targetPos = targetPositions[reelIndex] || 0;
          element.style.transform = `translate3d(0, ${-targetPos}px, 0)`;
        }
      });
    }, 200);
  }
  
  // Removed complex visual update system - physics engine handles everything
  
  // Simplified visual update management
  function startVisualUpdates() {
    // Physics engine handles all updates directly
  }
  
  function stopVisualUpdates() {
    // Physics engine handles cleanup
  }
  
  // Removed old unified spin functions - now using exported functions called directly from parent
  
  // Removed complex updateReelVisuals - now handled directly in handlePhysicsUpdate
  
  function handlePhysicsUpdate(states: ReelAnimationState[]) {
    // GUARD: Don't update if not currently spinning - prevents background updates
    if (!currentlySpinning) {
      return;
    }
    
    // Direct DOM updates only during active spinning
    states.forEach((state, index) => {
      if (reelElements[index] && state.isSpinning) {
        // SAFETY FIX: Validate position before applying transform to prevent visual glitches
        const position = state.currentPosition;
        const maxAllowedPosition = EXTENDED_SYMBOLS * 100; // Total reel height
        const minAllowedPosition = -1000; // Allow some negative positioning
        
        // Clamp position to safe bounds to prevent extreme jumps
        const safePosition = Math.max(minAllowedPosition, Math.min(position, maxAllowedPosition));
        const translateY = -safePosition;
        const transform = `translate3d(0, ${translateY}px, 0)`;
        
        reelElements[index].style.transform = transform;
        
        // Apply visual effects only during spinning with velocity-based blur
        if (reelContainers[index]) {
          const blur = Math.min(Math.abs(state.velocity) / 500, 2);
          reelContainers[index].style.filter = blur > 0.1 ? `blur(${blur}px)` : '';
        }
        
        // Debug logging for position tracking (only for first reel to avoid spam)
        if (index === 0 && state.easingPhase === 'outcome_deceleration') {
        }
      }
    });
  }
  
  onMount(async () => {
    // Initialize animations system
    initializeAnimations();
    
    // Fetch real contract reel data FIRST
    console.log('🔄 Fetching contract reel data...');
    await fetchContractReelData();
    
    // Initialize unified physics-based animation system
    physicsEngine = new ReelPhysicsEngine(
      {
        ...DEFAULT_REEL_PHYSICS,
        spinPattern: 'alternating'
      },
      handlePhysicsUpdate
    );
    
    // Initialize reel states (no store conflicts)
    physicsEngine.initializeReels();
    
    // Initialize reel references
    const updateReelRefs = () => {
      // Use component-scoped selectors instead of global document queries
      if (gridElement) {
        reelElements = Array.from(gridElement.querySelectorAll('.reel-strip'));
        reelContainers = Array.from(gridElement.querySelectorAll('.reel-viewport'));
        
        // Initialize symbol grid references with component scope
        symbolGrid = Array(5).fill(null).map((_, reelIndex) => 
          Array.from(gridElement.querySelectorAll(`[data-reel="${reelIndex}"] .symbol-element`))
        );
      } else {
        reelElements = [];
        reelContainers = [];
        symbolGrid = [];
      }
      
      // Elements initialized
    };
    
    // Use timeout to ensure DOM is ready
    setTimeout(() => {
      updateReelRefs();
      isMounted = true;
      // Start visual update loop
      startVisualUpdates();
    }, 100);
    
    // Also update on any changes
    const observer = new MutationObserver(updateReelRefs);
    if (gridElement) {
      observer.observe(gridElement, {
        childList: true,
        subtree: true
      });
    }
    
    return () => {
      observer.disconnect();
      stopVisualUpdates();
    };
  });
  
  onDestroy(() => {
    stopVisualUpdates();
    if (physicsEngine) {
      physicsEngine.stopAllReels();
    }
    cleanupAnimations();
  });
</script>

<div class="reel-grid" bind:this={gridElement} role="application" aria-label="Slot machine reels">
  <!-- Loading indicator overlay -->
  {#if isLoadingReelData}
    <div class="loading-overlay" transition:fade={{ duration: 200 }}>
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading reels...</div>
    </div>
  {/if}
  
  <!-- Error indicator -->
  {#if reelDataError}
    <div class="error-indicator" transition:fade={{ duration: 200 }}>
      <span class="error-icon">⚠️</span>
      <span class="error-text">{reelDataError}</span>
    </div>
  {/if}
  
  {#each extendedReels as extendedReel, reelIndex}
    <div 
      class="reel-container"
      data-reel={reelIndex}
      aria-label="Reel {reelIndex + 1}"
    >
      <!-- Viewport that shows only visible symbols -->
      <div 
        class="reel-viewport"
        class:spinning={currentlySpinning}
      >
        <!-- Extended reel strip for seamless scrolling -->
        <div 
          class="reel-strip"
          data-reel={reelIndex}
        >
          {#each extendedReel as symbol, symbolIndex}
            {#if symbol}
              <div 
                class="symbol-position"
                class:symbol-element={true}
                data-position="{reelIndex}-{symbolIndex}"
                data-reel={reelIndex}
                data-row={symbolIndex}
              >
                <SymbolComponent 
                  {symbol} 
                  size="medium"
                  isSpinning={false}
                  position={{ reel: reelIndex, row: symbolIndex, symbol }}
                  animationDelay={0}
                />
              </div>
            {/if}
          {/each}
        </div>
        
        <!-- Gradient overlays for depth effect -->
        {#if currentlySpinning}
          <div class="reel-gradient-top" aria-hidden="true"></div>
          <div class="reel-gradient-bottom" aria-hidden="true"></div>
        {/if}
      </div>
      
      <!-- Physics debug info (development only) -->
      {#if false && preferences.highPerformance && currentlySpinning}
        <div class="physics-debug" aria-hidden="true">
          <span>Reel {reelIndex + 1} Spinning</span>
        </div>
      {/if}
    </div>
  {/each}
  
  <!-- Performance indicator (hidden by default) -->
  <div class="performance-indicator" aria-hidden="true" data-testid="performance-monitor">
    <!-- Will be populated by performance monitoring -->
  </div>
</div>

<style>
  .reel-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
    padding: 8px;
    background: linear-gradient(145deg, var(--theme-surface-secondary), var(--theme-surface-primary));
    border-radius: 8px;
    border: 2px solid var(--theme-surface-border);
    max-width: 600px;
    margin: 0 auto;
    position: relative;
    overflow: hidden;
    /* Ensure minimum height even when empty to prevent collapse */
    min-height: 336px; /* 306px container + 8px padding top/bottom + 8px for grid structure */
  }

  /* Make reel grid border and background transparent for background themes */
  :global(.background-theme) .reel-grid {
    border: 2px solid transparent;
    background: transparent;
  }

  /* Fallback height when grid is empty */
  .reel-grid:not(:has(.reel-container)) {
    height: 336px;
  }
  
  /* Loading overlay */
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 100;
    border-radius: 8px;
    backdrop-filter: blur(4px);
  }
  
  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(16, 185, 129, 0.3);
    border-top: 3px solid #10b981;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 12px;
  }
  
  .loading-text {
    color: #ffffff;
    font-size: 14px;
    font-weight: 500;
  }
  
  /* Error indicator */
  .error-indicator {
    position: absolute;
    top: 4px;
    right: 4px;
    background: rgba(239, 68, 68, 0.9);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 4px;
    backdrop-filter: blur(4px);
  }
  
  .error-icon {
    font-size: 14px;
  }
  
  .error-text {
    font-weight: 500;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .reel-container {
    position: relative;
    height: 306px; /* Fixed height for exactly 3 visible symbols: 3 * 100px + 2 * 2px gap + 2px buffer */
    overflow: hidden;
    border-radius: 6px;
    background: var(--theme-surface-primary);
    border: 1px solid var(--theme-surface-border);
  }

  /* Make reel container borders and background transparent for background themes */
  :global(.background-theme) .reel-container {
    border: 1px solid transparent;
    background: transparent;
  }

  .reel-viewport {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    transform-style: preserve-3d;
    transition: perspective 0.3s ease;
  }
  
  .reel-viewport.spinning {
    perspective-origin: 50% 50%;
  }
  
  .reel-strip {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    transform-origin: center top;
    backface-visibility: hidden;
    transform-style: preserve-3d;
    transition: none; /* No CSS transitions - physics handles animation */
    /* CRITICAL: Disable all CSS animations that could conflict with physics */
    animation: none !important;
    /* GPU optimization for smooth animation */
    will-change: transform;
  }
  
  /* Gradient overlays for depth effect */
  .reel-gradient-top,
  .reel-gradient-bottom {
    position: absolute;
    left: 0;
    right: 0;
    height: 40px;
    pointer-events: none;
    z-index: 10;
    transition: opacity 0.3s ease;
  }
  
  .reel-gradient-top {
    top: 0;
    background: linear-gradient(to bottom, 
      var(--theme-surface-primary) 0%, 
      color-mix(in srgb, var(--theme-surface-primary) 60%, transparent) 50%,
      transparent 100%
    );
  }
  
  .reel-gradient-bottom {
    bottom: 0;
    background: linear-gradient(to top, 
      var(--theme-surface-primary) 0%, 
      color-mix(in srgb, var(--theme-surface-primary) 60%, transparent) 50%,
      transparent 100%
    );
  }
  
  /* Direction-specific effects */
  .reel-viewport.spin-up .reel-gradient-top {
    opacity: 0.7;
  }
  
  .reel-viewport.spin-down .reel-gradient-bottom {
    opacity: 0.7;
  }
  
  .symbol-position {
    width: 100%;
    height: 100px; /* Fixed height for consistent spacing */
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-surface-secondary);
    border-radius: 8px;
    border: 1px solid var(--theme-surface-border);
    position: relative;
    /*overflow: hidden;*/
    transition: all 0.3s ease;
  }

  /* Make symbol position borders and background transparent for background themes */
  :global(.background-theme) .symbol-position {
    border: 1px solid transparent;
    background: transparent;
  }
  
  .symbol-position:hover {
    /* border-color: var(--theme-primary); */
    box-shadow: 0 0 12px color-mix(in srgb, var(--theme-primary) 30%, transparent);
    /* background: var(--theme-surface-hover); */
  }
  
  /* Physics debug info */
  .physics-debug {
    position: absolute;
    bottom: 4px;
    left: 4px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.7);
    background: rgba(0, 0, 0, 0.7);
    padding: 2px 4px;
    border-radius: 3px;
    pointer-events: none;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  /* Performance indicator (hidden by default) */
  .performance-indicator {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    pointer-events: none;
    z-index: 1000;
    display: none; /* Only shown in development */
  }
  
  /* Symbol reveal animation (applied via JS) */
  @keyframes symbol-reveal {
    0% { 
      transform: scale(0.8) rotateY(90deg); 
      opacity: 0; 
      filter: blur(2px);
    }
    50% { 
      transform: scale(1.05) rotateY(45deg); 
      opacity: 0.7; 
      filter: blur(1px);
    }
    100% { 
      transform: scale(1) rotateY(0deg); 
      opacity: 1; 
      filter: blur(0px);
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .reel-strip {
      transition: transform 0.3s ease !important;
    }
    
    .reel-viewport {
      filter: none !important;
      box-shadow: none !important;
    }
    
    .reel-gradient-top,
    .reel-gradient-bottom {
      display: none;
    }
  }
  
  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .symbol-position {
      border-color: rgba(255, 255, 255, 0.8);
      background: rgba(0, 0, 0, 0.8);
    }
    
    .reel-gradient-top,
    .reel-gradient-bottom {
      display: none;
    }
  }
  
  /* Battery optimization */
  .reel-grid[data-battery-optimized="true"] .reel-viewport {
    filter: none !important;
    box-shadow: none !important;
  }
  
  .reel-grid[data-battery-optimized="true"] .reel-gradient-top,
  .reel-grid[data-battery-optimized="true"] .reel-gradient-bottom {
    display: none;
  }
  
  /* Responsive design */
  @media (max-width: 768px) {
    .reel-grid {
      gap: 4px;
      padding: 12px;
    }
    
    .symbol-position {
      border-radius: 6px;
    }
    
    /* Reduce animation complexity on mobile */
    .reel-column.accelerating,
    .reel-column.decelerating {
      animation-duration: calc(var(--animation-duration, 0.3s) * 1.2);
    }
  }
  
  @media (max-width: 480px) {
    .reel-grid {
      gap: 2px;
      padding: 8px;
    }
    
    .symbol-position {
      border-radius: 4px;
      border-width: 1px;
    }
    
    /* Further reduce animations on small screens */
    .reel-blur-overlay {
      display: none;
    }
    
    .reel-column.settling {
      animation-duration: 0.2s;
    }
  }
  
  /* Dark mode adjustments */
  @media (prefers-color-scheme: dark) {
    .reel-grid {
      background: linear-gradient(145deg, #0f172a, #020617);
      border-color: #1e293b;
    }
    
    .symbol-position {
      background: rgba(15, 23, 42, 0.7);
      border-color: rgba(30, 41, 59, 0.7);
    }
  }
</style>