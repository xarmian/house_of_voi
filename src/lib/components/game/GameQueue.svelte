<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { Clock, RefreshCw, TrendingUp, TrendingDown, X, Check, Loader, Info, Share2 } from 'lucide-svelte';
  import { queueStore, queueStats, pendingSpins, recentSpins, allSpins } from '$lib/stores/queue';
  import { currentSpinId } from '$lib/stores/game';
  import { formatVOI } from '$lib/constants/betting';
  import { ensureBase32TxId, formatTxIdForDisplay } from '$lib/utils/transactionUtils';
  import { SpinStatus } from '$lib/types/queue';
  import type { QueuedSpin } from '$lib/types/queue';
  import { playButtonClick } from '$lib/services/soundService';
  import SpinDetailsModal from '$lib/components/modals/SpinDetailsModal.svelte';
  
  export let maxHeight = '400px';
  
  // Removed unused auto refresh interval
  let showCompleted = true;
  let selectedTab: 'recent' = 'recent';
  let showSpinDetailsModal = false;
  let selectedSpin: QueuedSpin | null = null;
  
  // Pagination state
  let currentPage = 0;
  const itemsPerPage = 10;
  
  // Track which spin is being replayed
  let replayingSpinId: string | null = null;
  let replayTimeout: NodeJS.Timeout | null = null;
  
  // Track spins that have been shown as "Completed" to prevent reverting to "Submitting"
  let completedSpins = new Set<string>();
  
  // Track share button states
  let sharingSpinId: string | null = null;
  let shareSuccess = false;
  
  onDestroy(() => {
    // Cleanup not needed anymore
    if (replayTimeout) {
      clearTimeout(replayTimeout);
    }
  });
  
  // Clear replaying spin when a new current spin appears
  $: if ($currentSpinId && replayingSpinId && $currentSpinId !== replayingSpinId) {
    replayingSpinId = null;
    if (replayTimeout) {
      clearTimeout(replayTimeout);
      replayTimeout = null;
    }
  }
  
  function getStatusIcon(status: SpinStatus, spin?: QueuedSpin) {
    // If this spin was previously completed, keep showing checkmark
    if (spin && completedSpins.has(spin.id)) {
      return Check;
    }
    
    // If not revealed yet, show as confirming loader
    if (spin && (status === SpinStatus.READY_TO_CLAIM || status === SpinStatus.CLAIMING || status === SpinStatus.COMPLETED) && !spin.revealed) {
      return Loader;
    }

    switch (status) {
      case SpinStatus.PENDING:
      case SpinStatus.SUBMITTING:
      case SpinStatus.WAITING:
      case SpinStatus.PROCESSING:
        return Loader;
      case SpinStatus.READY_TO_CLAIM:
      case SpinStatus.CLAIMING:
      case SpinStatus.COMPLETED:
        return Check;
      case SpinStatus.FAILED:
      case SpinStatus.EXPIRED:
        return X;
      default:
        return Loader;
    }
  }
  
  function getStatusColor(status: SpinStatus, spin?: QueuedSpin): string {
    // If this spin was previously completed, keep showing green
    if (spin && completedSpins.has(spin.id)) {
      return 'text-green-400';
    }
    
    // If not revealed yet, keep confirming color
    if (spin && (status === SpinStatus.READY_TO_CLAIM || status === SpinStatus.CLAIMING || status === SpinStatus.COMPLETED) && !spin.revealed) {
      return 'text-blue-400';
    }

    switch (status) {
      case SpinStatus.PENDING:
      case SpinStatus.SUBMITTING:
      case SpinStatus.WAITING:
      case SpinStatus.PROCESSING:
        return 'text-blue-400';
      case SpinStatus.READY_TO_CLAIM:
      case SpinStatus.CLAIMING:
      case SpinStatus.COMPLETED:
        return 'text-green-400';
      case SpinStatus.FAILED:
      case SpinStatus.EXPIRED:
        return 'text-red-400';
      default:
        return 'text-blue-400';
    }
  }
  
  function getStatusText(status: SpinStatus, spin?: QueuedSpin): string {
    // Defensive logic: once a spin has been shown as "Completed", never revert to "Submitting"
    if (spin && (status === SpinStatus.READY_TO_CLAIM || status === SpinStatus.CLAIMING || status === SpinStatus.COMPLETED)) {
      // Until the spin has been visually revealed, keep showing Confirming
      if (!spin.revealed) {
        return 'Confirming';
      }
      completedSpins.add(spin.id);
      return 'Completed';
    }
    
    // If this spin was previously completed, keep showing "Completed"
    if (spin && completedSpins.has(spin.id)) {
      return 'Completed';
    }
    
    switch (status) {
      case SpinStatus.PENDING:
      case SpinStatus.SUBMITTING:
        return 'Submitting';
      case SpinStatus.WAITING:
      case SpinStatus.PROCESSING:
        return 'Confirming';
      case SpinStatus.READY_TO_CLAIM:
        return 'Confirming'; // Show as "Confirming" until actually displayed
      case SpinStatus.CLAIMING:
      case SpinStatus.COMPLETED:
        return 'Completed';
      case SpinStatus.FAILED:
      case SpinStatus.EXPIRED:
        return 'Failed';
      default:
        return 'Submitting';
    }
  }
  
  function formatTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return new Date(timestamp).toLocaleDateString();
  }
  

  function handleReplaySpin(spin: QueuedSpin) {
    console.log('🎮 Replaying spin:', spin.id);
    
    // Play button click sound for replay
    playButtonClick().catch(() => {
      // Ignore sound errors
    });
    
    // Clear any existing replay timeout
    if (replayTimeout) {
      clearTimeout(replayTimeout);
    }
    
    // Set this as the replaying spin
    replayingSpinId = spin.id;
    
    // Clear the replaying spin after 5 seconds
    replayTimeout = setTimeout(() => {
      replayingSpinId = null;
      replayTimeout = null;
    }, 5000);
    
    // Dispatch custom event to parent component with replay data
    const event = new CustomEvent('replay-spin', {
      detail: {
        spin,
        outcome: spin.outcome,
        winnings: spin.winnings || 0,
        betAmount: spin.totalBet
      }
    });
    
    // Dispatch to parent element
    document.dispatchEvent(event);
  }
  
  function clearCompleted() {
    queueStore.clearOldSpins(0); // Clear all completed spins
    currentPage = 0; // Reset pagination after clearing
  }
  
  
  function goToPage(page: number) {
    currentPage = Math.max(0, Math.min(page, totalPages - 1));
  }
  
  function previousPage() {
    if (currentPage > 0) {
      currentPage--;
    }
  }
  
  function nextPage() {
    if (currentPage < totalPages - 1) {
      currentPage++;
    }
  }

  function openSpinDetails(spin: QueuedSpin) {
    selectedSpin = spin;
    showSpinDetailsModal = true;
  }

  function closeSpinDetails() {
    selectedSpin = null;
    showSpinDetailsModal = false;
  }

  function getExplorerUrl(txId: string): string {
    // Ensure we use the base32 format for the explorer URL
    const base32TxId = ensureBase32TxId(txId);
    return `https://block.voi.network/explorer/transaction/${base32TxId}`;
  }

  function formatTxId(txId: string): string {
    // Use the utility function that handles conversion and formatting
    return formatTxIdForDisplay(txId, 8);
  }
  
  async function handleShareSpin(spin: QueuedSpin) {
    try {
      sharingSpinId = spin.id;

      let url: string;
      // Use transaction ID if available (shortest and most reliable)
      if (spin.txId) {
        url = `${window.location.origin}/replay?tx=${encodeURIComponent(spin.txId)}`;
      } else {
        // Fallback when transaction ID is not available
        console.warn('Cannot share spin without transaction ID');
        return;
      }

      await navigator.clipboard.writeText(url);
      
      shareSuccess = true;
      setTimeout(() => {
        shareSuccess = false;
        sharingSpinId = null;
      }, 2000);
      
      // Play button click sound
      playButtonClick().catch(() => {
        // Ignore sound errors
      });
    } catch (error) {
      console.error('Failed to share spin:', error);
      sharingSpinId = null;
    }
  }
  
  $: allRecentSpins = (() => {
    // Create a Map to deduplicate by ID, ensuring each spin appears only once
    const spinMap = new Map();
    
    // Add pending spins first (they take priority)
    $pendingSpins.forEach(spin => spinMap.set(spin.id, spin));
    
    // Add all non-pending spins
    $allSpins.forEach(spin => {
      if (!spinMap.has(spin.id)) {
        spinMap.set(spin.id, spin);
      }
    });
    
    // Convert back to array and sort by timestamp
    const spins = Array.from(spinMap.values()).sort((a, b) => b.timestamp - a.timestamp);
    
    // Cleanup completedSpins Set to prevent memory leaks
    const currentSpinIds = new Set(spins.map(s => s.id));
    completedSpins.forEach(id => {
      if (!currentSpinIds.has(id)) {
        completedSpins.delete(id);
      }
    });
    
    return spins;
  })();
  
  // Calculate pagination values
  $: totalSpins = allRecentSpins.length;
  $: totalPages = Math.ceil(totalSpins / itemsPerPage);
  $: startIndex = currentPage * itemsPerPage;
  $: endIndex = Math.min(startIndex + itemsPerPage, totalSpins);
  
  $: displaySpins = allRecentSpins.slice(startIndex, endIndex);
  
</script>

<div class="game-queue-container">
  <!-- Header -->
  <div class="queue-header">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <Clock class="w-5 h-5 text-theme-text opacity-70" />
        <h3 class="text-lg font-semibold text-theme">Game Queue</h3>
        {#if $queueStats.pendingSpins > 0}
          <span class="pending-badge">{$queueStats.pendingSpins}</span>
        {/if}
      </div>
      
      <div class="flex items-center gap-2">
        {#if $queueStats.totalSpins > 0}
          <button
            on:click={clearCompleted}
            class="text-xs text-theme-text opacity-70 hover:opacity-100 transition-colors"
          >
            Clear
          </button>
        {/if}
      </div>
    </div>
  </div>
  
  
  <!-- Header Info -->
  <div class="queue-info">
    <div class="text-sm text-theme-text opacity-70 px-4 py-2 bg-slate-800/30">
      All Spins ({totalSpins > 0 ? `${startIndex + 1}-${endIndex} of ${totalSpins}` : '0'})
    </div>
  </div>
  
  
  <!-- Spin List -->
  <div class="spin-list">
      {#each displaySpins as spin (spin.id)}
        <div 
          class="spin-item"
          class:spin-item-clickable={[SpinStatus.READY_TO_CLAIM, SpinStatus.CLAIMING, SpinStatus.COMPLETED].includes(spin.status) && spin.outcome}
          class:spin-item-current={$currentSpinId === spin.id || replayingSpinId === spin.id}
          title={[SpinStatus.READY_TO_CLAIM, SpinStatus.CLAIMING, SpinStatus.COMPLETED].includes(spin.status) && spin.outcome ? "Click to replay this spin" : ""}
          on:click={() => {
            if ([SpinStatus.READY_TO_CLAIM, SpinStatus.CLAIMING, SpinStatus.COMPLETED].includes(spin.status) && spin.outcome) {
              handleReplaySpin(spin);
            }
          }}
          in:fly={{ x: -20, duration: 200 }}
          out:fade={{ duration: 150 }}
        >
          <!-- Status Icon -->
          <div class="status-icon {getStatusColor(spin.status, spin)}">
            {#if [SpinStatus.PENDING, SpinStatus.SUBMITTING, SpinStatus.WAITING, SpinStatus.PROCESSING].includes(spin.status) && !completedSpins.has(spin.id)}
              <svelte:component this={getStatusIcon(spin.status, spin)} class="w-4 h-4 animate-spin" />
            {:else}
              <svelte:component this={getStatusIcon(spin.status, spin)} class="w-4 h-4" />
            {/if}
          </div>

          <!-- Info Button (kept near status icon) -->
          {#if spin.txId || spin.claimTxId || spin.commitmentRound || spin.outcomeRound || spin.status === SpinStatus.FAILED}
            <button 
              class="info-button"
              on:click|stopPropagation={() => openSpinDetails(spin)}
              title="View spin details"
            >
              <Info class="w-3 h-3" />
            </button>
          {/if}
          
          <!-- Spin Details -->
          <div class="spin-details">
            <div class="spin-meta">
              <span class="bet-amount">{formatVOI(spin.totalBet)} VOI</span>
              <span class="paylines">{spin.selectedPaylines} lines</span>
              <span class="timestamp">{formatTime(spin.timestamp)}</span>
            </div>
            
            <div class="status-text {getStatusColor(spin.status, spin)}">
              {getStatusText(spin.status, spin)}
            </div>
          </div>
          
          <!-- Result / Actions -->
          <div class="spin-result">
            {#if (spin.status === SpinStatus.READY_TO_CLAIM || spin.status === SpinStatus.CLAIMING || spin.status === SpinStatus.COMPLETED) && typeof spin.winnings === 'number' && spin.revealed}
              <!-- Show win/loss amount for completed spins -->
              {#if spin.winnings > 0}
                <div class="win-amount text-green-400">
                  +{formatVOI(spin.winnings)} VOI
                </div>
              {:else}
                <div class="loss-amount text-red-400">
                  Loss
                </div>
              {/if}
            {:else}
              <!-- Show processing indicator for active spins -->
              <div class="processing-indicator">
                <div class="text-xs text-theme-text opacity-70">
                  Bet: {formatVOI(spin.totalBet)} VOI
                </div>
              </div>
            {/if}
          </div>
          
          <!-- Share Button (far right) -->
          {#if [SpinStatus.READY_TO_CLAIM, SpinStatus.CLAIMING, SpinStatus.COMPLETED].includes(spin.status) && spin.outcome && typeof spin.winnings === 'number' && spin.revealed}
            <button 
              class="share-button"
              class:sharing={sharingSpinId === spin.id}
              class:success={shareSuccess && sharingSpinId === spin.id}
              on:click|stopPropagation={() => handleShareSpin(spin)}
              title={shareSuccess && sharingSpinId === spin.id ? 'Link copied!' : 'Share this spin'}
              disabled={sharingSpinId === spin.id}
            >
              {#if shareSuccess && sharingSpinId === spin.id}
                <Check class="w-3 h-3" />
              {:else}
                <Share2 class="w-3 h-3" />
              {/if}
            </button>
          {/if}
        </div>
      {/each}
      
      {#if displaySpins.length === 0}
        <div class="empty-state">
          <div class="empty-icon">📜</div>
          <p class="empty-title">No spins yet</p>
          <p class="empty-description">
            Your spin history will appear here once you start playing
          </p>
        </div>
      {/if}
    </div>
    
    <!-- Pagination Controls -->
    {#if totalPages > 1}
      <div class="pagination-controls">
        <button 
          class="pagination-button" 
          class:disabled={currentPage === 0}
          on:click={previousPage}
          disabled={currentPage === 0}
        >
          ‹ Previous
        </button>
        
        <div class="pagination-info">
          <span class="text-xs text-theme-text opacity-70">
            Page {currentPage + 1} of {totalPages}
          </span>
        </div>
        
        <button 
          class="pagination-button" 
          class:disabled={currentPage === totalPages - 1}
          on:click={nextPage}
          disabled={currentPage === totalPages - 1}
        >
          Next ›
        </button>
      </div>
    {/if}
</div>

<!-- Spin Details Modal -->
<SpinDetailsModal 
  isVisible={showSpinDetailsModal}
  spin={selectedSpin}
  on:close={closeSpinDetails}
/>

<style>
  .game-queue-container {
    @apply w-full;
  }
  
  .queue-header {
    @apply p-3 sm:p-4;
  }
  
  .pending-badge {
    @apply bg-blue-600 text-theme text-xs font-bold px-2 py-1 rounded-full;
  }
  
  
  .queue-info {
    @apply border-b border-slate-700;
  }
  
  
  .spin-list {
    @apply overflow-y-auto;
    min-height: calc(50vh - 8rem);
    max-height: calc(50vh - 8rem);
  }

  /* Desktop: Allow more height for the spin list */
  @media (min-width: 1024px) {
    .spin-list {
      min-height: calc(100vh - 22rem);
      max-height: calc(100vh - 22rem);
    }
  }
  
  .spin-item {
    @apply flex items-center gap-3 p-3 border-b border-slate-700 hover:bg-slate-700/50 transition-colors;
  }
  
  .spin-item:last-child {
    @apply border-b-0;
  }

  .spin-item-clickable {
    @apply cursor-pointer hover:bg-voi-900/20 hover:border-voi-600/30;
    position: relative;
    border-left: 3px solid transparent;
    transition: all 0.2s ease;
  }

  .spin-item-clickable:hover {
    border-left-color: rgba(16, 185, 129, 0.5);
    transform: translateX(2px);
  }

  .spin-item-current {
    @apply bg-voi-900/30 border-l-4 border-l-voi-500;
    position: relative;
    animation: currentSpinPulse 2s ease-in-out infinite;
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
  }

  @keyframes currentSpinPulse {
    0%, 100% {
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
    }
    50% {
      box-shadow: 0 0 30px rgba(16, 185, 129, 0.5);
    }
  }

  .status-icon {
    @apply flex-shrink-0;
  }
  
  .spin-details {
    @apply flex-1 min-w-0;
  }
  
  .spin-meta {
    @apply flex items-center gap-2 text-xs text-theme-text opacity-70 mb-1;
  }
  
  .bet-amount {
    @apply font-semibold text-theme;
  }
  
  .paylines, .timestamp {
    @apply text-theme-text opacity-50;
  }
  
  .status-text {
    @apply text-sm font-medium;
  }
  
  
  .spin-result {
    @apply flex-shrink-0 text-right;
  }
  
  .result-display {
    @apply flex flex-col items-end gap-1;
  }
  
  .win-amount, .loss-amount {
    @apply text-sm font-semibold;
  }
  
  
  .retry-button {
    @apply bg-surface-secondary hover:bg-surface-hover text-theme font-medium rounded-lg transition-colors duration-200 text-xs px-3 py-1;
  }
  
  .processing-indicator {
    @apply flex flex-col items-end gap-1 text-right;
  }
  
  .empty-state {
    @apply text-center py-12 px-4;
  }
  
  .empty-icon {
    @apply text-4xl mb-4;
  }
  
  .empty-title {
    @apply text-lg font-semibold text-theme mb-2;
  }
  
  .empty-description {
    @apply text-sm text-theme-text opacity-70;
  }
  
  /* Custom scrollbar */
  .spin-list::-webkit-scrollbar {
    width: 4px;
  }
  
  .spin-list::-webkit-scrollbar-track {
    background: rgba(51, 65, 85, 0.3);
  }
  
  .spin-list::-webkit-scrollbar-thumb {
    background: rgba(16, 185, 129, 0.5);
    border-radius: 2px;
  }
  
  .spin-list::-webkit-scrollbar-thumb:hover {
    background: rgba(16, 185, 129, 0.7);
  }
  

  .share-button {
    @apply flex-shrink-0 p-1 rounded-full bg-slate-700 hover:bg-slate-600 text-theme-text opacity-60 hover:opacity-100 transition-all duration-200 disabled:cursor-not-allowed;
  }
  
  .share-button.sharing {
    @apply opacity-50;
  }
  
  .share-button.success {
    @apply bg-green-600 text-theme opacity-100;
  }
  
  .info-button {
    @apply p-1 rounded-full bg-slate-700 hover:bg-slate-600 text-theme-text opacity-60 hover:opacity-100 transition-all duration-200;
  }

  
  /* Pagination styles */
  .pagination-controls {
    @apply flex items-center justify-between px-4 py-3 border-t border-slate-700 bg-slate-800/30;
  }
  
  .pagination-button {
    @apply bg-slate-700 hover:bg-slate-600 text-theme text-xs font-medium px-3 py-2 rounded transition-colors duration-200;
  }
  
  .pagination-button:disabled,
  .pagination-button.disabled {
    @apply opacity-50 cursor-not-allowed hover:bg-surface-secondary;
  }
  
  .pagination-info {
    @apply flex items-center;
  }
</style>
