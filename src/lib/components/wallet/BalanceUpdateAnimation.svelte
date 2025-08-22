<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { onMount, onDestroy } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  
  export let startBalance: number = 0;
  export let endBalance: number = 0;
  export let duration: number = 2000; // Animation duration in ms
  export let isWinnings: boolean = false; // true for game winnings, false for refunds
  export let formatAsCurrency: boolean = true;
  
  const dispatch = createEventDispatcher();
  
  // Tweened store for smooth animation
  const balance = tweened(startBalance, {
    duration,
    easing: cubicOut
  });
  
  let animationActive = false;
  let balanceDelta = 0;
  let showFloatingText = false;
  let floatingTextY = 0;
  
  // Format balance for display
  $: formattedBalance = formatAsCurrency 
    ? ($balance / 1_000_000).toFixed(6) + ' VOI'
    : $balance.toFixed(0);
  
  // Calculate delta
  $: balanceDelta = endBalance - startBalance;
  
  // Format delta for floating text
  $: formattedDelta = formatAsCurrency
    ? `+${(balanceDelta / 1_000_000).toFixed(6)} VOI`
    : `+${balanceDelta}`;
  
  // Start animation when component mounts or balance changes
  export async function animate(newEndBalance?: number) {
    if (newEndBalance !== undefined) {
      endBalance = newEndBalance;
    }
    
    // Update delta
    balanceDelta = endBalance - $balance;
    
    if (balanceDelta <= 0) return;
    
    animationActive = true;
    showFloatingText = true;
    floatingTextY = 0;
    
    // Dispatch animation start event
    dispatch('animationStart', { startBalance: $balance, endBalance, delta: balanceDelta });
    
    // Start the balance counter animation
    await balance.set(endBalance);
    
    // Keep floating text visible for a bit after counter finishes
    setTimeout(() => {
      showFloatingText = false;
      animationActive = false;
      dispatch('animationEnd', { finalBalance: endBalance });
    }, 500);
  }
  
  // Auto-start animation on mount if there's a difference
  onMount(() => {
    if (endBalance > startBalance) {
      animate();
    }
  });
  
  // Cleanup
  onDestroy(() => {
    animationActive = false;
    showFloatingText = false;
  });
</script>

<div class="balance-container">
  <div class="balance-value" class:animating={animationActive} class:win-animation={isWinnings && animationActive}>
    {formattedBalance}
  </div>
  
  {#if showFloatingText && balanceDelta > 0}
    <div 
      class="floating-delta {isWinnings ? 'win-delta' : 'refund-delta'}"
      style="transform: translateY(-{floatingTextY}px)"
    >
      {formattedDelta}
    </div>
  {/if}
</div>

<style>
  .balance-container {
    position: relative;
    display: inline-block;
  }
  
  .balance-value {
    font-variant-numeric: tabular-nums;
    transition: color 0.3s ease, text-shadow 0.3s ease;
  }
  
  .balance-value.animating {
    color: #4ADE80;
    text-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
  }
  
  .balance-value.win-animation {
    color: #FDE047;
    text-shadow: 0 0 20px rgba(253, 224, 71, 0.8);
    animation: pulse 0.5s ease-in-out 3;
  }
  
  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }
  
  .floating-delta {
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    font-weight: bold;
    font-size: 0.9em;
    white-space: nowrap;
    pointer-events: none;
    animation: float-up 2.5s ease-out forwards;
    opacity: 0;
  }
  
  .win-delta {
    color: #FDE047;
    text-shadow: 0 0 10px rgba(253, 224, 71, 0.8);
  }
  
  .refund-delta {
    color: #4ADE80;
    text-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
  }
  
  @keyframes float-up {
    0% {
      opacity: 0;
      transform: translateX(-50%) translateY(0);
    }
    20% {
      opacity: 1;
    }
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-40px);
    }
  }
</style>