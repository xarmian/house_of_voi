<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { ybtTransfersStore, ybtTransfersData, ybtTransfersLoading } from '$lib/stores/ybtTransfers';
  import { ybtTransfersService } from '$lib/services/ybtTransfers';
  import type { YBTTransaction } from '$lib/types/ybtTransfers';
  import type { ContractPair } from '$lib/types/multiContract';

  const dispatch = createEventDispatcher();

  // Props
  export let open = false;
  export let contractContext: ContractPair | null = null;
  export let userAddress: string | null = null;

  // Modal element for focus management
  let modalElement: HTMLElement;

  // Local state
  let exportLoading = false;
  let feedback = '';
  let feedbackTimer: NodeJS.Timeout;

  // Handle escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close();
    }
  }

  // Close modal
  function close() {
    open = false;
    dispatch('close');
  }

  // Handle backdrop click
  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  // Format date for display
  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  // Format time for display
  function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  // Format transaction amount
  function formatAmount(amount: bigint): string {
    return ybtTransfersService.formatTransferAmount(amount);
  }

  // Get transaction type display text
  function getTransactionType(direction: 'in' | 'out'): string {
    return direction === 'in' ? 'Deposit' : 'Withdrawal';
  }

  // Get transaction type CSS class
  function getTransactionTypeClass(direction: 'in' | 'out'): string {
    return direction === 'in' ? 'text-green-400' : 'text-red-400';
  }

  // Format address for display
  function formatAddress(address: string): string {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  }

  // Show feedback message
  function showFeedback(message: string) {
    feedback = message;
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      feedback = '';
    }, 3000);
  }

  // Export to CSV
  async function exportToCSV() {
    if (!$ybtTransfersData) return;
    
    exportLoading = true;
    try {
      const csvContent = ybtTransfersService.exportTransfersToCSV($ybtTransfersData.transactions);
      const filename = `ybt-transfers-${userAddress ? formatAddress(userAddress) : 'history'}-${new Date().toISOString().split('T')[0]}.csv`;
      ybtTransfersService.downloadCSV(csvContent, filename);
      
      showFeedback('Transfer history exported to CSV');
      dispatch('exported', { filename });
    } catch (error) {
      console.error('Export failed:', error);
      showFeedback('Export failed. Please try again.');
    } finally {
      exportLoading = false;
    }
  }

  // Copy transaction ID to clipboard
  async function copyTxId(txId: string) {
    try {
      await navigator.clipboard.writeText(txId);
      showFeedback('Transaction ID copied to clipboard');
      dispatch('copied', { txId });
    } catch (error) {
      console.error('Copy failed:', error);
      showFeedback('Copy failed. Please try again.');
    }
  }

  // Load transfer data when modal opens
  $: if (open && userAddress) {
    ybtTransfersStore.refresh(userAddress, contractContext?.id);
  }

  // Set up event listeners
  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeydown);
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeydown);
    }
  });
</script>

{#if open}
  <!-- Modal backdrop -->
  <div 
    class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    on:click={handleBackdropClick}
    transition:fade={{ duration: 200 }}
  >
    <!-- Modal content -->
    <div 
      bind:this={modalElement}
      class="bg-surface-primary rounded-xl border border-surface-border w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl"
      transition:fly={{ y: 20, duration: 300 }}
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-surface-border bg-surface-primary/50">
        <div class="flex items-center gap-3">
          <div>
            <h2 class="text-xl font-bold text-theme">House Transaction History</h2>
            {#if contractContext}
              <p class="text-sm text-slate-400">{contractContext.name} • {contractContext.description}</p>
            {/if}
            {#if userAddress}
              <p class="text-xs text-slate-500 font-mono mt-1">{formatAddress(userAddress)}</p>
            {/if}
            {#if feedback}
              <div class="mt-2 px-3 py-1.5 bg-green-900/30 border border-green-500/30 rounded-md">
                <p class="text-xs text-green-400 font-medium">{feedback}</p>
              </div>
            {/if}
          </div>
        </div>
        
        <div class="flex items-center gap-2">
          {#if $ybtTransfersData && $ybtTransfersData.transactions.length > 0}
            <button
              on:click={exportToCSV}
              disabled={exportLoading}
              class="btn-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if exportLoading}
                <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-theme" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Exporting...
              {:else}
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
                </svg>
                Export CSV
              {/if}
            </button>
          {/if}
          
          <button
            on:click={close}
            class="p-2 text-slate-400 hover:text-theme transition-colors"
            title="Close modal"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-hidden">
        {#if $ybtTransfersLoading}
          <!-- Loading state -->
          <div class="flex items-center justify-center py-12">
            <div class="text-center">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-500 mx-auto"></div>
              <p class="text-slate-400 mt-3">Loading transaction history...</p>
            </div>
          </div>
        {:else if $ybtTransfersData && $ybtTransfersData.transactions.length > 0}
          <!-- Transaction table -->
          <div class="overflow-auto max-h-[60vh]">
            <table class="w-full text-sm">
              <thead class="bg-slate-700/50 sticky top-0">
                <tr class="text-left">
                  <th class="px-6 py-4 font-semibold text-slate-200 text-sm">Date</th>
                  <th class="px-6 py-4 font-semibold text-slate-200 text-sm">Time</th>
                  <th class="px-6 py-4 font-semibold text-slate-200 text-sm">Type</th>
                  <th class="px-6 py-4 font-semibold text-slate-200 text-sm text-right">Amount</th>
                  <th class="px-6 py-4 font-semibold text-slate-200 text-sm">Transaction ID</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-700">
                {#each $ybtTransfersData.transactions as transaction}
                  <tr class="hover:bg-slate-700/30 transition-colors">
                    <td class="px-6 py-4 text-slate-300">{formatDate(transaction.ts)}</td>
                    <td class="px-6 py-4 text-slate-400 font-mono text-xs">{formatTime(transaction.ts)}</td>
                    <td class="px-6 py-4">
                      <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full {transaction.direction === 'in' ? 'bg-green-400' : 'bg-red-400'}"></div>
                        <span class="font-medium {getTransactionTypeClass(transaction.direction)}">
                          {getTransactionType(transaction.direction)}
                        </span>
                      </div>
                    </td>
                    <td class="px-6 py-4 text-right">
                      <div class="font-mono {getTransactionTypeClass(transaction.direction)} font-semibold">
                        {transaction.direction === 'in' ? '+' : '-'}{formatAmount(transaction.amount)} VOI
                      </div>
                    </td>
                    <td class="px-6 py-4">
                      <div class="flex items-center gap-2">
                        <a
                          href="https://block.voi.network/explorer/transaction/{transaction.txid}"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="font-mono text-xs text-slate-400 hover:text-theme transition-colors bg-slate-700/50 hover:bg-slate-600/50 px-3 py-1.5 rounded-md flex items-center gap-1.5 group"
                          title="View on block explorer"
                        >
                          {transaction.txid.slice(0, 8)}...{transaction.txid.slice(-8)}
                          <svg class="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                          </svg>
                        </a>
                        <button
                          on:click={() => copyTxId(transaction.txid)}
                          class="p-1.5 text-slate-400 hover:text-theme transition-colors bg-slate-700/50 hover:bg-slate-600/50 rounded-md"
                          title="Copy transaction ID"
                        >
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- Summary footer -->
          {#if $ybtTransfersData.totals}
            <div class="border-t border-slate-700 p-6 bg-slate-800/50">
              <h3 class="text-lg font-medium text-theme mb-4">Summary</h3>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="bg-slate-700/50 rounded-lg p-4">
                  <div class="text-slate-400 text-sm font-medium mb-1">Total Deposited</div>
                  <div class="text-green-400 text-xl font-bold">
                    +{formatAmount($ybtTransfersData.totals.in)} VOI
                  </div>
                </div>
                <div class="bg-slate-700/50 rounded-lg p-4">
                  <div class="text-slate-400 text-sm font-medium mb-1">Total Withdrawn</div>
                  <div class="text-red-400 text-xl font-bold">
                    -{formatAmount($ybtTransfersData.totals.out)} VOI
                  </div>
                </div>
                <div class="bg-slate-700/50 rounded-lg p-4">
                  <div class="text-slate-400 text-sm font-medium mb-1">Net Balance</div>
                  <div class="text-theme text-xl font-bold">
                    {formatAmount($ybtTransfersData.totals.net)} VOI
                  </div>
                </div>
              </div>
            </div>
          {/if}
        {:else}
          <!-- Empty state -->
          <div class="flex items-center justify-center py-12">
            <div class="text-center">
              <svg class="w-16 h-16 mx-auto mb-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <h3 class="text-lg font-medium text-slate-300 mb-2">No Transaction History</h3>
              <p class="text-slate-400">You haven't made any YBT deposits or withdrawals yet.</p>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .btn-secondary {
    @apply bg-slate-700 hover:bg-slate-600 text-theme font-semibold py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center;
    min-height: 40px;
  }
  
  .text-voi-500 {
    color: #10b981;
  }
  
  .border-voi-500 {
    border-color: #10b981;
  }
</style>