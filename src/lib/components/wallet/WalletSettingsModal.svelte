<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { walletStore } from '$lib/stores/wallet';
  import { Send, Download, Upload, RotateCcw, X, AlertTriangle, Settings, Key } from 'lucide-svelte';
  import ExportWalletModal from './ExportWalletModal.svelte';
  import ImportWalletModal from './ImportWalletModal.svelte';
  import TransferTokensModal from './TransferTokensModal.svelte';
  
  const dispatch = createEventDispatcher();
  
  let showExportWallet = false;
  let showImportWallet = false;
  let showTransferTokens = false;
  let showChangePassword = false;
  let showResetConfirmation = false;
  let resetConfirmationText = '';
  let isResetting = false;
  let isChangingPassword = false;
  let newPassword = '';
  let confirmPassword = '';
  let showPassword = false;
  let passwordChangeError = '';
  
  function closeModal() {
    dispatch('close');
  }
  
  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }
  
  function openExportWallet() {
    showExportWallet = true;
  }
  
  function openImportWallet() {
    showImportWallet = true;
  }
  
  function openTransferTokens() {
    showTransferTokens = true;
  }
  
  function openChangePassword() {
    showChangePassword = true;
  }
  
  function openResetConfirmation() {
    showResetConfirmation = true;
    resetConfirmationText = '';
  }
  
  async function confirmReset() {
    if (resetConfirmationText !== 'RESET MY WALLET') {
      return;
    }
    
    isResetting = true;
    try {
      await walletStore.resetWallet();
      dispatch('walletChanged');
    } catch (error) {
      console.error('Failed to reset wallet:', error);
    } finally {
      isResetting = false;
      showResetConfirmation = false;
    }
  }
  
  function handleWalletImported() {
    showImportWallet = false;
    dispatch('walletChanged');
  }
  
  async function handlePasswordChange() {
    passwordChangeError = '';
    
    if (newPassword !== confirmPassword) {
      passwordChangeError = 'Passwords do not match';
      return;
    }
    
    if (newPassword.trim() !== '' && newPassword.length < 4) {
      passwordChangeError = 'Password must be at least 4 characters or empty for no password';
      return;
    }
    
    isChangingPassword = true;
    try {
      await walletStore.changePassword(newPassword);
      showChangePassword = false;
      newPassword = '';
      confirmPassword = '';
      passwordChangeError = '';
    } catch (error) {
      console.error('Failed to change password:', error);
      passwordChangeError = error instanceof Error ? error.message : 'Failed to change password';
    } finally {
      isChangingPassword = false;
    }
  }
  
  function cancelPasswordChange() {
    showChangePassword = false;
    newPassword = '';
    confirmPassword = '';
    passwordChangeError = '';
  }
  
  $: canReset = resetConfirmationText === 'RESET MY WALLET' && !isResetting;
</script>

<!-- Modal Overlay -->
<div 
  class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
  on:click={handleOverlayClick}
  role="dialog"
  aria-modal="true"
  aria-labelledby="settings-modal-title"
>
  <div class="card max-w-md w-full max-h-[90vh] overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between p-6 border-b border-slate-700">
      <h2 id="settings-modal-title" class="text-xl font-semibold text-theme flex items-center gap-2">
        <Settings class="w-5 h-5" />
        Wallet Settings
      </h2>
      <button
        on:click={closeModal}
        class="p-1 text-gray-400 hover:text-theme transition-colors"
      >
        <X class="w-5 h-5" />
      </button>
    </div>
    
    <!-- Content -->
    <div class="p-6 space-y-4">
      
      {#if !showResetConfirmation && !showChangePassword}
        <!-- Transfer Tokens -->
        <button
          on:click={openTransferTokens}
          class="w-full p-4 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors text-left"
        >
          <div class="flex items-center gap-3">
            <div class="p-2 bg-blue-600 rounded-lg">
              <Send class="w-5 h-5 text-theme" />
            </div>
            <div>
              <h3 class="font-medium text-theme">Transfer Tokens</h3>
              <p class="text-sm text-gray-400">Send VOI to another wallet</p>
            </div>
          </div>
        </button>
        
        <!-- Export Account -->
        <button
          on:click={openExportWallet}
          class="w-full p-4 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors text-left"
        >
          <div class="flex items-center gap-3">
            <div class="p-2 bg-green-600 rounded-lg">
              <Download class="w-5 h-5 text-theme" />
            </div>
            <div>
              <h3 class="font-medium text-theme">Export Account</h3>
              <p class="text-sm text-gray-400">Backup your wallet keys and recovery phrase</p>
            </div>
          </div>
        </button>
        
        <!-- Import Account -->
        <button
          on:click={openImportWallet}
          class="w-full p-4 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors text-left"
        >
          <div class="flex items-center gap-3">
            <div class="p-2 bg-purple-600 rounded-lg">
              <Upload class="w-5 h-5 text-theme" />
            </div>
            <div>
              <h3 class="font-medium text-theme">Import Account</h3>
              <p class="text-sm text-gray-400">Replace current wallet with existing account</p>
            </div>
          </div>
        </button>
        
        <!-- Change Password -->
        <button
          on:click={openChangePassword}
          class="w-full p-4 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors text-left"
        >
          <div class="flex items-center gap-3">
            <div class="p-2 bg-orange-600 rounded-lg">
              <Key class="w-5 h-5 text-theme" />
            </div>
            <div>
              <h3 class="font-medium text-theme">Change Password</h3>
              <p class="text-sm text-gray-400">Update your wallet password or remove it</p>
            </div>
          </div>
        </button>
        
        <!-- Reset to New Wallet -->
        <button
          on:click={openResetConfirmation}
          class="w-full p-4 bg-red-900/20 hover:bg-red-900/30 border border-red-700/50 rounded-lg transition-colors text-left"
        >
          <div class="flex items-center gap-3">
            <div class="p-2 bg-red-600 rounded-lg">
              <RotateCcw class="w-5 h-5 text-theme" />
            </div>
            <div>
              <h3 class="font-medium text-red-400">Reset to New Wallet</h3>
              <p class="text-sm text-red-300">⚠️ DANGEROUS: Creates a brand new wallet</p>
            </div>
          </div>
        </button>
        
      {:else if showResetConfirmation}
        <!-- Reset Confirmation -->
        <div class="space-y-4">
          <div class="p-4 bg-red-900/30 border border-red-700 rounded-lg">
            <div class="flex items-start gap-3">
              <AlertTriangle class="w-6 h-6 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 class="font-semibold text-red-400 mb-2">⚠️ DANGER ZONE</h3>
                <div class="text-red-300 text-sm space-y-2">
                  <p><strong>This action will PERMANENTLY DELETE your current wallet!</strong></p>
                  <ul class="list-disc list-inside space-y-1">
                    <li>All tokens in this wallet will be LOST FOREVER</li>
                    <li>Your current recovery phrase will be INVALID</li>
                    <li>A completely new wallet will be created</li>
                    <li>This action CANNOT BE UNDONE</li>
                  </ul>
                  <p><strong>Make sure you have transferred all tokens out first!</strong></p>
                </div>
              </div>
            </div>
          </div>
          
          <div class="space-y-3">
            <label for="reset-confirmation" class="block text-sm font-medium text-gray-300">
              Type "RESET MY WALLET" to confirm:
            </label>
            <input
              id="reset-confirmation"
              type="text"
              bind:value={resetConfirmationText}
              placeholder="RESET MY WALLET"
              class="w-full input-field font-mono"
              class:border-red-500={resetConfirmationText && resetConfirmationText !== 'RESET MY WALLET'}
              class:border-green-500={resetConfirmationText === 'RESET MY WALLET'}
            />
          </div>
          
          <div class="flex gap-3">
            <button
              on:click={() => showResetConfirmation = false}
              class="flex-1 btn-secondary"
              disabled={isResetting}
            >
              Cancel
            </button>
            <button
              on:click={confirmReset}
              class="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-theme py-2 px-4 rounded-lg transition-colors duration-200 font-medium"
              disabled={!canReset}
            >
              {#if isResetting}
                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
              {:else}
                Reset Wallet
              {/if}
            </button>
          </div>
        </div>
        
      {:else if showChangePassword}
        <!-- Change Password Form -->
        <div class="space-y-4">
          <div class="p-4 bg-orange-900/20 border border-orange-500/30 rounded-lg">
            <h3 class="font-semibold text-orange-400 mb-2">Change Wallet Password</h3>
            <p class="text-orange-300 text-sm">
              Enter a new password to secure your wallet, or leave empty to remove password protection.
            </p>
          </div>
          
          {#if passwordChangeError}
            <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p class="text-red-400 text-sm">{passwordChangeError}</p>
            </div>
          {/if}
          
          <div class="space-y-4">
            <div class="space-y-2">
              <label for="new-password" class="block text-sm font-medium text-gray-300">
                New Password <span class="text-gray-500">(leave empty for no password)</span>
              </label>
              <div class="relative">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  bind:value={newPassword}
                  disabled={isChangingPassword}
                  placeholder="Enter new password or leave empty"
                  class="w-full input-field pr-10"
                  autocomplete="new-password"
                />
                <button
                  type="button"
                  on:click={() => showPassword = !showPassword}
                  disabled={isChangingPassword}
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 disabled:opacity-50"
                >
                  {#if showPassword}
                    👁️
                  {:else}
                    🔒
                  {/if}
                </button>
              </div>
            </div>
            
            <div class="space-y-2">
              <label for="confirm-new-password" class="block text-sm font-medium text-gray-300">
                Confirm New Password
              </label>
              <input
                id="confirm-new-password"
                type={showPassword ? 'text' : 'password'}
                bind:value={confirmPassword}
                disabled={isChangingPassword}
                placeholder={newPassword.trim() === '' ? "Leave empty to confirm no password" : "Confirm your new password"}
                class="w-full input-field"
                autocomplete="new-password"
              />
            </div>
          </div>
          
          <!-- Security warning -->
          {#if newPassword.trim() === ''}
            <div class="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
              <p class="text-amber-400 text-sm font-medium mb-1">⚠️ No Password Security</p>
              <p class="text-amber-300 text-xs">
                Your wallet will be stored with minimal encryption. Anyone with access to your device can access your funds.
              </p>
            </div>
          {:else}
            <div class="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <p class="text-blue-400 text-sm">
                💡 Your wallet will be encrypted with this password. You'll need it every time you access your wallet.
              </p>
            </div>
          {/if}
          
          <div class="flex gap-3">
            <button
              on:click={cancelPasswordChange}
              class="flex-1 btn-secondary"
              disabled={isChangingPassword}
            >
              Cancel
            </button>
            <button
              on:click={handlePasswordChange}
              class="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-600/50 text-theme py-2 px-4 rounded-lg transition-colors duration-200 font-medium"
              disabled={isChangingPassword || newPassword !== confirmPassword}
            >
              {#if isChangingPassword}
                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
              {:else}
                Change Password
              {/if}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Sub-modals -->
{#if showExportWallet}
  <ExportWalletModal
    on:close={() => showExportWallet = false}
  />
{/if}

{#if showImportWallet}
  <ImportWalletModal
    on:close={() => showImportWallet = false}
    on:success={handleWalletImported}
  />
{/if}

{#if showTransferTokens}
  <TransferTokensModal
    on:close={() => showTransferTokens = false}
  />
{/if}


<style>
  .btn-secondary {
    @apply px-4 py-2 bg-slate-600 hover:bg-slate-500 text-theme font-medium rounded-lg transition-colors duration-200;
  }
  
  .input-field {
    @apply px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-voi-500 focus:border-transparent;
  }
  
  .card {
    @apply bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl shadow-2xl border border-slate-700;
  }
</style>