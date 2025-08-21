<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { walletService } from '$lib/services/wallet';
  import { algorandService } from '$lib/services/algorand';
  import { formatVOI } from '$lib/constants/betting';
  import { Trash2 } from 'lucide-svelte';

  export let isOpen = false;
  export let title = 'Enter Wallet Password';
  export let message = 'Please enter your wallet password to continue.';
  export let isLoading = false;
  export let error = '';

  const dispatch = createEventDispatcher<{
    confirm: { password: string };
    cancel: void;
    abandon: void;
  }>();

  let password = '';
  let showPassword = false;
  let showAbandonConfirm = false;
  
  // Wallet info state
  let walletInfo: { address: string; createdAt: number; lastUsed: number; isPasswordless?: boolean } | null = null;
  let walletBalance: number | null = null;
  let loadingBalance = false;

  async function loadWalletInfo() {
    walletInfo = walletService.getPublicWalletData();
    
    if (walletInfo?.address && algorandService) {
      loadingBalance = true;
      try {
        walletBalance = await algorandService.getBalance(walletInfo.address);
      } catch (err) {
        console.error('Failed to load wallet balance:', err);
        walletBalance = null;
      } finally {
        loadingBalance = false;
      }
    }
  }

  function handleSubmit() {
    // Allow both empty and non-empty passwords
    dispatch('confirm', { password: password });
  }

  function handleCancel() {
    password = '';
    error = '';
    showAbandonConfirm = false;
    dispatch('cancel');
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
    } else if (event.key === 'Escape') {
      handleCancel();
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

  // Load wallet info when modal opens
  $: if (isOpen) {
    loadWalletInfo();
  }

  // Clear form when modal closes
  $: if (!isOpen) {
    password = '';
    error = '';
    showAbandonConfirm = false;
    walletInfo = null;
    walletBalance = null;
  }
</script>

{#if isOpen}
  <!-- Modal backdrop -->
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <!-- Modal content -->
    <div class="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl max-w-md w-full">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-700">
        <h2 class="text-xl font-bold text-theme">{title}</h2>
        <p class="text-slate-300 text-sm mt-1">{message}</p>
      </div>

      <!-- Body -->
      <div class="px-6 py-4 space-y-4">
        {#if error}
          <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
            <p class="text-red-400 text-sm">{error}</p>
          </div>
        {/if}

        <!-- Wallet Information -->
        {#if walletInfo}
          <div class="p-4 bg-slate-700/50 border border-slate-600 rounded-lg space-y-3">
            <h3 class="text-sm font-medium text-slate-300 mb-2">Wallet Information</h3>
            
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
          <label for="wallet-password" class="block text-sm font-medium text-slate-300">
            Password {#if walletInfo?.isPasswordless}<span class="text-slate-500">(leave empty for passwordless wallet)</span>{/if}
          </label>
          <div class="relative">
            <input
              id="wallet-password"
              type={showPassword ? 'text' : 'password'}
              bind:value={password}
              disabled={isLoading}
              placeholder={walletInfo?.isPasswordless ? "Leave empty for passwordless wallet" : "Enter your wallet password"}
              class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              on:keydown={handleKeydown}
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
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.5 6.5m3.378 3.378a3 3 0 004.243 4.243M21.5 6.5l-15 15"></path>
                </svg>
              {:else}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7-1.275 4.057-5.065 7-9.543 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
              {/if}
            </button>
          </div>
        </div>

        <!-- Abandon Wallet Option -->
        {#if !showAbandonConfirm}
          <div class="pt-2 border-t border-slate-600">
            <button
              type="button"
              on:click={handleAbandonWallet}
              disabled={isLoading}
              class="flex items-center gap-2 text-sm text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              <Trash2 class="w-4 h-4" />
              Create new wallet instead
            </button>
          </div>
        {:else}
          <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
            <p class="text-red-400 text-sm font-medium mb-2">⚠️ Warning</p>
            <p class="text-red-300 text-sm mb-3">
              This will permanently delete your current wallet. Make sure you have your recovery phrase saved!
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
                class="px-3 py-1 bg-slate-600 hover:bg-slate-700 text-theme text-sm rounded transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-slate-700 flex justify-end space-x-3">
        <button
          type="button"
          on:click={handleCancel}
          disabled={isLoading}
          class="px-4 py-2 text-slate-300 hover:text-theme transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={handleSubmit}
          disabled={isLoading}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-theme rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {#if isLoading}
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          {/if}
          <span>Unlock</span>
        </button>
      </div>
    </div>
  </div>
{/if}