<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let email: string;
  export let isLoading = false;

  const dispatch = createEventDispatcher<{
    submit: { otpCode: string };
    resend: { email: string };
  }>();

  let otpCode = '';
  let localError = '';

  function handleSubmit() {
    if (!otpCode.trim()) {
      localError = 'Please enter the verification code';
      return;
    }

    if (otpCode.length !== 6) {
      localError = 'Verification code must be 6 digits';
      return;
    }

    localError = '';
    dispatch('submit', { otpCode });
  }

  function handleResend() {
    dispatch('resend', { email });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !isLoading) {
      handleSubmit();
    }
  }
</script>

<div class="px-6 py-6 space-y-6">
  <p class="text-slate-300 text-sm">
    Code sent to <span class="font-medium text-theme">{email}</span>
  </p>

  {#if localError}
    <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
      <p class="text-red-400 text-sm">{localError}</p>
    </div>
  {/if}

  <div class="space-y-2">
    <label for="otp" class="block text-sm font-medium text-slate-300">
      Verification Code
    </label>
    <input
      id="otp"
      type="text"
      inputmode="numeric"
      maxlength="6"
      bind:value={otpCode}
      on:keydown={handleKeydown}
      disabled={isLoading}
      placeholder="000000"
      class="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-theme text-center text-2xl tracking-widest placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
    />
    <p class="text-slate-400 text-xs text-center">
      Check your email for the 6-digit code
    </p>
  </div>

  <div class="flex justify-center">
    <button
      type="button"
      on:click={handleResend}
      disabled={isLoading}
      class="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
    >
      Resend code
    </button>
  </div>

  <div class="flex justify-end pt-4">
    <button
      type="button"
      on:click={handleSubmit}
      disabled={isLoading || !otpCode.trim()}
      class="px-6 py-2 bg-green-600 hover:bg-green-700 text-theme rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
    >
      {#if isLoading}
        <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      {/if}
      <span>{isLoading ? 'Verifying...' : 'Verify & Login'}</span>
    </button>
  </div>
</div>
