<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X, RotateCcw, AlertTriangle } from 'lucide-svelte';
  import { betPerLineVOI, totalBetVOI } from '$lib/stores/betting';
  import { bettingStore } from '$lib/stores/betting';

  const dispatch = createEventDispatcher<{
    close: void;
    confirm: { count: number | 'unlimited' };
  }>();

  let selectedCount: number | 'unlimited' | 'custom' = 10;
  let customAmount = 20;

  const spinOptions = [
    { value: 5, label: '5 Spins' },
    { value: 10, label: '10 Spins' },
    { value: 25, label: '25 Spins' },
    { value: 50, label: '50 Spins' },
    { value: 'custom' as const, label: 'Custom' },
    { value: 'unlimited' as const, label: 'Until Canceled' }
  ];

  function closeModal() {
    dispatch('close');
  }

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }

  function confirmAutoSpin() {
    const finalCount = selectedCount === 'custom' ? customAmount : selectedCount;
    dispatch('confirm', { count: finalCount });
    closeModal();
  }

  function handleCustomAmountInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value);
    if (!isNaN(value) && value > 0) {
      customAmount = value;
    }
  }

  $: finalCount = selectedCount === 'custom' ? customAmount : selectedCount;
  $: estimatedCost = finalCount === 'unlimited' || typeof finalCount !== 'number' ? 0 : (finalCount * ($totalBetVOI || 0));
</script>

<!-- Modal Overlay -->
<div 
  class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
  on:click={handleOverlayClick}
  role="dialog"
  aria-modal="true"
  aria-labelledby="auto-spin-modal-title"
>
  <div class="bg-surface-primary rounded-xl shadow-2xl border border-surface-border max-w-md w-full max-h-[90vh] overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between p-6 border-b border-surface-border">
      <div class="flex items-center gap-3">
        <RotateCcw class="w-6 h-6 text-amber-400" />
        <h2 id="auto-spin-modal-title" class="text-xl font-semibold text-theme">Auto Spin Setup</h2>
      </div>
      <button
        on:click={closeModal}
        class="p-1 text-gray-400 hover:text-theme transition-colors rounded-lg hover:bg-surface-hover"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Content -->
    <div class="p-6 space-y-6">
      <!-- Current Bet Info -->
      <div class="bg-surface-secondary rounded-lg p-4 border border-surface-border">
        <h3 class="text-sm font-medium text-theme-text mb-3">Current Bet Settings</h3>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-theme-text">Bet per Line:</span>
            <span class="text-theme font-medium">{$betPerLineVOI} VOI</span>
          </div>
          <div class="flex justify-between">
            <span class="text-theme-text">Active Paylines:</span>
            <span class="text-theme font-medium">{$bettingStore.selectedPaylines}</span>
          </div>
          <div class="flex justify-between border-t border-surface-border pt-2">
            <span class="text-theme-text">Total per Spin:</span>
            <span class="text-voi-400 font-bold">{$totalBetVOI} VOI</span>
          </div>
        </div>
      </div>

      <!-- Spin Count Selection -->
      <div>
        <h3 class="text-sm font-medium text-theme-text mb-3">Number of Spins</h3>
        <div class="grid grid-cols-2 gap-3">
          {#each spinOptions as option}
            <button
              on:click={() => selectedCount = option.value}
              class="auto-spin-option"
              class:selected={selectedCount === option.value}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Custom Amount Input -->
      {#if selectedCount === 'custom'}
        <div class="bg-surface-secondary rounded-lg p-4 border border-surface-border">
          <label for="custom-amount" class="block text-sm font-medium text-theme-text mb-2">
            Custom Number of Spins
          </label>
          <input
            id="custom-amount"
            type="number"
            min="1"
            max="1000"
            bind:value={customAmount}
            on:input={handleCustomAmountInput}
            class="w-full px-3 py-2 bg-surface-primary border border-surface-border rounded-lg text-theme focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            placeholder="Enter number of spins"
          />
        </div>
      {/if}

      <!-- Estimated Cost -->
      {#if selectedCount !== 'unlimited' && estimatedCost > 0}
        <div class="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3">
          <div class="flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle class="w-4 h-4" />
            <span class="font-medium">Estimated Total Cost: {estimatedCost.toFixed(6)} VOI</span>
          </div>
        </div>
      {/if}

      <!-- Warning -->
      <div class="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
        <div class="flex items-start gap-3">
          <AlertTriangle class="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div class="text-sm">
            <p class="text-red-400 font-medium mb-1">Important Notice</p>
            <p class="text-red-300 leading-relaxed">
              Auto Spin will automatically place bets using your current settings. You can stop auto spin at any time by clicking the "Stop Auto" button. Please gamble responsibly.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex gap-3 p-6 border-t border-surface-border">
      <button
        on:click={closeModal}
        class="flex-1 py-3 px-4 bg-surface-tertiary hover:bg-surface-hover text-theme-text font-medium rounded-lg transition-colors"
      >
        Cancel
      </button>
      <button
        on:click={confirmAutoSpin}
        class="flex-1 py-3 px-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
      >
        Start Auto Spin
      </button>
    </div>
  </div>
</div>

<style lang="postcss">
  .auto-spin-option {
    @apply py-3 px-4 text-sm font-medium bg-surface-tertiary hover:bg-surface-hover text-theme-text border border-surface-border rounded-lg transition-all duration-200;
  }

  .auto-spin-option.selected {
    @apply bg-amber-600 hover:bg-amber-700 text-white border-amber-500;
  }
</style>