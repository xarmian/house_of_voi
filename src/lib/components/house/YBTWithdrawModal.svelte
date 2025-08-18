<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { walletStore } from '$lib/stores/walletAdapter';
  import { ybtService } from '$lib/services/ybt';
  import type { YBTWithdrawParams } from '$lib/types/ybt';

  export let open = false;
  export let userShares: bigint = BigInt(0);
  
  let tokenDecimals = 9; // Default to 9, will be fetched

  const dispatch = createEventDispatcher();

  let withdrawAmount = '';
  let isProcessing = false;
  let error = '';

  $: sharesAmount = parseFloat(withdrawAmount) || 0;
  $: sharesBigInt = BigInt(Math.floor(sharesAmount * (10 ** tokenDecimals)));
  $: transactionFee = BigInt(6000); // 6000 microAlgos for app call + inner payment
  $: canWithdraw = sharesAmount > 0 && sharesBigInt <= userShares && !isProcessing && $walletStore.account && $walletStore.balance >= Number(transactionFee);
  $: maxShares = Number(userShares) / (10 ** tokenDecimals);

  async function handleWithdraw() {
    if (!canWithdraw || !$walletStore.account) return;

    isProcessing = true;
    error = '';

    try {
      const params: YBTWithdrawParams = {
        shares: sharesBigInt
      };

      const result = await ybtService.withdraw(params);

      if (result.success) {
        dispatch('success', result);
        open = false;
        resetForm();
      } else {
        error = result.error || 'Withdrawal failed';
      }
    } catch (err) {
      console.error('Withdraw error:', err);
      error = err instanceof Error ? err.message : 'An unexpected error occurred';
    } finally {
      isProcessing = false;
    }
  }

  function resetForm() {
    withdrawAmount = '';
    error = '';
  }

  function closeModal() {
    open = false;
    resetForm();
  }

  function setMaxAmount() {
    withdrawAmount = maxShares.toFixed(tokenDecimals);
  }

  function setPercentage(percent: number) {
    withdrawAmount = (maxShares * percent / 100).toFixed(tokenDecimals);
  }
  
  async function loadTokenDecimals() {
    try {
      const globalState = await ybtService.getGlobalState();
      tokenDecimals = globalState.decimals;
    } catch (error) {
      console.error('Error loading token decimals:', error);
      // Keep default value of 9
    }
  }
  
  // Load token decimals when modal opens
  $: if (open) {
    loadTokenDecimals();
  }
</script>

{#if open}
  <!-- Modal Backdrop -->
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <!-- Modal Content -->
    <div class="bg-slate-800 rounded-lg shadow-xl max-w-md w-full border border-slate-700">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-slate-700">
        <h2 class="text-xl font-bold text-white">Withdraw YBT Shares</h2>
        <button
          on:click={closeModal}
          class="text-slate-400 hover:text-white transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="p-6">
        <!-- Available Shares Display -->
        <div class="mb-4 p-3 bg-slate-700 rounded-lg">
          <div class="text-sm text-slate-400">Available Shares</div>
          <div class="text-lg font-bold text-white">
            {maxShares.toFixed(tokenDecimals)} YBT
          </div>
        </div>

        <!-- Quick Percentage Buttons -->
        <div class="mb-4">
          <div class="text-sm text-slate-300 mb-2">Quick Select</div>
          <div class="grid grid-cols-4 gap-2">
            <button
              type="button"
              on:click={() => setPercentage(25)}
              class="btn-quick text-xs"
              disabled={isProcessing || maxShares === 0}
            >
              25%
            </button>
            <button
              type="button"
              on:click={() => setPercentage(50)}
              class="btn-quick text-xs"
              disabled={isProcessing || maxShares === 0}
            >
              50%
            </button>
            <button
              type="button"
              on:click={() => setPercentage(75)}
              class="btn-quick text-xs"
              disabled={isProcessing || maxShares === 0}
            >
              75%
            </button>
            <button
              type="button"
              on:click={setMaxAmount}
              class="btn-quick text-xs"
              disabled={isProcessing || maxShares === 0}
            >
              MAX
            </button>
          </div>
        </div>

        <!-- Amount Input -->
        <div class="mb-4">
          <label for="withdrawAmount" class="block text-sm font-medium text-slate-300 mb-2">
            Shares to Withdraw
          </label>
          <div class="relative">
            <input
              id="withdrawAmount"
              type="number"
              step={1 / (10 ** tokenDecimals)}
              min="0"
              max={maxShares}
              bind:value={withdrawAmount}
              placeholder={"0." + "0".repeat(tokenDecimals)}
              class="input-field w-full pr-16"
              disabled={isProcessing}
            />
            <button
              type="button"
              on:click={setMaxAmount}
              class="absolute right-2 top-1/2 transform -translate-y-1/2 text-voi-400 text-sm font-medium hover:text-voi-300"
              disabled={isProcessing || maxShares === 0}
            >
              MAX
            </button>
          </div>
        </div>

        <!-- Preview -->
        {#if sharesAmount > 0}
          <div class="mb-4 p-3 bg-slate-700 rounded-lg">
            <div class="text-sm text-slate-400 mb-2">Withdrawal Preview</div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-300">Shares:</span>
              <span class="text-white">{sharesAmount.toFixed(tokenDecimals)} YBT</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-300">Transaction Fee:</span>
              <span class="text-white">{(Number(transactionFee) / 1_000_000).toFixed(6)} VOI</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-300">Percentage:</span>
              <span class="text-voi-400">{((sharesAmount / maxShares) * 100).toFixed(2)}%</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-300">You'll receive:</span>
              <span class="text-yellow-400">VOI</span>
            </div>
          </div>
        {/if}

        <!-- Error Display -->
        {#if error}
          <div class="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
            <div class="text-red-300 text-sm">{error}</div>
          </div>
        {/if}

        <!-- Warning -->
        {#if sharesAmount > 0}
          <div class="mb-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
            <div class="flex">
              <svg class="w-5 h-5 text-yellow-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
              </svg>
              <div class="text-sm">
                <p class="text-yellow-300 font-medium">Withdrawal Notice</p>
                <p class="text-yellow-400 mt-1">
                  Withdrawing shares will reduce your ownership percentage and future yield earnings.
                </p>
              </div>
            </div>
          </div>
        {/if}

        <!-- Actions -->
        <div class="flex gap-3">
          <button
            type="button"
            on:click={closeModal}
            class="btn-secondary flex-1"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            type="button"
            on:click={handleWithdraw}
            class="btn-withdraw flex-1"
            disabled={!canWithdraw}
          >
            {#if isProcessing}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Withdrawing...
            {:else}
              Withdraw
            {/if}
          </button>
        </div>

        <!-- Info -->
        <div class="mt-4 p-3 bg-slate-900 rounded-lg">
          <div class="text-xs text-slate-400">
            <p class="mb-1">• Withdrawal amounts are converted back to VOI</p>
            <p class="mb-1">• Transaction fees apply to all withdrawals</p>
            <p>• Withdrawals are processed immediately</p>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .text-voi-400 {
    color: #10b981;
  }
  
  .text-voi-300 {
    color: #34d399;
  }
  
  .btn-quick {
    @apply bg-slate-600 hover:bg-slate-500 text-white py-1 px-2 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
  }
  
  .btn-withdraw {
    @apply bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed;
  }
</style>