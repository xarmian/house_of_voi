<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let isLoading = false;

  const dispatch = createEventDispatcher<{
    submit: { mnemonic: string; password: string };
  }>();

  let mnemonic = '';
  let password = '';
  let confirmPassword = '';
  let showPassword = false;
  let localError = '';

  function handleSubmit() {
    if (!mnemonic.trim()) {
      localError = 'Please enter your backup code';
      return;
    }

    if (password !== confirmPassword) {
      localError = 'Passwords do not match';
      return;
    }

    localError = '';
    dispatch('submit', { mnemonic: mnemonic.trim(), password });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      handleSubmit();
    }
  }
</script>

<div class="px-6 py-6 space-y-6">
  <p class="text-slate-300 text-sm">
    Enter your 25-word backup code to restore your account on this device
  </p>

  {#if localError}
    <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
      <p class="text-red-400 text-sm">{localError}</p>
    </div>
  {/if}

  <div class="space-y-4">
    <div class="space-y-2">
      <label for="import-mnemonic" class="block text-sm font-medium text-slate-300">
        Backup Code (25 words)
      </label>
      <textarea
        id="import-mnemonic"
        bind:value={mnemonic}
        disabled={isLoading}
        placeholder="Enter your 25-word backup code..."
        rows="3"
        class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
        autocomplete="off"
      />
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
          on:keydown={handleKeydown}
          disabled={isLoading}
          placeholder="Enter a password or leave empty"
          class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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

    <div class="space-y-2">
      <label for="import-confirm-password" class="block text-sm font-medium text-slate-300">
        Confirm Password
      </label>
      <input
        id="import-confirm-password"
        type={showPassword ? 'text' : 'password'}
        bind:value={confirmPassword}
        on:keydown={handleKeydown}
        disabled={isLoading}
        placeholder={password.trim() === '' ? 'Leave empty to confirm no password' : 'Confirm your password'}
        class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        autocomplete="new-password"
      />
    </div>
  </div>

  <!-- Security warning -->
  {#if password.trim() === ''}
    <div class="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
      <p class="text-amber-400 text-sm font-medium mb-1">⚠️ No Password Protection</p>
      <p class="text-amber-300 text-xs">
        Without a password, anyone who can access this device can use your account. We strongly recommend setting a password for security.
      </p>
    </div>
  {:else}
    <div class="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
      <p class="text-blue-400 text-sm">
        💡 Your account will be encrypted with this password for security. Keep it safe!
      </p>
    </div>
  {/if}

  <div class="flex justify-end pt-4">
    <button
      type="button"
      on:click={handleSubmit}
      disabled={isLoading || password !== confirmPassword || !mnemonic.trim()}
      class="px-6 py-2 bg-green-600 hover:bg-green-700 text-theme rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
    >
      {#if isLoading}
        <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      {/if}
      <span>Restore Account</span>
    </button>
  </div>
</div>
