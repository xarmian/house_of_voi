<script lang="ts">
  import { walletStore, walletBalance, walletAddress, isWalletConnected } from '$lib/stores/wallet';
  import { Copy, RefreshCw, Plus, Lock, Unlock, X, Settings } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';
  import AddFundsModal from './AddFundsModal.svelte';
  import WalletSettingsModal from './WalletSettingsModal.svelte';
  
  const dispatch = createEventDispatcher();
  
  export let isVisible = false;
  
  let showAddFunds = false;
  let showSettings = false;
  let isRefreshing = false;
  let copySuccess = false;
  
  // Format balance for display
  $: formattedBalance = ($walletBalance / 1_000_000).toFixed(6);
  $: shortAddress = $walletAddress ? 
    $walletAddress.slice(0, 8) + '...' + $walletAddress.slice(-8) : '';
  
  async function copyAddress() {
    if (!$walletAddress) return;
    
    try {
      await navigator.clipboard.writeText($walletAddress);
      copySuccess = true;
      setTimeout(() => copySuccess = false, 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  }
  
  async function refreshBalance() {
    isRefreshing = true;
    await walletStore.refreshBalance();
    setTimeout(() => isRefreshing = false, 1000);
  }
  
  function openAddFunds() {
    showAddFunds = true;
  }
  
  function openSettings() {
    showSettings = true;
  }
  
  function lockWallet() {
    walletStore.lock();
  }
  
  function unlockWallet() {
    walletStore.unlock();
  }
  
  function closeModal() {
    isVisible = false;
    dispatch('close');
  }
  
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  }
</script>

<!-- Modal backdrop -->
{#if isVisible}
  <div 
    class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    on:click={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-labelledby="wallet-modal-title"
  >
    <div class="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-700 w-full max-w-md max-h-[90vh] overflow-y-auto">
      <!-- Modal header -->
      <div class="flex items-center justify-between mb-4">
        <h2 id="wallet-modal-title" class="text-xl font-semibold text-white">Gaming Wallet</h2>
        <button
          on:click={closeModal}
          class="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700"
          aria-label="Close wallet details"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
      
      <!-- Wallet content -->
      {#if $walletStore.isLoading}
        <div class="text-center py-8">
          <div class="w-8 h-8 border-2 border-voi-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p class="text-gray-400">Loading wallet...</p>
        </div>
      {:else if $walletStore.error}
        <div class="text-center py-8">
          <p class="text-red-400 mb-4">{$walletStore.error}</p>
          <button
            on:click={() => walletStore.initialize()}
            class="btn-primary"
          >
            Retry
          </button>
        </div>
      {:else if $walletStore.isLocked}
        <div class="text-center py-8">
          <Lock class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-400 mb-4">Wallet is locked</p>
          <button
            on:click={unlockWallet}
            class="btn-primary"
          >
            Unlock Wallet
          </button>
        </div>
      {:else if $isWalletConnected}
        <!-- Balance Display -->
        <div class="text-center mb-6">
          <div class="text-3xl font-bold text-white mb-2">
            {formattedBalance} VOI
          </div>
          {#if $walletStore.lastUpdated}
            <p class="text-sm text-gray-400">
              Last updated: {new Date($walletStore.lastUpdated).toLocaleTimeString()}
            </p>
          {/if}
          
          <!-- Refresh button -->
          <button
            on:click={refreshBalance}
            disabled={isRefreshing}
            class="mt-2 p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh balance"
          >
            <RefreshCw class="w-5 h-5 {isRefreshing ? 'animate-spin' : ''}" />
          </button>
        </div>
        
        <!-- Address Display -->
        <div class="bg-slate-700/50 rounded-lg p-4 mb-6">
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0">
              <p class="text-sm text-gray-400 mb-1">Wallet Address</p>
              <p class="font-mono text-sm text-white break-all">{$walletAddress}</p>
            </div>
            <button
              on:click={copyAddress}
              class="ml-3 p-2 text-gray-400 hover:text-white transition-colors flex-shrink-0"
              title="Copy full address"
            >
              <Copy class="w-4 h-4" />
            </button>
          </div>
          
          {#if copySuccess}
            <p class="text-voi-400 text-sm mt-2">Address copied to clipboard!</p>
          {/if}
        </div>
        
        <!-- Action Buttons -->
        <div class="grid grid-cols-2 gap-3 mb-6">
          <button
            on:click={openAddFunds}
            class="btn-primary flex items-center justify-center gap-2"
          >
            <Plus class="w-4 h-4" />
            Add Funds
          </button>
          
          <button
            on:click={openSettings}
            class="btn-secondary flex items-center justify-center gap-2"
          >
            <Settings class="w-4 h-4" />
            Settings
          </button>
        </div>
        
        <!-- Lock Section -->
        <div class="mb-6">
          <button
            on:click={lockWallet}
            class="w-full bg-amber-600 hover:bg-amber-700 text-white py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <Lock class="w-4 h-4" />
            Lock Wallet
          </button>
        </div>
        
        <!-- Security Warning -->
        <div class="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
          <p class="text-yellow-400 text-sm">
            <strong>⚠️ Gaming Wallet:</strong> This wallet is designed for gaming only. Export your keys for backup and never share your private keys with anyone.
          </p>
        </div>
      {:else}
        <!-- Not connected state -->
        <div class="text-center py-8">
          <p class="text-gray-400 mb-4">No wallet connected</p>
          <button
            on:click={() => walletStore.initialize()}
            class="btn-primary"
          >
            Connect Wallet
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Sub-modals -->
{#if showAddFunds && $walletAddress}
  <AddFundsModal
    address={$walletAddress}
    on:close={() => showAddFunds = false}
  />
{/if}

{#if showSettings}
  <WalletSettingsModal
    on:close={() => showSettings = false}
    on:walletChanged={() => {
      showSettings = false;
      closeModal();
    }}
  />
{/if}

<style>
  .btn-primary {
    @apply px-4 py-2 bg-voi-600 hover:bg-voi-700 text-white font-medium rounded-lg transition-colors duration-200;
  }
  
  .btn-secondary {
    @apply px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white font-medium rounded-lg transition-colors duration-200;
  }
</style>