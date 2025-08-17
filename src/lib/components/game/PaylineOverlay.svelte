<script lang="ts">
  import { gameStore } from '$lib/stores/game';
  import { onMount } from 'svelte';
  
  export let showPaylines = false;
  export let activePaylines: number[] = [];
  
  // Standard 20 paylines for 5x3 grid
  const PAYLINES = [
    [1, 1, 1, 1, 1], // Middle line
    [0, 0, 0, 0, 0], // Top line
    [2, 2, 2, 2, 2], // Bottom line
    [0, 1, 2, 1, 0], // V shape
    [2, 1, 0, 1, 2], // Inverted V
    [0, 0, 1, 0, 0], // Top-center peak
    [2, 2, 1, 2, 2], // Bottom-center valley
    [1, 0, 1, 2, 1], // M shape
    [1, 2, 1, 0, 1], // W shape
    [0, 1, 1, 1, 2], // Ascending
    [2, 1, 1, 1, 0], // Descending
    [0, 1, 2, 2, 2], // Step up
    [2, 1, 0, 0, 0], // Step down
    [1, 1, 0, 1, 1], // Dip up
    [1, 1, 2, 1, 1], // Dip down
    [0, 2, 0, 2, 0], // Zigzag up
    [2, 0, 2, 0, 2], // Zigzag down
    [1, 2, 2, 2, 1], // Bottom arc
    [1, 0, 0, 0, 1], // Top arc
    [0, 1, 0, 1, 2]  // Custom pattern
  ];
  
  $: visiblePaylines = showPaylines ? PAYLINES.slice(0, Math.max(...activePaylines) + 1) : [];
  
  function getPaylineColor(index: number): string {
    const colors = [
      '#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6',
      '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1',
      '#14b8a6', '#eab308', '#dc2626', '#9333ea', '#0ea5e9',
      '#65a30d', '#ea580c', '#db2777', '#7c3aed', '#0891b2'
    ];
    return colors[index % colors.length];
  }
  
  function getPaylinePath(payline: number[], index: number): string {
    const cellWidth = 100 / 5; // 20% per reel
    const cellHeight = 100 / 3; // 33.33% per row
    
    let path = '';
    
    payline.forEach((row, reel) => {
      const x = (reel * cellWidth) + (cellWidth / 2);
      const y = (row * cellHeight) + (cellHeight / 2);
      
      if (reel === 0) {
        path += `M ${x} ${y}`;
      } else {
        path += ` L ${x} ${y}`;
      }
    });
    
    return path;
  }
</script>

{#if showPaylines}
  <div class="payline-overlay">
    <svg class="payline-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      {#each visiblePaylines as payline, index}
        {#if activePaylines.includes(index)}
          <path
            d={getPaylinePath(payline, index)}
            stroke={getPaylineColor(index)}
            stroke-width="0.8"
            fill="none"
            opacity="0.8"
            class="payline-path active"
          />
          <!-- Payline number -->
          <text
            x="2"
            y={5 + (index * 3)}
            fill={getPaylineColor(index)}
            font-size="2.5"
            font-weight="bold"
            class="payline-number"
          >
            {index + 1}
          </text>
        {/if}
      {/each}
    </svg>
  </div>
{/if}

<style>
  .payline-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 5;
  }
  
  .payline-svg {
    width: 100%;
    height: 100%;
  }
  
  .payline-path {
    filter: drop-shadow(0 0 2px currentColor);
    animation: payline-glow 2s ease-in-out infinite alternate;
  }
  
  .payline-path.active {
    stroke-dasharray: 2 1;
    animation: payline-dash 1s linear infinite, payline-glow 2s ease-in-out infinite alternate;
  }
  
  .payline-number {
    text-shadow: 0 0 2px currentColor;
  }
  
  @keyframes payline-dash {
    to {
      stroke-dashoffset: -3;
    }
  }
  
  @keyframes payline-glow {
    from { opacity: 0.6; }
    to { opacity: 1; }
  }
</style>