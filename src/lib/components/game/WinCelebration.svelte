<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { scale, fly, fade } from 'svelte/transition';
  import { elasticOut, bounceOut, cubicOut } from 'svelte/easing';
  import type { CelebrationEffect, WinAnimation } from '$lib/types/animations';
  import type { SlotSymbol } from '$lib/types/symbols';
  import { 
    animationPreferences, 
    shouldReduceAnimations, 
    winAnimations 
  } from '$lib/stores/animations';
  import { triggerWinCelebration } from '$lib/utils/animations';
  import { playWinSound } from '$lib/services/soundService';
  import WinLineRenderer from './WinLineRenderer.svelte';
  import { detectWinningPaylines, formatPaylineDebugInfo } from '$lib/utils/winLineDetection';
  import type { WinningPaylineData } from '$lib/utils/winLineDetection';
  
  // Test-specific win detection that doesn't rely on contract
  async function detectTestWinningPaylines(
    grid: string[][],
    betPerLine: number,
    selectedPaylines: number
  ): Promise<WinningPaylineData[]> {
    const winningPaylines: WinningPaylineData[] = [];
    
    // Use standard payline patterns for testing
    const standardPaylines = [
      [1, 1, 1, 1, 1], // Middle row
      [0, 0, 0, 0, 0], // Top row
      [2, 2, 2, 2, 2], // Bottom row
      [0, 1, 2, 1, 0], // V shape
      [2, 1, 0, 1, 2], // ^ shape
      [0, 0, 1, 2, 2], // Diagonal down
      [2, 2, 1, 0, 0], // Diagonal up
      [1, 0, 1, 2, 1], // Zigzag
      [1, 2, 1, 0, 1], // Zigzag reverse
      [0, 1, 0, 1, 0], // Up-down pattern
    ];
    
    // Check each selected payline for wins
    for (let line = 0; line < Math.min(selectedPaylines, standardPaylines.length); line++) {
      const payline = standardPaylines[line];
      
      // Count occurrences of each symbol anywhere in the payline
      const symbolCounts: { [symbol: string]: number } = {
        'A': 0,
        'B': 0,
        'C': 0,
        'D': 0
      };

      // Check all positions in the payline
      const paylineSymbols = [];
      for (let col = 0; col < 5; col++) {
        const row = payline[col];
        const symbol = grid[col][row];
        paylineSymbols.push(symbol);
        
        if (['A', 'B', 'C', 'D'].includes(symbol)) {
          symbolCounts[symbol]++;
        }
      }
      
      // Find the symbol with the highest count (must be at least 3)
      let bestSymbol = '';
      let bestCount = 0;
      
      for (const symbol of ['A', 'B', 'C', 'D']) {
        if (symbolCounts[symbol] >= 3 && symbolCounts[symbol] > bestCount) {
          bestSymbol = symbol;
          bestCount = symbolCounts[symbol];
        }
      }

      // If we have a winning combination, calculate winnings
      if (bestCount >= 3) {
        // Use simplified multipliers for testing
        const multipliers = {
          'A': { 3: 50, 4: 200, 5: 1000 },
          'B': { 3: 25, 4: 100, 5: 500 },
          'C': { 3: 10, 4: 50, 5: 200 },
          'D': { 3: 5, 4: 25, 5: 100 }
        };
        
        const multiplier = multipliers[bestSymbol][bestCount] || 1;
        const winAmount = betPerLine * multiplier;
        
        winningPaylines.push({
          paylineIndex: line,
          payline: [...payline],
          symbol: bestSymbol,
          count: bestCount,
          multiplier,
          winAmount
        });
      }
    }
    
    return winningPaylines;
  }

  export let isVisible = false;
  export let winAmount = 0;
  export let betAmount = 0;
  export let winLevel: 'small' | 'medium' | 'large' | 'jackpot' = 'small';
  export let duration = 3000;
  export let winningSymbols: SlotSymbol[] = [];
  export let gridOutcome: string[][] | null = null;
  export let selectedPaylines: number = 1;
  export let isReplay: boolean = false;

  let celebrationContainer: HTMLElement;
  let particles: Array<{ id: number; x: number; y: number; color: string; size: number }> = [];
  let coins: Array<{ id: number; x: number; y: number; delay: number }> = [];
  let shootingSymbols: Array<{ 
    id: number; 
    symbol: SlotSymbol; 
    x: number; 
    y: number; 
    targetX: number; 
    targetY: number; 
    delay: number; 
    rotation: number;
    scale: number;
  }> = [];
  let showWinText = false;
  let showWinAmount = false;
  let particleId = 0;
  let coinId = 0;
  let symbolId = 0;
  let winningPaylines: WinningPaylineData[] = [];
  let showWinLines = false;
  
  // Track all timeouts to properly clean them up
  let activeTimeouts: NodeJS.Timeout[] = [];

  // Calculate normalized amounts and multiplier
  $: normalizedWinAmount = winAmount / 1e6;
  $: normalizedBetAmount = betAmount / 1e6;
  $: multiplier = normalizedBetAmount > 0 ? normalizedWinAmount / normalizedBetAmount : 0;
  
  // Generate multiplier text
  $: multiplierText = (() => {
    if (multiplier === 0) return '';
    if (multiplier === 1) return 'Even!';
    if (multiplier < 1) return `${multiplier.toFixed(2)}x`;
    if (multiplier < 10) return `${multiplier.toFixed(1)}x`;
    return `${Math.floor(multiplier)}x`;
  })();

  // Subscribe to animation preferences
  $: preferences = $animationPreferences;
  $: reduceMotion = $shouldReduceAnimations;

  // Win level configurations with dynamic titles based on multiplier
  $: winConfig = (() => {
    const baseConfig = {
      small: {
        particleCount: reduceMotion ? 5 : 20,
        coinCount: reduceMotion ? 2 : 8,
        symbolCount: reduceMotion ? 6 : 24,
        colors: ['#10b981', '#059669', '#047857'],
        baseTitle: 'Nice Win!',
        intensity: 'low' as const
      },
      medium: {
        particleCount: reduceMotion ? 8 : 40,
        coinCount: reduceMotion ? 4 : 15,
        symbolCount: reduceMotion ? 10 : 40,
        colors: ['#3b82f6', '#1d4ed8', '#1e40af'],
        baseTitle: 'Great Win!',
        intensity: 'medium' as const
      },
      large: {
        particleCount: reduceMotion ? 12 : 80,
        coinCount: reduceMotion ? 6 : 25,
        symbolCount: reduceMotion ? 16 : 70,
        colors: ['#8b5cf6', '#7c3aed', '#6d28d9'],
        baseTitle: 'Big Win!',
        intensity: 'high' as const
      },
      jackpot: {
        particleCount: reduceMotion ? 15 : 150,
        coinCount: reduceMotion ? 8 : 40,
        symbolCount: reduceMotion ? 24 : 120,
        colors: ['#f59e0b', '#d97706', '#b45309', '#92400e'],
        baseTitle: 'JACKPOT!',
        intensity: 'extreme' as const
      }
    }[winLevel];
    
    // Add dynamic title based on multiplier
    let title = baseConfig.baseTitle;
    if (multiplier >= 100) {
      title = 'MEGA WIN!';
    } else if (multiplier >= 50) {
      title = 'HUGE WIN!';
    } else if (multiplier >= 20) {
      title = 'BIG WIN!';
    } else if (multiplier >= 10) {
      title = 'Great Win!';
    } else if (multiplier >= 5) {
      title = 'Nice Win!';
    } else if (multiplier === 1) {
      title = 'Even!';
    } else if (multiplier > 0) {
      title = 'Win!';
    }
    
    return { ...baseConfig, title };
  })();

  // Handle visibility changes
  $: if (isVisible) {
    // Use async IIFE to wait for DOM to be ready
    (async () => {
      await tick(); // Wait for DOM to update
      startCelebration();
    })();
  } else {
    cleanup();
  }

  async function startCelebration() {
    if (!celebrationContainer) return;

    // Detect winning paylines if we have valid grid outcome data
    if (gridOutcome && winAmount > 0) {
      try {
        // Check if grid has valid symbols (not placeholders like '_')
        const hasValidSymbols = gridOutcome.some(col => 
          col.some(symbol => symbol && symbol !== '_' && ['A', 'B', 'C', 'D'].includes(symbol))
        );
        
        if (!hasValidSymbols) {
          winningPaylines = [];
          showWinLines = false;
          return;
        }
        
        const betPerLine = betAmount / selectedPaylines;
        
        // Always use full detection across all paylines (including replays)
        winningPaylines = await detectWinningPaylines(gridOutcome, betPerLine, selectedPaylines);

        // Show winning lines immediately
        showWinLines = true;
      } catch (error) {
        console.error('Failed to detect winning paylines for celebration:', error);
        winningPaylines = [];
      }
    }

    // Play win sound immediately when celebration starts
    playWinSound(winLevel).catch(() => {
      // Ignore sound errors
    });

    // Show win text with delay
    activeTimeouts.push(setTimeout(() => {
      showWinText = true;
    }, 200));

    activeTimeouts.push(setTimeout(() => {
      showWinAmount = true;
    }, 600));

    // Start particle effects
    if (preferences.particlesEnabled && !reduceMotion) {
      createParticleExplosion();
    }

    // Start coin rain
    if (!reduceMotion) {
      createCoinRain();
    }

    // Start shooting symbols
    if (!reduceMotion && winningSymbols.length > 0) {
      createShootingSymbols();
    }

    // Screen effects
    if (winLevel === 'large' || winLevel === 'jackpot') {
      createScreenShake();
    }

    if (winLevel === 'jackpot') {
      createScreenFlash();
    }

    // Note: Auto-hide is handled by the parent component
  }

  function createParticleExplosion() {
    const { particleCount, colors } = winConfig;
    const newParticles: typeof particles = [];

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * 2 * Math.PI;
      const velocity = 100 + Math.random() * 200;
      const centerX = celebrationContainer.offsetWidth / 2;
      const centerY = celebrationContainer.offsetHeight / 2;

      newParticles.push({
        id: particleId++,
        x: centerX + Math.cos(angle) * velocity,
        y: centerY + Math.sin(angle) * velocity,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 5
      });
    }

    particles = newParticles;

    // Remove particles after animation
    activeTimeouts.push(setTimeout(() => {
      particles = [];
    }, 2000));
  }

  function createCoinRain() {
    const { coinCount } = winConfig;
    const newCoins: typeof coins = [];

    for (let i = 0; i < coinCount; i++) {
      newCoins.push({
        id: coinId++,
        x: Math.random() * celebrationContainer.offsetWidth,
        y: -50,
        delay: i * 100
      });
    }

    coins = newCoins;

    // Remove coins after animation
    activeTimeouts.push(setTimeout(() => {
      coins = [];
    }, 3000));
  }

  function createShootingSymbols() {
    const { symbolCount } = winConfig;
    const newSymbols: typeof shootingSymbols = [];
    const centerX = celebrationContainer.offsetWidth / 2;
    const centerY = celebrationContainer.offsetHeight / 2;
    
    for (let i = 0; i < symbolCount; i++) {
      // Pick a random winning symbol or use available symbols cyclically
      const symbol = winningSymbols[i % winningSymbols.length];
      
      // Calculate shooting direction (burst pattern)
      const angle = (i / symbolCount) * 2 * Math.PI + (Math.random() - 0.5) * 0.5; // Add some randomness
      
      // Make jackpot symbols shoot much further and with more randomness
      const baseDistance = winLevel === 'jackpot' ? 500 : 300;
      const extraDistance = winLevel === 'jackpot' ? 600 : 400;
      const distance = baseDistance + Math.random() * extraDistance;
      
      // Calculate scale based on rarity
      const baseScale = {
        'legendary': 1.4,
        'rare': 1.2,
        'uncommon': 1.0,
        'common': 0.8
      }[symbol.rarity] || 1.0;
      
      const scale = baseScale * (0.8 + Math.random() * 0.4); // Add some variation
      
      const targetX = centerX + Math.cos(angle) * distance;
      const targetY = centerY + Math.sin(angle) * distance;
      
      newSymbols.push({
        id: symbolId++,
        symbol,
        x: centerX,
        y: centerY,
        targetX,
        targetY,
        delay: winLevel === 'jackpot' ? 
          i * 25 + Math.random() * 200 : // Faster, more random timing for jackpot
          i * 50 + Math.random() * 100, // Normal timing
        rotation: Math.random() * 360,
        scale
      });
      
    }

    shootingSymbols = newSymbols;

    // Remove symbols after animation (longer for jackpot)
    const cleanupTime = winLevel === 'jackpot' ? 5000 : 3000;
    activeTimeouts.push(setTimeout(() => {
      shootingSymbols = [];
    }, cleanupTime));
  }

  function createScreenShake() {
    if (celebrationContainer) {
      celebrationContainer.style.animation = `screen-shake 0.5s ease-in-out`;
      activeTimeouts.push(setTimeout(() => {
        if (celebrationContainer) {
          celebrationContainer.style.animation = '';
        }
      }, 500));
    }
  }

  function createScreenFlash() {
    const flash = document.createElement('div');
    flash.className = 'screen-flash';
    flash.style.cssText = `
      position: fixed;
      inset: 0;
      background: radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%);
      pointer-events: none;
      z-index: 9999;
      animation: flash-effect 0.6s ease-out;
    `;

    document.body.appendChild(flash);
    activeTimeouts.push(setTimeout(() => flash.remove(), 600));
  }

  function cleanup() {
    // Clear all active timeouts
    activeTimeouts.forEach(timeout => clearTimeout(timeout));
    activeTimeouts = [];
    
    // Reset all state
    showWinText = false;
    showWinAmount = false;
    showWinLines = false;
    particles = [];
    coins = [];
    shootingSymbols = [];
    winningPaylines = [];
  }

  onDestroy(cleanup);
</script>

<div 
  bind:this={celebrationContainer}
  class="win-celebration-container"
  class:visible={isVisible}
  class:level-small={winLevel === 'small'}
  class:level-medium={winLevel === 'medium'}
  class:level-large={winLevel === 'large'}
  class:level-jackpot={winLevel === 'jackpot'}
  aria-live="polite"
  aria-label={isVisible ? `${winConfig.title} You won ${normalizedWinAmount.toLocaleString()} VOI! ${multiplierText}` : ''}
>
  {#if isVisible}
    <!-- Win line highlighting (WebGL) -->
    <WinLineRenderer 
      isVisible={showWinLines}
      {winningPaylines}
      containerElement={celebrationContainer}
    />
    
    <!-- Win text display -->
    {#if showWinText}
      <div 
        class="win-text"
        class:win-text-small={winLevel === 'small'}
        class:win-text-medium={winLevel === 'medium'}
        class:win-text-large={winLevel === 'large'}
        class:win-text-jackpot={winLevel === 'jackpot'}
        in:scale={{ duration: 800, easing: elasticOut }}
        out:fade={{ duration: 300 }}
      >
        <h2 class="win-title">{winConfig.title}</h2>
        {#if showWinAmount}
          <div 
            class="win-amount"
            in:fly={{ y: 50, duration: 600, delay: 200, easing: bounceOut }}
            out:fade={{ duration: 200 }}
          >
            +{normalizedWinAmount.toLocaleString()} VOI
            {#if multiplierText}
              <div class="multiplier-text">{multiplierText}</div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Particle effects -->
    {#if preferences.particlesEnabled && !reduceMotion}
      <div class="particles-container" aria-hidden="true">
        {#each particles as particle (particle.id)}
          <div
            class="particle"
            style="
              left: {particle.x}px; 
              top: {particle.y}px; 
              background-color: {particle.color};
              width: {particle.size}px;
              height: {particle.size}px;
            "
            in:scale={{ duration: 200 }}
            out:fade={{ duration: 1500 }}
          ></div>
        {/each}
      </div>
    {/if}

    <!-- Coin rain -->
    {#if !reduceMotion}
      <div class="coins-container" aria-hidden="true">
        {#each coins as coin (coin.id)}
          <div
            class="coin"
            class:coin-small={winLevel === 'small'}
            class:coin-medium={winLevel === 'medium'}
            class:coin-large={winLevel === 'large'}
            class:coin-jackpot={winLevel === 'jackpot'}
            style="left: {coin.x}px; top: {coin.y}px;"
            in:fly={{ 
              y: celebrationContainer?.offsetHeight + 100 || 600, 
              duration: 2000 + Math.random() * 1000,
              delay: coin.delay,
              easing: cubicOut
            }}
            out:fade={{ duration: 200 }}
          >
            💰
          </div>
        {/each}
      </div>
    {/if}

    <!-- Shooting symbols -->
    {#if !reduceMotion && winningSymbols.length > 0}
      <div class="shooting-symbols-container" aria-hidden="true">
        {#each shootingSymbols as shootingSymbol (shootingSymbol.id)}
          <div
            class="shooting-symbol"
            class:jackpot-symbol={winLevel === 'jackpot'}
            class:symbol-legendary={shootingSymbol.symbol.rarity === 'legendary'}
            class:symbol-rare={shootingSymbol.symbol.rarity === 'rare'}
            class:symbol-uncommon={shootingSymbol.symbol.rarity === 'uncommon'}
            class:symbol-common={shootingSymbol.symbol.rarity === 'common'}
            style="
              left: {shootingSymbol.x}px; 
              top: {shootingSymbol.y}px;
              --initial-scale: {shootingSymbol.scale};
              --initial-rotation: {shootingSymbol.rotation}deg;
              --target-x: {shootingSymbol.targetX - shootingSymbol.x}px;
              --target-y: {shootingSymbol.targetY - shootingSymbol.y}px;
              animation-delay: {shootingSymbol.delay}ms;
            "
            in:scale={{ duration: 200, delay: shootingSymbol.delay }}
            out:fade={{ duration: 300 }}
          >
            <img 
              src={shootingSymbol.symbol.image} 
              alt={shootingSymbol.symbol.displayName}
              class="symbol-image"
            />
            <!-- Glow effect for premium symbols -->
            {#if shootingSymbol.symbol.rarity === 'legendary' || shootingSymbol.symbol.rarity === 'rare'}
              <div class="symbol-glow" style="background-color: {shootingSymbol.symbol.glowColor};"></div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- Win level specific effects -->
    {#if winLevel === 'jackpot'}
      <div 
        class="jackpot-burst" 
        aria-hidden="true"
        in:scale={{ duration: 1000, easing: elasticOut }}
        out:fade={{ duration: 500 }}
      ></div>
    {/if}

    <!-- Background overlay -->
    <div 
      class="celebration-background"
      class:celebration-background-small={winLevel === 'small'}
      class:celebration-background-medium={winLevel === 'medium'}
      class:celebration-background-large={winLevel === 'large'}
      class:celebration-background-jackpot={winLevel === 'jackpot'}
      in:fade={{ duration: 400 }}
      out:fade={{ duration: 600 }}
    ></div>
  {/if}
</div>

<style>
  .win-celebration-container {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 1000;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .celebration-background {
    position: absolute;
    inset: 0;
    opacity: 0.1;
  }

  .celebration-background.celebration-background-small {
    background: radial-gradient(circle, #10b981 0%, transparent 60%);
  }

  .celebration-background.celebration-background-medium {
    background: radial-gradient(circle, #3b82f6 0%, transparent 70%);
  }

  .celebration-background.celebration-background-large {
    background: radial-gradient(circle, #8b5cf6 0%, transparent 80%);
  }

  .celebration-background.celebration-background-jackpot {
    background: radial-gradient(circle, #f59e0b 0%, #ef4444 30%, transparent 90%);
    animation: jackpot-background 2s ease-in-out infinite;
  }

  .win-text {
    text-align: center;
    color: white;
    text-shadow: 0 4px 12px rgba(0, 0, 0, 0.8);
    z-index: 10;
    position: relative;
  }

  .win-title {
    font-size: 3rem;
    font-weight: bold;
    margin: 0 0 1rem 0;
    line-height: 1;
  }

  .win-text.win-text-medium .win-title {
    font-size: 3.5rem;
  }

  .win-text.win-text-large .win-title {
    font-size: 4rem;
  }

  .win-text.win-text-jackpot .win-title {
    font-size: 5rem;
    background: linear-gradient(45deg, #f59e0b, #ef4444, #8b5cf6);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: jackpot-text 1s ease-in-out infinite;
  }

  .win-amount {
    font-size: 2rem;
    font-weight: bold;
    color: #fbbf24;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  }

  .multiplier-text {
    font-size: 1.5rem;
    font-weight: bold;
    color: #10b981;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
    margin-top: 0.5rem;
  }

  .particles-container {
    position: absolute;
    inset: 0;
    z-index: 5;
  }

  .particle {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    animation: particle-float 2s ease-out forwards;
  }

  .coins-container {
    position: absolute;
    inset: 0;
    z-index: 8;
  }

  .coin {
    position: absolute;
    font-size: 2rem;
    pointer-events: none;
    animation: coin-spin 1s linear infinite;
  }

  .coin.coin-large,
  .coin.coin-jackpot {
    font-size: 2.5rem;
  }

  .shooting-symbols-container {
    position: absolute;
    inset: 0;
    z-index: 9;
  }

  .shooting-symbol {
    position: absolute;
    pointer-events: none;
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
    animation: symbol-shoot 2s ease-out forwards;
  }

  .shooting-symbol.jackpot-symbol {
    animation: symbol-shoot-jackpot 3s ease-out forwards;
  }

  .symbol-image {
    width: 64px;
    height: 64px;
    object-fit: contain;
    filter: brightness(1.1) contrast(1.1);
  }

  .shooting-symbol.symbol-legendary .symbol-image {
    width: 80px;
    height: 80px;
    animation: symbol-legendary-pulse 0.8s ease-in-out infinite alternate;
  }

  .shooting-symbol.symbol-rare .symbol-image {
    width: 72px;
    height: 72px;
    animation: symbol-rare-glow 1s ease-in-out infinite alternate;
  }

  .shooting-symbol.symbol-uncommon .symbol-image {
    width: 64px;
    height: 64px;
    animation: symbol-uncommon-shine 1.2s ease-in-out infinite alternate;
  }

  .shooting-symbol.symbol-common .symbol-image {
    width: 56px;
    height: 56px;
  }

  .symbol-glow {
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    opacity: 0.4;
    filter: blur(8px);
    z-index: -1;
    animation: glow-pulse 1s ease-in-out infinite alternate;
  }

  .jackpot-burst {
    position: absolute;
    inset: -20%;
    background: conic-gradient(from 0deg, 
      #f59e0b, #ef4444, #8b5cf6, #3b82f6, 
      #10b981, #f59e0b);
    opacity: 0.3;
    border-radius: 50%;
    animation: jackpot-burst-rotate 3s linear infinite;
    z-index: 1;
  }

  /* Animation keyframes */
  @keyframes particle-float {
    0% {
      transform: scale(1) translateY(0);
      opacity: 1;
    }
    50% {
      transform: scale(1.2) translateY(-20px);
      opacity: 0.8;
    }
    100% {
      transform: scale(0.8) translateY(-40px);
      opacity: 0;
    }
  }

  @keyframes coin-spin {
    0% { transform: rotateY(0deg); }
    100% { transform: rotateY(360deg); }
  }

  @keyframes screen-shake {
    0%, 100% { transform: translateX(0); }
    10% { transform: translateX(-2px) translateY(1px); }
    20% { transform: translateX(2px) translateY(-1px); }
    30% { transform: translateX(-1px) translateY(2px); }
    40% { transform: translateX(1px) translateY(-2px); }
    50% { transform: translateX(-2px) translateY(1px); }
    60% { transform: translateX(2px) translateY(-1px); }
    70% { transform: translateX(-1px) translateY(2px); }
    80% { transform: translateX(1px) translateY(-2px); }
    90% { transform: translateX(-1px) translateY(1px); }
  }

  @keyframes flash-effect {
    0% { opacity: 0; }
    50% { opacity: 1; }
    100% { opacity: 0; }
  }

  @keyframes jackpot-background {
    0%, 100% { opacity: 0.1; transform: scale(1); }
    50% { opacity: 0.2; transform: scale(1.05); }
  }

  @keyframes jackpot-text {
    0%, 100% { 
      transform: scale(1) rotate(0deg);
      filter: hue-rotate(0deg);
    }
    50% { 
      transform: scale(1.05) rotate(1deg);
      filter: hue-rotate(30deg);
    }
  }

  @keyframes jackpot-burst-rotate {
    0% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(180deg) scale(1.1); }
    100% { transform: rotate(360deg) scale(1); }
  }

  @keyframes symbol-legendary-pulse {
    0% { 
      filter: brightness(1.1) contrast(1.1) drop-shadow(0 0 12px #3b82f6);
      transform: scale(1);
    }
    100% { 
      filter: brightness(1.4) contrast(1.3) drop-shadow(0 0 20px #60a5fa);
      transform: scale(1.1);
    }
  }

  @keyframes symbol-rare-glow {
    0% { 
      filter: brightness(1.1) contrast(1.1) drop-shadow(0 0 8px #f59e0b);
    }
    100% { 
      filter: brightness(1.3) contrast(1.2) drop-shadow(0 0 16px #fbbf24);
    }
  }

  @keyframes symbol-uncommon-shine {
    0% { 
      filter: brightness(1.1) contrast(1.1) drop-shadow(0 0 4px #6b7280);
    }
    100% { 
      filter: brightness(1.2) contrast(1.15) drop-shadow(0 0 8px #9ca3af);
    }
  }

  @keyframes glow-pulse {
    0% { 
      opacity: 0.3;
      transform: scale(1);
    }
    100% { 
      opacity: 0.6;
      transform: scale(1.2);
    }
  }

  @keyframes symbol-shoot {
    0% {
      transform: scale(0.3) rotate(0deg);
      opacity: 0;
    }
    15% {
      transform: scale(1) rotate(180deg);
      opacity: 1;
    }
    100% {
      transform: translateX(var(--target-x, 300px)) translateY(var(--target-y, 300px)) scale(0.8) rotate(720deg);
      opacity: 0;
    }
  }

  @keyframes symbol-shoot-jackpot {
    0% {
      transform: scale(0.2) rotate(0deg);
      opacity: 0;
      filter: brightness(1) drop-shadow(0 0 0px #f59e0b);
    }
    8% {
      transform: scale(0.6) rotate(90deg);
      opacity: 0.8;
      filter: brightness(1.5) drop-shadow(0 0 15px #f59e0b);
    }
    15% {
      transform: scale(1.3) rotate(270deg);
      opacity: 1;
      filter: brightness(2) drop-shadow(0 0 25px #f59e0b);
    }
    25% {
      transform: scale(1.1) rotate(450deg);
      opacity: 1;
      filter: brightness(1.8) drop-shadow(0 0 20px #fbbf24);
    }
    85% {
      transform: translateX(var(--target-x, 400px)) translateY(var(--target-y, 400px)) scale(1) rotate(1080deg);
      opacity: 0.8;
      filter: brightness(1.3) drop-shadow(0 0 15px #f59e0b);
    }
    100% {
      transform: translateX(var(--target-x, 400px)) translateY(var(--target-y, 400px)) scale(0.6) rotate(1260deg);
      opacity: 0;
      filter: brightness(1) drop-shadow(0 0 5px #f59e0b);
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .win-celebration-container *,
    .particle,
    .coin,
    .jackpot-burst,
    .shooting-symbol,
    .symbol-image,
    .symbol-glow {
      animation: none !important;
    }

    .win-text.win-text-jackpot .win-title {
      background: #f59e0b;
      background-clip: unset;
      -webkit-background-clip: unset;
      -webkit-text-fill-color: unset;
      color: #f59e0b;
    }

    .celebration-background {
      opacity: 0.05;
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .win-title {
      color: white;
      text-shadow: 2px 2px 0 black, -2px -2px 0 black, 2px -2px 0 black, -2px 2px 0 black;
    }

    .win-amount {
      color: yellow;
      text-shadow: 2px 2px 0 black, -2px -2px 0 black, 2px -2px 0 black, -2px 2px 0 black;
    }

    .celebration-background {
      display: none;
    }
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .win-title {
      font-size: 2rem;
    }

    .win-text.win-text-medium .win-title {
      font-size: 2.5rem;
    }

    .win-text.win-text-large .win-title {
      font-size: 3rem;
    }

    .win-text.win-text-jackpot .win-title {
      font-size: 3.5rem;
    }

    .win-amount {
      font-size: 1.5rem;
    }

    .multiplier-text {
      font-size: 1.2rem;
    }

    .coin {
      font-size: 1.5rem;
    }

    .coin.coin-large,
    .coin.coin-jackpot {
      font-size: 2rem;
    }
  }

  @media (max-width: 480px) {
    .win-title {
      font-size: 1.5rem;
    }

    .win-text.win-text-medium .win-title {
      font-size: 2rem;
    }

    .win-text.win-text-large .win-title {
      font-size: 2.5rem;
    }

    .win-text.win-text-jackpot .win-title {
      font-size: 3rem;
    }

    .win-amount {
      font-size: 1.2rem;
    }

    .multiplier-text {
      font-size: 1rem;
    }

    .coin {
      font-size: 1.2rem;
    }

    .coin.large,
    .coin.jackpot {
      font-size: 1.5rem;
    }

    /* Reduce particle count on small screens */
    .particles-container {
      display: none;
    }

    /* Reduce symbol sizes on mobile */
    .symbol-image {
      width: 48px;
      height: 48px;
    }

    .shooting-symbol.symbol-legendary .symbol-image {
      width: 60px;
      height: 60px;
    }

    .shooting-symbol.symbol-rare .symbol-image {
      width: 54px;
      height: 54px;
    }

    .shooting-symbol.symbol-uncommon .symbol-image {
      width: 48px;
      height: 48px;
    }

    .shooting-symbol.symbol-common .symbol-image {
      width: 42px;
      height: 42px;
    }
  }
</style>
