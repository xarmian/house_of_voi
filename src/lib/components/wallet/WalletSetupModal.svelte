<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let isOpen = false;
  export let isLoading = false;
  export let error = '';
  export let generatedMnemonic = ''; // Mnemonic passed from parent after generation

  const dispatch = createEventDispatcher<{
    createWallet: { password: string };
    confirmMnemonicBackup: void;
    importWallet: { mnemonic: string; password: string };
    loginWithEmail: void;
    cancel: void;
  }>();

  let mode: 'choose' | 'create' | 'show-mnemonic' | 'import' = 'choose';
  let password = '';
  let confirmPassword = '';
  let mnemonic = '';
  let showPassword = false;
  let mnemonicAcknowledged = false;
  let hasWrittenDown = false;

  function handleCreateWallet() {
    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }
    if (password.trim() !== '' && password.length < 4) {
      error = 'Password must be at least 4 characters or empty for no password';
      return;
    }
    // Dispatch to generate wallet and show mnemonic
    dispatch('createWallet', { password });
  }

  function handleConfirmMnemonicBackup() {
    if (!mnemonicAcknowledged || !hasWrittenDown) {
      error = 'Please acknowledge that you have written down your recovery phrase';
      return;
    }
    dispatch('confirmMnemonicBackup');
  }

  async function copyMnemonicToClipboard() {
    try {
      await navigator.clipboard.writeText(generatedMnemonic);
      alert('Recovery phrase copied to clipboard! Make sure to store it securely.');
    } catch (err) {
      console.error('Failed to copy:', err);
      error = 'Failed to copy to clipboard';
    }
  }

  function handleImportWallet() {
    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }
    if (!mnemonic.trim()) {
      error = 'Please enter your recovery phrase';
      return;
    }
    dispatch('importWallet', { mnemonic: mnemonic.trim(), password });
  }

  function handleCancel() {
    mode = 'choose';
    password = '';
    confirmPassword = '';
    mnemonic = '';
    error = '';
    dispatch('cancel');
  }

  function resetForm() {
    password = '';
    confirmPassword = '';
    mnemonic = '';
    mnemonicAcknowledged = false;
    hasWrittenDown = false;
    error = '';
  }

  // Clear form when modal closes or mode changes
  $: if (!isOpen) {
    mode = 'choose';
    resetForm();
  }
  $: if (mode === 'choose') {
    resetForm();
  }

  // Watch for generatedMnemonic to switch to show-mnemonic mode
  $: if (generatedMnemonic && mode === 'create') {
    mode = 'show-mnemonic';
  }
</script>

{#if isOpen}
  <!-- Modal backdrop -->
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <!-- Modal content -->
    <div class="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      
      {#if mode === 'choose'}
        <!-- Choose setup method -->
        <div class="px-6 py-4 border-b border-slate-700">
          <h2 class="text-xl font-bold text-theme">Setup Wallet</h2>
          <p class="text-slate-300 text-sm mt-1">Create a new wallet or import an existing one</p>
        </div>

        <div class="px-6 py-6 space-y-4">
          {#if error}
            <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p class="text-red-400 text-sm">{error}</p>
            </div>
          {/if}

          <div class="space-y-3">
            <!-- Login with Email (CDP) -->
            <button
              type="button"
              on:click={() => dispatch('loginWithEmail')}
              disabled={isLoading}
              class="w-full p-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 border border-purple-500 rounded-lg text-left transition-colors disabled:opacity-50"
            >
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <svg class="w-5 h-5 text-theme" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                  </svg>
                </div>
                <div>
                  <h3 class="text-theme font-medium">Login with Email</h3>
                  <p class="text-slate-200 text-sm">Quick & easy with email verification, no registration required</p>
                </div>
              </div>
            </button>

            <button
              type="button"
              on:click={() => mode = 'create'}
              disabled={isLoading}
              class="w-full p-4 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-left transition-colors disabled:opacity-50"
            >
              <div class="flex items-center space-x-3">
                <div class="w-24 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <svg class="w-5 h-5 text-theme" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                  </svg>
                </div>
                <div>
                  <h3 class="text-theme font-medium">Generate a self-custodial account</h3>
                  <p class="text-slate-400 text-sm">Generate an account stored in your browser, to be used with House of Voi. It can be restored or copied to another device using a recovery phrase.</p>
                </div>
              </div>
            </button>

            <button
              type="button"
              on:click={() => mode = 'import'}
              disabled={isLoading}
              class="w-full p-4 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-left transition-colors disabled:opacity-50"
            >
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                  <svg class="w-5 h-5 text-theme" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
                  </svg>
                </div>
                <div>
                  <h3 class="text-theme font-medium">Import an account</h3>
                  <p class="text-slate-400 text-sm">Restore an account from a recovery phrase</p>
                </div>
              </div>
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

      {:else if mode === 'create'}
        <!-- Create new wallet -->
        <div class="px-6 py-4 border-b border-slate-700">
          <h2 class="text-xl font-bold text-theme">Create New Account</h2>
          <p class="text-slate-300 text-sm mt-1">Set a password to secure your wallet</p>
        </div>

        <div class="px-6 py-4 space-y-4">
          {#if error}
            <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p class="text-red-400 text-sm">{error}</p>
            </div>
          {/if}

          <div class="space-y-4">
            <div class="space-y-2">
              <label for="create-password" class="block text-sm font-medium text-slate-300">
                Password <span class="text-slate-500">(leave empty for no password)</span>
              </label>
              <div class="relative">
                <input
                  id="create-password"
                  type={showPassword ? 'text' : 'password'}
                  bind:value={password}
                  disabled={isLoading}
                  placeholder="Enter a password or leave empty"
                  class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  autocomplete="new-password"
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

            <div class="space-y-2">
              <label for="confirm-password" class="block text-sm font-medium text-slate-300">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                bind:value={confirmPassword}
                disabled={isLoading}
                placeholder={password.trim() === '' ? "Leave empty to confirm no password" : "Confirm your password"}
                class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                autocomplete="new-password"
              />
            </div>
          </div>

          <!-- Security warning for passwordless wallets -->
          {#if password.trim() === ''}
            <div class="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
              <p class="text-amber-400 text-sm font-medium mb-1">⚠️ No Password Security</p>
              <p class="text-amber-300 text-xs">
                Your wallet will be stored with minimal encryption in your browser. Anyone with access to your device can access your funds. Only use this option if you understand the risks.
              </p>
            </div>
          {:else}
            <div class="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <p class="text-blue-400 text-sm">
                💡 Your wallet will be encrypted with this password. You'll need it every time you access your wallet.
              </p>
            </div>
          {/if}
        </div>

        <div class="px-6 py-4 border-t border-slate-700 flex justify-end space-x-3">
          <button
            type="button"
            on:click={() => mode = 'choose'}
            disabled={isLoading}
            class="px-4 py-2 text-slate-300 hover:text-theme transition-colors disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            on:click={handleCreateWallet}
            disabled={isLoading || password !== confirmPassword}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-theme rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {#if isLoading}
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            {/if}
            <span>Create Wallet</span>
          </button>
        </div>

      {:else if mode === 'show-mnemonic'}
        <!-- Show mnemonic backup screen -->
        <div class="px-6 py-4 border-b border-slate-700">
          <h2 class="text-xl font-bold text-theme">Backup Your Recovery Phrase</h2>
          <p class="text-slate-300 text-sm mt-1">Write down and secure your recovery phrase</p>
        </div>

        <div class="px-6 py-4 space-y-4">
          {#if error}
            <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p class="text-red-400 text-sm">{error}</p>
            </div>
          {/if}

          <!-- Critical Warning -->
          <div class="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
              <div>
                <h3 class="font-semibold text-red-400 mb-2">Critical: Save This Recovery Phrase!</h3>
                <ul class="text-red-300 text-sm space-y-1">
                  <li>• Your wallet is stored ONLY in your browser's local storage</li>
                  <li>• It will be DELETED if you clear your browser cache or data</li>
                  <li>• This recovery phrase is the ONLY way to restore your wallet</li>
                  <li>• Write it down on paper and store it in a secure location</li>
                  <li>• You can use it to import your wallet on other devices</li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Mnemonic Display -->
          <div class="space-y-3">
            <label class="block text-sm font-medium text-slate-300">
              Your 25-Word Recovery Phrase
            </label>
            <textarea
              value={generatedMnemonic}
              readonly
              rows="4"
              class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            ></textarea>
            <button
              type="button"
              on:click={copyMnemonicToClipboard}
              disabled={isLoading}
              class="w-full px-4 py-2 bg-slate-600 hover:bg-slate-500 text-theme rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
              <span>Copy to Clipboard</span>
            </button>
          </div>

          <!-- Backup Instructions -->
          <div class="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
            <h4 class="font-semibold text-blue-400 mb-2">How to Backup</h4>
            <ol class="list-decimal list-inside space-y-1 text-blue-300 text-sm">
              <li>Write down all 25 words in the correct order on paper</li>
              <li>Double-check that you wrote them correctly</li>
              <li>Store the paper in a secure location (safe, lockbox, etc.)</li>
              <li>Consider making multiple copies in different secure locations</li>
              <li>Never store it digitally or share it with anyone</li>
            </ol>
          </div>

          <!-- Acknowledgment Checkboxes -->
          <div class="space-y-3">
            <label class="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={mnemonicAcknowledged}
                disabled={isLoading}
                class="mt-1 w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 disabled:opacity-50"
              />
              <span class="text-slate-300 text-sm">
                I understand that this recovery phrase is the only way to restore my wallet if my browser data is cleared or lost
              </span>
            </label>

            <label class="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={hasWrittenDown}
                disabled={isLoading}
                class="mt-1 w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 disabled:opacity-50"
              />
              <span class="text-slate-300 text-sm">
                I have written down my recovery phrase and stored it in a secure location
              </span>
            </label>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-slate-700 flex justify-end space-x-3">
          <button
            type="button"
            on:click={() => mode = 'create'}
            disabled={isLoading}
            class="px-4 py-2 text-slate-300 hover:text-theme transition-colors disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            on:click={handleConfirmMnemonicBackup}
            disabled={isLoading || !mnemonicAcknowledged || !hasWrittenDown}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-theme rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {#if isLoading}
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            {/if}
            <span>Continue</span>
          </button>
        </div>

      {:else if mode === 'import'}
        <!-- Import existing wallet -->
        <div class="px-6 py-4 border-b border-slate-700">
          <h2 class="text-xl font-bold text-theme">Import Wallet</h2>
          <p class="text-slate-300 text-sm mt-1">Enter your recovery phrase and set a password</p>
        </div>

        <div class="px-6 py-4 space-y-4">
          {#if error}
            <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p class="text-red-400 text-sm">{error}</p>
            </div>
          {/if}

          <div class="space-y-4">
            <div class="space-y-2">
              <label for="import-mnemonic" class="block text-sm font-medium text-slate-300">
                Recovery Phrase
              </label>
              <textarea
                id="import-mnemonic"
                bind:value={mnemonic}
                disabled={isLoading}
                placeholder="Enter your 25-word recovery phrase..."
                rows="3"
                class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 resize-none"
                autocomplete="off"
              ></textarea>
            </div>

            <div class="space-y-2">
              <label for="import-password" class="block text-sm font-medium text-slate-300">
                Password <span class="text-slate-500">(leave empty for no password)</span>
              </label>
              <div class="relative">
                <input
                  id="import-password"
                  type={showPassword ? 'text' : 'password'}
                  bind:value={password}
                  disabled={isLoading}
                  placeholder="Enter a password or leave empty"
                  class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  autocomplete="new-password"
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

            <div class="space-y-2">
              <label for="import-confirm-password" class="block text-sm font-medium text-slate-300">
                Confirm Password
              </label>
              <input
                id="import-confirm-password"
                type={showPassword ? 'text' : 'password'}
                bind:value={confirmPassword}
                disabled={isLoading}
                placeholder={password.trim() === '' ? "Leave empty to confirm no password" : "Confirm your password"}
                class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                autocomplete="new-password"
              />
            </div>
          </div>

          <!-- Security warning for passwordless wallets in import mode -->
          {#if password.trim() === ''}
            <div class="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
              <p class="text-amber-400 text-sm font-medium mb-1">⚠️ No Password Security</p>
              <p class="text-amber-300 text-xs">
                Your wallet will be stored with minimal encryption in your browser. Anyone with access to your device can access your funds. Only use this option if you understand the risks.
              </p>
            </div>
          {:else}
            <div class="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <p class="text-blue-400 text-sm">
                💡 Your wallet will be encrypted with this password. You'll need it every time you access your wallet.
              </p>
            </div>
          {/if}
        </div>

        <div class="px-6 py-4 border-t border-slate-700 flex justify-end space-x-3">
          <button
            type="button"
            on:click={() => mode = 'choose'}
            disabled={isLoading}
            class="px-4 py-2 text-slate-300 hover:text-theme transition-colors disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            on:click={handleImportWallet}
            disabled={isLoading || password !== confirmPassword || !mnemonic.trim()}
            class="px-4 py-2 bg-green-600 hover:bg-green-700 text-theme rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {#if isLoading}
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            {/if}
            <span>Import Wallet</span>
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}