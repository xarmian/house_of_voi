<script lang="ts">
  import { fly, scale } from 'svelte/transition';
  import { toastStore } from '$lib/stores/toast';
  import { feedPreferences } from '$lib/stores/preferences';
  import { Trophy, ExternalLink, X, TrendingUp, Coins } from 'lucide-svelte';
  import { formatVOI } from '$lib/constants/betting';
  
  export let toast: any; // Will be properly typed when we extend the toast system

  const { winData } = toast;
  
  // Defensive check for winData
  if (!winData) {
    console.error('WinToast: winData is undefined', toast);
  }
  
  const dismiss = () => {
    toastStore.dismiss(toast.id);
  };
  
  const handleAction = () => {
    if (toast.action) {
      toast.action.handler();
    }
  };

  // Get animation style from preferences
  $: animationStyle = $feedPreferences.animationStyle;

  // Calculate color based on multiplier
  $: getMultiplierColor = (multiplier: number) => {
    if (multiplier >= 100) return 'text-pink-400';      // 100x+ - Ultra rare
    if (multiplier >= 50) return 'text-purple-400';     // 50x+ - Legendary  
    if (multiplier >= 20) return 'text-yellow-400';     // 20x+ - Epic
    if (multiplier >= 10) return 'text-orange-400';     // 10x+ - Rare
    if (multiplier >= 5) return 'text-blue-400';        // 5x+ - Uncommon
    return 'text-green-400';                             // < 5x - Common
  };

  $: getMultiplierBg = (multiplier: number) => {
    if (multiplier >= 100) return 'from-pink-500/20 to-purple-500/20 border-pink-500/30';
    if (multiplier >= 50) return 'from-purple-500/20 to-indigo-500/20 border-purple-500/30';
    if (multiplier >= 20) return 'from-yellow-500/20 to-orange-500/20 border-yellow-500/30';
    if (multiplier >= 10) return 'from-orange-500/20 to-red-500/20 border-orange-500/30';
    if (multiplier >= 5) return 'from-blue-500/20 to-cyan-500/20 border-blue-500/30';
    return 'from-green-500/20 to-emerald-500/20 border-green-500/30';
  };

  $: getRarityLabel = (multiplier: number) => {
    if (multiplier >= 100) return 'ULTRA RARE';
    if (multiplier >= 50) return 'LEGENDARY';
    if (multiplier >= 20) return 'EPIC WIN';
    if (multiplier >= 10) return 'RARE WIN';
    if (multiplier >= 5) return 'BIG WIN';
    return 'WIN';
  };

  // Animation variants
  $: transitionProps = (() => {
    switch (animationStyle) {
      case 'bounce':
        return { y: -100, duration: 500 };
      case 'fade':
        return { opacity: 0, duration: 400 };
      case 'slide':
      default:
        return { x: 400, duration: 400 };
    }
  })();
</script>

{#if winData && winData.multiplier !== undefined}
<div
  class="win-toast relative overflow-hidden backdrop-blur-sm max-w-sm w-full bg-gradient-to-r {getMultiplierBg(winData.multiplier)}"
  in:fly={transitionProps}
  out:scale={{ duration: 300, start: 0.9 }}
>
  <!-- Background glow effect for high multipliers -->
  {#if winData.multiplier >= 20}
    <div class="absolute inset-0 animate-pulse bg-gradient-to-r opacity-30 {getMultiplierBg(winData.multiplier)}"></div>
  {/if}
  
  <!-- Content -->
  <div class="relative flex items-start gap-3 p-4">
    <!-- Icon with animation for big wins -->
    <div class="flex-shrink-0 {getMultiplierColor(winData.multiplier)}">
      {#if winData.multiplier >= 50}
        <div class="animate-bounce">
          <Trophy class="w-6 h-6" />
        </div>
      {:else if winData.multiplier >= 10}
        <div class="animate-pulse">
          <Trophy class="w-6 h-6" />
        </div>
      {:else}
        <Coins class="w-6 h-6" />
      {/if}
    </div>
    
    <!-- Main content -->
    <div class="flex-1 min-w-0">
      <!-- Rarity label for big wins -->
      {#if winData.multiplier >= 5}
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-bold tracking-wider {getMultiplierColor(winData.multiplier)} opacity-80">
            {getRarityLabel(winData.multiplier)}
          </span>
          {#if winData.multiplier >= 10}
            <div class="flex">
              {#each Array(Math.min(Math.floor(winData.multiplier / 10), 5)) as _}
                <span class="text-yellow-400 animate-pulse">⭐</span>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- Winner and payout -->
      <div class="mb-2">
        <p class="text-sm font-bold text-white leading-tight">
          {toast.title}
        </p>
        <p class="text-xs text-slate-300 mt-1">
          {toast.message}
        </p>
      </div>

      <!-- Stats row -->
      <div class="flex items-center justify-between text-xs text-slate-400 mb-3">
        <div class="flex items-center gap-1">
          <TrendingUp class="w-3 h-3" />
          <span class="font-semibold {getMultiplierColor(winData.multiplier)}">
            {winData.multiplier.toFixed(1)}x
          </span>
        </div>
        <div class="text-slate-400">
          {new Date(winData.timestamp).toLocaleTimeString()}
        </div>
      </div>
      
      <!-- Action button -->
      {#if toast.action}
        <button
          on:click={handleAction}
          class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium 
                 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30
                 rounded-md transition-all duration-200 text-white"
        >
          <ExternalLink class="w-3 h-3" />
          {toast.action.label}
        </button>
      {/if}
    </div>
    
    <!-- Dismiss button -->
    {#if toast.dismissible}
      <button
        on:click={dismiss}
        class="flex-shrink-0 text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
        aria-label="Dismiss"
      >
        <X class="w-4 h-4" />
      </button>
    {/if}
  </div>

  <!-- Progress bar for auto-dismiss -->
  {#if toast.duration > 0}
    <div class="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
      <div 
        class="h-full bg-gradient-to-r {getMultiplierColor(winData.multiplier).replace('text-', 'from-')} to-transparent
               animate-progress"
        style="animation-duration: {toast.duration}ms"
      ></div>
    </div>
  {/if}
</div>
{:else}
  <!-- Fallback for invalid winData -->
  <div class="win-toast relative overflow-hidden backdrop-blur-sm max-w-sm w-full bg-red-500/20 border border-red-500/30 p-4 rounded-lg">
    <div class="text-red-400 text-sm">
      Error: Invalid win data
    </div>
  </div>
{/if}

<style>
  .win-toast {
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 
      0 10px 25px rgba(0, 0, 0, 0.3),
      0 0 50px rgba(255, 255, 255, 0.1) inset;
  }

  @keyframes progress {
    from { width: 100%; }
    to { width: 0%; }
  }

  .animate-progress {
    animation: progress linear forwards;
  }

  /* Special effects for legendary wins */
  .win-toast:has(.text-purple-400) {
    box-shadow: 
      0 10px 25px rgba(0, 0, 0, 0.3),
      0 0 50px rgba(168, 85, 247, 0.3) inset,
      0 0 100px rgba(168, 85, 247, 0.2);
  }

  .win-toast:has(.text-pink-400) {
    box-shadow: 
      0 10px 25px rgba(0, 0, 0, 0.3),
      0 0 50px rgba(236, 72, 153, 0.3) inset,
      0 0 100px rgba(236, 72, 153, 0.2);
    animation: ultra-glow 2s ease-in-out infinite alternate;
  }

  @keyframes ultra-glow {
    from { box-shadow: 
      0 10px 25px rgba(0, 0, 0, 0.3),
      0 0 50px rgba(236, 72, 153, 0.3) inset,
      0 0 100px rgba(236, 72, 153, 0.2);
    }
    to { box-shadow: 
      0 10px 25px rgba(0, 0, 0, 0.3),
      0 0 50px rgba(236, 72, 153, 0.5) inset,
      0 0 100px rgba(236, 72, 153, 0.4);
    }
  }

  /* Responsive adjustments */
  @media (max-width: 480px) {
    .win-toast {
      max-width: calc(100vw - 2rem);
    }
  }
</style>