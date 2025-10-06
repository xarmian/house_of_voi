<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { cdpWalletService } from '$lib/services/cdpWallet';

  export let isOpen = false;
  export let isLoading = false;
  export let error = '';

  const dispatch = createEventDispatcher<{
    success: { email: string; otpCode: string };
    cancel: void;
  }>();

  let step: 'email' | 'otp' = 'email';
  let email = '';
  let otpCode = '';
  let sendingOTP = false;
  let localError = '';

  $: displayError = error || localError;

  async function handleSendOTP() {
    if (!email.trim()) {
      localError = 'Please enter your email address';
      return;
    }

    // Basic email validation
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
      step = 'otp';
    } else {
      localError = (result.error || 'Failed to send verification code') + '. Please try again.';
    }
  }

  function handleVerifyOTP() {
    if (!otpCode.trim()) {
      localError = 'Please enter the verification code';
      return;
    }

    if (otpCode.length !== 6) {
      localError = 'Verification code must be 6 digits';
      return;
    }

    // Dispatch to parent to handle verification and wallet derivation
    dispatch('success', { email, otpCode });
  }

  function handleCancel() {
    resetForm();
    dispatch('cancel');
  }

  function handleBack() {
    step = 'email';
    otpCode = '';
    localError = '';
  }

  function resetForm() {
    step = 'email';
    email = '';
    otpCode = '';
    localError = '';
  }

  // Reset form when modal closes
  $: if (!isOpen) {
    resetForm();
  }

  // Handle Enter key
  function handleEmailKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !sendingOTP) {
      handleSendOTP();
    }
  }

  function handleOTPKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !isLoading) {
      handleVerifyOTP();
    }
  }
</script>

{#if isOpen}
  <!-- Modal backdrop -->
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <!-- Modal content -->
    <div class="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl max-w-md w-full">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-700">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold text-theme">
              {step === 'email' ? 'Login with Email' : 'Enter Verification Code'}
            </h2>
            <p class="text-slate-300 text-sm mt-1">
              {step === 'email'
                ? 'We\'ll send you a one-time code'
                : `Code sent to ${email}`}
            </p>
          </div>
          {#if step === 'otp'}
            <button
              type="button"
              on:click={handleBack}
              class="text-slate-400 hover:text-theme transition-colors"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
              </svg>
            </button>
          {/if}
        </div>
      </div>

      <!-- Body -->
      <div class="px-6 py-4 space-y-4">
        {#if displayError}
          <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
            <p class="text-red-400 text-sm">{displayError}</p>
          </div>
        {/if}

        {#if step === 'email'}
          <!-- Email input -->
          <div class="space-y-2">
            <label for="email" class="block text-sm font-medium text-slate-300">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              bind:value={email}
              on:keydown={handleEmailKeydown}
              disabled={sendingOTP}
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
        {:else}
          <!-- OTP input -->
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
              on:keydown={handleOTPKeydown}
              disabled={isLoading}
              placeholder="000000"
              class="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-theme text-center text-2xl tracking-widest placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <p class="text-slate-400 text-xs text-center">
              Check your email for the 6-digit code
            </p>
          </div>

          <!-- Resend OTP -->
          <div class="flex justify-center">
            <button
              type="button"
              on:click={handleSendOTP}
              disabled={sendingOTP}
              class="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
            >
              {sendingOTP ? 'Sending...' : 'Resend code'}
            </button>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-slate-700 flex justify-end space-x-3">
        <button
          type="button"
          on:click={handleCancel}
          disabled={sendingOTP || isLoading}
          class="px-4 py-2 text-slate-300 hover:text-theme transition-colors disabled:opacity-50"
        >
          Cancel
        </button>

        {#if step === 'email'}
          <button
            type="button"
            on:click={handleSendOTP}
            disabled={sendingOTP || !email.trim()}
            class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-theme rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
          >
            {#if sendingOTP}
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            {/if}
            <span>{sendingOTP ? 'Sending...' : 'Send Code'}</span>
          </button>
        {:else}
          <button
            type="button"
            on:click={handleVerifyOTP}
            disabled={isLoading || !otpCode.trim()}
            class="px-6 py-2 bg-green-600 hover:bg-green-700 text-theme rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
          >
            {#if isLoading}
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            {/if}
            <span>{isLoading ? 'Verifying...' : 'Verify & Login'}</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
