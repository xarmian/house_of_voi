<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { walletStore } from '$lib/stores/walletAdapter';
  import { ybtService } from '$lib/services/ybt';
  import type { YBTDepositParams } from '$lib/types/ybt';

  export let open = false;

  const dispatch = createEventDispatcher();

  let depositAmount = '';
  let isProcessing = false;
  let error = '';
  let depositCost = BigInt(0);
  let isLoadingCost = false;

  $: voiAmount = parseFloat(depositAmount) || 0;
  $: microVoiAmount = BigInt(Math.floor(voiAmount * 1_000_000));
  $: totalPaymentAmount = microVoiAmount + depositCost;
  $: transactionFee = BigInt(4000); // 4000 microAlgos for app call + inner payment
  $: totalRequired = totalPaymentAmount + transactionFee;
  $: canDeposit = voiAmount > 0 && $walletStore.balance >= Number(totalRequired) && !isProcessing && $walletStore.account;

  async function loadDepositCost() {
    if (!open) return;
    
    isLoadingCost = true;
    try {
      depositCost = await ybtService.getDepositCost();
    } catch (err) {
      console.error('Error loading deposit cost:', err);
      error = 'Failed to load deposit cost';
    } finally {
      isLoadingCost = false;
    }
  }

  async function handleDeposit() {
    console.log('handleDeposit called', { canDeposit, account: $walletStore.account });
    
    if (!canDeposit || !$walletStore.account) return;

    isProcessing = true;
    error = '';
    
    console.log('Starting deposit with params:', { totalPaymentAmount: Number(totalPaymentAmount) });

    try {
      const params: YBTDepositParams = {
        amount: totalPaymentAmount
      };

      const result = await ybtService.deposit(params);
      console.log('Deposit result:', result);

      if (result.success) {
        console.log('Deposit successful, dispatching success event');
        dispatch('success', result);
        
        // Show success message briefly before closing
        setTimeout(() => {
          open = false;
          resetForm();
        }, 1000);
      } else {
        console.log('Deposit failed:', result.error);
        error = result.error || 'Deposit failed';
        isProcessing = false;
      }
    } catch (err) {
      console.error('Deposit error:', err);
      error = err instanceof Error ? err.message : 'An unexpected error occurred';
      isProcessing = false;
    }
  }

  function resetForm() {
    depositAmount = '';
    error = '';
    depositCost = BigInt(0);
  }

  function closeModal() {
    open = false;
    resetForm();
  }

  function setMaxAmount() {
    const maxVoi = $walletStore.balance / 1_000_000;
    const depositCostVoi = Number(depositCost) / 1_000_000;
    const transactionFeeVoi = Number(transactionFee) / 1_000_000;
    const availableForDeposit = Math.max(0, maxVoi - depositCostVoi - transactionFeeVoi - 0.001); // Leave 0.001 VOI buffer
    depositAmount = availableForDeposit.toFixed(6);
  }

  // Load deposit cost when modal opens
  $: if (open) {
    loadDepositCost();
  }
</script>

{#if open}
  <!-- Modal Backdrop -->
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <!-- Modal Content -->
    <div class="bg-slate-800 rounded-lg shadow-xl max-w-md w-full border border-slate-700">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-slate-700">
        <h2 class="text-xl font-bold text-theme">Deposit to YBT</h2>
        <button
          on:click={closeModal}
          class="text-slate-400 hover:text-theme transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="p-6">
        <!-- Balance Display -->
        <div class="mb-4 p-3 bg-slate-700 rounded-lg">
          <div class="text-sm text-slate-400">Available Balance</div>
          <div class="text-lg font-bold text-theme">
            {($walletStore.balance / 1_000_000).toFixed(6)} VOI
          </div>
        </div>

        <!-- Deposit Cost Info -->
        {#if isLoadingCost}
          <div class="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <div class="animate-pulse">
              <div class="text-sm text-blue-300">Loading deposit cost...</div>
            </div>
          </div>
        {:else if depositCost > BigInt(0)}
          <div class="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <div class="text-sm text-blue-300">Minimum Deposit</div>
            <div class="text-blue-200 font-medium">
              {(Number(depositCost) / 1_000_000).toFixed(6)} VOI
            </div>
          </div>
        {/if}

        <!-- Amount Input -->
        <div class="mb-4">
          <label for="depositAmount" class="block text-sm font-medium text-slate-300 mb-2">
            Deposit Amount (VOI)
          </label>
          <div class="relative">
            <input
              id="depositAmount"
              type="number"
              step="0.000001"
              min="0"
              max={$walletStore.balance / 1_000_000}
              bind:value={depositAmount}
              placeholder="0.000000"
              class="input-field w-full pr-16"
              disabled={isProcessing}
            />
            <button
              type="button"
              on:click={setMaxAmount}
              class="absolute right-2 top-1/2 transform -translate-y-1/2 text-voi-400 text-sm font-medium hover:text-voi-300"
              disabled={isProcessing}
            >
              MAX
            </button>
          </div>
        </div>

        <!-- Preview -->
        {#if voiAmount > 0}
          <div class="mb-4 p-3 bg-slate-700 rounded-lg">
            <div class="text-sm text-slate-400 mb-2">Deposit Preview</div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-300">Deposit Amount:</span>
              <span class="text-theme">{voiAmount.toFixed(6)} VOI</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-300">Deposit Cost:</span>
              <span class="text-theme">{(Number(depositCost) / 1_000_000).toFixed(6)} VOI</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-300">Transaction Fee:</span>
              <span class="text-theme">{(Number(transactionFee) / 1_000_000).toFixed(6)} VOI</span>
            </div>
            <div class="flex justify-between text-sm border-t border-slate-600 pt-2 mt-2">
              <span class="text-slate-300 font-medium">Total Required:</span>
              <span class="text-theme font-medium">{(Number(totalRequired) / 1_000_000).toFixed(6)} VOI</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-300">You'll receive:</span>
              <span class="text-voi-400">YBT Shares</span>
            </div>
          </div>
        {/if}

        <!-- Error Display -->
        {#if error}
          <div class="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
            <div class="text-red-300 text-sm">{error}</div>
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
            on:click={handleDeposit}
            class="btn-primary flex-1"
            disabled={!canDeposit}
          >
            {#if isProcessing}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-theme" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Depositing...
            {:else}
              Deposit
            {/if}
          </button>
        </div>

        <!-- Info -->
        <div class="mt-4 p-3 bg-slate-900 rounded-lg">
          <div class="text-xs text-slate-400">
            <p class="mb-1">• YBT shares represent your portion of the house funds</p>
            <p class="mb-1">• You earn yield based on your share percentage</p>
            <p>• Shares can be withdrawn at any time</p>
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
  
  .btn-primary {
    @apply bg-voi-600 hover:bg-voi-700 text-theme font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed;
  }
  
  .bg-voi-600 {
    background-color: #059669;
  }
  
  .hover\:bg-voi-700:hover {
    background-color: #047857;
  }
</style>