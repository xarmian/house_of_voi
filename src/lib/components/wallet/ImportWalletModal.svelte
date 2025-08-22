<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { walletStore } from '$lib/stores/wallet';
  import { Upload, X, AlertTriangle, CheckCircle } from 'lucide-svelte';
  
  const dispatch = createEventDispatcher();
  
  let mnemonic = '';
  let password = '';
  let confirmPassword = '';
  let acknowledged = false;
  let isImporting = false;
  let importError = '';
  
  async function importWallet() {
    if (!mnemonic.trim() || !acknowledged || !password) {
      return;
    }
    
    if (password !== confirmPassword) {
      importError = 'Passwords do not match';
      return;
    }
    
    isImporting = true;
    importError = '';
    
    try {
      await walletStore.importWallet(mnemonic.trim(), password);
      dispatch('success');
      closeModal();
    } catch (error) {
      importError = error instanceof Error ? error.message : 'Failed to import wallet';
    } finally {
      isImporting = false;
    }
  }
  
  function closeModal() {
    dispatch('close');
  }
  
  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }
  
  function validateMnemonic(text) {
    const trimmed = text.trim();
    if (!trimmed) return false;
    
    const words = trimmed.split(/\s+/);
    return words.length === 25 && words.every(word => word.length > 0);
  }
  
  $: isValidMnemonic = validateMnemonic(mnemonic);
  $: canImport = isValidMnemonic && acknowledged && password === confirmPassword && !isImporting;
</script>

<!-- Modal Overlay -->
<div 
  class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
  on:click={handleOverlayClick}
  role="dialog"
  aria-modal="true"
  aria-labelledby="import-modal-title"
>
  <div class="card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between p-6 border-b border-slate-700">
      <h2 id="import-modal-title" class="text-xl font-semibold text-theme">Import Wallet</h2>
      <button
        on:click={closeModal}
        class="p-1 text-gray-400 hover:text-theme transition-colors"
      >
        <X class="w-5 h-5" />
      </button>
    </div>
    
    <!-- Content -->
    <div class="p-6 space-y-6">
      <!-- Warning -->
      <div class="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
        <div class="flex items-start gap-3">
          <AlertTriangle class="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <h3 class="font-semibold text-yellow-400 mb-2">Important Notice</h3>
            <p class="text-yellow-300 text-sm">
              Importing a new wallet will <strong>replace your current wallet</strong>. 
              Make sure you have backed up your current wallet's recovery phrase before proceeding.
            </p>
          </div>
        </div>
      </div>
      
      <!-- Mnemonic Input -->
      <div class="space-y-3">
        <label for="mnemonic-input" class="block text-sm font-medium text-gray-300">
          Recovery Phrase (25 words)
        </label>
        <textarea
          id="mnemonic-input"
          bind:value={mnemonic}
          placeholder="Enter your 25-word recovery phrase here..."
          class="w-full h-32 input-field font-mono text-sm resize-none"
          class:border-green-500={isValidMnemonic}
          class:border-red-500={mnemonic.trim() && !isValidMnemonic}
        ></textarea>
        
        {#if mnemonic.trim() && !isValidMnemonic}
          <p class="text-red-400 text-sm">
            Please enter exactly 25 words separated by spaces
          </p>
        {:else if isValidMnemonic}
          <p class="text-green-400 text-sm flex items-center gap-2">
            <CheckCircle class="w-4 h-4" />
            Valid recovery phrase format
          </p>
        {/if}
      </div>
      
      <!-- Password Input -->
      <div class="space-y-3">
        <label for="password-input" class="block text-sm font-medium text-gray-300">
          Set Wallet Password
        </label>
        <input
          id="password-input"
          type="password"
          bind:value={password}
          placeholder="Enter a password to secure your wallet"
          class="w-full input-field"
          class:border-red-500={password && password.length < 4}
          autocomplete="off"
        />
        {#if password && password.length < 4}
          <p class="text-red-400 text-sm">Password must be at least 4 characters</p>
        {/if}
      </div>
      
      <!-- Confirm Password Input -->
      <div class="space-y-3">
        <label for="confirm-password-input" class="block text-sm font-medium text-gray-300">
          Confirm Password
        </label>
        <input
          id="confirm-password-input"
          type="password"
          bind:value={confirmPassword}
          placeholder="Confirm your password"
          class="w-full input-field"
          class:border-red-500={confirmPassword && password !== confirmPassword}
          autocomplete="off"
        />
        {#if confirmPassword && password !== confirmPassword}
          <p class="text-red-400 text-sm">Passwords do not match</p>
        {/if}
      </div>
      
      <!-- Error Display -->
      {#if importError}
        <div class="p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
          <p class="text-red-400 text-sm">{importError}</p>
        </div>
      {/if}
      
      <!-- Acknowledgment -->
      <label class="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={acknowledged}
          class="mt-1 w-4 h-4 text-voi-600 bg-slate-700 border-slate-600 rounded focus:ring-voi-500"
        />
        <span class="text-gray-300 text-sm">
          I understand that importing this wallet will replace my current wallet and I have backed up my current recovery phrase
        </span>
      </label>
      
      <!-- Security Tips -->
      <div class="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
        <h4 class="font-semibold text-blue-400 mb-2">Security Tips</h4>
        <ul class="text-blue-300 text-sm space-y-1">
          <li>• Only enter your recovery phrase on trusted devices</li>
          <li>• Never share your recovery phrase with anyone</li>
          <li>• Make sure you're on the correct website</li>
          <li>• Clear your clipboard after importing</li>
        </ul>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="p-6 border-t border-slate-700 flex justify-end gap-3">
      <button
        on:click={closeModal}
        class="btn-secondary"
        disabled={isImporting}
      >
        Cancel
      </button>
      <button
        on:click={importWallet}
        class="btn-primary"
        disabled={!canImport}
      >
        {#if isImporting}
          <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
          Importing...
        {:else}
          <Upload class="w-4 h-4 mr-2" />
          Import Wallet
        {/if}
      </button>
    </div>
  </div>
</div>