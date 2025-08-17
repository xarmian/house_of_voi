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
  import { 
    ReelSpinAnimation, 
    easingFunctions, 
    initializeAnimations
  } from '$lib/utils/animations';
  import SymbolComponent from './Symbol.svelte';
  
  export let grid: SlotSymbol[][];
  export let isSpinning: boolean;
  
  let reelElements: HTMLElement[] = [];
  let reelContainers: HTMLElement[] = [];
  let activeAnimations: ReelSpinAnimation[] = [];
  let symbolGrid: HTMLElement[][] = [];
  let isMounted = false;
  
  // Subscribe to animation stores
  $: reelStates = $reelAnimations;
  $: preferences = $animationPreferences;
  $: reduceMotion = $shouldReduceAnimations;
  
  // Handle main spinning state changes
  $: if (isMounted && isSpinning) {
    startSpinning();
  } else if (isMounted) {
    stopAllSpinAnimations();
  }
  
  // Update individual reel animations based on store state
  $: {
    if (reelElements && reelElements.length === 5) {
      reelStates.forEach((state, index) => {
        updateReelVisuals(index, state);
      });
    }
  }
  
  function startSpinning() {
    // Start all 5 reels spinning
    for (let i = 0; i < 5; i++) {
      reelAnimations.startReelSpin(i, {
        spinSpeed: 40,
        blur: 2,
        easingPhase: 'constant'
      });
    }
  }
  
  
  function updateReelVisuals(reelIndex: number, state: ReelAnimationState) {
    const reelElement = reelElements[reelIndex];
    if (!reelElement) return;
    
    // Apply blur based on spin speed
    const blurAmount = state.isSpinning ? 
      Math.min(state.blur, preferences.batteryOptimized ? 2 : 4) : 0;
    reelElement.style.filter = `blur(${blurAmount}px)`;
    
    // Apply transform based on offset
    if (state.offset !== 0) {
      reelElement.style.transform = `translateY(${state.offset}px)`;
    } else {
      reelElement.style.transform = '';
    }
    
    // Apply appropriate animation class
    reelElement.className = reelElement.className.replace(/reel-\w+/g, '');
    if (state.isSpinning) {
      reelElement.classList.add(`reel-${state.easingPhase}`);
    }
    
    // GPU optimization
    if (state.isSpinning) {
      reelElement.style.willChange = 'transform, filter';
    } else {
      reelElement.style.willChange = 'auto';
    }
  }
  
  function stopAllSpinAnimations() {
    // Stop all active animations
    activeAnimations.forEach((animation, index) => {
      if (animation) {
        animation.stop();
        activeAnimations[index] = null;
      }
    });
    
    // Clear animation store
    reelAnimations.stopAllReels();
    
    // Clean up visual states
    reelElements.forEach((element, index) => {
      if (element) {
        element.style.filter = '';
        element.style.transform = '';
        element.style.willChange = 'auto';
        element.className = element.className.replace(/reel-\w+/g, '');
      }
    });
  }
  
  onMount(() => {
    // Initialize animations system
    initializeAnimations();
    startPerformanceOptimization();
    
    // Initialize reel references
    const updateReelRefs = () => {
      reelElements = Array.from(document.querySelectorAll('.reel-column'));
      reelContainers = Array.from(document.querySelectorAll('.reel-container'));
      
      // Initialize symbol grid references
      symbolGrid = Array(5).fill(null).map((_, reelIndex) => 
        Array.from(document.querySelectorAll(`[data-reel="${reelIndex}"] .symbol-element`))
      );
    };
    
    // Use timeout to ensure DOM is ready
    setTimeout(() => {
      updateReelRefs();
      isMounted = true; // Set mounted flag after DOM is ready
    }, 100);
    
    // Also update on any changes
    const observer = new MutationObserver(updateReelRefs);
    observer.observe(document.querySelector('.reel-grid'), {
      childList: true,
      subtree: true
    });
    
    return () => observer.disconnect();
  });
  
  onDestroy(() => {
    stopAllSpinAnimations();
    cleanupAnimations();
  });
</script>

<div class="reel-grid" role="application" aria-label="Slot machine reels">
  {#each grid as reel, reelIndex}
    <div 
      class="reel-container"
      data-reel={reelIndex}
      aria-label="Reel {reelIndex + 1}"
    >
      <div 
        class="reel-column"
        class:spinning={reelStates[reelIndex]?.isSpinning}
        class:accelerating={reelStates[reelIndex]?.easingPhase === 'acceleration'}
        class:decelerating={reelStates[reelIndex]?.easingPhase === 'deceleration'}
        class:settling={reelStates[reelIndex]?.easingPhase === 'settling'}
        data-reel={reelIndex}
      >
        {#each reel as symbol, rowIndex}
          <div 
            class="symbol-position"
            class:symbol-element={true}
            data-position="{reelIndex}-{rowIndex}"
            data-reel={reelIndex}
            data-row={rowIndex}
          >
            <SymbolComponent 
              {symbol} 
              size="medium"
              isSpinning={reelStates[reelIndex]?.isSpinning || false}
              position={{ reel: reelIndex, row: rowIndex, symbol }}
              animationDelay={rowIndex * 150}
            />
          </div>
        {/each}
      </div>
      
      <!-- Reel performance overlay (development only) -->
      {#if reelStates[reelIndex]?.isSpinning && !preferences.batteryOptimized}
        <div class="reel-blur-overlay" aria-hidden="true"></div>
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
    background: linear-gradient(145deg, #1e293b, #0f172a);
    border-radius: 8px;
    border: 2px solid #334155;
    max-width: 600px;
    margin: 0 auto;
    position: relative;
    overflow: hidden;
  }
  
  .reel-container {
    position: relative;
    height: 100%;
    overflow: hidden;
    border-radius: 6px;
  }
  
  .reel-column {
    display: flex;
    flex-direction: column;
    gap: 2px;
    height: 100%;
    position: relative;
    transform-origin: center top;
    backface-visibility: hidden;
    /* GPU acceleration will be set via JS when needed */
  }
  
  /* Spinning animation phases */
  .reel-column.spinning {
    transition: none; /* Disable CSS transitions during JS animations */
  }
  
  .reel-column.accelerating {
    animation: reel-accelerate 0.3s ease-out infinite;
  }
  
  .reel-column.decelerating {
    animation: reel-decelerate 0.5s ease-in infinite;
  }
  
  .reel-column.settling {
    animation: reel-settle 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }
  
  .reel-column.constant {
    animation: reel-constant 0.6s linear infinite;
  }
  
  .symbol-position {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(30, 41, 59, 0.5);
    border-radius: 8px;
    border: 1px solid rgba(51, 65, 85, 0.5);
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }
  
  .symbol-position:hover {
    border-color: rgba(16, 185, 129, 0.5);
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.2);
  }
  
  /* Performance overlay for spinning reels */
  .reel-blur-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      0deg,
      transparent 0%,
      rgba(255, 255, 255, 0.1) 30%,
      rgba(255, 255, 255, 0.2) 50%,
      rgba(255, 255, 255, 0.1) 70%,
      transparent 100%
    );
    animation: reel-blur-sweep 0.8s ease-in-out infinite;
    pointer-events: none;
    z-index: 10;
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
  
  /* Animation keyframes */
  @keyframes reel-accelerate {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-4px); }
    100% { transform: translateY(0px); }
  }
  
  @keyframes reel-decelerate {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-2px); }
    100% { transform: translateY(0px); }
  }
  
  @keyframes reel-settle {
    0% { transform: translateY(0px) scaleY(1); }
    30% { transform: translateY(-1px) scaleY(1.02); }
    60% { transform: translateY(1px) scaleY(0.98); }
    100% { transform: translateY(0px) scaleY(1); }
  }
  
  @keyframes reel-constant {
    0% { transform: translateY(0px); }
    25% { transform: translateY(-3px); }
    50% { transform: translateY(0px); }
    75% { transform: translateY(3px); }
    100% { transform: translateY(0px); }
  }
  
  @keyframes reel-blur-sweep {
    0% { transform: translateY(-100%); opacity: 0; }
    50% { opacity: 1; }
    100% { transform: translateY(100%); opacity: 0; }
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
    .reel-column,
    .symbol-position,
    .reel-blur-overlay {
      animation: none !important;
      transition: opacity 0.3s ease !important;
    }
    
    .reel-column.spinning {
      opacity: 0.7;
    }
    
    .reel-blur-overlay {
      display: none;
    }
  }
  
  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .symbol-position {
      border-color: rgba(255, 255, 255, 0.8);
      background: rgba(0, 0, 0, 0.8);
    }
    
    .reel-blur-overlay {
      display: none;
    }
  }
  
  /* Battery optimization via CSS custom properties - applied via JS */
  .reel-grid[data-battery-optimized="true"] .reel-column.spinning {
    animation-duration: calc(var(--animation-duration, 0.3s) * 1.5);
    animation-timing-function: linear;
  }
  
  .reel-grid[data-battery-optimized="true"] .reel-blur-overlay {
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