<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let isOpen = false;
  export let isLoading = false;
  export let error = '';

  const dispatch = createEventDispatcher<{
    createWallet: { password: string };
    importWallet: { mnemonic: string; password: string };
    cancel: void;
  }>();

  let mode: 'choose' | 'create' | 'import' = 'choose';
  let password = '';
  let confirmPassword = '';
  let mnemonic = '';
  let showPassword = false;

  function handleCreateWallet() {
    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }
    if (password.trim() !== '' && password.length < 4) {
      error = 'Password must be at least 4 characters or empty for no password';
      return;
    }
    dispatch('createWallet', { password });
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
</script>

{#if isOpen}
  <!-- Modal backdrop -->
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <!-- Modal content -->
    <div class="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl max-w-md w-full">
      
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
            <button
              type="button"
              on:click={() => mode = 'create'}
              disabled={isLoading}
              class="w-full p-4 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-left transition-colors disabled:opacity-50"
            >
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <svg class="w-5 h-5 text-theme" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                  </svg>
                </div>
                <div>
                  <h3 class="text-theme font-medium">Create New Wallet</h3>
                  <p class="text-slate-400 text-sm">Generate a new wallet with recovery phrase</p>
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
                  <h3 class="text-theme font-medium">Import Existing Wallet</h3>
                  <p class="text-slate-400 text-sm">Restore wallet from recovery phrase</p>
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
          <h2 class="text-xl font-bold text-theme">Create New Wallet</h2>
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