<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
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
  import SymbolComponent from './Symbol.svelte';
  
  export let grid: SlotSymbol[][];
  export let isSpinning: boolean;
  
  let reelElements: HTMLElement[] = [];
  let reelContainers: HTMLElement[] = [];
  let symbolGrid: HTMLElement[][] = [];
  let isMounted = false;
  let physicsEngine: ReelPhysicsEngine | null = null;
  
  // Extended reel data for seamless scrolling
  let extendedReels: SlotSymbol[][] = [];
  const VISIBLE_SYMBOLS = 3;
  const EXTENDED_SYMBOLS = 30; // More symbols for smooth scrolling (increased buffer)
  
  // Subscribe to animation stores (removed reactive reelStates to prevent conflicts with physics)
  $: preferences = $animationPreferences;
  $: reduceMotion = $shouldReduceAnimations;
  $: theme = $currentTheme;
  
  // Initialize extended reels only when grid changes (prevent recreation during spinning)
  $: if (!currentlySpinning) {
    extendedReels = grid.map(reel => {
      // Ensure we have a valid reel with symbols
      if (!reel || reel.length === 0) {
        console.warn('Empty or invalid reel detected, using fallback');
        return [];
      }
      
      // Create extended reel with buffer symbols for seamless wrapping
      const extended: SlotSymbol[] = [];
      
      // Add buffer at the start (last few symbols from original reel)
      const bufferStart = 5;
      for (let i = 0; i < bufferStart; i++) {
        const symbol = reel[reel.length - bufferStart + i];
        if (symbol) {
          extended.push(symbol);
        }
      }
      
      // Add main symbols (repeat the original reel multiple times)
      for (let i = 0; i < EXTENDED_SYMBOLS - bufferStart * 2; i++) {
        const symbol = reel[i % reel.length];
        if (symbol) {
          extended.push(symbol);
        }
      }
      
      // Add buffer at the end (first few symbols from original reel)
      const bufferEnd = 5;
      for (let i = 0; i < bufferEnd; i++) {
        const symbol = reel[i % reel.length];
        if (symbol) {
          extended.push(symbol);
        }
      }
      
      return extended;
    });
  }
  
  // Track spinning state to avoid multiple triggers
  let currentlySpinning = false;
  let processingSpinId: string | null = null;
  
  // COMPLETELY REMOVE REACTIVE STATEMENTS - Use direct function calls instead
  let lastProcessedSpinId: string | null = null;
  let lastProcessedOutcomeSpinId: string | null = null;
  
  // Direct function that gets called from parent component
  export function startSpin(spinId: string) {
    if (!isMounted || !physicsEngine || !reelElements.length || 
        spinId === lastProcessedSpinId || currentlySpinning) {
      return;
    }
    lastProcessedSpinId = spinId;
    currentlySpinning = true;
    
    // Calculate target positions within safe zone (avoiding buffer areas)
    const bufferSymbols = 5;
    const safeZoneSymbols = EXTENDED_SYMBOLS - bufferSymbols * 2;
    const targetPositions = Array(5).fill(0).map(() => 
      (bufferSymbols + Math.floor(Math.random() * safeZoneSymbols)) * 100
    );
    
    physicsEngine.startSpin(targetPositions);
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
    
    // DUPLICATE PROTECTION: Prevent repeated calls for same outcome
    if (spinId && lastProcessedOutcomeSpinId === spinId) {
      return;
    }
    lastProcessedOutcomeSpinId = spinId || null;
    
    // COMPLETELY stop physics animation and any callbacks
    physicsEngine.stopAllReels();
    currentlySpinning = false;
    
    // Clear any visual effects and reset to default position
    reelElements.forEach((element, reelIndex) => {
      if (element && reelContainers[reelIndex]) {
        // Reset to default position (0px) - let Svelte handle the symbol display
        const transform = `translate3d(0, 0px, 0)`;
        element.style.transform = transform;
        
        // Clear all visual effects
        reelContainers[reelIndex].style.filter = '';
        reelContainers[reelIndex].style.perspective = '';
        reelContainers[reelIndex].style.boxShadow = '';
        
        // Disable GPU optimization to prevent further updates
        element.style.willChange = '';
        reelContainers[reelIndex].style.willChange = '';
      }
    });
    
    // The grid prop should now contain the correct symbols from the game store
    // Svelte will automatically re-render the correct symbols
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
        const translateY = -state.currentPosition;
        const transform = `translate3d(0, ${translateY}px, 0)`;
        
        reelElements[index].style.transform = transform;
        
        // Apply visual effects only during spinning
        if (reelContainers[index]) {
          reelContainers[index].style.filter = `blur(${Math.min(Math.abs(state.velocity) / 500, 2)}px)`;
        }
      }
    });
  }
  
  onMount(() => {
    // Initialize animations system
    initializeAnimations();
    // Don't start performance monitoring by default - it runs at 60fps continuously!
    // Only enable during actual performance debugging
    // startPerformanceOptimization();
    
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
      // Use more specific selectors to get exactly 5 reels
      const gridElement = document.querySelector('.reel-grid');
      if (gridElement) {
        reelElements = Array.from(gridElement.querySelectorAll('.reel-strip'));
        reelContainers = Array.from(gridElement.querySelectorAll('.reel-viewport'));
      } else {
        reelElements = [];
        reelContainers = [];
      }
      
      // Initialize symbol grid references
      symbolGrid = Array(5).fill(null).map((_, reelIndex) => 
        Array.from(document.querySelectorAll(`[data-reel="${reelIndex}"] .symbol-element`))
      );
      
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
    const gridElement = document.querySelector('.reel-grid');
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

<div class="reel-grid" role="application" aria-label="Slot machine reels">
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
  }
  
  .reel-container {
    position: relative;
    height: 320px; /* Fixed height for 3 visible symbols + padding */
    overflow: hidden;
    border-radius: 6px;
    background: var(--theme-surface-primary);
    border: 1px solid var(--theme-surface-border);
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
    overflow: hidden;
    transition: all 0.3s ease;
  }
  
  .symbol-position:hover {
    border-color: var(--theme-primary);
    box-shadow: 0 0 12px color-mix(in srgb, var(--theme-primary) 30%, transparent);
    background: var(--theme-surface-hover);
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