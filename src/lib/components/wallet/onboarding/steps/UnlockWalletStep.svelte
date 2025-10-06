<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { walletService } from '$lib/services/wallet';
  import { algorandService } from '$lib/services/algorand';
  import { balanceManager } from '$lib/services/balanceManager';
  import type { WalletOrigin } from '$lib/types/wallet';
  import { Trash2 } from 'lucide-svelte';

  export let isLoading = false;

  const dispatch = createEventDispatcher<{
    submit: { password: string };
    cancel: void;
    abandon: void;
  }>();

  let password = '';
  let showPassword = false;
  let showAbandonConfirm = false;

  // Wallet info state
  let walletInfo: {
    address: string;
    createdAt: number;
    lastUsed: number;
    origin?: WalletOrigin;
    isPasswordless?: boolean;
  } | null = null;
  let walletBalance: number | null = null;
  let loadingBalance = false;

  const formatVOI = (amount: number) => {
    return (amount / 1_000_000).toFixed(6);
  };

  async function loadWalletInfo() {
    walletInfo = walletService.getPublicWalletData();

    if (walletInfo?.address && algorandService) {
      loadingBalance = true;
      try {
        walletBalance = await balanceManager.getBalance(walletInfo.address);
      } catch (err) {
        console.error('Failed to load wallet balance:', err);
        walletBalance = null;
      } finally {
        loadingBalance = false;
      }
    }
  }

  function handleSubmit() {
    dispatch('submit', { password });
  }

  function handleAbandonWallet() {
    if (showAbandonConfirm) {
      dispatch('abandon');
      showAbandonConfirm = false;
    } else {
      showAbandonConfirm = true;
    }
  }

  function cancelAbandon() {
    showAbandonConfirm = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleSubmit();
    }
  }

  function formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  onMount(() => {
    loadWalletInfo();
  });
</script>

<div class="px-6 py-6 space-y-6">
  <p class="text-slate-300 text-sm">
    Enter your password to access your account
  </p>

  <!-- Account Information -->
  {#if walletInfo}
    <div class="p-4 bg-slate-700/50 border border-slate-600 rounded-lg space-y-3">
      <h3 class="text-sm font-medium text-slate-300 mb-2">Account Information</h3>

      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-slate-400">Address:</span>
          <span class="text-theme font-mono">{formatAddress(walletInfo.address)}</span>
        </div>

        <div class="flex justify-between">
          <span class="text-slate-400">Balance:</span>
          <span class="text-theme">
            {#if loadingBalance}
              <span class="text-slate-400">Loading...</span>
            {:else if walletBalance !== null}
              {formatVOI(walletBalance)} VOI
            {:else}
              <span class="text-slate-400">Unable to load</span>
            {/if}
          </span>
        </div>

        <div class="flex justify-between">
          <span class="text-slate-400">Created:</span>
          <span class="text-theme">{formatDate(walletInfo.createdAt)}</span>
        </div>

        <div class="flex justify-between">
          <span class="text-slate-400">Last Used:</span>
          <span class="text-theme">{formatDate(walletInfo.lastUsed)}</span>
        </div>
      </div>
    </div>
  {/if}

  <div class="space-y-2">
    <label for="unlock-password" class="block text-sm font-medium text-slate-300">
      Password {#if walletInfo?.isPasswordless}<span class="text-slate-500">(leave empty for no password)</span>{/if}
    </label>
    <div class="relative">
      <input
        id="unlock-password"
        type={showPassword ? 'text' : 'password'}
        bind:value={password}
        on:keydown={handleKeydown}
        disabled={isLoading}
        placeholder={walletInfo?.isPasswordless ? 'Leave empty for no password' : 'Enter your password'}
        class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        autocomplete="off"
      />
      <button
        type="button"
        on:click={() => showPassword = !showPassword}
        disabled={isLoading}
        class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 disabled:opacity-50"
      >
        {#if showPassword}
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.5 6.5m3.378 3.378a3 3 0 004.243 4.243M21.5 6.5l-15 15" />
          </svg>
        {:else}
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7-1.275 4.057-5.065 7-9.543 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        {/if}
      </button>
    </div>
  </div>

  <!-- Abandon Account Option -->
  {#if !showAbandonConfirm}
    <div class="pt-2 border-t border-slate-600">
      <button
        type="button"
        on:click={handleAbandonWallet}
        disabled={isLoading}
        class="flex items-center gap-2 text-sm text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
      >
        <Trash2 class="w-4 h-4" />
        Create new account instead
      </button>
    </div>
  {:else}
    <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
      <p class="text-red-400 text-sm font-medium mb-2">⚠️ Warning</p>
      <p class="text-red-300 text-sm mb-3">
        This will permanently delete your current account from this device. Make sure you have your backup code saved!
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          on:click={handleAbandonWallet}
          disabled={isLoading}
          class="px-3 py-1 bg-red-600 hover:bg-red-700 text-theme text-sm rounded transition-colors disabled:opacity-50"
        >
          Delete & Create New
        </button>
        <button
          type="button"
          on:click={cancelAbandon}
          disabled={isLoading}
          class="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-theme text-sm rounded transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  {/if}

  <div class="flex justify-end pt-4">
    <button
      type="button"
      on:click={handleSubmit}
      disabled={isLoading}
      class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-theme rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
    >
      {#if isLoading}
        <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      {/if}
      <span>Unlock</span>
    </button>
  </div>
</div>
