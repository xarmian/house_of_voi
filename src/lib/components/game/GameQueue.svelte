<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { Clock, RefreshCw, TrendingUp, TrendingDown, X, Check, AlertCircle, Loader, Info } from 'lucide-svelte';
  import { queueStore, queueStats, pendingSpins, readyToClaim, recentSpins } from '$lib/stores/queue';
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
  
  onMount(() => {
    // Auto-refresh disabled - the queue processor handles all updates
    // Removed empty interval that was wasting CPU cycles
  });
  
  onDestroy(() => {
    // Cleanup not needed anymore
  });
  
  function getStatusIcon(status: SpinStatus) {
    switch (status) {
      case SpinStatus.PENDING:
        return Clock;
      case SpinStatus.SUBMITTING:
      case SpinStatus.WAITING:
      case SpinStatus.PROCESSING:
        return Loader;
      case SpinStatus.READY_TO_CLAIM:
        return AlertCircle;
      case SpinStatus.CLAIMING:
        return Check; // Same icon as completed
      case SpinStatus.COMPLETED:
        return Check;
      case SpinStatus.FAILED:
      case SpinStatus.EXPIRED:
        return X;
      default:
        return Clock;
    }
  }
  
  function getStatusColor(status: SpinStatus, spin?: QueuedSpin): string {
    switch (status) {
      case SpinStatus.PENDING:
        return 'text-gray-400';
      case SpinStatus.SUBMITTING:
      case SpinStatus.WAITING:
      case SpinStatus.PROCESSING:
        return 'text-blue-400';
      case SpinStatus.READY_TO_CLAIM:
        if (spin && (spin.claimRetryCount || 0) >= 3) {
          return 'text-purple-400'; // Different color for manual claim required
        }
        return 'text-yellow-400';
      case SpinStatus.CLAIMING:
        // Always show as completed (green) - claiming is silent
        return 'text-green-400';
      case SpinStatus.COMPLETED:
        return 'text-green-400';
      case SpinStatus.FAILED:
      case SpinStatus.EXPIRED:
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  }
  
  function getStatusText(status: SpinStatus, spin?: QueuedSpin): string {
    switch (status) {
      case SpinStatus.PENDING:
        return 'Queued';
      case SpinStatus.SUBMITTING:
        return 'Submitting...';
      case SpinStatus.WAITING:
        return 'Confirming...';
      case SpinStatus.PROCESSING:
        return 'Processing...';
      case SpinStatus.READY_TO_CLAIM:
        if (spin && (spin.claimRetryCount || 0) >= 3) {
          return 'Manual Claim Required';
        }
        // For losing spins, show "Processing..." instead of "Ready to Claim"
        if (spin && typeof spin.winnings === 'number' && spin.winnings === 0) {
          return 'Processing...';
        }
        return 'Ready to Claim';
      case SpinStatus.CLAIMING:
        // Always show completed - claim failures are usually bots claiming first (which is good!)
        return 'Completed';
      case SpinStatus.COMPLETED:
        return 'Completed';
      case SpinStatus.FAILED:
        return 'Failed';
      case SpinStatus.EXPIRED:
        return 'Expired';
      default:
        return status;
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
  
  
  async function handleClaimSpin(spin: QueuedSpin) {
    console.log('🎯 Manual claim triggered for spin:', spin.id);
    
    // Play button click sound for claim
    playButtonClick().catch(() => {
      // Ignore sound errors
    });
    
    // Let the blockchain service handle status updates - don't manually set CLAIMING here
    
    try {
      // Import and use the queue processor to submit claim
      const { queueProcessor } = await import('$lib/services/queueProcessor');
      await queueProcessor.submitClaim(spin);
    } catch (error) {
      console.error('❌ Manual claim failed:', error);
      // Revert status back to ready to claim
      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.READY_TO_CLAIM,
        data: {
          error: `Claim failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      });
    }
  }

  async function handleRetryClaim(spin: QueuedSpin) {
    console.log('🔄 Retrying claim for spin:', spin.id);
    
    // Play button click sound for retry claim
    playButtonClick().catch(() => {
      // Ignore sound errors
    });
    
    // Clear the error and reset claim retry state, then immediately claim again
    queueStore.updateSpin({
      id: spin.id,
      status: SpinStatus.READY_TO_CLAIM,
      data: {
        error: undefined,
        claimRetryCount: 0,
        lastClaimRetry: undefined
      }
    });
    
    // Wait a moment, then trigger claim again
    setTimeout(() => {
      handleClaimSpin(spin);
    }, 100);
  }

  function handleReplaySpin(spin: QueuedSpin) {
    console.log('🎮 Replaying spin:', spin.id);
    
    // Play button click sound for replay
    playButtonClick().catch(() => {
      // Ignore sound errors
    });
    
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
    return Array.from(spinMap.values()).sort((a, b) => b.timestamp - a.timestamp);
  })();
  $: displaySpins = selectedTab === 'recent' ? allRecentSpins : [];
  
  // Calculate additional stats for the Stats tab
  $: largestWin = Math.max(0, ...$queueStats.totalSpins > 0 ? allRecentSpins.filter(s => s.winnings).map(s => s.winnings!) : [0]);
  $: totalWins = allRecentSpins.filter(s => s.winnings && s.winnings > 0).length;
  $: winRate = $queueStats.totalSpins > 0 ? (totalWins / $queueStats.totalSpins) * 100 : 0;
  
  // Filter ready to claim spins to only include winning spins (winnings > 0)
  $: readyToClaimWinners = $readyToClaim.filter(spin => 
    typeof spin.winnings === 'number' && spin.winnings > 0
  );
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
  
  <!-- Ready to Claim Banner - Only show for winning spins -->
  {#if readyToClaimWinners.length > 0}
    <div class="claim-banner" in:fly={{ y: -20, duration: 300 }}>
      <div class="flex items-center gap-2">
        <AlertCircle class="w-4 h-4 text-yellow-400" />
        <span class="text-sm font-medium text-theme">
          {readyToClaimWinners.length} winning spin{readyToClaimWinners.length > 1 ? 's' : ''} ready to claim
        </span>
      </div>
      <button
        on:click={() => readyToClaimWinners.forEach(spin => handleClaimSpin(spin))}
        class="claim-all-button"
      >
        Claim Winnings
      </button>
    </div>
  {/if}
  
  <!-- Content -->
  {#if selectedTab === 'recent'}
    <!-- Spin List -->
    <div class="spin-list" style="max-height: {maxHeight}">
      {#each displaySpins as spin (spin.id)}
        <div 
          class="spin-item"
          class:spin-item-clickable={spin.status === SpinStatus.COMPLETED && spin.outcome}
          title={spin.status === SpinStatus.COMPLETED && spin.outcome ? "Click to replay this spin" : ""}
          on:click={() => {
            if (spin.status === SpinStatus.COMPLETED && spin.outcome) {
              handleReplaySpin(spin);
            }
          }}
          in:fly={{ x: -20, duration: 200 }}
          out:fade={{ duration: 150 }}
        >
          <!-- Status Icon -->
          <div class="status-icon {getStatusColor(spin.status)}">
            {#if [SpinStatus.SUBMITTING, SpinStatus.WAITING, SpinStatus.PROCESSING].includes(spin.status)}
              <svelte:component this={getStatusIcon(spin.status)} class="w-4 h-4 animate-spin" />
            {:else}
              <svelte:component this={getStatusIcon(spin.status)} class="w-4 h-4" />
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
              {#if spin.status === SpinStatus.READY_TO_CLAIM && (spin.claimRetryCount || 0) >= 3}
                <span class="retry-info">• Auto-claim failed {spin.claimRetryCount} times</span>
              {/if}
              {#if spin.error && spin.status === SpinStatus.READY_TO_CLAIM && !spin.isAutoClaimInProgress}
                <span class="error-text">• {spin.error}</span>
              {/if}
            </div>
          </div>
          
          <!-- Result / Actions -->
          <div class="spin-result">
            {#if spin.status === SpinStatus.COMPLETED && typeof spin.winnings === 'number'}
              <!-- Show final winnings for completed spins -->
              {#if spin.winnings > 0}
                <div class="win-amount text-green-400">
                  +{formatVOI(spin.winnings)} VOI
                </div>
              {:else}
                <div class="loss-amount text-red-400">
                  Loss
                </div>
              {/if}
            {:else if (spin.status === SpinStatus.READY_TO_CLAIM || spin.status === SpinStatus.CLAIMING) && typeof spin.winnings === 'number'}
              <!-- Show win/loss amount immediately when outcome is known -->
              <div class="result-display">
                {#if spin.winnings > 0}
                  <div class="win-amount text-green-400">
                    +{formatVOI(spin.winnings)} VOI
                  </div>
                {:else}
                  <div class="loss-amount text-red-400">
                    Loss
                  </div>
                {/if}
                {#if spin.status === SpinStatus.READY_TO_CLAIM && !spin.isAutoClaimInProgress && spin.winnings > 0}
                  <!-- Only show claim button for winning spins -->
                  <button
                    on:click={() => handleClaimSpin(spin)}
                    class="claim-button"
                    style="margin-top: 0.25rem;"
                  >
                    Claim
                  </button>
                {:else if spin.status === SpinStatus.READY_TO_CLAIM && spin.isAutoClaimInProgress && spin.winnings > 0}
                  <!-- Remove auto-claiming message - claiming happens silently -->
                {:else if spin.status === SpinStatus.READY_TO_CLAIM && spin.winnings === 0}
                  <!-- For losing spins, show processing status -->
                  <div class="text-xs text-blue-400 font-medium" style="margin-top: 0.25rem;">
                  </div>
                {:else if spin.status === SpinStatus.CLAIMING && !spin.error}
                  <div class="text-xs font-medium" style="margin-top: 0.25rem;"
                       class:text-blue-400={spin.winnings === 0}
                       class:text-orange-400={spin.winnings !== 0}>
                  </div>
                {:else if spin.status === SpinStatus.CLAIMING && spin.error && spin.winnings > 0}
                  <!-- Only show retry button for winning spins with errors -->
                  <button
                    on:click={() => handleRetryClaim(spin)}
                    class="retry-button"
                    style="margin-top: 0.25rem;"
                  >
                    Retry Claim
                  </button>
                {/if}
              </div>
            {:else if spin.status === SpinStatus.READY_TO_CLAIM && !spin.isAutoClaimInProgress}
              <!-- Only show claim button if we don't know the winnings yet, or if it's a winning spin -->
              {#if typeof spin.winnings !== 'number' || spin.winnings > 0}
                <button
                  on:click={() => handleClaimSpin(spin)}
                  class="claim-button"
                >
                  Claim
                </button>
              {:else}
                <div class="text-xs text-blue-400 font-medium">
                </div>
              {/if}
            {:else if spin.status === SpinStatus.READY_TO_CLAIM && spin.isAutoClaimInProgress}
              <!-- Remove auto-claiming message - claiming happens silently -->
            {:else if spin.status === SpinStatus.CLAIMING && spin.error}
              <!-- Only show retry for winning spins -->
              {#if typeof spin.winnings !== 'number' || spin.winnings > 0}
                <button
                  on:click={() => handleRetryClaim(spin)}
                  class="retry-button"
                >
                  Retry Claim
                </button>
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
  
  .claim-banner {
    @apply flex items-center justify-between p-3 bg-yellow-900/20 border-b border-yellow-700/50;
  }
  
  .claim-all-button {
    @apply bg-yellow-600 hover:bg-yellow-700 text-theme text-xs font-semibold px-3 py-1 rounded-md transition-colors;
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
  
  .error-text {
    @apply text-red-400 text-xs;
  }
  
  .retry-info {
    @apply text-purple-400 text-xs;
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
  
  .claim-button {
    @apply bg-yellow-600 hover:bg-yellow-700 text-theme text-xs font-semibold px-3 py-1 rounded-md transition-colors;
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