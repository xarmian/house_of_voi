<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { walletStore } from '$lib/stores/wallet';
  import { walletService } from '$lib/services/wallet';
  import WalletPasswordModal from './WalletPasswordModal.svelte';
  import WalletSetupModal from './WalletSetupModal.svelte';
  import AddFundsModal from './AddFundsModal.svelte';

  export let isOpen = false;
  export let showAddFundsAfterUnlock = true;

  const dispatch = createEventDispatcher<{
    close: void;
    walletReady: void;
  }>();

  // Modal states
  let showPasswordModal = false;
  let showSetupModal = false;
  let showAddFundsModal = false;
  let showLegacyMigrationModal = false;

  // Loading and error states
  let isLoading = false;
  let error = '';

  // Subscribe to wallet store
  $: wallet = $walletStore;

  // When modal opens, determine which flow to show
  $: if (isOpen && !showPasswordModal && !showSetupModal && !showAddFundsModal && !showLegacyMigrationModal) {
    handleOpenFlow();
  }

  async function handleOpenFlow() {
    if (wallet.isConnected) {
      // Already connected, show Add Funds directly
      showAddFundsModal = true;
    } else if (wallet.isGuest) {
      // Guest mode, check if existing wallet exists
      if (walletService.hasStoredWallet()) {
        if (walletService.isLegacyWallet()) {
          showLegacyMigrationModal = true;
        } else {
          showPasswordModal = true;
        }
      } else {
        showSetupModal = true;
      }
    } else if (wallet.isLocked) {
      // Wallet exists but locked
      if (walletService.isLegacyWallet()) {
        showLegacyMigrationModal = true;
      } else {
        showPasswordModal = true;
      }
    }
  }

  // Handle password unlock
  async function handlePasswordUnlock(event: CustomEvent<{ password: string }>) {
    const { password } = event.detail;
    isLoading = true;
    error = '';

    try {
      await walletStore.unlock(password);
      showPasswordModal = false;
      if (showAddFundsAfterUnlock) {
        showAddFundsModal = true; // Show Add Funds directly after unlock
      } else {
        handleClose(); // Just close the modal
      }
      dispatch('walletReady');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to unlock wallet';
    } finally {
      isLoading = false;
    }
  }

  // Handle abandon wallet
  function handleAbandonWallet() {
    // Clear the existing wallet
    walletService.clearWallet();
    
    // Reset wallet store to guest mode
    walletStore.resetWallet();
    
    // Close password modal and show setup modal for new wallet
    showPasswordModal = false;
    showSetupModal = true;
    
    error = '';
  }

  // Handle wallet creation
  async function handleCreateWallet(event: CustomEvent<{ password: string }>) {
    const { password } = event.detail;
    isLoading = true;
    error = '';

    try {
      await walletStore.createWallet(password);
      showSetupModal = false;
      showAddFundsModal = true; // Show Add Funds directly after creation
      dispatch('walletReady');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create wallet';
    } finally {
      isLoading = false;
    }
  }

  // Handle wallet import
  async function handleImportWallet(event: CustomEvent<{ mnemonic: string; password: string }>) {
    const { mnemonic, password } = event.detail;
    isLoading = true;
    error = '';

    try {
      await walletStore.importWallet(mnemonic, password);
      showSetupModal = false;
      showAddFundsModal = true; // Show Add Funds directly after import
      dispatch('walletReady');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to import wallet';
    } finally {
      isLoading = false;
    }
  }

  // Handle legacy wallet recovery
  async function handleLegacyRecover() {
    isLoading = true;
    error = '';

    try {
      const account = await walletService.recoverWallet();
      if (account) {
        // Successfully recovered legacy wallet, now prompt to set password
        const password = prompt('Your wallet was recovered! Please set a new password to secure it:');
        if (password && password.length >= 4) {
          await walletService.storeWallet(account, password);
          await walletStore.unlock(password);
          showLegacyMigrationModal = false;
          showAddFundsModal = true; // Show Add Funds directly after recovery
          dispatch('walletReady');
        } else {
          error = 'Password must be at least 4 characters';
        }
      } else {
        error = 'Failed to recover wallet. Please use your backup recovery phrase.';
      }
    } catch (err) {
      error = 'Failed to recover wallet. Please use your backup recovery phrase.';
    } finally {
      isLoading = false;
    }
  }

  // Handle legacy wallet manual recovery
  function handleLegacyManualRecover() {
    showLegacyMigrationModal = false;
    showSetupModal = true;
  }

  // Handle modal close
  function handleClose() {
    isOpen = false;
    showPasswordModal = false;
    showSetupModal = false;
    showAddFundsModal = false;
    showLegacyMigrationModal = false;
    error = '';
    dispatch('close');
  }

  // Handle sub-modal cancellations
  function handleCancel() {
    // If user cancels from setup/password, close entire gateway
    handleClose();
  }
</script>

<!-- Gateway wrapper - only shows background when any modal is open -->
{#if isOpen && (showPasswordModal || showSetupModal || showAddFundsModal || showLegacyMigrationModal)}
  <!-- Password input modal -->
  <WalletPasswordModal
    bind:isOpen={showPasswordModal}
    {isLoading}
    {error}
    on:confirm={handlePasswordUnlock}
    on:cancel={handleCancel}
    on:abandon={handleAbandonWallet}
  />

  <!-- Wallet setup modal -->
  <WalletSetupModal
    bind:isOpen={showSetupModal}
    {isLoading}
    {error}
    on:createWallet={handleCreateWallet}
    on:importWallet={handleImportWallet}
    on:cancel={handleCancel}
  />

  <!-- Add Funds modal (when connected) -->
  {#if showAddFundsModal && $walletStore.account}
    <AddFundsModal
      address={$walletStore.account.address}
      on:close={handleClose}
    />
  {/if}

  <!-- Legacy wallet migration modal -->
  {#if showLegacyMigrationModal}
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl max-w-md w-full">
        <div class="px-6 py-4 border-b border-slate-700">
          <h2 class="text-xl font-bold text-theme">Wallet Recovery</h2>
          <p class="text-slate-300 text-sm mt-1">Your wallet needs to be updated for better security</p>
        </div>

        <div class="px-6 py-4 space-y-4">
          {#if error}
            <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p class="text-red-400 text-sm">{error}</p>
            </div>
          {/if}

          <div class="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <h3 class="text-blue-400 font-medium mb-2">🔄 Wallet Update Required</h3>
            <p class="text-blue-300 text-sm">
              We've improved wallet security. Your wallet can be automatically recovered, or you can import it manually using your recovery phrase.
            </p>
          </div>

          <div class="space-y-3">
            <button
              type="button"
              on:click={handleLegacyRecover}
              disabled={isLoading}
              class="w-full p-3 bg-green-600 hover:bg-green-700 text-theme rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {#if isLoading}
                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              {/if}
              <span>Auto-Recover Wallet</span>
            </button>

            <button
              type="button"
              on:click={handleLegacyManualRecover}
              disabled={isLoading}
              class="w-full p-3 bg-slate-600 hover:bg-slate-500 text-theme rounded-lg transition-colors disabled:opacity-50"
            >
              Import Using Recovery Phrase
            </button>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-slate-700 flex justify-end">
          <button
            type="button"
            on:click={handleCancel}
            disabled={isLoading}
            class="px-4 py-2 text-slate-300 hover:text-theme transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}