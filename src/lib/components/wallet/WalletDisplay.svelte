<script lang="ts">
  import { walletStore, walletBalance, walletAddress, isWalletConnected } from '$lib/stores/wallet';
  import { Wallet, MoreHorizontal, RefreshCw } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';
  import WalletDetailsModal from './WalletDetailsModal.svelte';
  
  const dispatch = createEventDispatcher();
  
  export let compact = false;
  
  let showDetailsModal = false;
  let isRefreshing = false;
  
  // Format balance for display
  $: formattedBalance = ($walletBalance / 1_000_000).toFixed(6);
  $: shortAddress = $walletAddress ? 
    $walletAddress.slice(0, 8) + '...' + $walletAddress.slice(-8) : '';
  
  async function refreshBalance() {
    isRefreshing = true;
    await walletStore.refreshBalance();
    setTimeout(() => isRefreshing = false, 1000);
  }
  
  function openDetailsModal() {
    showDetailsModal = true;
  }
</script>

<!-- Unified Wallet Component - opens modal for all functionality -->
<div class="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl shadow-2xl border border-slate-700 h-fit"
     class:p-4={!compact}
     class:p-2={compact}
     class:rounded-xl={compact}>
  <div class="flex items-center justify-between"
       class:mb-3={!compact}
       class:mb-2={compact}>
    <!-- Header Section -->
    {#if compact}
      <div class="flex items-center gap-2">
        <Wallet class="w-5 h-5 text-voi-400" />
        <h3 class="text-base font-semibold text-white">Wallet</h3>
        {#if $isWalletConnected}
          <span class="text-lg font-bold text-voi-400">{formattedBalance} VOI</span>
        {/if}
      </div>
    {:else}
      <div class="flex items-center gap-3">
        <Wallet class="w-6 h-6 text-voi-400" />
        <h3 class="text-lg font-semibold text-white">Gaming Wallet</h3>
        {#if $isWalletConnected}
          <span class="text-xl font-bold text-voi-400">{formattedBalance} VOI</span>
        {/if}
      </div>
    {/if}
    
    <!-- Action Buttons -->
    <div class="flex items-center gap-2">
      <!-- Refresh Balance (non-compact only) -->
      {#if !compact && $isWalletConnected}
        <button
          on:click={refreshBalance}
          disabled={isRefreshing}
          class="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          title="Refresh balance"
        >
          <RefreshCw class="w-4 h-4 {isRefreshing ? 'animate-spin' : ''}" />
        </button>
      {/if}
      
      <!-- Details/Settings Button -->
      <button
        on:click={openDetailsModal}
        class="p-1.5 text-gray-400 hover:text-white transition-colors"
        title="Open wallet details"
      >
        <MoreHorizontal class="w-4 h-4" />
      </button>
    </div>
  </div>
  
  <!-- Status Display -->
  {#if $walletStore.isLoading}
    <div class="text-center py-4">
      <div class="w-6 h-6 border-2 border-voi-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
      <p class="text-gray-400 text-sm">Loading wallet...</p>
    </div>
  {:else if $walletStore.error}
    <div class="text-center py-4">
      <p class="text-red-400 text-sm mb-3">{$walletStore.error}</p>
      <button
        on:click={() => walletStore.initialize()}
        class="px-4 py-2 bg-voi-600 hover:bg-voi-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Retry
      </button>
    </div>
  {:else if !$isWalletConnected && !$walletStore.isLocked}
    <!-- Not connected - show connect button -->
    <div class="text-center py-4">
      <p class="text-gray-400 text-sm mb-3">No wallet connected</p>
      <button
        on:click={() => walletStore.initialize()}
        class="px-4 py-2 bg-voi-600 hover:bg-voi-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Connect Wallet
      </button>
    </div>
  {:else if $walletStore.isLocked}
    <!-- Locked state -->
    <div class="text-center py-4">
      <p class="text-gray-400 text-sm mb-3">Wallet is locked</p>
      <button
        on:click={openDetailsModal}
        class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Unlock Wallet
      </button>
    </div>
  {:else if !compact}
    <!-- Desktop connected state - show address info -->
    <div class="bg-slate-700/50 rounded-lg p-3">
      <p class="text-xs text-gray-400 mb-1">Address</p>
      <p class="font-mono text-sm text-white">{shortAddress}</p>
      <p class="text-xs text-gray-400 mt-2">
        Click the menu to access all wallet functions
      </p>
    </div>
  {/if}
</div>

<!-- Unified Modal -->
{#if showDetailsModal}
  <WalletDetailsModal
    bind:isVisible={showDetailsModal}
    on:close={() => showDetailsModal = false}
  />
{/if}

<style>
  /* Ensure consistent button styling */
  :global(.btn-primary) {
    @apply px-4 py-2 bg-voi-600 hover:bg-voi-700 text-white font-medium rounded-lg transition-colors duration-200;
  }
  
  :global(.btn-secondary) {
    @apply px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white font-medium rounded-lg transition-colors duration-200;
  }
</style>