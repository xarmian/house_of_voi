<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { cdpWalletService } from '$lib/services/cdpWallet';

  export let isLoading = false;

  const dispatch = createEventDispatcher<{
    submit: { email: string };
  }>();

  let email = '';
  let sendingOTP = false;
  let localError = '';

  async function handleSubmit() {
    if (!email.trim()) {
      localError = 'Please enter your email address';
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      localError = 'Please enter a valid email address';
      return;
    }

    sendingOTP = true;
    localError = '';

    const result = await cdpWalletService.signInWithEmail(email);
    sendingOTP = false;

    if (result.success) {
      dispatch('submit', { email });
    } else {
      localError = (result.error || 'Failed to send verification code') + '. Please try again.';
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !sendingOTP) {
      handleSubmit();
    }
  }
</script>

<div class="px-6 py-6 space-y-6">
  {#if localError}
    <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
      <p class="text-red-400 text-sm">{localError}</p>
    </div>
  {/if}

  <div class="space-y-2">
    <label for="email" class="block text-sm font-medium text-slate-300">
      Email Address
    </label>
    <input
      id="email"
      type="email"
      bind:value={email}
      on:keydown={handleKeydown}
      disabled={sendingOTP || isLoading}
      placeholder="you@example.com"
      class="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-theme placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
    />
  </div>

  <div class="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
    <h3 class="text-blue-400 font-medium mb-2">🔐 Secure & Easy</h3>
    <p class="text-blue-300 text-sm">
      You will receive an OTP (one-time passcode) via email to generate and/or restore your Voi gaming wallet. No passwords or seed phrases needed!
    </p>
  </div>

  <div class="flex justify-end pt-4">
    <button
      type="button"
      on:click={handleSubmit}
      disabled={sendingOTP || isLoading || !email.trim()}
      class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-theme rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
    >
      {#if sendingOTP || isLoading}
        <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      {/if}
      <span>{sendingOTP ? 'Sending...' : 'Send Code'}</span>
    </button>
  </div>
</div>
