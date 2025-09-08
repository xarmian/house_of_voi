<script lang="ts">
  import { onMount } from 'svelte';
  import { totalSupply, isYBTLoading } from '$lib/stores/ybt';
  import { ybtService } from '$lib/services/ybt';
  import type { YBTGlobalState } from '$lib/types/ybt';
  import type { HouseBalanceData } from '$lib/services/houseBalance';
  import { themeStore } from '$lib/stores/theme';

  export let houseBalance: HouseBalanceData | null = null;
  export let balanceLoading = false;
  export let onRefreshBalance: (() => Promise<void>) | null = null;

  let globalState: YBTGlobalState | null = null;
  let isLoadingGlobal = false;
  let error = '';

  async function loadGlobalState() {
    isLoadingGlobal = true;
    error = '';
    
    try {
      globalState = await ybtService.getGlobalState();
    } catch (err) {
      console.error('Error loading global state:', err);
      error = 'Failed to load YBT contract information';
    } finally {
      isLoadingGlobal = false;
    }
  }

  onMount(() => {
    loadGlobalState();
  });

  function formatSupply(supply: bigint): string {
    return globalState ? ybtService.formatShares(supply, globalState.decimals) : ybtService.formatShares(supply, 9);
  }
</script>

<div class="card p-4">
  <div class="flex items-center justify-between mb-3">
    <div>
      <h2 class="text-lg font-bold text-theme">Contract Health</h2>
      <p class="text-xs text-slate-400 mt-1">YBT token and house balance status</p>
    </div>
    <button
      on:click={async () => {
        await loadGlobalState();
        if (onRefreshBalance) {
          await onRefreshBalance();
        }
      }}
      disabled={isLoadingGlobal || balanceLoading}
      class="btn-secondary text-xs px-2 py-1"
    >
      {#if isLoadingGlobal || balanceLoading}
        <svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      {:else}
        ↻
      {/if}
    </button>
  </div>

  {#if isLoadingGlobal && !globalState}
    <div class="text-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-500 mx-auto"></div>
      <p class="text-slate-400 mt-2">Loading contract information...</p>
    </div>
  {:else if error}
    <div class="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
      <div class="flex">
        <svg class="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
        </svg>
        <div class="text-sm">
          <p class="text-red-300 font-medium">Error loading contract data</p>
          <p class="text-red-400 mt-1">{error}</p>
        </div>
      </div>
    </div>
  {:else if globalState}
    <div class="grid grid-cols-2 gap-3">
      <!-- Token Info -->
      <div class="bg-slate-700 rounded-lg p-3">
        <div class="text-slate-400 text-xs font-medium mb-1">Token</div>
        <div class="text-sm font-bold text-theme">
          {globalState.name}
        </div>
        <div class="text-xs text-slate-500">({globalState.symbol})</div>
      </div>

      <!-- Total Supply -->
      <div class="bg-slate-700 rounded-lg p-3">
        <div class="text-slate-400 text-xs font-medium mb-1">Supply</div>
        <div class="text-sm font-bold text-voi-400">
          {formatSupply($totalSupply)}
        </div>
        <div class="text-xs text-slate-500">Total Shares</div>
      </div>
    </div>

    <!-- Contract Balances -->
    <div class="mt-4">
      <h3 class="text-sm font-semibold text-theme mb-3 flex items-center gap-2">
        Contract Balances
        {#if houseBalance}
          <span class="text-xs px-2 py-1 rounded-full {houseBalance.isOperational ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}">
            {houseBalance.isOperational ? '● Operational' : '● Below Min'}
          </span>
        {/if}
      </h3>
      {#if balanceLoading}
        <div class="flex items-center justify-center py-4">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-voi-400"></div>
        </div>
      {:else if houseBalance}
        <div class="space-y-2">
          <div class="flex items-center justify-between p-2 bg-slate-700/50 rounded">
            <span class="text-xs text-gray-400">Total</span>
            <span class="text-sm font-bold text-theme">
              {(houseBalance.total / 1e6).toFixed(2)} VOI
            </span>
          </div>
          
          <!-- Visual Fund Distribution -->
          <div class="p-2 bg-slate-700/50 rounded">
            <div class="flex justify-between text-xs text-gray-400 mb-2">
              <span>Fund Distribution</span>
              <span>Available / Locked</span>
            </div>
            <div class="w-full bg-slate-600 rounded-full h-3 overflow-hidden">
              <div class="h-full flex">
                <div 
                  class="bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                  style="width: {houseBalance.total > 0 ? (houseBalance.available / houseBalance.total) * 100 : 0}%"
                ></div>
                <div 
                  class="bg-gradient-to-r from-yellow-500 to-yellow-400 transition-all duration-500"
                  style="width: {houseBalance.total > 0 ? (houseBalance.locked / houseBalance.total) * 100 : 0}%"
                ></div>
              </div>
            </div>
            <div class="flex justify-between text-xs mt-1">
              <span class="text-green-400">{(houseBalance.available / 1e6).toFixed(1)} VOI</span>
              <span class="text-yellow-400">{(houseBalance.locked / 1e6).toFixed(1)} VOI</span>
            </div>
          </div>
        </div>
      {:else}
        <div class="text-center py-4 text-gray-400 text-sm">
          <p>Unable to load balance data</p>
        </div>
      {/if}
    </div>

    <!-- Documentation Link -->
    <div class="mt-4 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-voi-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span class="text-sm text-slate-300">Yield-bearing token that earns from house profits</span>
        </div>
        <a 
          href="https://docs.houseofvoi.com" 
          target="_blank" 
          rel="noopener noreferrer"
          class="text-voi-400 hover:text-voi-300 text-sm font-medium transition-colors duration-200 flex items-center gap-1"
        >
          Learn more
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
          </svg>
        </a>
      </div>
    </div>
  {/if}
</div>

<style>
  .text-voi-400 {
    color: #10b981;
  }
  
  .bg-voi-500 {
    background-color: #059669;
  }
</style>