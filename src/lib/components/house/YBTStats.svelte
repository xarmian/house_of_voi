<script lang="ts">
  import { onMount } from 'svelte';
  import { totalSupply, isYBTLoading } from '$lib/stores/ybt';
  import { ybtService } from '$lib/services/ybt';
  import type { YBTGlobalState } from '$lib/types/ybt';

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

<div class="card p-6">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-2xl font-bold text-theme">YBT Contract Overview</h2>
    <button
      on:click={loadGlobalState}
      disabled={isLoadingGlobal}
      class="btn-secondary text-sm"
    >
      {#if isLoadingGlobal}
        <svg class="animate-spin -ml-1 mr-1 h-3 w-3 text-theme" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Refreshing...
      {:else}
        Refresh
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
    <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Token Name -->
      <div class="bg-slate-700 rounded-lg p-4">
        <div class="text-slate-400 text-sm font-medium mb-1">Token Name</div>
        <div class="text-lg font-bold text-theme truncate">
          {globalState.name}
        </div>
        <div class="text-xs text-slate-500 mt-1">({globalState.symbol})</div>
      </div>

      <!-- Total Supply -->
      <div class="bg-slate-700 rounded-lg p-4">
        <div class="text-slate-400 text-sm font-medium mb-1">Total Supply</div>
        <div class="text-lg font-bold text-voi-400">
          {formatSupply($totalSupply)}
        </div>
        <div class="text-xs text-slate-500 mt-1">YBT Tokens</div>
      </div>

      <!-- Decimals -->
      <div class="bg-slate-700 rounded-lg p-4">
        <div class="text-slate-400 text-sm font-medium mb-1">Precision</div>
        <div class="text-lg font-bold text-blue-400">
          {globalState.decimals}
        </div>
        <div class="text-xs text-slate-500 mt-1">Decimal Places</div>
      </div>

      <!-- Yield Source -->
      <div class="bg-slate-700 rounded-lg p-4">
        <div class="text-slate-400 text-sm font-medium mb-1">Yield Source</div>
        <div class="text-lg font-bold text-yellow-400">
          {globalState.yieldBearingSource || 'Not Set'}
        </div>
        <div class="text-xs text-slate-500 mt-1">App ID</div>
      </div>
    </div>

    <!-- Additional Info -->
    <div class="mt-6 p-4 bg-slate-900 rounded-lg">
      <h3 class="text-lg font-semibold text-theme mb-3">How YBT Works</h3>
      <div class="grid md:grid-cols-3 gap-4 text-sm">
        <div class="flex items-start">
          <div class="w-2 h-2 bg-voi-400 rounded-full mt-2 mr-3 flex-shrink-0"></div>
          <div>
            <div class="text-theme font-medium">Deposit Funds</div>
            <div class="text-slate-400">Deposit VOI to receive YBT shares proportional to your contribution</div>
          </div>
        </div>
        <div class="flex items-start">
          <div class="w-2 h-2 bg-voi-400 rounded-full mt-2 mr-3 flex-shrink-0"></div>
          <div>
            <div class="text-theme font-medium">Earn Yield</div>
            <div class="text-slate-400">Your shares earn yield from house profits and gaming activities</div>
          </div>
        </div>
        <div class="flex items-start">
          <div class="w-2 h-2 bg-voi-400 rounded-full mt-2 mr-3 flex-shrink-0"></div>
          <div>
            <div class="text-theme font-medium">Withdraw Anytime</div>
            <div class="text-slate-400">Redeem your shares for the underlying VOI value plus any earned yield</div>
          </div>
        </div>
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