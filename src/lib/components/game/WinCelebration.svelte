<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { scale, fly, fade } from 'svelte/transition';
  import { elasticOut, bounceOut, cubicOut } from 'svelte/easing';
  import type { CelebrationEffect, WinAnimation } from '$lib/types/animations';
  import { 
    animationPreferences, 
    shouldReduceAnimations, 
    winAnimations 
  } from '$lib/stores/animations';
  import { triggerWinCelebration } from '$lib/utils/animations';

  export let isVisible = false;
  export let winAmount = 0;
  export let betAmount = 0;
  export let winLevel: 'small' | 'medium' | 'large' | 'jackpot' = 'small';
  export let duration = 3000;

  let celebrationContainer: HTMLElement;
  let particles: Array<{ id: number; x: number; y: number; color: string; size: number }> = [];
  let coins: Array<{ id: number; x: number; y: number; delay: number }> = [];
  let showWinText = false;
  let showWinAmount = false;
  let particleId = 0;
  let coinId = 0;

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
        colors: ['#10b981', '#059669', '#047857'],
        baseTitle: 'Nice Win!',
        intensity: 'low' as const
      },
      medium: {
        particleCount: reduceMotion ? 8 : 40,
        coinCount: reduceMotion ? 4 : 15,
        colors: ['#3b82f6', '#1d4ed8', '#1e40af'],
        baseTitle: 'Great Win!',
        intensity: 'medium' as const
      },
      large: {
        particleCount: reduceMotion ? 12 : 80,
        coinCount: reduceMotion ? 6 : 25,
        colors: ['#8b5cf6', '#7c3aed', '#6d28d9'],
        baseTitle: 'Big Win!',
        intensity: 'high' as const
      },
      jackpot: {
        particleCount: reduceMotion ? 15 : 150,
        coinCount: reduceMotion ? 8 : 40,
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
    startCelebration();
  } else {
    cleanup();
  }

  function startCelebration() {
    if (!celebrationContainer) return;

    // Show win text with delay
    setTimeout(() => {
      showWinText = true;
    }, 200);

    setTimeout(() => {
      showWinAmount = true;
    }, 600);

    // Start particle effects
    if (preferences.particlesEnabled && !reduceMotion) {
      createParticleExplosion();
    }

    // Start coin rain
    if (!reduceMotion) {
      createCoinRain();
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
    setTimeout(() => {
      particles = [];
    }, 2000);
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
    setTimeout(() => {
      coins = [];
    }, 3000);
  }

  function createScreenShake() {
    if (celebrationContainer) {
      celebrationContainer.style.animation = `screen-shake 0.5s ease-in-out`;
      setTimeout(() => {
        if (celebrationContainer) {
          celebrationContainer.style.animation = '';
        }
      }, 500);
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
    setTimeout(() => flash.remove(), 600);
  }

  function cleanup() {
    showWinText = false;
    showWinAmount = false;
    particles = [];
    coins = [];
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

  .win-celebration-container.visible {
    pointer-events: auto;
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

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .win-celebration-container *,
    .particle,
    .coin,
    .jackpot-burst {
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
  }
</style>