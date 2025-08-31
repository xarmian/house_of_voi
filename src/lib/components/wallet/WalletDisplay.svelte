<script lang="ts">
  import { walletStore, walletBalance, walletAddress, isWalletConnected, hasExistingWallet, type BalanceChangeEventDetail } from '$lib/stores/wallet';
  import { reservedBalance } from '$lib/stores/queue';
  import { walletService } from '$lib/services/wallet';
  import { algorandService } from '$lib/services/algorand';
  import { balanceManager } from '$lib/services/balanceManager';
  import { Wallet, MoreHorizontal, RefreshCw, Unlock, Lock, TrendingUp, Copy, Check, User } from 'lucide-svelte';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import WalletDetailsModal from './WalletDetailsModal.svelte';
  import GamingWalletStakingModal from './GamingWalletStakingModal.svelte';
  import BalanceUpdateAnimation from './BalanceUpdateAnimation.svelte';
  import { playDeposit, playBalanceIncrease } from '$lib/services/soundService';
  import { formatVOI } from '$lib/constants/betting';

  const dispatch = createEventDispatcher();
  
  export let compact = false;
  
  let showDetailsModal = false;
  let showStakingModal = false;
  let isRefreshing = false;
  let copied = false;
  
  // Balance animation state
  let balanceAnimationComponent: BalanceUpdateAnimation;
  let isAnimatingBalance = false;
  let previousBalance = $walletBalance;
  let balanceChangeUnsubscribe: (() => void) | null = null;
  
  // Public wallet data for locked wallets
  let publicWalletData: { address: string; createdAt: number; lastUsed: number; isPasswordless?: boolean } | null = null;
  let publicBalance: number | null = null;
  let loadingPublicBalance = false;
  
  // Format balance for display
  $: formattedBalance = $isWalletConnected ? 
    ($walletBalance / 1_000_000).toFixed(6) : 
    publicBalance !== null ? 
      (publicBalance / 1_000_000).toFixed(6) : 
      '0.000000';
  
  // Calculate available credits for betting
  $: walletBal = $isWalletConnected ? $walletBalance : (publicBalance || 0);
  $: reserved = $reservedBalance || 0;
  const minTransactionCost = 50500 + 30000 + 28500 + 15000 + 1000000; // spin + 1 payline + box + network + buffer
  $: grossAvailable = Math.max(0, walletBal - reserved);
  $: availableForBetting = Math.max(0, grossAvailable - minTransactionCost);
  $: formattedAvailableCredits = Math.floor(availableForBetting / 1e6);
  
  $: shortAddress = $isWalletConnected ? 
    ($walletAddress ? $walletAddress.slice(0, 8) + '...' + $walletAddress.slice(-8) : '') :
    (publicWalletData?.address ? publicWalletData.address.slice(0, 8) + '...' + publicWalletData.address.slice(-8) : '');
  
  // Load public wallet data for guest mode with existing wallet
  async function loadPublicWalletData() {
    publicWalletData = walletService.getPublicWalletData();
    
    if (publicWalletData?.address && algorandService) {
      loadingPublicBalance = true;
      try {
        publicBalance = await balanceManager.getBalance(publicWalletData.address);
      } catch (err) {
        console.error('Failed to load public wallet balance:', err);
        publicBalance = null;
      } finally {
        loadingPublicBalance = false;
      }
    }
  }
  
  // Handle balance changes for animation and sound
  const handleBalanceChange = async (event: BalanceChangeEventDetail) => {
    if (!event.isIncrease || !event.isSignificant) return; // Only animate significant increases (> 1 VOI)
    
    console.log('Significant balance increase detected:', event);
    
    // Play deposit sound for any significant balance increase
    await playDeposit();
    
    // Start balance animation
    if (balanceAnimationComponent) {
      isAnimatingBalance = true;
      await balanceAnimationComponent.animate(event.newBalance);
    }
  };

  onMount(() => {
    loadPublicWalletData();
    
    // Subscribe to balance changes
    balanceChangeUnsubscribe = walletStore.onBalanceChange(handleBalanceChange);
  });
  
  onDestroy(() => {
    // Cleanup balance change subscription
    if (balanceChangeUnsubscribe) {
      balanceChangeUnsubscribe();
    }
  });
  
  // Load public data when in guest mode with existing wallet
  $: if ($walletStore.isGuest && $hasExistingWallet) {
    loadPublicWalletData();
  }
  
  // Clear public data when not in the right state
  $: if (!$walletStore.isGuest || !$hasExistingWallet) {
    publicWalletData = null;
    publicBalance = null;
  }
  
  async function refreshBalance() {
    isRefreshing = true;
    await walletStore.refreshBalance();
    setTimeout(() => isRefreshing = false, 1000);
  }
  
  function openDetailsModal() {
    if ($walletStore.isGuest && !$hasExistingWallet) {
      // True new user - start wallet setup
      dispatch('startSetup');
    } else if ($walletStore.isGuest && $hasExistingWallet) {
      // Existing wallet in guest mode - trigger unlock flow
      dispatch('unlock');
    } else {
      // Connected wallet - show details modal
      showDetailsModal = true;
    }
  }
  
  function openStakingModal() {
    showStakingModal = true;
  }
  
  function handleStakingSuccess(event) {
    // Refresh wallet balance after successful staking/unstaking
    refreshBalance();
    dispatch('stakingSuccess', event.detail);
  }
  
  async function copyAddress() {
    const address = $isWalletConnected ? $walletAddress : publicWalletData?.address;
    if (address) {
      try {
        await navigator.clipboard.writeText(address);
        copied = true;
        setTimeout(() => copied = false, 2000);
      } catch (err) {
        console.error('Failed to copy address:', err);
      }
    }
  }
</script>

<!-- Unified Wallet Component - opens modal for all functionality -->
{#if compact}
  <!-- Compact Mobile View - Single Line -->
  <div class="card-secondary px-3 py-2 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Wallet class="w-4 h-4 text-voi-400" />
      <span class="text-sm font-medium text-theme">Credits: {formattedAvailableCredits} VOI</span>
    </div>
    
    {#if $walletStore.isGuest && !$hasExistingWallet}
      <button
        on:click={openDetailsModal}
        class="px-3 py-1 bg-green-600 hover:bg-green-700 text-theme text-xs font-medium rounded transition-colors"
      >
        Add Credits
      </button>
    {:else if $walletStore.isGuest && $hasExistingWallet}
      <button
        on:click={openDetailsModal}
        class="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-theme text-xs font-medium rounded transition-colors flex items-center gap-1"
      >
        <Unlock class="w-3 h-3" />
        Unlock
      </button>
    {:else if $walletStore.isLocked}
      <button
        on:click={openDetailsModal}
        class="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-theme text-xs font-medium rounded transition-colors"
      >
        Unlock
      </button>
    {:else if $walletStore.error}
      <button
        on:click={() => walletStore.initialize()}
        class="px-3 py-1 bg-red-600 hover:bg-red-700 text-theme text-xs font-medium rounded transition-colors"
      >
        Retry
      </button>
    {:else}
      <div class="flex items-center gap-1">
        <button
          on:click={openStakingModal}
          class="px-2 py-1 bg-voi-600 hover:bg-voi-700 text-white text-xs font-medium rounded transition-colors flex items-center gap-1"
          title="Stake VOI"
        >
          <TrendingUp class="w-3 h-3" />
          Stake
        </button>
        <button
          on:click={openDetailsModal}
          class="p-1 text-theme-text opacity-70 hover:opacity-100 transition-colors"
          title="Wallet options"
        >
          <MoreHorizontal class="w-4 h-4" />
        </button>
      </div>
    {/if}
  </div>
{:else}
  <!-- Desktop View - Full Display -->
  <div class="card bg-gradient-to-b from-surface-primary to-surface-secondary rounded-2xl shadow-2xl h-fit p-4">
    <div class="flex items-center justify-between mb-3">
      <!-- Header Section -->
      <div class="flex items-center gap-3">
        <Wallet class="w-5 h-5 text-voi-400" />
        <div>
          {#if $isWalletConnected || publicBalance !== null}
            <div class="flex items-center gap-2">
              <h3 class="text-base font-semibold text-voi-400">Available Credits: {formattedAvailableCredits} VOI</h3>
            </div>
            <div class="text-sm text-theme-text opacity-70 mt-0.5 hidden">
              Wallet Balance: {#if loadingPublicBalance}
                Loading...
              {:else}
                <BalanceUpdateAnimation 
                  bind:this={balanceAnimationComponent}
                  startBalance={$isWalletConnected ? $walletBalance : (publicBalance || 0)}
                  endBalance={$isWalletConnected ? $walletBalance : (publicBalance || 0)}
                  formatAsCurrency={true}
                  isWinnings={false}
                  on:animationStart={() => isAnimatingBalance = true}
                  on:animationEnd={() => isAnimatingBalance = false}
                />
              {/if}
            </div>
          {:else}
            <div class="flex items-center gap-2">
              <h3 class="text-base font-medium text-theme">Available Credits</h3>
            </div>
          {/if}
        </div>
      </div>
      
      <!-- Action Buttons -->
      <div class="flex items-center gap-2">
        <!-- Refresh Balance -->
        {#if $isWalletConnected}
          <button
            on:click={refreshBalance}
            disabled={isRefreshing}
            class="p-2 text-theme-text opacity-70 hover:opacity-100 transition-colors disabled:opacity-50"
            title="Refresh balance"
          >
            <RefreshCw class="w-4 h-4 {isRefreshing ? 'animate-spin' : ''}" />
          </button>
        {/if}
        
        <!-- Details/Settings Button -->
        <button
          on:click={openDetailsModal}
          class="p-1.5 text-theme-text opacity-70 hover:opacity-100 transition-colors"
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
      <p class="text-theme-text opacity-70 text-sm">Loading wallet...</p>
    </div>
  {:else if $walletStore.error}
    <div class="text-center py-4">
      <p class="text-red-400 text-sm mb-3">{$walletStore.error}</p>
      <button
        on:click={() => walletStore.initialize()}
        class="px-4 py-2 bg-voi-600 hover:bg-voi-700 text-theme text-sm font-medium rounded-lg transition-colors"
      >
        Retry
      </button>
    </div>
  {:else if $walletStore.isGuest && !$hasExistingWallet}
    <!-- True new user - show Add Funds button -->
    <div class="text-center py-4">
      <p class="text-theme-text opacity-70 text-sm mb-3">Ready to play!</p>
      <button
        on:click={openDetailsModal}
        class="px-4 py-2 bg-green-600 hover:bg-green-700 text-theme text-sm font-medium rounded-lg transition-colors"
      >
        Add Credits
      </button>
    </div>
  {:else if $walletStore.isGuest && $hasExistingWallet}
    <!-- Existing wallet in guest mode - show unlock with address -->
    <div class="py-4">
      <div class="bg-surface-tertiary rounded-lg shadow-lg border border-surface-border backdrop-blur-sm p-3 mb-3">
        <div class="flex items-center gap-1 mb-1">
          <p class="text-xs text-theme-text opacity-70">Address</p>
          <Lock class="w-3 h-3 text-theme-text opacity-70" />
        </div>
        <div class="flex items-center gap-2">
          <a 
            href="https://voirewards.com/wallet/{publicWalletData?.address || ''}"
            target="_blank"
            rel="noopener noreferrer"
            class="font-mono text-sm text-voi-400 hover:text-voi-300 transition-colors underline"
          >
            {shortAddress}
          </a>
          <a
            href="/profile/{publicWalletData?.address || ''}"
            class="p-1 text-theme-text opacity-70 hover:opacity-100 transition-colors"
            title="View profile"
          >
            <User class="w-3 h-3" />
          </a>
          <button
            on:click={copyAddress}
            class="p-1 text-theme-text opacity-70 hover:opacity-100 transition-colors"
            title="Copy address"
          >
            {#if copied}
              <Check class="w-3 h-3 text-green-400" />
            {:else}
              <Copy class="w-3 h-3" />
            {/if}
          </button>
        </div>
        {#if publicWalletData?.isPasswordless}
          <p class="text-xs text-amber-400 mt-1">Passwordless wallet</p>
        {/if}
      </div>
      <div class="text-center">
        <button
          on:click={openDetailsModal}
          class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-theme text-sm font-medium rounded-lg transition-colors flex items-center gap-2 mx-auto"
        >
          <Unlock class="w-4 h-4" />
          Unlock Wallet
        </button>
      </div>
    </div>
  {:else if !compact}
    <!-- Desktop connected state - show address info -->
    <div class="bg-surface-tertiary rounded-lg shadow-lg border border-surface-border backdrop-blur-sm p-3">
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-1">
          <p class="text-xs text-theme-text opacity-70">Address</p>
          <Unlock class="w-3 h-3 text-theme-text opacity-70" />
        </div>
        <button
          on:click={() => walletStore.lock()}
          class="p-1 text-theme-text opacity-70 hover:opacity-100 transition-colors"
          title="Lock wallet"
        >
          <Lock class="w-3 h-3" />
        </button>
      </div>
      <div class="flex items-center gap-2">
        <a 
          href="https://voirewards.com/wallet/{$walletAddress || ''}"
          target="_blank"
          rel="noopener noreferrer"
          class="font-mono text-sm text-voi-400 hover:text-voi-300 transition-colors underline"
        >
          {shortAddress}
        </a>
        <a
          href="/profile/{$walletAddress || ''}"
          class="p-1 text-theme-text opacity-70 hover:opacity-100 transition-colors"
          title="View profile"
        >
          <User class="w-3 h-3" />
        </a>
        <button
          on:click={copyAddress}
          class="p-1 text-theme-text opacity-70 hover:opacity-100 transition-colors"
          title="Copy address"
        >
          {#if copied}
            <Check class="w-3 h-3 text-green-400" />
          {:else}
            <Copy class="w-3 h-3" />
          {/if}
        </button>
      </div>
      <p class="text-xs text-theme-text opacity-70 mt-2">
        Click the menu to access functions • Click lock to secure
      </p>
    </div>
  {/if}
  </div>
{/if}

<!-- Modals -->
{#if showDetailsModal}
  <WalletDetailsModal
    bind:isVisible={showDetailsModal}
    on:close={() => showDetailsModal = false}
  />
{/if}

{#if showStakingModal}
  <GamingWalletStakingModal
    bind:isVisible={showStakingModal}
    on:close={() => showStakingModal = false}
    on:success={handleStakingSuccess}
  />
{/if}

<style>
  /* Ensure consistent button styling */
  :global(.btn-primary) {
    @apply px-4 py-2 bg-voi-600 hover:bg-voi-700 text-theme font-medium rounded-lg transition-colors duration-200;
  }
  
  :global(.btn-secondary) {
    @apply px-4 py-2 bg-surface-secondary hover:bg-surface-hover text-theme font-medium rounded-lg transition-colors duration-200;
  }
  
  /* VOI branding colors */
  .bg-voi-600 {
    background-color: #059669;
  }
  
  .hover\:bg-voi-700:hover {
    background-color: #047857;
  }
</style>