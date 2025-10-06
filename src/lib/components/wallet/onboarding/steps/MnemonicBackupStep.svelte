<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let mnemonic: string;
  export let isLoading = false;

  const dispatch = createEventDispatcher<{
    confirm: void;
  }>();

  let mnemonicAcknowledged = false;
  let hasWrittenDown = false;
  let localError = '';

  async function copyMnemonicToClipboard() {
    try {
      await navigator.clipboard.writeText(mnemonic);
      alert('Backup code copied to clipboard! Make sure to store it securely.');
    } catch (err) {
      console.error('Failed to copy:', err);
      localError = 'Failed to copy to clipboard';
    }
  }

  function handleConfirm() {
    if (!mnemonicAcknowledged || !hasWrittenDown) {
      localError = 'Please acknowledge that you have written down your backup code';
      return;
    }

    localError = '';
    dispatch('confirm');
  }
</script>

<div class="px-6 py-6 space-y-6">
  {#if localError}
    <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
      <p class="text-red-400 text-sm">{localError}</p>
    </div>
  {/if}

  <!-- Critical Warning -->
  <div class="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
    <div class="flex items-start gap-3">
      <svg class="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div>
        <h3 class="font-semibold text-red-400 mb-2">⚠️ Important: Save Your Backup Code!</h3>
        <ul class="text-red-300 text-sm space-y-1">
          <li>• Your account is stored only on this device in your browser</li>
          <li>• It will be deleted if you clear your browser data or uninstall the browser</li>
          <li>• This backup code is the ONLY way to restore your account</li>
          <li>• Write it down on paper and store it somewhere safe</li>
          <li>• You can use it to access your account on other devices</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Backup Code Display -->
  <div class="space-y-3">
    <label class="block text-sm font-medium text-slate-300">
      Your 25-Word Backup Code
    </label>
    <textarea
      value={mnemonic}
      readonly
      rows="4"
      class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
    <button
      type="button"
      on:click={copyMnemonicToClipboard}
      disabled={isLoading}
      class="w-full px-4 py-2 bg-slate-600 hover:bg-slate-500 text-theme rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      <span>Copy to Clipboard</span>
    </button>
  </div>

  <!-- Backup Instructions -->
  <div class="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
    <h4 class="font-semibold text-blue-400 mb-2">📝 How to Save Your Backup Code</h4>
    <ol class="list-decimal list-inside space-y-1 text-blue-300 text-sm">
      <li>Write down all 25 words in the exact order on paper</li>
      <li>Double-check that you copied them correctly</li>
      <li>Store the paper somewhere safe (like a safe or lockbox)</li>
      <li>Optional: Make a second copy and store it somewhere else safe</li>
      <li>Never save it on your computer or share it with anyone</li>
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
        I understand this backup code is the only way to restore my account if I lose access to this device
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
        I have written down my backup code and stored it in a safe place
      </span>
    </label>
  </div>

  <div class="flex justify-end pt-4">
    <button
      type="button"
      on:click={handleConfirm}
      disabled={isLoading || !mnemonicAcknowledged || !hasWrittenDown}
      class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-theme rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
    >
      {#if isLoading}
        <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      {/if}
      <span>Continue</span>
    </button>
  </div>
</div>
