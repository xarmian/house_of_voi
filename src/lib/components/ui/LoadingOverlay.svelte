<script lang="ts">
  import { fade, scale, fly } from 'svelte/transition';
  import { elasticOut } from 'svelte/easing';
  import type { LoadingState } from '$lib/types/animations';
  import { shouldReduceAnimations } from '$lib/stores/animations';

  export let isVisible = false;
  export let loadingState: LoadingState;
  export let showProgress = false;

  $: reduceMotion = $shouldReduceAnimations;

  // Loading messages based on type
  $: loadingConfig = {
    spin: {
      title: 'Spinning...',
      subtitle: 'Processing your spin on the blockchain',
      icon: '🎰',
      color: 'text-amber-400'
    },
    transaction: {
      title: 'Processing Transaction',
      subtitle: 'Confirming on Voi blockchain',
      icon: '⛓️',
      color: 'text-blue-400'
    },
    connection: {
      title: 'Connecting...',
      subtitle: 'Establishing blockchain connection',
      icon: '🔗',
      color: 'text-green-400'
    },
    general: {
      title: 'Loading...',
      subtitle: 'Please wait',
      icon: '⏳',
      color: 'text-gray-400'
    }
  }[loadingState.type];

  // Progress calculation
  $: progressPercentage = Math.min(Math.max(loadingState.progress || 0, 0), 100);
</script>

{#if isVisible}
  <div 
    class="loading-overlay"
    in:fade={{ duration: reduceMotion ? 100 : 300 }}
    out:fade={{ duration: reduceMotion ? 100 : 400 }}
    role="dialog"
    aria-live="polite"
    aria-label={loadingConfig.title}
  >
    <!-- Background blur -->
    <div class="overlay-background"></div>
    
    <!-- Loading content -->
    <div 
      class="loading-content"
      in:scale={{ 
        duration: reduceMotion ? 200 : 600, 
        start: 0.8, 
        easing: elasticOut 
      }}
      out:scale={{ duration: 200, start: 1.1 }}
    >
      <!-- Loading icon -->
      <div 
        class="loading-icon {loadingConfig.color}"
        class:animate-bounce={!reduceMotion && loadingState.type === 'spin'}
        class:animate-pulse={!reduceMotion && loadingState.type !== 'spin'}
      >
        <span class="icon-emoji" aria-hidden="true">{loadingConfig.icon}</span>
      </div>
      
      <!-- Loading text -->
      <div class="loading-text">
        <h2 class="loading-title {loadingConfig.color}">
          {loadingConfig.title}
        </h2>
        <p class="loading-subtitle">
          {loadingState.message || loadingConfig.subtitle}
        </p>
      </div>
      
      <!-- Progress bar (if enabled) -->
      {#if showProgress && loadingState.progress !== undefined}
        <div 
          class="progress-container"
          in:fly={{ y: 20, duration: 300, delay: 200 }}
        >
          <div class="progress-bar">
            <div 
              class="progress-fill {loadingConfig.color.replace('text-', 'bg-')}"
              style="width: {progressPercentage}%"
              class:animate-pulse={progressPercentage < 100 && !reduceMotion}
            ></div>
          </div>
          <div class="progress-text">
            {Math.round(progressPercentage)}%
          </div>
        </div>
      {/if}
      
      <!-- Animated dots for ongoing operations -->
      {#if !showProgress || loadingState.progress === undefined}
        <div 
          class="loading-dots"
          in:fade={{ duration: 300, delay: 400 }}
        >
          <span class="dot" class:animate-bounce={!reduceMotion} style="animation-delay: 0ms"></span>
          <span class="dot" class:animate-bounce={!reduceMotion} style="animation-delay: 150ms"></span>
          <span class="dot" class:animate-bounce={!reduceMotion} style="animation-delay: 300ms"></span>
        </div>
      {/if}
      
      <!-- Blockchain-specific indicators -->
      {#if loadingState.type === 'transaction'}
        <div 
          class="blockchain-indicator"
          in:fade={{ duration: 300, delay: 600 }}
        >
          <div class="indicator-item">
            <div class="indicator-icon">📝</div>
            <span class="indicator-text">Transaction Submitted</span>
          </div>
          <div class="indicator-item" class:active={progressPercentage > 33}>
            <div class="indicator-icon">⏳</div>
            <span class="indicator-text">Awaiting Confirmation</span>
          </div>
          <div class="indicator-item" class:active={progressPercentage > 66}>
            <div class="indicator-icon">✅</div>
            <span class="indicator-text">Confirmed</span>
          </div>
        </div>
      {/if}
    </div>
    
    <!-- Background animation effects -->
    {#if !reduceMotion}
      <div class="background-effects" aria-hidden="true">
        <div class="effect-circle circle-1"></div>
        <div class="effect-circle circle-2"></div>
        <div class="effect-circle circle-3"></div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .loading-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .overlay-background {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.8);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .loading-content {
    position: relative;
    background: linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95));
    border: 1px solid rgba(51, 65, 85, 0.5);
    border-radius: 1rem;
    padding: 2rem;
    text-align: center;
    max-width: 400px;
    width: 100%;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .loading-icon {
    margin-bottom: 1.5rem;
  }

  .icon-emoji {
    font-size: 3rem;
    display: inline-block;
  }

  .loading-text {
    margin-bottom: 1.5rem;
  }

  .loading-title {
    font-size: 1.5rem;
    font-weight: bold;
    margin-bottom: 0.5rem;
    color: white;
  }

  .loading-subtitle {
    color: rgb(156, 163, 175);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .progress-container {
    margin-bottom: 1rem;
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: rgba(51, 65, 85, 0.5);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .progress-fill {
    height: 100%;
    transition: width 0.3s ease;
    border-radius: 4px;
    background: linear-gradient(90deg, currentColor, rgba(255, 255, 255, 0.3));
  }

  .progress-text {
    font-size: 0.75rem;
    color: rgb(156, 163, 175);
    font-weight: 500;
  }

  .loading-dots {
    display: flex;
    justify-content: center;
    gap: 0.25rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    background: rgb(156, 163, 175);
    border-radius: 50%;
    display: inline-block;
  }

  .blockchain-indicator {
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid rgba(51, 65, 85, 0.5);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .indicator-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    border-radius: 0.5rem;
    background: rgba(51, 65, 85, 0.2);
    transition: all 0.3s ease;
    opacity: 0.5;
  }

  .indicator-item.active {
    opacity: 1;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .indicator-icon {
    font-size: 1rem;
    width: 1.5rem;
    text-align: center;
  }

  .indicator-text {
    font-size: 0.75rem;
    color: rgb(156, 163, 175);
    font-weight: 500;
  }

  .indicator-item.active .indicator-text {
    color: rgb(16, 185, 129);
  }

  .background-effects {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    border-radius: 1rem;
  }

  .effect-circle {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(16, 185, 129, 0.1), transparent);
    animation: float 6s ease-in-out infinite;
  }

  .circle-1 {
    width: 100px;
    height: 100px;
    top: 10%;
    left: 10%;
    animation-delay: 0s;
  }

  .circle-2 {
    width: 60px;
    height: 60px;
    top: 60%;
    right: 20%;
    animation-delay: 2s;
  }

  .circle-3 {
    width: 80px;
    height: 80px;
    bottom: 20%;
    left: 20%;
    animation-delay: 4s;
  }

  /* Animation keyframes */
  @keyframes float {
    0%, 100% {
      transform: translateY(0) scale(1);
      opacity: 0.1;
    }
    50% {
      transform: translateY(-20px) scale(1.1);
      opacity: 0.2;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .loading-icon,
    .dot,
    .progress-fill,
    .effect-circle {
      animation: none !important;
    }

    .overlay-background {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      background: rgba(15, 23, 42, 0.9);
    }

    .loading-content {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }

    .background-effects {
      display: none;
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .loading-content {
      border: 2px solid white;
      background: black;
    }

    .loading-title {
      color: white;
    }

    .loading-subtitle,
    .progress-text,
    .indicator-text {
      color: white;
    }

    .progress-bar {
      background: white;
    }

    .indicator-item {
      border: 1px solid white;
      background: rgba(255, 255, 255, 0.1);
    }
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .loading-content {
      padding: 1.5rem;
      margin: 1rem;
    }

    .icon-emoji {
      font-size: 2.5rem;
    }

    .loading-title {
      font-size: 1.25rem;
    }

    .loading-subtitle {
      font-size: 0.8rem;
    }

    .blockchain-indicator {
      margin-top: 1rem;
      padding-top: 1rem;
    }

    .indicator-item {
      padding: 0.375rem;
      gap: 0.5rem;
    }

    .indicator-text {
      font-size: 0.7rem;
    }
  }

  @media (max-width: 480px) {
    .loading-content {
      padding: 1rem;
    }

    .icon-emoji {
      font-size: 2rem;
    }

    .loading-title {
      font-size: 1.125rem;
    }

    .blockchain-indicator {
      gap: 0.5rem;
    }

    .effect-circle {
      display: none; /* Hide background effects on small screens */
    }
  }
</style>