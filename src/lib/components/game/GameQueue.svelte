<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { Clock, RefreshCw, TrendingUp, TrendingDown, X, Check, Loader, Info } from 'lucide-svelte';
  import { queueStore, queueStats, pendingSpins, recentSpins } from '$lib/stores/queue';
  import { currentSpinId } from '$lib/stores/game';
  import { formatVOI } from '$lib/constants/betting';
  import { SpinStatus } from '$lib/types/queue';
  import type { QueuedSpin } from '$lib/types/queue';
  import { playButtonClick } from '$lib/services/soundService';
  
  export let maxHeight = '400px';
  
  // Removed unused auto refresh interval
  let showCompleted = true;
  let selectedTab: 'recent' | 'stats' = 'recent';
  let showSpinDetailsModal = false;
  let selectedSpin: QueuedSpin | null = null;
  
  // Track which spin is being replayed
  let replayingSpinId: string | null = null;
  let replayTimeout: NodeJS.Timeout | null = null;
  
  // Track spins that have been shown as "Completed" to prevent reverting to "Submitting"
  let completedSpins = new Set<string>();
  
  onMount(() => {
    // Auto-refresh disabled - the queue processor handles all updates
    // Removed empty interval that was wasting CPU cycles
  });
  
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
    if (spin && (
      status === SpinStatus.READY_TO_CLAIM || 
      status === SpinStatus.CLAIMING || 
      status === SpinStatus.COMPLETED
    )) {
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
    return `https://block.voi.network/explorer/transaction/${txId}`;
  }

  function formatTxId(txId: string): string {
    return txId.length > 16 ? `${txId.slice(0, 8)}...${txId.slice(-8)}` : txId;
  }
  
  $: allRecentSpins = (() => {
    // Create a Map to deduplicate by ID, ensuring each spin appears only once
    const spinMap = new Map();
    
    // Add pending spins first (they take priority)
    $pendingSpins.forEach(spin => spinMap.set(spin.id, spin));
    
    // Add recent spins, but only if not already present
    $recentSpins.forEach(spin => {
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
  $: displaySpins = selectedTab === 'recent' ? allRecentSpins : [];
  
  // Calculate additional stats for the Stats tab
  $: largestWin = Math.max(0, ...$queueStats.totalSpins > 0 ? allRecentSpins.filter(s => s.winnings).map(s => s.winnings!) : [0]);
  $: totalWins = allRecentSpins.filter(s => s.winnings && s.winnings > 0).length;
  $: winRate = $queueStats.totalSpins > 0 ? (totalWins / $queueStats.totalSpins) * 100 : 0;
</script>

<div class="game-queue card">
  <!-- Header -->
  <div class="queue-header">
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
  
  <!-- Quick Stats -->
  <div class="queue-stats">
    <div class="stat">
      <div class="stat-value">{allRecentSpins.length}</div>
      <div class="stat-label">Recent</div>
    </div>
    
    <div class="stat">
      <div class="stat-value text-blue-400">{$queueStats.pendingSpins}</div>
      <div class="stat-label">In Progress</div>
    </div>
    
    <div class="stat">
      <div class="stat-value text-green-400">{totalWins}</div>
      <div class="stat-label">Wins</div>
    </div>
    
    <div class="stat">
      <div class="stat-value" 
           class:text-green-400={$queueStats.netProfit >= 0}
           class:text-red-400={$queueStats.netProfit < 0}>
        {$queueStats.netProfit >= 0 ? '+' : ''}{formatVOI($queueStats.netProfit)}
      </div>
      <div class="stat-label">Net</div>
    </div>
  </div>
  
  <!-- Tabs -->
  <div class="queue-tabs">
    <button
      class="tab"
      class:active={selectedTab === 'recent'}
      on:click={() => selectedTab = 'recent'}
    >
      Recent Spins ({allRecentSpins.length})
    </button>
    <button
      class="tab"
      class:active={selectedTab === 'stats'}
      on:click={() => selectedTab = 'stats'}
    >
      Stats
    </button>
  </div>
  
  
  <!-- Content -->
  {#if selectedTab === 'recent'}
    <!-- Spin List -->
    <div class="spin-list" style="max-height: {maxHeight}">
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

          <!-- Info Button -->
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
            {#if (spin.status === SpinStatus.READY_TO_CLAIM || spin.status === SpinStatus.CLAIMING || spin.status === SpinStatus.COMPLETED) && typeof spin.winnings === 'number'}
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
            {:else if [SpinStatus.PENDING, SpinStatus.SUBMITTING, SpinStatus.WAITING, SpinStatus.PROCESSING].includes(spin.status)}
              <!-- Show processing indicator for active spins -->
              <div class="processing-indicator">
                <div class="text-xs text-theme-text opacity-70">
                  Bet: {formatVOI(spin.totalBet)} VOI
                </div>
              </div>
            {/if}
          </div>
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
  {:else if selectedTab === 'stats'}
    <!-- Stats View -->
    <div class="stats-content">
      <div class="stats-grid">
        <!-- Basic Stats -->
        <div class="stat-card">
          <div class="stat-icon">🎰</div>
          <div class="stat-info">
            <div class="stat-title">Total Spins</div>
            <div class="stat-value">{$queueStats.totalSpins}</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">🏆</div>
          <div class="stat-info">
            <div class="stat-title">Total Wins</div>
            <div class="stat-value">{totalWins}</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">📊</div>
          <div class="stat-info">
            <div class="stat-title">Win Rate</div>
            <div class="stat-value">{winRate.toFixed(1)}%</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">💎</div>
          <div class="stat-info">
            <div class="stat-title">Largest Win</div>
            <div class="stat-value">{formatVOI(largestWin)} VOI</div>
          </div>
        </div>
        
        <!-- Financial Stats -->
        <div class="stat-card wide">
          <div class="stat-icon">💰</div>
          <div class="stat-info">
            <div class="stat-title">Total Wagered</div>
            <div class="stat-value">{formatVOI($queueStats.totalWagered)} VOI</div>
          </div>
        </div>
        
        <div class="stat-card wide">
          <div class="stat-icon">💸</div>
          <div class="stat-info">
            <div class="stat-title">Total Winnings</div>
            <div class="stat-value text-green-400">{formatVOI($queueStats.totalWinnings)} VOI</div>
          </div>
        </div>
        
        <!-- Net Profit/Loss -->
        <div class="stat-card wide">
          <div class="stat-icon">{$queueStats.netProfit >= 0 ? '📈' : '📉'}</div>
          <div class="stat-info">
            <div class="stat-title">Net Result</div>
            <div class="stat-value" 
                 class:text-green-400={$queueStats.netProfit >= 0}
                 class:text-red-400={$queueStats.netProfit < 0}>
              {$queueStats.netProfit >= 0 ? '+' : ''}{formatVOI($queueStats.netProfit)} VOI
            </div>
          </div>
        </div>
        
      </div>
    </div>
  {/if}
</div>

<!-- Spin Details Modal -->
{#if showSpinDetailsModal && selectedSpin}
  <div class="modal-backdrop" on:click={closeSpinDetails} transition:fade={{ duration: 200 }}>
    <div class="modal-content" on:click|stopPropagation transition:fly={{ y: 20, duration: 300 }}>
      <!-- Modal Header -->
      <div class="modal-header">
        <h3 class="modal-title">Spin Details</h3>
        <button class="modal-close" on:click={closeSpinDetails}>
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body">
        <!-- Basic Spin Info -->
        <div class="detail-section">
          <h4 class="detail-section-title">Spin Information</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Bet Amount:</span>
              <span class="detail-value">{formatVOI(selectedSpin.totalBet)} VOI</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Paylines:</span>
              <span class="detail-value">{selectedSpin.selectedPaylines} lines</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Status:</span>
              <span class="detail-value {getStatusColor(selectedSpin.status)}">{getStatusText(selectedSpin.status, selectedSpin)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Timestamp:</span>
              <span class="detail-value">{new Date(selectedSpin.timestamp).toLocaleString()}</span>
            </div>
            {#if typeof selectedSpin.winnings === 'number'}
              <div class="detail-item">
                <span class="detail-label">Winnings:</span>
                <span class="detail-value" class:text-green-400={selectedSpin.winnings > 0} class:text-red-400={selectedSpin.winnings <= 0}>
                  {selectedSpin.winnings > 0 ? '+' : ''}{formatVOI(selectedSpin.winnings)} VOI
                </span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Blockchain Details -->
        {#if selectedSpin.txId || selectedSpin.claimTxId || selectedSpin.commitmentRound || selectedSpin.outcomeRound}
          <div class="detail-section">
            <h4 class="detail-section-title">Blockchain Details</h4>
            <div class="detail-grid">
              {#if selectedSpin.commitmentRound}
                <div class="detail-item">
                  <span class="detail-label">Block Number (Commitment):</span>
                  <span class="detail-value font-mono">{selectedSpin.commitmentRound}</span>
                </div>
              {/if}
              {#if selectedSpin.outcomeRound}
                <div class="detail-item">
                  <span class="detail-label">Block Number (Outcome):</span>
                  <span class="detail-value font-mono">{selectedSpin.outcomeRound}</span>
                </div>
              {/if}
              {#if selectedSpin.txId}
                <div class="detail-item full-width">
                  <span class="detail-label">Transaction ID:</span>
                  <div class="tx-link-container">
                    <span class="detail-value font-mono tx-id">{formatTxId(selectedSpin.txId)}</span>
                    <a 
                      href={getExplorerUrl(selectedSpin.txId)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      class="explorer-link"
                      title="View on block explorer"
                    >
                      View on Explorer
                    </a>
                  </div>
                </div>
              {/if}
              {#if selectedSpin.claimTxId}
                <div class="detail-item full-width">
                  <span class="detail-label">Claim Transaction ID:</span>
                  <div class="tx-link-container">
                    <span class="detail-value font-mono tx-id">{formatTxId(selectedSpin.claimTxId)}</span>
                    <a 
                      href={getExplorerUrl(selectedSpin.claimTxId)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      class="explorer-link"
                      title="View on block explorer"
                    >
                      View on Explorer
                    </a>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Error Information -->
        {#if selectedSpin.error}
          <div class="detail-section">
            <h4 class="detail-section-title text-red-400">Error Details</h4>
            <div class="error-message">
              {selectedSpin.error}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .game-queue {
    @apply bg-surface-tertiary rounded-lg shadow-lg border border-surface-border backdrop-blur-sm overflow-hidden;
  }
  
  .queue-header {
    @apply flex items-center justify-between p-4 border-b border-surface-border;
  }
  
  .pending-badge {
    @apply bg-blue-600 text-theme text-xs font-bold px-2 py-1 rounded-full;
  }
  
  .queue-stats {
    @apply grid grid-cols-4 gap-3 p-3 bg-surface-tertiary;
  }
  
  .stat {
    @apply text-center;
  }
  
  .stat-value {
    @apply text-sm font-bold text-theme;
  }
  
  .stat-label {
    @apply text-xs text-theme-text opacity-70;
    margin-top: 0.25rem;
  }
  
  .queue-tabs {
    @apply flex border-b border-surface-border;
  }
  
  .tab {
    @apply flex-1 py-3 px-4 text-sm font-medium text-theme-text opacity-70 hover:opacity-100 transition-colors;
  }
  
  .tab.active {
    @apply text-theme bg-surface-hover border-b-2 border-theme-primary;
  }
  
  
  .spin-list {
    @apply overflow-y-auto;
  }
  
  .spin-item {
    @apply flex items-center gap-3 p-3 border-b border-surface-border hover:bg-surface-hover transition-colors;
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
  
  /* Stats view styles */
  .stats-content {
    @apply p-4;
  }
  
  .stats-grid {
    @apply grid grid-cols-2 gap-3;
  }
  
  .stat-card {
    @apply bg-surface-tertiary rounded-lg shadow-lg border border-surface-border backdrop-blur-sm p-3 flex items-center gap-3;
  }
  
  .stat-card.wide {
    @apply col-span-2;
  }
  
  .stat-icon {
    @apply text-2xl flex-shrink-0;
  }
  
  .stat-info {
    @apply flex-1 min-w-0;
  }
  
  .stat-title {
    @apply text-xs text-theme-text opacity-70 font-medium;
  }
  
  .stat-value {
    @apply text-lg font-bold text-theme;
    margin-top: 0.25rem;
  }
  
  @media (min-width: 640px) {
    .stats-grid {
      @apply grid-cols-2;
    }
    
    .stat-card.wide {
      @apply col-span-1;
    }
  }

  /* Info Button */
  .info-button {
    @apply flex-shrink-0 p-1 rounded-full bg-surface-secondary hover:bg-surface-hover text-theme-text opacity-60 hover:opacity-100 transition-all duration-200;
  }

  /* Modal Styles */
  .modal-backdrop {
    @apply fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4;
  }

  .modal-content {
    @apply bg-surface-primary border border-surface-border rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden;
  }

  .modal-header {
    @apply flex items-center justify-between p-4 border-b border-surface-border;
  }

  .modal-title {
    @apply text-lg font-semibold text-theme;
  }

  .modal-close {
    @apply p-1 rounded-lg hover:bg-surface-hover text-theme-text opacity-70 hover:opacity-100 transition-colors;
  }

  .modal-body {
    @apply p-4 max-h-[calc(90vh-80px)] overflow-y-auto;
  }

  .detail-section {
    @apply mb-6 last:mb-0;
  }

  .detail-section-title {
    @apply text-sm font-semibold text-theme-text mb-3;
  }

  .detail-grid {
    @apply grid grid-cols-1 sm:grid-cols-2 gap-3;
  }

  .detail-item {
    @apply flex flex-col gap-1;
  }

  .detail-item.full-width {
    @apply sm:col-span-2;
  }

  .detail-label {
    @apply text-xs text-theme-text opacity-70 font-medium;
  }

  .detail-value {
    @apply text-sm text-theme font-medium;
  }

  .tx-link-container {
    @apply flex items-center justify-between gap-3 bg-surface-tertiary rounded-lg shadow-lg border border-surface-border backdrop-blur-sm p-2;
  }

  .tx-id {
    @apply text-xs text-theme-text;
  }

  .explorer-link {
    @apply text-xs bg-voi-600 hover:bg-voi-700 text-theme px-3 py-1 rounded-md transition-colors font-medium;
  }

  .error-message {
    @apply bg-red-900/20 border border-red-800/50 rounded-md p-3 text-sm text-red-300;
  }

  /* Custom scrollbar for modal */
  .modal-body::-webkit-scrollbar {
    width: 4px;
  }
  
  .modal-body::-webkit-scrollbar-track {
    background: rgba(51, 65, 85, 0.3);
  }
  
  .modal-body::-webkit-scrollbar-thumb {
    background: rgba(16, 185, 129, 0.5);
    border-radius: 2px;
  }
  
  .modal-body::-webkit-scrollbar-thumb:hover {
    background: rgba(16, 185, 129, 0.7);
  }
</style>