<script lang="ts">
  import { walletStore } from '$lib/stores/wallet';
  import { balanceManager } from '$lib/services/balanceManager';
  import { createEventDispatcher, onMount } from 'svelte';
  import {
    X,
    Plus,
    Trash2,
    Edit,
    Eye,
    EyeOff,
    Copy,
    Check,
    ExternalLink,
    LogOut,
    Unlock
  } from 'lucide-svelte';
  import type { WalletMetadata } from '$lib/types/wallet';

  export let isOpen = false;

  const dispatch = createEventDispatcher<{
    close: void;
    addWallet: void;
    switchWallet: { address: string };
  }>();

  let wallets: WalletMetadata[] = [];
  let walletBalances: Record<string, number> = {};
  let isLoadingBalances = false;
  let editingNickname: string | null = null;
  let nicknameInput = '';
  let copiedAddress: string | null = null;
  let removingWallet: string | null = null;
  let passwordPrompt: { address: string; action: 'switch' | 'remove' } | null = null;
  let password = '';
  let passwordError = '';

  $: if (isOpen) {
    loadWallets();
  }

  $: activeAddress = $walletStore.activeWalletAddress;

  async function loadWallets() {
    wallets = walletStore.getAvailableWallets();
    await loadBalances();
  }

  async function loadBalances() {
    isLoadingBalances = true;
    for (const wallet of wallets) {
      try {
        const balance = await balanceManager.getBalance(wallet.address);
        walletBalances[wallet.address] = balance;
      } catch (error) {
        console.error(`Failed to load balance for ${wallet.address}:`, error);
        walletBalances[wallet.address] = 0;
      }
    }
    isLoadingBalances = false;
  }

  function getOriginLabel(origin: string): string {
    switch (origin) {
      case 'cdp':
        return 'Email Login';
      case 'imported':
        return 'Imported Mnemonic';
      case 'generated':
        return 'Self Custody';
      case 'legacy':
        return 'Self Custody';
      default:
        return 'Self Custody';
    }
  }

  function getOriginBadge(origin: string): string {
    switch (origin) {
      case 'cdp':
        return '📧';
      case 'imported':
        return '📥';
      case 'generated':
        return '🔑';
      case 'legacy':
        return '🔑';
      default:
        return '🔑';
    }
  }

  function getOriginColor(origin: string): string {
    switch (origin) {
      case 'cdp':
        return 'bg-blue-900/30 text-blue-400 border-blue-500/30';
      case 'imported':
        return 'bg-purple-900/30 text-purple-400 border-purple-500/30';
      case 'generated':
        return 'bg-green-900/30 text-green-400 border-green-500/30';
      case 'legacy':
        return 'bg-green-900/30 text-green-400 border-green-500/30';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  }

  async function handleSwitchWallet(wallet: WalletMetadata) {
    // Check if password is needed
    if (!wallet.isPasswordless && wallet.address !== activeAddress) {
      passwordPrompt = { address: wallet.address, action: 'switch' };
      return;
    }

    try {
      await walletStore.switchWallet(wallet.address, '');
      handleClose();
    } catch (error) {
      console.error('Failed to switch wallet:', error);
    }
  }

  async function handlePasswordSubmit() {
    if (!passwordPrompt) return;

    passwordError = '';

    try {
      if (passwordPrompt.action === 'switch') {
        await walletStore.switchWallet(passwordPrompt.address, password);
        handleClose();
      } else if (passwordPrompt.action === 'remove') {
        // For remove, we just need to verify password first (would need to unlock to verify)
        // For now, we'll just remove it
        await walletStore.removeWallet(passwordPrompt.address);
        loadWallets();
      }

      passwordPrompt = null;
      password = '';
    } catch (error) {
      passwordError = error instanceof Error ? error.message : 'Invalid password';
    }
  }

  function cancelPasswordPrompt() {
    passwordPrompt = null;
    password = '';
    passwordError = '';
  }

  async function handleRemoveWallet(address: string) {
    const wallet = wallets.find(w => w.address === address);
    if (!wallet) return;

    const confirmed = confirm(
      `Are you sure you want to remove "${wallet.nickname || wallet.address.slice(0, 8)}"?\n\nMake sure you have your recovery phrase saved!`
    );

    if (!confirmed) return;

    try {
      await walletStore.removeWallet(address);
      loadWallets();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to remove wallet');
    }
  }

  function startEditNickname(wallet: WalletMetadata) {
    editingNickname = wallet.address;
    nicknameInput = wallet.nickname || '';
  }

  async function saveNickname(address: string) {
    try {
      await walletStore.renameWallet(address, nicknameInput.trim());
      editingNickname = null;
      loadWallets();
    } catch (error) {
      console.error('Failed to rename wallet:', error);
    }
  }

  function cancelEdit() {
    editingNickname = null;
    nicknameInput = '';
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      copiedAddress = address;
      setTimeout(() => (copiedAddress = null), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  }

  function handleClose() {
    isOpen = false;
    dispatch('close');
  }

  function handleAddWallet() {
    dispatch('addWallet');
    handleClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    on:click={handleBackdropClick}
    role="dialog"
    aria-modal="true"
  >
    <div
      class="bg-surface-primary rounded-xl border border-surface-border shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
    >
      <!-- Header -->
      <div class="px-6 py-4 border-b border-surface-border flex items-center justify-between">
        <h2 class="text-xl font-bold text-theme">Manage Accounts</h2>
        <button
          on:click={handleClose}
          class="p-2 text-theme-text opacity-70 hover:opacity-100 transition-colors rounded-lg hover:bg-surface-hover"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Password Prompt Modal -->
      {#if passwordPrompt}
        <div
          class="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl"
        >
          <div class="bg-surface-secondary rounded-lg border border-surface-border shadow-xl p-6 max-w-md">
            <h3 class="text-lg font-semibold text-theme mb-4">Enter Password</h3>
            <p class="text-sm text-theme-text mb-4">
              This wallet is password-protected. Please enter the password to continue.
            </p>

            <input
              type="password"
              bind:value={password}
              on:keydown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              placeholder="Enter password"
              class="w-full px-4 py-3 bg-surface-tertiary border border-surface-border rounded-lg text-theme placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-voi-500 mb-2"
              autofocus
            />

            {#if passwordError}
              <p class="text-red-400 text-sm mb-4">{passwordError}</p>
            {/if}

            <div class="flex gap-3">
              <button
                on:click={cancelPasswordPrompt}
                class="flex-1 px-4 py-2 bg-surface-tertiary hover:bg-surface-hover text-theme rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                on:click={handlePasswordSubmit}
                class="flex-1 px-4 py-2 bg-voi-600 hover:bg-voi-700 text-white rounded-lg transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- Wallet List -->
      <div class="flex-1 overflow-y-auto p-6 space-y-3">
        {#each wallets as wallet}
          {@const isActive = wallet.address === activeAddress}
          {@const balance = walletBalances[wallet.address] || 0}
          {@const isEditing = editingNickname === wallet.address}

          <div
            class="bg-surface-secondary/50 rounded-lg border p-4 transition-all hover:bg-surface-secondary {isActive ? 'border-voi-400' : 'border-surface-border'}"
          >
            <div class="flex items-start justify-between gap-4">
              <!-- Left: Wallet Info -->
              <div class="flex-1 min-w-0">
                <!-- Name and Type -->
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-xl">{getOriginBadge(wallet.origin)}</span>
                  {#if isEditing}
                    <input
                      type="text"
                      bind:value={nicknameInput}
                      on:keydown={(e) => e.key === 'Enter' && saveNickname(wallet.address)}
                      placeholder="Enter wallet name"
                      class="flex-1 px-2 py-1 bg-surface-tertiary border border-surface-border rounded text-sm text-theme focus:outline-none focus:border-voi-500"
                      autofocus
                    />
                    <button
                      on:click={() => saveNickname(wallet.address)}
                      class="p-1 text-green-400 hover:text-green-300"
                    >
                      <Check class="w-4 h-4" />
                    </button>
                    <button on:click={cancelEdit} class="p-1 text-theme-text opacity-70 hover:opacity-100">
                      <X class="w-4 h-4" />
                    </button>
                  {:else}
                    <h3 class="text-sm font-semibold text-theme truncate">
                      {wallet.nickname || 'Unnamed Wallet'}
                    </h3>
                    <button
                      on:click={() => startEditNickname(wallet)}
                      class="p-1 text-theme-text opacity-50 hover:text-voi-400 hover:opacity-100 transition-colors"
                      title="Edit name"
                    >
                      <Edit class="w-3 h-3" />
                    </button>
                  {/if}
                </div>

                <!-- Address -->
                <div class="flex items-center gap-1.5 mb-2">
                  <p class="text-xs font-mono text-theme-text opacity-70 truncate">{wallet.address}</p>
                  <button
                    on:click={() => copyAddress(wallet.address)}
                    class="p-1 text-theme-text opacity-50 hover:text-voi-400 hover:opacity-100 transition-colors flex-shrink-0"
                    title="Copy"
                  >
                    {#if copiedAddress === wallet.address}
                      <Check class="w-3 h-3 text-green-400" />
                    {:else}
                      <Copy class="w-3 h-3" />
                    {/if}
                  </button>
                  <a
                    href="https://voirewards.com/wallet/{wallet.address}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="p-1 text-theme-text opacity-50 hover:text-voi-400 hover:opacity-100 transition-colors flex-shrink-0"
                    title="Explorer"
                  >
                    <ExternalLink class="w-3 h-3" />
                  </a>
                </div>

                <!-- Tags/Badges -->
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-xs px-2 py-0.5 rounded border {getOriginColor(wallet.origin)}">
                    {getOriginLabel(wallet.origin)}
                  </span>
                  {#if isActive}
                    <span class="text-xs px-2 py-0.5 bg-voi-600 text-white rounded font-medium">
                      Active
                    </span>
                  {/if}
                  {#if wallet.isPasswordless}
                    <span class="text-xs px-2 py-0.5 bg-amber-900/30 text-amber-400 rounded border border-amber-500/30">
                      🔓
                    </span>
                  {/if}
                  <span class="text-xs text-theme-text opacity-50">
                    • {new Date(wallet.lastUsed).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <!-- Right: Balance and Actions -->
              <div class="flex flex-col items-end gap-2 flex-shrink-0">
                <!-- Balance -->
                <div class="text-right">
                  <div class="text-lg font-bold text-voi-400">
                    {(balance / 1_000_000).toFixed(2)}
                  </div>
                  <div class="text-xs text-theme-text opacity-50">VOI</div>
                </div>

                <!-- Actions -->
                <div class="flex gap-1.5">
                  {#if !isActive}
                    <button
                      on:click={() => handleSwitchWallet(wallet)}
                      class="px-3 py-1.5 bg-voi-600 hover:bg-voi-700 text-white text-xs rounded transition-colors font-medium"
                      title="Switch to this account"
                    >
                      Switch
                    </button>
                  {/if}
                  <button
                    on:click={() => handleRemoveWallet(wallet.address)}
                    class="p-1.5 text-red-400 hover:text-red-300 transition-colors"
                    title="Remove"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/each}

        <!-- Add New Wallet Button -->
        <button
          on:click={handleAddWallet}
          class="w-full px-4 py-4 bg-surface-secondary/50 hover:bg-surface-secondary border-2 border-dashed border-surface-border hover:border-voi-400 rounded-lg transition-all flex items-center justify-center gap-3"
        >
          <Plus class="w-5 h-5 text-voi-400" />
          <span class="text-theme font-medium">Add New Account</span>
        </button>
      </div>
    </div>
  </div>
{/if}
