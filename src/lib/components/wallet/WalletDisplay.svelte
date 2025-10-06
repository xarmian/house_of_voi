<script lang="ts">
  import { walletStore, walletBalance, walletAddress, isWalletConnected, hasExistingWallet, isCDPWallet, cdpUserEmail, type BalanceChangeEventDetail } from '$lib/stores/wallet';
  import { reservedBalance } from '$lib/stores/queue';
  import { walletService } from '$lib/services/wallet';
  import { algorandService } from '$lib/services/algorand';
  import { balanceManager } from '$lib/services/balanceManager';
  import type { WalletOrigin } from '$lib/types/wallet';
  import { Wallet, MoreHorizontal, RefreshCw, Unlock, Lock, TrendingUp, Copy, Check, User, Mail, LogOut } from 'lucide-svelte';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import WalletDetailsModal from './WalletDetailsModal.svelte';
  import GamingWalletStakingModal from './GamingWalletStakingModal.svelte';
  import WalletSwitcher from './WalletSwitcher.svelte';
  import WalletListModal from './WalletListModal.svelte';
  import BalanceUpdateAnimation from './BalanceUpdateAnimation.svelte';
  import { playDeposit, playBalanceIncrease } from '$lib/services/soundService';
  import { formatVOI } from '$lib/constants/betting';

  const dispatch = createEventDispatcher();

  export let compact = false;
  
  let showDetailsModal = false;
  let showStakingModal = false;
  let showWalletListModal = false;
  let isRefreshing = false;
  let copied = false;
  
  // Balance animation state
  let balanceAnimationComponent: BalanceUpdateAnimation;
  let isAnimatingBalance = false;
  let previousBalance = $walletBalance;
  let balanceChangeUnsubscribe: (() => void) | null = null;
  
  // Pending transaction state
  let hasPendingTransactions = false;
  let pendingDeductions = 0;
  
  // Public wallet data for locked wallets
  let publicWalletData: {
    address: string;
    createdAt: number;
    lastUsed: number;
    origin?: WalletOrigin;
    isPasswordless?: boolean;
  } | null = null;
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
  // Gross available excludes only active reservations; pending on-chain deductions are reflected when confirmed
  $: grossAvailable = Math.max(0, walletBal - reserved);
  $: availableForBetting = Math.max(0, grossAvailable - minTransactionCost);
  $: formattedAvailableCredits = Math.floor(availableForBetting / 1e6);
  
  $: shortAddress = $isWalletConnected ? 
    ($walletAddress ? $walletAddress.slice(0, 8) + '...' + $walletAddress.slice(-8) : '') :
    (publicWalletData?.address ? publicWalletData.address.slice(0, 8) + '...' + publicWalletData.address.slice(-8) : '');
  
  // Load public wallet data for guest mode with existing wallet
  async function loadPublicWalletData() {
    // First try multi-wallet collection
    const activeAddress = walletService.getActiveWalletAddress();
    if (activeAddress) {
      const wallets = walletService.getAllWallets();
      const activeWallet = wallets.find(w => w.address === activeAddress);
      if (activeWallet) {
        publicWalletData = {
          address: activeWallet.address,
          createdAt: activeWallet.createdAt,
          lastUsed: activeWallet.lastUsed,
          origin: activeWallet.origin,
          isPasswordless: activeWallet.isPasswordless
        };
      }
    }

    // Fall back to legacy single wallet if no multi-wallet found
    if (!publicWalletData) {
      publicWalletData = walletService.getPublicWalletData();
    }

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

  // Check for pending transactions
  function checkPendingTransactions() {
    if ($walletAddress) {
      hasPendingTransactions = balanceManager.hasPendingTransactions($walletAddress);
      if (hasPendingTransactions) {
        const pending = balanceManager.getPendingAmount($walletAddress);
        pendingDeductions = pending.deductions;
      } else {
        pendingDeductions = 0;
      }
    }
  }

  // Reload public wallet data when active wallet changes
  $: if ($walletStore.activeWalletAddress) {
    loadPublicWalletData();
  }

  onMount(() => {
    loadPublicWalletData();

    // Subscribe to balance changes
    balanceChangeUnsubscribe = walletStore.onBalanceChange(handleBalanceChange);

    // Check for pending transactions initially
    checkPendingTransactions();

    // Periodically check for pending transaction changes
    const pendingCheckInterval = setInterval(checkPendingTransactions, 1000);

    return () => {
      clearInterval(pendingCheckInterval);
    };
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
    } else if (!$isWalletConnected && ($walletStore.availableWallets.length > 0 || $hasExistingWallet)) {
      // Have wallets but not connected - trigger unlock flow
      dispatch('unlock');
    } else if ($isWalletConnected) {
      // Connected wallet - show details modal
      showDetailsModal = true;
    } else {
      // Fallback - show details modal
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

  function handleLogout() {
    if (confirm('Are you sure you want to logout? Your account will remain on this device.')) {
      walletStore.lock();
    }
  }

  // Multi-wallet handlers
  function handleAddWallet() {
    dispatch('startSetup', { mode: 'add' }); // Trigger wallet onboarding in add mode
  }

  function handleManageWallets() {
    showWalletListModal = true;
  }

  async function handleSwitchWallet(event: CustomEvent<{ address: string }>) {
    const { address } = event.detail;

    // The WalletSwitcher dropdown is simple, just switch (passwordless only for now)
    try {
      await walletStore.switchWallet(address, '');
    } catch (error) {
      console.error('Failed to switch wallet:', error);
      // If it fails, open the manage modal where they can enter password
      showWalletListModal = true;
    }
  }
</script>

<!-- Unified Wallet Component - opens modal for all functionality -->
{#if compact}
  <!-- Compact Mobile View -->
  <div class="card-secondary px-3 py-2">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Wallet class="w-4 h-4 text-voi-400" />
        <span class="text-sm font-medium text-theme">
          {formattedAvailableCredits} VOI
          {#if hasPendingTransactions}
            <span class="text-xs text-amber-400 ml-1" title="Transaction pending confirmation">●</span>
          {/if}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Wallet Switcher -->
        {#if $walletStore.availableWallets.length > 0}
          <WalletSwitcher
            compact={true}
            on:addWallet={handleAddWallet}
            on:manageWallets={handleManageWallets}
            on:switchWallet={handleSwitchWallet}
          />
        {/if}

        <!-- Menu Button -->
        <button
          on:click={openDetailsModal}
          class="p-1.5 text-theme-text opacity-70 hover:opacity-100 transition-colors"
          title="Wallet options"
        >
          <MoreHorizontal class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
{:else}
  <!-- Desktop View - Full Display -->
  <div class="card bg-gradient-to-b from-surface-primary to-surface-secondary rounded-2xl shadow-2xl h-fit p-4">
    <div class="space-y-3">
      <!-- Row 2: Wallet Switcher and Actions (ALWAYS SHOW IF WALLETS EXIST) -->
      {#if $walletStore.availableWallets.length > 0}
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <!-- Wallet Switcher -->
            <WalletSwitcher
              compact={true}
              on:addWallet={handleAddWallet}
              on:manageWallets={handleManageWallets}
              on:switchWallet={handleSwitchWallet}
            />

            <!-- Quick Actions -->
            <div class="flex items-center gap-1">
              {#if $walletAddress}
                <a
                  href="/profile/{$walletAddress}"
                  class="p-1.5 text-theme-text opacity-50 hover:text-voi-400 hover:opacity-100 transition-colors"
                  title="View profile"
                >
                  <User class="w-3.5 h-3.5" />
                </a>
                <button
                  on:click={copyAddress}
                  class="p-1.5 text-theme-text opacity-50 hover:text-voi-400 hover:opacity-100 transition-colors"
                  title="Copy address"
                >
                  {#if copied}
                    <Check class="w-3.5 h-3.5 text-green-400" />
                  {:else}
                    <Copy class="w-3.5 h-3.5" />
                  {/if}
                </button>
              {/if}

              {#if $isWalletConnected}
                <button
                  on:click={refreshBalance}
                  disabled={isRefreshing}
                  class="p-1.5 text-theme-text opacity-50 hover:text-voi-400 hover:opacity-100 transition-colors disabled:opacity-30"
                  title="Refresh balance"
                >
                  <RefreshCw class="w-3.5 h-3.5 {isRefreshing ? 'animate-spin' : ''}" />
                </button>

                <button
                  on:click={$isCDPWallet ? handleLogout : () => walletStore.lock()}
                  class="p-1.5 text-theme-text opacity-50 hover:text-red-400 hover:opacity-100 transition-colors"
                  title={$isCDPWallet ? 'Logout' : 'Lock wallet'}
                >
                  {#if $isCDPWallet}
                    <LogOut class="w-3.5 h-3.5" />
                  {:else}
                    <Lock class="w-3.5 h-3.5" />
                  {/if}
                </button>
              {:else if $walletAddress}
                <!-- Show unlock button when locked -->
                <button
                  on:click={openDetailsModal}
                  class="p-1.5 text-amber-400 hover:text-amber-300 transition-colors"
                  title="Unlock wallet"
                >
                  <Unlock class="w-3.5 h-3.5" />
                </button>
              {/if}
            </div>
          </div>

      </div>
      {/if}
      
      <!-- Row 1: Balance and Menu (ALWAYS SHOW) -->
      <div class="flex items-end justify-between">
        <div class="flex items-center gap-2">
          <Wallet class="w-5 h-5 text-voi-400" />
          <div>
            <h3 class="text-base font-semibold text-voi-400">
              {formattedAvailableCredits} VOI
              {#if hasPendingTransactions}
                <span class="text-xs text-amber-400 ml-2 animate-pulse" title="Transaction pending confirmation">●</span>
              {/if}
            </h3>
            <p class="text-xs text-theme-text opacity-50">Available Credits</p>
          </div>
        </div>

        <!-- CDP Email (if applicable) -->
        {#if $isCDPWallet && $cdpUserEmail}
          <div class="flex items-center gap-1.5 text-xs text-theme-text opacity-70 mb-1">
            <Mail class="w-3 h-3" />
            <span>{$cdpUserEmail}</span>
          </div>
        {/if}

        <button
          on:click={openDetailsModal}
          class="p-1.5 text-theme-text opacity-70 hover:text-voi-400 hover:opacity-100 transition-colors"
          title="Open wallet details"
        >
          <MoreHorizontal class="w-3.5 h-3.5" />
        </button>
      </div>

    </div>

  <!-- Status Messages (only for special states) -->
  {#if $walletStore.isLoading}
    <div class="text-center py-4">
      <div class="w-6 h-6 border-2 border-voi-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
      <p class="text-theme-text opacity-70 text-sm">Loading wallet...</p>
    </div>
  {:else if $walletStore.error}
    <div class="text-center py-2">
      <p class="text-red-400 text-sm mb-2">{$walletStore.error}</p>
      <button
        on:click={() => walletStore.initialize()}
        class="px-3 py-1.5 bg-voi-600 hover:bg-voi-700 text-white text-sm rounded-lg transition-colors"
      >
        Retry
      </button>
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

{#if showWalletListModal}
  <WalletListModal
    bind:isOpen={showWalletListModal}
    on:close={() => showWalletListModal = false}
    on:addWallet={handleAddWallet}
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
