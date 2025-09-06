<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { scale, fade, fly, blur } from 'svelte/transition';
  import { elasticOut, bounceOut, backOut } from 'svelte/easing';
  import type { SlotSymbol, ReelPosition } from '$lib/types/symbols';
  import { 
    animationPreferences, 
    shouldReduceAnimations 
  } from '$lib/stores/animations';
  import { triggerTouchFeedback } from '$lib/utils/animations';
  import { currentTheme } from '$lib/stores/theme';
  import { getThemeSymbolImagePath } from '$lib/constants/symbols';
  
  export let symbol: SlotSymbol;
  export let size: 'small' | 'medium' | 'large' = 'medium';
  export let isSpinning = false;
  export let isHighlighted = false;
  export let isWinning = false;
  export let winMultiplier: number | null = null;
  export let position: ReelPosition | null = null;
  export let showMultiplier = false;
  export let animationDelay = 0;
  
  const dispatch = createEventDispatcher();
  
  let symbolElement: HTMLElement;
  let isRevealing = false;
  let showWinEffect = false;
  let winEffectLevel: 'small' | 'medium' | 'large' | 'jackpot' = 'small';
  
  // Subscribe to animation preferences
  $: preferences = $animationPreferences;
  $: reduceMotion = $shouldReduceAnimations;
  $: theme = $currentTheme;

  // Get theme-specific image path
  $: themeImagePath = symbol ? getThemeSymbolImagePath(symbol.id, theme) : symbol?.image;
  
  $: sizeClass = {
    small: 'w-8 h-8',
    medium: 'w-12 h-12',
    large: 'w-16 h-16'
  }[size];
  
  $: rarityGlow = symbol?.rarity ? {
    common: '',
    uncommon: 'shadow-green-500/20',
    rare: 'shadow-blue-500/30',
    legendary: 'shadow-purple-500/40'
  }[symbol.rarity] : '';
  
  // Determine win effect level based on multiplier
  $: if (winMultiplier) {
    if (winMultiplier >= 100) winEffectLevel = 'jackpot';
    else if (winMultiplier >= 50) winEffectLevel = 'large';
    else if (winMultiplier >= 10) winEffectLevel = 'medium';
    else winEffectLevel = 'small';
  }
  
  // Handle win highlighting
  $: if (isWinning && !showWinEffect) {
    setTimeout(() => {
      showWinEffect = true;
      if (preferences.hapticEnabled && !reduceMotion) {
        triggerHapticForWin();
      }
    }, animationDelay);
  } else if (!isWinning) {
    showWinEffect = false;
  }
  
  // Handle symbol revealing after spin
  $: if (!isSpinning && isRevealing) {
    isRevealing = false;
  }
  
  function handleClick() {
    if (position) {
      // Add touch feedback
      if (symbolElement && preferences.hapticEnabled) {
        triggerTouchFeedback(symbolElement, {
          type: 'scale',
          duration: 150,
          intensity: 0.95,
          easing: 'ease-out'
        });
      }
      
      dispatch('symbolClick', { symbol, position });
    }
  }
  
  function triggerHapticForWin() {
    const intensity = {
      small: 0.3,
      medium: 0.5,
      large: 0.7,
      jackpot: 1.0
    }[winEffectLevel];
    
    if (symbolElement && typeof navigator !== 'undefined') {
      triggerTouchFeedback(symbolElement, {
        type: 'haptic',
        duration: 50,
        intensity,
        easing: 'linear'
      });
    }
  }
  
  function startRevealAnimation() {
    if (!reduceMotion) {
      isRevealing = true;
      setTimeout(() => {
        isRevealing = false;
      }, 600);
    }
  }
</script>

<div 
  bind:this={symbolElement}
  class="symbol-container"
  class:spinning={isSpinning}
  class:highlighted={isHighlighted}
  class:winning={isWinning}
  class:revealing={isRevealing}
  class:clickable={position !== null}
  class:win-{winEffectLevel}={showWinEffect}
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex={position ? 0 : -1}
  style="--symbol-color: {symbol?.color || theme.primary}; --glow-color: {symbol?.glowColor || theme.secondary}; --theme-primary: {theme.primary}; --theme-secondary: {theme.secondary}; --animation-delay: {animationDelay}ms;"
  aria-label="{symbol?.displayName || 'Symbol'}{isWinning ? ' - Winning symbol!' : ''}"
>
  <!-- Symbol image -->
  <div class="symbol-image-wrapper">
    {#if themeImagePath || symbol?.image}
      {#if isRevealing && !reduceMotion && !isSpinning}
        <img
          src={themeImagePath || symbol.image}
          alt={symbol.displayName || 'Symbol'}
          class="symbol-image {rarityGlow}"
          in:fly={{ y: 20, duration: 400, delay: animationDelay, easing: backOut }}
          out:scale={{ duration: 200, start: 1.1 }}
        />
      {:else}
        <img
          src={themeImagePath || symbol.image}
          alt={symbol.displayName || 'Symbol'}
          class="symbol-image {rarityGlow}"
        />
      {/if}
    {:else}
      <!-- Fallback for missing symbol -->
      <div class="symbol-placeholder">
        <div class="placeholder-content"></div>
      </div>
    {/if}
  </div>
  
  <!-- Rarity indicator -->
  {#if symbol?.rarity && symbol.rarity !== 'common' && !isSpinning}
    <div 
      class="rarity-indicator rarity-{symbol.rarity}"
      in:scale={{ duration: 300, delay: animationDelay + 200, start: 0 }}
    ></div>
  {/if}
  
  <!-- Win multiplier display -->
  {#if showWinEffect && winMultiplier && !isSpinning}
    <div 
      class="win-multiplier {winEffectLevel}"
      in:fly={{ y: -10, duration: 500, delay: animationDelay + 100, easing: bounceOut }}
      out:fade={{ duration: 200 }}
    >
      +{winMultiplier}x
    </div>
  {/if}
  
  <!-- Standard multiplier display -->
  {#if showMultiplier && symbol?.multipliers?.[3] && !isSpinning && !showWinEffect}
    <div class="multiplier-badge" in:fade={{ duration: 300 }}>
      {symbol.multipliers[3]}x
    </div>
  {/if}
  
  <!-- Win highlight effects -->
  {#if showWinEffect}
    <!-- Primary win glow -->
    <div 
      class="win-highlight primary"
      in:scale={{ duration: 600, easing: elasticOut }}
      out:fade={{ duration: 300 }}
    ></div>
    
    <!-- Secondary pulse effect for bigger wins -->
    {#if winEffectLevel !== 'small'}
      <div 
        class="win-highlight secondary"
        in:scale={{ duration: 800, delay: 200, easing: elasticOut }}
        out:fade={{ duration: 300 }}
      ></div>
    {/if}
    
    <!-- Jackpot burst effect -->
    {#if winEffectLevel === 'jackpot'}
      <div 
        class="win-highlight jackpot-burst"
        in:scale={{ duration: 1000, delay: 300, easing: elasticOut }}
        out:fade={{ duration: 500 }}
      ></div>
    {/if}
  {/if}
  
  <!-- Legacy highlight for compatibility -->
  {#if isHighlighted && !showWinEffect}
    <div class="win-highlight legacy" in:scale={{ duration: 400 }}></div>
  {/if}
  
  <!-- Touch interaction ripple (added via JS) -->
  <div class="touch-ripple-container" aria-hidden="true"></div>
</div>

<style>
  .symbol-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    transform-origin: center;
    border-radius: 8px;
    overflow: hidden;
  }
  
  .symbol-container.clickable {
    cursor: pointer;
  }
  
  /*.symbol-container.clickable:focus {
    outline: 2px solid var(--theme-primary);
    outline-offset: 2px;
  }*/
  
  .symbol-container.spinning {
    /* Container stays stable, individual symbols handle their own spinning effects */
  }
  
  /* Removed individual symbol spinning - now handled by parent reel physics */
  .symbol-container.spinning .symbol-image {
    /* Symbol stays stable while parent reel moves */
    transform: none;
  }
  
  .symbol-container.highlighted {
    transform: scale(1.05);
    z-index: 10;
  }
  
  .symbol-container.winning {
    z-index: 15;
  }
  
  .symbol-container.revealing {
    overflow: visible;
  }
  
  /* Win effect levels */
  .symbol-container.win-small {
    animation: win-small 1.5s ease-in-out;
  }
  
  .symbol-container.win-medium {
    animation: win-medium 2s ease-in-out;
  }
  
  .symbol-container.win-large {
    animation: win-large 2.5s ease-in-out;
  }
  
  .symbol-container.win-jackpot {
    animation: win-jackpot 3s ease-in-out;
  }
  
  .symbol-image-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    /*overflow: hidden;*/
    perspective: 1000px;
    transform-style: preserve-3d;
  }
  
  .symbol-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 6px;
    transition: all 0.3s ease;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
  }
  
  .symbol-placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(45deg, #374151, #4b5563);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  
  .placeholder-content {
    width: 60%;
    height: 60%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    animation: placeholder-shimmer 1.5s ease-in-out infinite;
    border-radius: 4px;
  }
  
  .symbol-container:hover .symbol-image {
    transform: scale(1.05);
    filter: brightness(1.1) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
  }
  
  .symbol-container.clickable:active .symbol-image {
    transform: scale(0.95);
  }
  
  /* Rarity indicators */
  .rarity-indicator {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    z-index: 5;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }
  
  .rarity-uncommon {
    background: #10b981;
    box-shadow: 0 0 4px #10b981;
  }
  
  .rarity-rare {
    background: #3b82f6;
    box-shadow: 0 0 6px #3b82f6;
  }
  
  .rarity-legendary {
    background: #8b5cf6;
    box-shadow: 0 0 8px #8b5cf6;
    animation: legendary-pulse 2s ease-in-out infinite;
  }
  
  /* Multiplier badges */
  .multiplier-badge {
    position: absolute;
    bottom: -4px;
    right: -4px;
    background: var(--symbol-color);
    color: white;
    font-size: 0.6rem;
    font-weight: bold;
    padding: 1px 4px;
    border-radius: 4px;
    z-index: 5;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }
  
  .win-multiplier {
    position: absolute;
    top: -8px;
    left: 50%;
    transform: translateX(-50%);
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 6px;
    z-index: 20;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
  
  .win-multiplier.small {
    background: linear-gradient(45deg, #10b981, #059669);
    color: white;
    font-size: 0.7rem;
  }
  
  .win-multiplier.medium {
    background: linear-gradient(45deg, #3b82f6, #1d4ed8);
    color: white;
    font-size: 0.8rem;
    animation: multiplier-bounce 0.6s ease-out;
  }
  
  .win-multiplier.large {
    background: linear-gradient(45deg, #8b5cf6, #7c3aed);
    color: white;
    font-size: 0.9rem;
    animation: multiplier-bounce 0.8s ease-out;
  }
  
  .win-multiplier.jackpot {
    background: linear-gradient(45deg, #f59e0b, #d97706);
    color: white;
    font-size: 1rem;
    animation: multiplier-jackpot 1s ease-out;
  }
  
  /* Win highlight effects */
  .win-highlight {
    position: absolute;
    border-radius: 8px;
    pointer-events: none;
  }
  
  .win-highlight.primary {
    inset: -2px;
    background: radial-gradient(circle, var(--theme-primary) 0%, transparent 70%);
    opacity: 0.8;
    animation: win-glow-primary 1.5s ease-in-out infinite;
    z-index: 1;
  }
  
  .win-highlight.secondary {
    inset: -4px;
    background: linear-gradient(45deg, transparent, var(--theme-secondary), transparent);
    opacity: 0.6;
    animation: win-glow-secondary 2s ease-in-out infinite;
    z-index: 0;
  }
  
  .win-highlight.jackpot-burst {
    inset: -8px;
    background: conic-gradient(from 0deg, 
      #f59e0b, #ef4444, #8b5cf6, #3b82f6, 
      #10b981, #f59e0b);
    opacity: 0.9;
    animation: win-jackpot-burst 2s ease-in-out infinite;
    z-index: -1;
  }
  
  .win-highlight.legacy {
    inset: -2px;
    background: linear-gradient(45deg, transparent, var(--theme-primary), transparent);
    opacity: 0.6;
    animation: win-pulse 1s ease-in-out infinite;
    z-index: 1;
  }
  
  /* Touch ripple container */
  .touch-ripple-container {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    overflow: hidden;
    pointer-events: none;
    z-index: 10;
  }
  
  /* Animation keyframes */
  @keyframes legendary-pulse {
    0%, 100% { 
      opacity: 1; 
      transform: scale(1);
    }
    50% { 
      opacity: 0.7; 
      transform: scale(1.1);
    }
  }
  
  @keyframes win-pulse {
    0%, 100% { 
      opacity: 0.6;
      transform: scale(1);
    }
    50% { 
      opacity: 0.9;
      transform: scale(1.02);
    }
  }
  
  @keyframes placeholder-shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  
  /* Removed symbol-rotate-spin animation - symbols no longer spin individually */
  
  @keyframes win-small {
    0% { transform: scale(1); }
    20% { transform: scale(1.1); }
    40% { transform: scale(1.05); }
    60% { transform: scale(1.08); }
    80% { transform: scale(1.02); }
    100% { transform: scale(1); }
  }
  
  @keyframes win-medium {
    0% { transform: scale(1) rotate(0deg); }
    15% { transform: scale(1.15) rotate(2deg); }
    30% { transform: scale(1.1) rotate(-1deg); }
    45% { transform: scale(1.12) rotate(1deg); }
    60% { transform: scale(1.05) rotate(-0.5deg); }
    75% { transform: scale(1.08) rotate(0.5deg); }
    90% { transform: scale(1.02) rotate(0deg); }
    100% { transform: scale(1) rotate(0deg); }
  }
  
  @keyframes win-large {
    0% { transform: scale(1) rotate(0deg); }
    10% { transform: scale(1.2) rotate(3deg); }
    20% { transform: scale(1.15) rotate(-2deg); }
    30% { transform: scale(1.18) rotate(2deg); }
    40% { transform: scale(1.1) rotate(-1deg); }
    50% { transform: scale(1.15) rotate(1deg); }
    60% { transform: scale(1.08) rotate(-0.5deg); }
    70% { transform: scale(1.12) rotate(0.5deg); }
    80% { transform: scale(1.05) rotate(0deg); }
    90% { transform: scale(1.08) rotate(0deg); }
    100% { transform: scale(1) rotate(0deg); }
  }
  
  @keyframes win-jackpot {
    0% { transform: scale(1) rotate(0deg); }
    5% { transform: scale(1.3) rotate(5deg); }
    10% { transform: scale(1.2) rotate(-3deg); }
    15% { transform: scale(1.25) rotate(3deg); }
    20% { transform: scale(1.15) rotate(-2deg); }
    25% { transform: scale(1.2) rotate(2deg); }
    30% { transform: scale(1.1) rotate(-1deg); }
    35% { transform: scale(1.15) rotate(1deg); }
    40% { transform: scale(1.08) rotate(-0.5deg); }
    50% { transform: scale(1.12) rotate(0.5deg); }
    60% { transform: scale(1.05) rotate(0deg); }
    70% { transform: scale(1.08) rotate(0deg); }
    80% { transform: scale(1.02) rotate(0deg); }
    90% { transform: scale(1.05) rotate(0deg); }
    100% { transform: scale(1) rotate(0deg); }
  }
  
  @keyframes multiplier-bounce {
    0% { transform: translateX(-50%) translateY(0) scale(0.8); }
    50% { transform: translateX(-50%) translateY(-5px) scale(1.1); }
    100% { transform: translateX(-50%) translateY(0) scale(1); }
  }
  
  @keyframes multiplier-jackpot {
    0% { transform: translateX(-50%) translateY(0) scale(0.8) rotate(-5deg); }
    25% { transform: translateX(-50%) translateY(-8px) scale(1.2) rotate(2deg); }
    50% { transform: translateX(-50%) translateY(-5px) scale(1.1) rotate(-1deg); }
    75% { transform: translateX(-50%) translateY(-2px) scale(1.05) rotate(0.5deg); }
    100% { transform: translateX(-50%) translateY(0) scale(1) rotate(0deg); }
  }
  
  @keyframes win-glow-primary {
    0%, 100% { 
      opacity: 0.8;
      transform: scale(1);
    }
    50% { 
      opacity: 1;
      transform: scale(1.05);
    }
  }
  
  @keyframes win-glow-secondary {
    0%, 100% { 
      opacity: 0.6;
      transform: scale(1) rotate(0deg);
    }
    50% { 
      opacity: 0.9;
      transform: scale(1.1) rotate(180deg);
    }
  }
  
  @keyframes win-jackpot-burst {
    0% { 
      opacity: 0.9;
      transform: scale(1) rotate(0deg);
    }
    50% { 
      opacity: 1;
      transform: scale(1.2) rotate(180deg);
    }
    100% { 
      opacity: 0.9;
      transform: scale(1) rotate(360deg);
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .symbol-container,
    .win-highlight,
    .rarity-indicator,
    .win-multiplier,
    .placeholder-content {
      animation: none !important;
    }
    
    .symbol-container.winning {
      outline: 2px solid var(--theme-primary);
      outline-offset: 2px;
    }
    
    .symbol-container:hover .symbol-image {
      transform: none;
      filter: brightness(1.1);
    }
  }
  
  /* High contrast mode */
  @media (prefers-contrast: high) {
    .win-highlight {
      border: 2px solid var(--theme-primary);
      background: none;
    }
    
    .win-multiplier {
      border: 2px solid currentColor;
      background: var(--theme-primary);
    }
  }
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .rarity-indicator {
      width: 4px;
      height: 4px;
    }
    
    .multiplier-badge {
      font-size: 0.5rem;
      padding: 0px 2px;
    }
    
    .win-multiplier {
      font-size: 0.6rem;
      padding: 1px 4px;
    }
    
    .win-multiplier.medium,
    .win-multiplier.large,
    .win-multiplier.jackpot {
      font-size: 0.7rem;
    }
    
    /* Reduce animation intensity on mobile */
    .symbol-container.win-large,
    .symbol-container.win-jackpot {
      animation-duration: 2s;
    }
  }
  
  @media (max-width: 480px) {
    .win-multiplier {
      font-size: 0.5rem;
      padding: 1px 3px;
    }
    
    .multiplier-badge {
      font-size: 0.4rem;
      padding: 0px 1px;
    }
    
    /* Further reduce effects on small screens */
    .win-highlight.secondary,
    .win-highlight.jackpot-burst {
      display: none;
    }
  }
</style>