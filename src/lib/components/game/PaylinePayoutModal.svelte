<script lang="ts">
  import { onMount } from 'svelte';
  import { X, Eye, DollarSign, Target } from 'lucide-svelte';
  import { contractDataCache } from '$lib/services/contractDataCache';
  import { walletAddress } from '$lib/stores/wallet';
  import { WINNING_SYMBOLS } from '$lib/constants/symbols';
  
  export let showModal = false;

  let paylines: number[][] = [];
  let payoutMultipliers: Record<string, Record<number, number>> = {};
  let loading = true;
  let error: string | null = null;

  // Get symbol info from constants
  const symbolInfo = WINNING_SYMBOLS;

  async function loadPaylineData() {
    if (!$walletAddress) {
      error = 'Wallet not connected';
      return;
    }

    loading = true;
    error = null;

    try {
      // Load paylines from contract
      paylines = await contractDataCache.getPaylines($walletAddress);
      
      // Load payout multipliers for all symbols and counts
      const symbols = ['A', 'B', 'C', 'D'];
      const counts = [3, 4, 5];
      
      for (const symbol of symbols) {
        payoutMultipliers[symbol] = {};
        for (const count of counts) {
          payoutMultipliers[symbol][count] = await contractDataCache.getPayoutMultiplier(symbol, count, $walletAddress);
        }
      }
    } catch (err) {
      console.error('Error loading payline data:', err);
      error = 'Failed to load payline data from contract';
    } finally {
      loading = false;
    }
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

  function getPaylinePath(payline: number[]): string {
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

  function closeModal() {
    showModal = false;
  }

  onMount(() => {
    if (showModal && $walletAddress) {
      loadPaylineData();
    }
  });

  // Reactive loading when wallet address becomes available
  $: if (showModal && $walletAddress) {
    loadPaylineData();
  }
</script>

{#if showModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
    <div class="card max-w-6xl w-full max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <Target class="w-6 h-6 text-voi-400" />
            <h3 class="text-xl font-bold text-theme">Paylines & Payouts</h3>
          </div>
          <button
            on:click={closeModal}
            class="text-theme-text opacity-70 hover:opacity-100 text-2xl leading-none"
            title="Close"
          >
            <X class="w-6 h-6" />
          </button>
        </div>

        {#if loading}
          <div class="text-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-500 mx-auto"></div>
            <p class="text-slate-400 mt-2">Loading contract data...</p>
          </div>

        {:else if error}
          <div class="text-center py-8">
            <p class="text-red-400">{error}</p>
            <button on:click={loadPaylineData} class="btn-primary mt-3">
              Try Again
            </button>
          </div>

        {:else}
          <div class="space-y-8">
            <!-- Payout Table -->
            <div class="payout-section">
              <h4 class="section-title mb-4">
                <DollarSign class="w-5 h-5 inline" />
                Symbol Payouts
              </h4>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                {#each Object.entries(symbolInfo) as [symbol, info]}
                  <div class="payout-card">
                    <div class="flex items-center gap-3 mb-3">
                      <div class="symbol-icon" style="background-color: {info.color}20; border-color: {info.color}50;">
                        <img src={info.image} alt={info.displayName} class="w-8 h-8" />
                      </div>
                      <div>
                        <p class="text-theme font-medium">{info.displayName}</p>
                        <p class="text-xs text-gray-400">Symbol {symbol}</p>
                      </div>
                    </div>
                    
                    <div class="payout-values">
                      {#if payoutMultipliers[symbol]}
                        <div class="payout-row">
                          <span class="count">3 in a row:</span>
                          <span class="multiplier">{payoutMultipliers[symbol][3]}x</span>
                        </div>
                        <div class="payout-row">
                          <span class="count">4 in a row:</span>
                          <span class="multiplier">{payoutMultipliers[symbol][4]}x</span>
                        </div>
                        <div class="payout-row">
                          <span class="count">5 in a row:</span>
                          <span class="multiplier text-voi-400">{payoutMultipliers[symbol][5]}x</span>
                        </div>
                      {:else}
                        <div class="text-gray-400 text-sm">Loading...</div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Paylines Visualization -->
            <div class="paylines-section">
              <h4 class="section-title mb-4">
                <Eye class="w-5 h-5 inline" />
                Paylines ({paylines.length} total)
              </h4>
              
              <div class="paylines-grid">
                {#each paylines as payline, index}
                  <div class="payline-item">
                    <div class="payline-header">
                      <span class="payline-number">#{index + 1}</span>
                    </div>
                    
                    <div class="payline-visual">
                      <!-- Grid background -->
                      <div class="grid-background">
                        {#each Array(15) as _, i}
                          <div class="grid-cell"></div>
                        {/each}
                      </div>
                      
                      <!-- Payline path -->
                      <svg class="payline-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <path
                          d={getPaylinePath(payline)}
                          stroke={getPaylineColor(index)}
                          stroke-width="2"
                          fill="none"
                          opacity="0.9"
                        />
                        {#each payline as row, reel}
                          <circle
                            cx={(reel * 20) + 10}
                            cy={(row * 33.33) + 16.67}
                            r="3"
                            fill={getPaylineColor(index)}
                          />
                        {/each}
                      </svg>
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <!-- How to Play -->
            <div class="info-section">
              <h4 class="section-title mb-4">How Paylines Work</h4>
              <div class="info-grid">
                <div class="info-item">
                  <h5 class="info-title">Winning Combinations</h5>
                  <p class="info-text">Match 3, 4, or 5 identical symbols on any active payline.</p>
                </div>
                <div class="info-item">
                  <h5 class="info-title">Payline Selection</h5>
                  <p class="info-text">Choose how many paylines to activate (1-20). More paylines = more chances to win.</p>
                </div>
                <div class="info-item">
                  <h5 class="info-title">Payouts</h5>
                  <p class="info-text">Win amounts are calculated as: (Bet per line) × (Symbol multiplier) for each winning payline.</p>
                </div>
                <div class="info-item">
                  <h5 class="info-title">Contract Data</h5>
                  <p class="info-text">All paylines and payouts are retrieved directly from the blockchain contract.</p>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .section-title {
    @apply text-lg font-semibold text-theme flex items-center gap-2;
  }

  .payout-card {
    @apply bg-slate-700/50 rounded-lg p-4 border border-slate-600/50;
  }

  .symbol-icon {
    @apply w-12 h-12 rounded-lg flex items-center justify-center border;
  }

  .payout-values {
    @apply space-y-2;
  }

  .payout-row {
    @apply flex justify-between items-center text-sm;
  }

  .count {
    @apply text-gray-400;
  }

  .multiplier {
    @apply text-theme font-bold;
  }

  .paylines-grid {
    @apply grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4;
  }

  .payline-item {
    @apply bg-slate-800/50 rounded-lg p-3 border border-slate-600/30;
  }

  .payline-header {
    @apply text-center mb-2;
  }

  .payline-number {
    @apply text-sm font-bold text-voi-400;
  }

  .payline-visual {
    @apply relative w-full aspect-[5/3] bg-slate-900/50 rounded border border-slate-600/30;
  }

  .grid-background {
    @apply absolute inset-0 grid grid-cols-5 grid-rows-3 gap-px p-1;
  }

  .grid-cell {
    @apply bg-slate-700/30 rounded-sm;
  }

  .payline-svg {
    @apply absolute inset-0 w-full h-full;
  }

  .info-section {
    @apply border-t border-slate-700 pt-6;
  }

  .info-grid {
    @apply grid grid-cols-1 md:grid-cols-2 gap-4;
  }

  .info-item {
    @apply bg-slate-800/30 rounded-lg p-4;
  }

  .info-title {
    @apply text-sm font-medium text-voi-400 mb-2;
  }

  .info-text {
    @apply text-sm text-gray-300 leading-relaxed;
  }

  .btn-primary {
    @apply bg-voi-600 hover:bg-voi-700 text-theme font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2;
  }

  /* Animation for loading spinner */
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .paylines-grid {
      @apply grid-cols-2;
    }
    
    .info-grid {
      @apply grid-cols-1;
    }
  }
</style>