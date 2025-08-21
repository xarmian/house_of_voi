<!-- Phase 7: Transaction History Component -->
<!-- Shows blockchain transactions with explorer links -->

<script lang="ts">
  import { queueStore } from '$lib/stores/queue';
  import { ExternalLink, Copy, Clock, CheckCircle, XCircle } from 'lucide-svelte';
  import { BLOCKCHAIN_CONFIG } from '$lib/constants/network';
  
  $: completedSpins = $queueStore.spins.filter(spin => 
    spin.txId && ['completed', 'failed', 'ready_to_claim'].includes(spin.status)
  );
  
  function getExplorerUrl(txId: string): string {
    return `${BLOCKCHAIN_CONFIG.explorerUrl}/transaction/${txId}`;
  }
  
  async function copyTxId(txId: string) {
    try {
      await navigator.clipboard.writeText(txId);
      // Show success feedback (could add toast notification here)
      console.log('Transaction ID copied to clipboard');
    } catch (error) {
      console.error('Failed to copy transaction ID:', error);
      // Fallback for older browsers
      fallbackCopyTextToClipboard(txId);
    }
  }
  
  function fallbackCopyTextToClipboard(text: string) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      console.log('Transaction ID copied to clipboard (fallback)');
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    
    document.body.removeChild(textArea);
  }
  
  function formatTxId(txId: string): string {
    return txId.length > 16 ? `${txId.slice(0, 8)}...${txId.slice(-8)}` : txId;
  }
  
  function formatAmount(amount: number): string {
    return (amount / 1_000_000).toFixed(2);
  }
  
  function formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  function getStatusIcon(status: string) {
    switch (status) {
      case 'completed':
        return CheckCircle;
      case 'failed':
        return XCircle;
      case 'ready_to_claim':
        return Clock;
      default:
        return Clock;
    }
  }
  
  function getStatusColor(status: string): string {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'ready_to_claim':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  }
  
  function getStatusText(status: string): string {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'ready_to_claim':
        return 'Ready to Claim';
      default:
        return status;
    }
  }
</script>

{#if completedSpins.length > 0}
  <div class="transaction-history card p-4">
    <h3 class="text-lg font-semibold text-theme mb-4 flex items-center gap-2">
      <ExternalLink class="w-5 h-5" />
      Transaction History
    </h3>
    
    <div class="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
      {#each completedSpins.slice().reverse() as spin}
        <div class="transaction-item">
          <div class="transaction-info">
            <div class="tx-header">
              <div class="tx-id">
                <span class="font-mono text-sm text-gray-300">{formatTxId(spin.txId || '')}</span>
                <button
                  on:click={() => copyTxId(spin.txId || '')}
                  class="copy-button"
                  title="Copy transaction ID"
                >
                  <Copy class="w-3 h-3" />
                </button>
              </div>
              
              <div class="tx-status">
                <svelte:component 
                  this={getStatusIcon(spin.status)} 
                  class="w-4 h-4 {getStatusColor(spin.status)}"
                />
                <span class="status-text {getStatusColor(spin.status)}">
                  {getStatusText(spin.status)}
                </span>
              </div>
            </div>
            
            <div class="tx-details">
              <div class="detail-item">
                <span class="label">Amount:</span>
                <span class="amount">{formatAmount(spin.totalBet)} VOI</span>
              </div>
              
              <div class="detail-item">
                <span class="label">Paylines:</span>
                <span class="value">{spin.selectedPaylines}</span>
              </div>
              
              {#if spin.winnings && spin.winnings > 0}
                <div class="detail-item">
                  <span class="label">Winnings:</span>
                  <span class="winnings">{formatAmount(spin.winnings)} VOI</span>
                </div>
              {/if}
              
              <div class="detail-item">
                <span class="label">Time:</span>
                <span class="value">{formatTimestamp(spin.timestamp)}</span>
              </div>
            </div>
          </div>
          
          <a
            href={getExplorerUrl(spin.txId || '')}
            target="_blank"
            rel="noopener noreferrer"
            class="explorer-link"
            title="View on Voi Explorer"
          >
            <ExternalLink class="w-4 h-4" />
          </a>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <div class="transaction-history card p-4">
    <h3 class="text-lg font-semibold text-theme mb-4 flex items-center gap-2">
      <ExternalLink class="w-5 h-5" />
      Transaction History
    </h3>
    
    <div class="empty-state">
      <Clock class="w-8 h-8 text-gray-500 mx-auto mb-2" />
      <p class="text-gray-400 text-sm text-center">
        No transactions yet.<br />
        Start playing to see your transaction history here.
      </p>
    </div>
  </div>
{/if}

<style>
  .transaction-history {
    @apply bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm;
  }
  
  .transaction-item {
    @apply flex items-center justify-between p-3 bg-slate-700/30 rounded-md hover:bg-slate-700/50 transition-colors;
  }
  
  .transaction-info {
    @apply flex-1 min-w-0;
  }
  
  .tx-header {
    @apply flex items-center justify-between mb-2;
  }
  
  .tx-id {
    @apply flex items-center gap-2;
  }
  
  .copy-button {
    @apply text-gray-400 hover:text-theme transition-colors p-1 rounded hover:bg-slate-600/50;
  }
  
  .tx-status {
    @apply flex items-center gap-1;
  }
  
  .status-text {
    @apply text-xs font-medium;
  }
  
  .tx-details {
    @apply grid grid-cols-2 gap-2 text-xs;
  }
  
  .detail-item {
    @apply flex items-center gap-1;
  }
  
  .label {
    @apply text-gray-500;
  }
  
  .value {
    @apply text-gray-300;
  }
  
  .amount {
    @apply font-semibold text-theme;
  }
  
  .winnings {
    @apply font-semibold text-green-400;
  }
  
  .explorer-link {
    @apply text-gray-400 hover:text-voi-400 transition-colors p-2 rounded hover:bg-slate-600/50;
  }
  
  .empty-state {
    @apply py-8;
  }
  
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgb(71 85 105) transparent;
  }
  
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgb(71 85 105);
    border-radius: 3px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgb(100 116 139);
  }
  
  /* Mobile optimization */
  @media (max-width: 640px) {
    .tx-header {
      @apply flex-col items-start gap-2;
    }
    
    .tx-details {
      @apply grid-cols-1 gap-1;
    }
    
    .transaction-item {
      @apply flex-col items-start gap-3;
    }
    
    .explorer-link {
      @apply self-end;
    }
  }
</style>