<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Key, Shield, X } from 'lucide-svelte';

  export let isOpen = false;
  export let isSaving = false;
  export let error = '';

  const dispatch = createEventDispatcher<{
    setPassword: { password: string };
    skip: void;
  }>();

  let password = '';
  let confirmPassword = '';
  let showPassword = false;
  let localError = '';

  $: combinedError = localError || error;

  $: if (!isOpen) {
    password = '';
    confirmPassword = '';
    showPassword = false;
    localError = '';
  }

  function validate(): boolean {
    if (password.trim().length < 4) {
      localError = 'Password must be at least 4 characters';
      return false;
    }

    if (password !== confirmPassword) {
      localError = 'Passwords do not match';
      return false;
    }

    localError = '';
    return true;
  }

  function handleSubmit() {
    if (!validate()) {
      return;
    }

    dispatch('setPassword', { password });
  }

  function handleSkip() {
    localError = '';
    dispatch('skip');
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleSubmit();
    }
    if (event.key === 'Escape') {
      handleSkip();
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="card max-w-md w-full overflow-hidden">
      <div class="flex items-start justify-between p-5 border-b border-surface-border">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-voi-600/60 rounded-lg">
            <Shield class="w-5 h-5 text-theme" />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-theme">Protect Your Wallet</h2>
            <p class="text-sm text-slate-300">Add a password to encrypt this device's copy of your CDP wallet.</p>
          </div>
        </div>
        <button
          on:click={handleSkip}
          class="p-1 text-slate-400 hover:text-theme transition-colors"
          aria-label="Skip password setup"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="p-5 space-y-4">
        <div class="text-sm text-slate-300 bg-surface-secondary bg-opacity-50 border border-surface-border rounded-lg p-4">
          <p class="font-medium text-theme mb-2">Why add a password?</p>
          <ul class="space-y-1 list-disc list-inside text-slate-400">
            <li>Encrypts the Voi wallet stored in your browser</li>
            <li>Required to access the wallet on this device</li>
            <li>You can keep it passwordless, but it's less secure</li>
          </ul>
        </div>

        {#if combinedError}
          <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-sm text-red-300">
            {combinedError}
          </div>
        {/if}

        <div class="space-y-3">
          <label class="block text-sm font-medium text-slate-200" for="cdp-password">
            New password
          </label>
          <div class="relative">
            <input
              id="cdp-password"
              type={showPassword ? 'text' : 'password'}
              class="input-field pr-12"
              bind:value={password}
              placeholder="Enter a secure password"
              minlength="4"
              on:keydown={handleKeydown}
              autocomplete="new-password"
              disabled={isSaving}
            />
            <button
              type="button"
              class="toggle-eye"
              on:click={() => showPassword = !showPassword}
              disabled={isSaving}
            >
              {#if showPassword}
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.5 6.5m3.378 3.378a3 3 0 004.243 4.243M21.5 6.5l-15 15" /></svg>
              {:else}
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>
              {/if}
            </button>
          </div>

          <label class="block text-sm font-medium text-slate-200" for="cdp-password-confirm">
            Confirm password
          </label>
          <input
            id="cdp-password-confirm"
            type={showPassword ? 'text' : 'password'}
            class="input-field"
            bind:value={confirmPassword}
            placeholder="Re-enter your password"
            minlength="4"
            disabled={isSaving}
            on:keydown={handleKeydown}
            autocomplete="new-password"
          />
        </div>
      </div>

      <div class="p-5 border-t border-surface-border flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <button
          on:click={handleSkip}
          class="text-sm text-slate-300 hover:text-theme transition-colors"
          type="button"
          disabled={isSaving}
        >
          Skip for now
        </button>
        <button
          on:click={handleSubmit}
          class="btn-primary flex items-center justify-center gap-2"
          disabled={isSaving}
        >
          {#if isSaving}
            <span class="loader"></span>
            Saving...
          {:else}
            <Key class="w-4 h-4" />
            Set Password
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .card {
    @apply bg-surface-primary rounded-2xl shadow-2xl border border-surface-border;
  }

  .input-field {
    @apply w-full px-3 py-2 bg-surface-secondary border border-surface-border rounded-lg text-theme placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-transparent disabled:opacity-50;
  }

  .toggle-eye {
    @apply absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 disabled:opacity-50;
  }

  .btn-primary {
    @apply px-4 py-2 bg-voi-600 hover:bg-voi-700 text-theme font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .loader {
    @apply w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin;
  }
</style>
