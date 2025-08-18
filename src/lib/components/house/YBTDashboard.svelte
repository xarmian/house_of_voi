<script lang="ts">
  import { onMount } from 'svelte';
  import { ybtStore, userShares, sharePercentage, totalSupply, isYBTLoading } from '$lib/stores/ybt';
  import { walletStore } from '$lib/stores/walletAdapter';
  import { selectedWallet } from 'avm-wallet-svelte';
  import { ybtService } from '$lib/services/ybt';
  import YBTStats from './YBTStats.svelte';
  import YBTDepositModal from './YBTDepositModal.svelte';
  import YBTWithdrawModal from './YBTWithdrawModal.svelte';
  import type { YBTGlobalState } from '$lib/types/ybt';

  let showDepositModal = false;
  let showWithdrawModal = false;
  let isRefreshing = false;
  let globalState: YBTGlobalState | null = null;
  let contractValue = BigInt(0);
  let isLoadingContractValue = false;

  async function handleRefresh() {
    isRefreshing = true;
    await ybtStore.refresh();
    await loadContractValue();
    isRefreshing = false;
  }

  function formatShares(shares: bigint): string {
    return globalState ? ybtService.formatShares(shares, globalState.decimals) : ybtService.formatShares(shares, 9);
  }
  
  async function loadGlobalState() {
    try {
      globalState = await ybtService.getGlobalState();
    } catch (error) {
      console.error('Error loading global state:', error);
    }
  }
  
  async function loadContractValue() {
    isLoadingContractValue = true;
    try {
      contractValue = await ybtService.getContractTotalValue();
    } catch (error) {
      console.error('Error loading contract value:', error);
      contractValue = BigInt(0);
    } finally {
      isLoadingContractValue = false;
    }
  }
  
  function calculateUserPortfolioValue(): bigint {
    if (!globalState || $userShares === BigInt(0) || $totalSupply === BigInt(0) || contractValue === BigInt(0)) {
      return BigInt(0);
    }
    return ybtService.calculateUserPortfolioValue($userShares, $totalSupply, contractValue);
  }
  
  onMount(() => {
    loadGlobalState();
    loadContractValue();
  });

  $: hasShares = $userShares > BigInt(0);
</script>

<div class="space-y-6">
  <!-- Stats Overview -->
  <YBTStats />

  <!-- User Shares Card -->
  <div class="card p-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-2xl font-bold text-white">Your YBT Holdings</h2>
      <button
        on:click={handleRefresh}
        disabled={isRefreshing || $isYBTLoading}
        class="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {#if isRefreshing}
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Refreshing...
        {:else}
          Refresh
        {/if}
      </button>
    </div>

    {#if $isYBTLoading}
      <div class="text-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-500 mx-auto"></div>
        <p class="text-slate-400 mt-2">Loading your YBT data...</p>
      </div>
    {:else}
      <div class="grid md:grid-cols-3 gap-6">
        <!-- Shares Owned -->
        <div class="bg-slate-700 rounded-lg p-4">
          <div class="text-slate-400 text-sm font-medium mb-1">Shares Owned</div>
          <div class="text-2xl font-bold text-white">
            {formatShares($userShares)}
          </div>
          <div class="text-xs text-slate-500 mt-1">YBT Shares</div>
        </div>

        <!-- Ownership Percentage -->
        <div class="bg-slate-700 rounded-lg p-4">
          <div class="text-slate-400 text-sm font-medium mb-1">Ownership</div>
          <div class="text-2xl font-bold text-voi-400">
            {$sharePercentage.toFixed(4)}%
          </div>
          <div class="text-xs text-slate-500 mt-1">of Total Supply</div>
        </div>

        <!-- Portfolio Value -->
        <div class="bg-slate-700 rounded-lg p-4">
          <div class="text-slate-400 text-sm font-medium mb-1">Portfolio Value</div>
          <div class="text-2xl font-bold text-yellow-400">
            {#if isLoadingContractValue}
              <div class="flex items-center">
                <svg class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading...
              </div>
            {:else}
              {(Number(calculateUserPortfolioValue()) / 1_000_000).toFixed(6)} VOI
            {/if}
          </div>
          <div class="text-xs text-slate-500 mt-1">Based on Contract Value</div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-4 mt-6">
        <button
          on:click={() => showDepositModal = true}
          class="btn-primary flex-1"
          disabled={!$selectedWallet}
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
          </svg>
          Deposit
        </button>

        <button
          on:click={() => showWithdrawModal = true}
          class="btn-secondary flex-1"
          disabled={!hasShares || !$selectedWallet}
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 12H6"></path>
          </svg>
          Withdraw
        </button>
      </div>

      {#if !hasShares}
        <div class="mt-4 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <div class="flex">
            <svg class="w-5 h-5 text-blue-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
            </svg>
            <div class="text-sm">
              <p class="text-blue-300 font-medium">Start earning with YBT</p>
              <p class="text-blue-400 mt-1">
                Make your first deposit to start earning your share of the house profits.
              </p>
            </div>
          </div>
        </div>
      {/if}
    {/if}

    {#if $ybtStore.error}
      <div class="mt-4 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
        <div class="flex">
          <svg class="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
          </svg>
          <div class="text-sm">
            <p class="text-red-300 font-medium">Error loading YBT data</p>
            <p class="text-red-400 mt-1">{$ybtStore.error}</p>
          </div>
        </div>
        <button
          on:click={() => ybtStore.clearError()}
          class="text-red-400 text-sm underline mt-2"
        >
          Dismiss
        </button>
      </div>
    {/if}
  </div>
</div>

<!-- Modals -->
{#if showDepositModal}
  <YBTDepositModal 
    bind:open={showDepositModal}
    on:success={() => ybtStore.refresh()}
  />
{/if}

{#if showWithdrawModal}
  <YBTWithdrawModal 
    bind:open={showWithdrawModal}
    userShares={$userShares}
    on:success={() => ybtStore.refresh()}
  />
{/if}

<style>
  .text-voi-400 {
    color: #10b981;
  }
  
  .btn-primary {
    @apply bg-voi-600 hover:bg-voi-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center;
  }
  
  .btn-secondary {
    @apply bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center;
  }
  
  .bg-voi-600 {
    background-color: #059669;
  }
  
  .hover\:bg-voi-700:hover {
    background-color: #047857;
  }
</style>