<script lang="ts">
  import { walletStore } from '$lib/stores/wallet';
  import { createEventDispatcher } from 'svelte';
  import { ChevronDown, Wallet, Plus, Settings } from 'lucide-svelte';
  import type { WalletMetadata } from '$lib/types/wallet';

  const dispatch = createEventDispatcher<{
    addWallet: void;
    manageWallets: void;
    switchWallet: { address: string };
  }>();

  export let compact = false;

  let showDropdown = false;

  $: wallets = $walletStore.availableWallets;
  $: activeAddress = $walletStore.activeWalletAddress;
  $: currentWallet = wallets.find(w => w.address === activeAddress);

  function toggleDropdown() {
    showDropdown = !showDropdown;
  }

  function handleSwitchWallet(address: string) {
    showDropdown = false;
    dispatch('switchWallet', { address });
  }

  function handleAddWallet() {
    showDropdown = false;
    dispatch('addWallet');
  }

  function handleManageWallets() {
    showDropdown = false;
    dispatch('manageWallets');
  }

  function getWalletLabel(wallet: WalletMetadata): string {
    return wallet.nickname || 'Wallet';
  }

  function getShortAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function getOriginBadge(origin: string): string {
    switch (origin) {
      case 'cdp':
        return '📧';
      case 'imported':
        return '📥';
      case 'generated':
        return '🔑';
      default:
        return '💼';
    }
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    if (showDropdown && !(event.target as HTMLElement).closest('.wallet-switcher')) {
      showDropdown = false;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="wallet-switcher relative">
  <!-- Wallet Switcher Button -->
  <button
    on:click|stopPropagation={toggleDropdown}
    class="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-secondary hover:bg-surface-hover rounded-lg transition-colors border border-surface-border"
    class:ring-1={showDropdown}
    class:ring-voi-400={showDropdown}
    class:border-voi-400={showDropdown}
  >
    {#if compact}
      <!-- Compact mode: icon, partial address, and badge -->
      <Wallet class="w-3.5 h-3.5 text-voi-400" />
      {#if currentWallet}
        <span class="text-xs font-mono text-theme-text">
          {getShortAddress(currentWallet.address)}
        </span>
      {/if}
      {#if wallets.length > 1}
        <span class="px-1.5 py-0.5 text-xs bg-voi-600 text-white rounded font-medium">
          {wallets.length}
        </span>
      {/if}
      <ChevronDown class="w-3 h-3 text-theme-text opacity-70 transition-transform {showDropdown ? 'rotate-180' : ''}" />
    {:else}
      <!-- Full mode: icon, name, address, and badge -->
      <Wallet class="w-4 h-4 text-voi-400" />
      <div class="flex flex-col">
        {#if currentWallet}
          <span class="text-xs font-medium text-theme-text">{getWalletLabel(currentWallet)}</span>
          <span class="text-xs font-mono text-theme-text opacity-70">{getShortAddress(currentWallet.address)}</span>
        {:else}
          <span class="text-sm font-medium text-theme-text">Select Wallet</span>
        {/if}
      </div>
      {#if wallets.length > 1}
        <span class="ml-1 px-1.5 py-0.5 text-xs bg-voi-600 text-white rounded-full">
          {wallets.length}
        </span>
      {/if}
      <ChevronDown class="w-4 h-4 transition-transform {showDropdown ? 'rotate-180' : ''}" />
    {/if}
  </button>

    <!-- Dropdown Menu -->
    {#if showDropdown}
      <div
        class="absolute top-full right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-surface-primary rounded-xl border border-surface-border shadow-2xl z-50 overflow-hidden"
      >
        <!-- Header -->
        <div class="px-4 py-3 border-b border-surface-border">
          <h3 class="text-sm font-semibold text-theme">Your Wallets ({wallets.length})</h3>
        </div>

        <!-- Wallet List -->
        <div class="max-h-80 overflow-y-auto">
          {#each wallets as wallet}
            {@const isActive = wallet.address === activeAddress}
            <button
              on:click={() => handleSwitchWallet(wallet.address)}
              class="w-full px-4 py-3 flex items-start gap-3 hover:bg-surface-hover transition-colors text-left"
              class:bg-surface-secondary={isActive}
              class:ring-1={isActive}
              class:ring-voi-400={isActive}
            >
              <span class="text-2xl mt-0.5">{getOriginBadge(wallet.origin)}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium text-theme truncate">
                    {wallet.nickname || 'Wallet'}
                  </p>
                  {#if isActive}
                    <span class="px-1.5 py-0.5 text-xs bg-voi-600 text-white rounded">Active</span>
                  {/if}
                  {#if wallet.isPasswordless}
                    <span class="text-xs text-amber-400">🔓</span>
                  {/if}
                </div>
                <p class="text-xs text-theme-text opacity-70 font-mono truncate">{wallet.address}</p>
                <p class="text-xs text-theme-text opacity-50 mt-1">
                  Last used: {new Date(wallet.lastUsed).toLocaleDateString()}
                </p>
              </div>
            </button>
          {/each}
        </div>

        <!-- Actions -->
        <div class="border-t border-surface-border p-2 space-y-1">
          <button
            on:click={handleAddWallet}
            class="w-full px-3 py-2 flex items-center gap-2 text-sm text-theme hover:bg-surface-hover rounded-lg transition-colors"
          >
            <Plus class="w-4 h-4 text-voi-400" />
            <span>Add New Account</span>
          </button>
          <button
            on:click={handleManageWallets}
            class="w-full px-3 py-2 flex items-center gap-2 text-sm text-theme hover:bg-surface-hover rounded-lg transition-colors"
          >
            <Settings class="w-4 h-4 text-theme-text opacity-70" />
            <span>Manage Accounts</span>
          </button>
        </div>
      </div>
    {/if}
</div>

<style>
  /* Ensure dropdown is above other elements */
  .wallet-switcher {
    position: relative;
    z-index: 40;
  }
</style>
