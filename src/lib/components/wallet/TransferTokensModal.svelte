<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { walletStore, walletBalance, walletAddress } from '$lib/stores/wallet';
  import { algorandService } from '$lib/services/algorand';
  import { Send, X, AlertTriangle, CheckCircle } from 'lucide-svelte';
  
  const dispatch = createEventDispatcher();
  
  let recipientAddress = '';
  let amount = '';
  let isTransferring = false;
  let transferError = '';
  let transferSuccess = false;
  let txId = '';
  
  function closeModal() {
    dispatch('close');
  }
  
  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }
  
  async function transferTokens() {
    if (!recipientAddress.trim() || !amount.trim()) {
      transferError = 'Please enter both recipient address and amount';
      return;
    }
    
    const amountVOI = parseFloat(amount);
    if (isNaN(amountVOI) || amountVOI <= 0) {
      transferError = 'Please enter a valid amount';
      return;
    }
    
    const amountMicroVOI = Math.floor(amountVOI * 1_000_000);
    const maxAmount = $walletBalance - 1000; // Leave some for transaction fee
    
    if (amountMicroVOI > maxAmount) {
      transferError = 'Insufficient balance (need to leave some for transaction fees)';
      return;
    }
    
    isTransferring = true;
    transferError = '';
    transferSuccess = false;
    
    try {
      const result = await algorandService.sendPayment(
        recipientAddress.trim(),
        amountMicroVOI
      );
      
      if (result.success) {
        transferSuccess = true;
        txId = result.txId;
        
        // Refresh wallet balance
        await walletStore.refreshBalance();
        
        // Clear form
        recipientAddress = '';
        amount = '';
      } else {
        transferError = result.error || 'Transfer failed';
      }
    } catch (error) {
      transferError = error instanceof Error ? error.message : 'Transfer failed';
    } finally {
      isTransferring = false;
    }
  }
  
  function validateAddress(address: string): boolean {
    return address.length === 58 && /^[A-Z2-7]+$/.test(address);
  }
  
  function setMaxAmount() {
    const maxVOI = Math.max(0, ($walletBalance - 1000) / 1_000_000);
    amount = maxVOI.toFixed(6);
  }
  
  $: isValidAddress = validateAddress(recipientAddress);
  $: isValidAmount = amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0;
  $: canTransfer = isValidAddress && isValidAmount && !isTransferring;
  $: formattedBalance = ($walletBalance / 1_000_000).toFixed(6);
</script>

<!-- Modal Overlay -->
<div 
  class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
  on:click={handleOverlayClick}
  role="dialog"
  aria-modal="true"
  aria-labelledby="transfer-modal-title"
>
  <div class="card max-w-md w-full max-h-[90vh] overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between p-6 border-b border-slate-700">
      <h2 id="transfer-modal-title" class="text-xl font-semibold text-theme flex items-center gap-2">
        <Send class="w-5 h-5" />
        Transfer Tokens
      </h2>
      <button
        on:click={closeModal}
        class="p-1 text-gray-400 hover:text-theme transition-colors"
      >
        <X class="w-5 h-5" />
      </button>
    </div>
    
    <!-- Content -->
    <div class="p-6 space-y-6">
      
      {#if transferSuccess}
        <!-- Success Message -->
        <div class="text-center space-y-4">
          <div class="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle class="w-8 h-8 text-theme" />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-green-400 mb-2">Transfer Successful!</h3>
            <p class="text-gray-300 mb-4">Your tokens have been sent successfully.</p>
            <div class="p-3 bg-slate-700/50 rounded-lg">
              <p class="text-sm text-gray-400 mb-1">Transaction ID:</p>
              <p class="font-mono text-xs text-theme break-all">{txId}</p>
            </div>
          </div>
          <button
            on:click={closeModal}
            class="btn-primary w-full"
          >
            Done
          </button>
        </div>
        
      {:else}
        <!-- Balance Display -->
        <div class="p-4 bg-slate-700/50 rounded-lg">
          <div class="text-center">
            <p class="text-sm text-gray-400 mb-1">Available Balance</p>
            <p class="text-2xl font-bold text-theme">{formattedBalance} VOI</p>
          </div>
        </div>
        
        <!-- Recipient Address -->
        <div class="space-y-2">
          <label for="recipient-address" class="block text-sm font-medium text-gray-300">
            Recipient Address
          </label>
          <input
            id="recipient-address"
            type="text"
            bind:value={recipientAddress}
            placeholder="Enter 58-character Algorand address"
            class="w-full input-field font-mono text-sm"
            class:border-green-500={recipientAddress && isValidAddress}
            class:border-red-500={recipientAddress && !isValidAddress}
          />
          {#if recipientAddress && !isValidAddress}
            <p class="text-red-400 text-sm">Please enter a valid Algorand address (58 characters)</p>
          {/if}
        </div>
        
        <!-- Amount -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label for="transfer-amount" class="block text-sm font-medium text-gray-300">
              Amount (VOI)
            </label>
            <button
              on:click={setMaxAmount}
              class="text-sm text-voi-400 hover:text-voi-300 transition-colors"
            >
              Max
            </button>
          </div>
          <input
            id="transfer-amount"
            type="number"
            step="0.000001"
            min="0"
            bind:value={amount}
            placeholder="0.000000"
            class="w-full input-field"
            class:border-green-500={amount && isValidAmount}
            class:border-red-500={amount && !isValidAmount}
          />
          {#if amount && !isValidAmount}
            <p class="text-red-400 text-sm">Please enter a valid amount greater than 0</p>
          {/if}
        </div>
        
        <!-- Error Display -->
        {#if transferError}
          <div class="p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
            <div class="flex items-start gap-2">
              <AlertTriangle class="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <p class="text-red-400 text-sm">{transferError}</p>
            </div>
          </div>
        {/if}
        
        <!-- Warning -->
        <div class="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
          <div class="flex items-start gap-3">
            <AlertTriangle class="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 class="font-semibold text-yellow-400 mb-1">Important</h4>
              <ul class="text-yellow-300 text-sm space-y-1">
                <li>• Double-check the recipient address</li>
                <li>• Transactions cannot be reversed</li>
                <li>• A small fee will be deducted</li>
              </ul>
            </div>
          </div>
        </div>
        
        <!-- Transfer Button -->
        <button
          on:click={transferTokens}
          class="w-full btn-primary"
          disabled={!canTransfer}
        >
          {#if isTransferring}
            <div class="flex items-center justify-center gap-2">
              <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Sending...
            </div>
          {:else}
            <div class="flex items-center justify-center gap-2">
              <Send class="w-4 h-4" />
              Send {amount || '0'} VOI
            </div>
          {/if}
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .btn-primary {
    @apply px-4 py-2 bg-voi-600 hover:bg-voi-700 disabled:bg-voi-600/50 text-theme font-medium rounded-lg transition-colors duration-200;
  }
  
  .input-field {
    @apply px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-theme placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-voi-500 focus:border-transparent;
  }
  
  .card {
    @apply bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl shadow-2xl border border-slate-700;
  }
</style>