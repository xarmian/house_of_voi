<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { walletStore } from '$lib/stores/wallet';
  import { walletService } from '$lib/services/wallet';
  import WalletOnboardingWizard from './onboarding/WalletOnboardingWizard.svelte';

  export let isOpen = false;

  const dispatch = createEventDispatcher<{
    close: void;
    walletReady: void;
  }>();

  // Loading and error states
  let isLoading = false;
  let error = '';

  // Wallet creation state
  let pendingWalletPassword = '';
  let generatedMnemonic = '';

  // Wizard reference
  let wizard: WalletOnboardingWizard;

  // Determine initial wizard flow
  let initialFlow: 'choose' | 'unlock' = 'choose';
  let showLegacyMigrationModal = false;

  // Subscribe to wallet store
  $: wallet = $walletStore;

  // When modal opens, determine which flow to show
  $: if (isOpen && !showLegacyMigrationModal) {
    handleOpenFlow();
  }

  async function handleOpenFlow() {
    if (wallet.isConnected) {
      // Already connected, close modal
      handleClose();
    } else if (wallet.isGuest) {
      // Guest mode, check if existing wallet exists
      if (walletService.hasStoredWallet()) {
        if (walletService.isLegacyWallet()) {
          showLegacyMigrationModal = true;
        } else {
          initialFlow = 'unlock';
        }
      } else {
        initialFlow = 'choose';
      }
    } else if (wallet.isLocked) {
      // Wallet exists but locked
      if (walletService.isLegacyWallet()) {
        showLegacyMigrationModal = true;
      } else {
        initialFlow = 'unlock';
      }
    }
  }

  // Wizard event handlers
  async function handleUnlock(event: CustomEvent<{ password: string }>) {
    const { password } = event.detail;
    if (wizard) wizard.setLoading(true);
    error = '';

    try {
      await walletStore.unlock(password);

      if ($walletStore.account) {
        if (wizard) {
          wizard.setWalletAddress($walletStore.account.address);
          wizard.completeFlow();
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to unlock wallet';
      if (wizard) wizard.setError(errorMsg);
    } finally {
      if (wizard) wizard.setLoading(false);
    }
  }

  async function handleCreateWallet(event: CustomEvent<{ password: string }>) {
    const { password } = event.detail;
    if (wizard) wizard.setLoading(true);
    error = '';

    try {
      // Generate wallet but don't store it yet
      const account = await walletService.generateWallet();

      // Save the password and mnemonic for later
      pendingWalletPassword = password;
      generatedMnemonic = account.mnemonic;

      // Pass mnemonic to wizard to show backup step
      if (wizard) wizard.setMnemonic(account.mnemonic);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate wallet';
      if (wizard) wizard.setError(errorMsg);
    } finally {
      if (wizard) wizard.setLoading(false);
    }
  }

  async function handleConfirmMnemonicBackup() {
    if (wizard) wizard.setLoading(true);
    error = '';

    try {
      // Import the wallet from mnemonic (to recreate the account)
      const account = await walletService.importWallet(generatedMnemonic);

      // Clear existing wallet first
      walletService.clearWallet();

      // Store the wallet with password and origin as 'generated' (not 'imported')
      await walletService.storeWallet(account, pendingWalletPassword, { origin: 'generated' });

      // Now unlock it to populate the wallet store
      await walletStore.unlock(pendingWalletPassword);

      // Clear sensitive data
      pendingWalletPassword = '';
      generatedMnemonic = '';

      if ($walletStore.account && wizard) {
        wizard.setWalletAddress($walletStore.account.address);
        wizard.completeFlow();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create wallet';
      if (wizard) wizard.setError(errorMsg);
    } finally {
      if (wizard) wizard.setLoading(false);
    }
  }

  async function handleImportWallet(event: CustomEvent<{ mnemonic: string; password: string }>) {
    const { mnemonic, password } = event.detail;
    if (wizard) wizard.setLoading(true);
    error = '';

    try {
      await walletStore.importWallet(mnemonic, password);

      if ($walletStore.account && wizard) {
        wizard.setWalletAddress($walletStore.account.address);
        wizard.completeFlow();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to import wallet';
      if (wizard) wizard.setError(errorMsg);
    } finally {
      if (wizard) wizard.setLoading(false);
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
          await walletService.storeWallet(account, password, { origin: account.origin });
          await walletStore.unlock(password);
          showLegacyMigrationModal = false;

          if ($walletStore.account && wizard) {
            wizard.setWalletAddress($walletStore.account.address);
            wizard.completeFlow();
          } else {
            dispatch('walletReady');
          }
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
    initialFlow = 'choose';
  }

  async function handleCDPLogin(event: CustomEvent<{ email: string; otpCode: string }>) {
    const { email, otpCode } = event.detail;
    if (wizard) wizard.setLoading(true);
    error = '';

    try {
      // Use the wallet store flow so CDP metadata stays in sync
      await walletStore.loginWithCDP(email, otpCode);
      // Wizard will automatically proceed to CDP password step
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to authenticate with email';
      if (wizard) wizard.setError(errorMsg);
    } finally {
      if (wizard) wizard.setLoading(false);
    }
  }

  async function handleCDPPasswordSet(event: CustomEvent<{ password: string | null }>) {
    const { password } = event.detail;
    if (wizard) wizard.setLoading(true);
    error = '';

    try {
      if (password) {
        await walletStore.changePassword(password);
      }

      if ($walletStore.account && wizard) {
        wizard.setWalletAddress($walletStore.account.address);
        // Wizard will automatically complete
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to set password';
      if (wizard) wizard.setError(errorMsg);
    } finally {
      if (wizard) wizard.setLoading(false);
    }
  }

  // Handle modal close
  function handleClose() {
    isOpen = false;
    showLegacyMigrationModal = false;
    error = '';
    dispatch('close');
  }

  function handleWalletReady() {
    dispatch('walletReady');
  }

  function handleAbandonWallet() {
    // Clear the existing wallet
    walletService.clearWallet();

    // Reset wallet store to guest mode
    walletStore.resetWallet();

    error = '';
  }
</script>

<!-- New Wizard-based Gateway -->
{#if isOpen && !showLegacyMigrationModal}
  <WalletOnboardingWizard
    bind:this={wizard}
    bind:isOpen
    {initialFlow}
    on:close={handleClose}
    on:walletReady={handleWalletReady}
    on:unlock={handleUnlock}
    on:createWallet={handleCreateWallet}
    on:confirmMnemonicBackup={handleConfirmMnemonicBackup}
    on:importWallet={handleImportWallet}
    on:cdpLogin={handleCDPLogin}
    on:cdpPasswordSet={handleCDPPasswordSet}
    on:abandon={handleAbandonWallet}
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
            on:click={handleClose}
            disabled={isLoading}
            class="px-4 py-2 text-slate-300 hover:text-theme transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  {/if}

