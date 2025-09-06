<script lang="ts">
  import { contractDataCache } from '$lib/services/contractDataCache';
  import { walletAddress } from '$lib/stores/wallet';
  
  export let showPaylines = false;
  export let activePaylines: number[] = [];
  
  let paylines: number[][] = [];
  let loading = true;
  let error: string | null = null;
  
  
  async function loadPaylines() {
    if (!$walletAddress) {
      error = 'Wallet not connected - Machine out of order';
      loading = false;
      return;
    }

    try {
      loading = true;
      error = null;
      paylines = await contractDataCache.getPaylines($walletAddress);
    } catch (err) {
      console.error('Error loading paylines:', err);
      error = 'Failed to load paylines from contract - Machine out of order';
    } finally {
      loading = false;
    }
  }

  $: visiblePaylines = showPaylines && !loading && !error 
    ? paylines.slice(0, Math.max(...activePaylines) + 1) 
    : [];

  // Load paylines when wallet connects or component mounts
  $: if ($walletAddress) {
    loadPaylines();
  }
  
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
    {#if error}
      <div class="error-overlay">
        <div class="error-message">
          {error}
        </div>
      </div>
    {:else if loading}
      <div class="loading-overlay">
        <div class="loading-spinner"></div>
      </div>
    {:else}
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
    {/if}
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

  .error-overlay, .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.8);
    border-radius: 8px;
    z-index: 10;
  }

  .error-message {
    color: #ef4444;
    font-size: 14px;
    font-weight: bold;
    text-align: center;
    padding: 8px;
  }

  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid #374151;
    border-top: 2px solid #10b981;
    border-radius: 50%;
    animation: spin 1s linear infinite;
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

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>