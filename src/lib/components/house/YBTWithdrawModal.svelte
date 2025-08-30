<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { walletStore as externalWalletStore } from '$lib/stores/walletAdapter';
  import { walletStore as gamingWalletStore } from '$lib/stores/wallet';
  import { ybtService } from '$lib/services/ybt';
  import type { YBTWithdrawParams } from '$lib/types/ybt';

  export let open = false;
  export let userShares: bigint = BigInt(0);
  export let selectedWalletSource: 'gaming' | 'external' = 'external';
  
  let tokenDecimals = 9; // Default to 9, will be fetched
  let totalSupply = BigInt(0);
  let contractValue = BigInt(0);

  const dispatch = createEventDispatcher();

  let withdrawAmount = '';
  let isProcessing = false;
  let error = '';

  // Get wallet context from YBT service to ensure we use the wallet that will actually be used
  let actualWalletContext: any = null;
  let walletBalance = 0;
  let walletAccount: any = null;

  async function loadWalletContext() {
    try {
      actualWalletContext = await ybtService.getWalletContext();
      if (actualWalletContext) {
        if (actualWalletContext.type === 'gaming') {
          walletBalance = $gamingWalletStore.balance;
          walletAccount = $gamingWalletStore.account;
        } else {
          walletBalance = $externalWalletStore.balance;
          walletAccount = $externalWalletStore.account;
        }
      }
    } catch (error) {
      console.error('Error loading wallet context:', error);
    }
  }

  $: sharesAmount = parseFloat(withdrawAmount) || 0;
  $: sharesBigInt = BigInt(Math.floor(sharesAmount * (10 ** tokenDecimals)));
  $: transactionFee = BigInt(6000); // 6000 microAlgos for app call + inner payment
  $: canWithdraw = sharesAmount > 0 && sharesBigInt <= userShares && !isProcessing && walletAccount && walletBalance >= Number(transactionFee);
  $: maxShares = Number(userShares) / (10 ** tokenDecimals);
  $: voiAmount = ybtService.calculateUserPortfolioValue(sharesBigInt, totalSupply, contractValue);

  async function handleWithdraw() {
    if (!canWithdraw || !walletAccount) return;

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
  
  async function loadTokenData() {
    try {
      const globalState = await ybtService.getGlobalState();
      tokenDecimals = globalState.decimals;
      totalSupply = globalState.totalSupply;
      contractValue = await ybtService.getContractTotalValue();
    } catch (error) {
      console.error('Error loading token data:', error);
      // Keep default values
    }
  }
  
  // Load token data and wallet context when modal opens
  $: if (open) {
    loadTokenData();
    loadWalletContext();
  }
</script>

{#if open}
  <!-- Modal Backdrop -->
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-3 sm:p-4 z-50">
    <!-- Modal Content -->
    <div class="bg-slate-800 rounded-lg shadow-xl max-w-md w-full border border-slate-700 max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 sm:p-6 border-b border-slate-700">
        <h2 class="text-lg sm:text-xl font-bold text-theme">Withdraw YBT Shares</h2>
        <button
          on:click={closeModal}
          class="text-slate-400 hover:text-theme transition-colors p-2"
          style="min-height: 44px; min-width: 44px;"
        >
          <svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="p-4 sm:p-6">
        <!-- Available Shares Display -->
        <div class="mb-4 p-3 bg-slate-700 rounded-lg">
          <div class="text-xs sm:text-sm text-slate-400">Available Shares</div>
          <div class="text-base sm:text-lg font-bold text-theme">
            {maxShares.toFixed(tokenDecimals)} YBT
          </div>
        </div>

        <!-- Quick Percentage Buttons -->
        <div class="mb-4">
          <div class="text-xs sm:text-sm text-slate-300 mb-2">Quick Select</div>
          <div class="grid grid-cols-4 gap-2">
            <button
              type="button"
              on:click={() => setPercentage(25)}
              class="btn-quick text-xs"
              style="min-height: 40px;"
              disabled={isProcessing || maxShares === 0}
            >
              25%
            </button>
            <button
              type="button"
              on:click={() => setPercentage(50)}
              class="btn-quick text-xs"
              style="min-height: 40px;"
              disabled={isProcessing || maxShares === 0}
            >
              50%
            </button>
            <button
              type="button"
              on:click={() => setPercentage(75)}
              class="btn-quick text-xs"
              style="min-height: 40px;"
              disabled={isProcessing || maxShares === 0}
            >
              75%
            </button>
            <button
              type="button"
              on:click={setMaxAmount}
              class="btn-quick text-xs"
              style="min-height: 40px;"
              disabled={isProcessing || maxShares === 0}
            >
              MAX
            </button>
          </div>
        </div>

        <!-- Amount Input -->
        <div class="mb-4">
          <label for="withdrawAmount" class="block text-xs sm:text-sm font-medium text-slate-300 mb-2">
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
              class="input-field w-full pr-12 sm:pr-16 text-sm sm:text-base"
              style="min-height: 44px;"
              disabled={isProcessing}
            />
            <button
              type="button"
              on:click={setMaxAmount}
              class="absolute right-2 top-1/2 transform -translate-y-1/2 text-voi-400 text-xs sm:text-sm font-medium hover:text-voi-300 px-2 py-1"
              style="min-height: 32px;"
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
              <span class="text-theme">{sharesAmount.toFixed(tokenDecimals)} YBT</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-300">Transaction Fee:</span>
              <span class="text-theme">{(Number(transactionFee) / 1_000_000).toFixed(6)} VOI</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-300">Percentage:</span>
              <span class="text-voi-400">{((sharesAmount / maxShares) * 100).toFixed(2)}%</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-300">You'll receive:</span>
              <span class="text-yellow-400">{(Number(voiAmount) / 1_000_000).toFixed(6)} VOI</span>
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
        <div class="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            on:click={closeModal}
            class="btn-secondary flex-1 text-sm sm:text-base"
            style="min-height: 48px;"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            type="button"
            on:click={handleWithdraw}
            class="btn-withdraw flex-1 text-sm sm:text-base"
            style="min-height: 48px;"
            disabled={!canWithdraw}
          >
            {#if isProcessing}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-theme" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
    @apply bg-slate-600 hover:bg-slate-500 text-theme py-2 px-2 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
    min-height: 40px;
  }
  
  .btn-withdraw {
    @apply bg-red-600 hover:bg-red-700 text-theme font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed;
    min-height: 44px;
  }
  
  .btn-secondary {
    @apply bg-slate-700 hover:bg-slate-600 text-theme font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed;
    min-height: 44px;
  }
  
  .input-field {
    @apply bg-slate-700 border border-slate-600 rounded-lg px-3 py-3 text-theme focus:border-voi-400 focus:outline-none transition-colors duration-200;
    min-height: 44px;
  }
</style>