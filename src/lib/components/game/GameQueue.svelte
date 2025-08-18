<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { Clock, RefreshCw, TrendingUp, TrendingDown, X, Check, AlertCircle, Loader } from 'lucide-svelte';
  import { queueStore, queueStats, pendingSpins, readyToClaim, recentSpins } from '$lib/stores/queue';
  import { formatVOI } from '$lib/constants/betting';
  import { SpinStatus } from '$lib/types/queue';
  import type { QueuedSpin } from '$lib/types/queue';
  
  export let maxHeight = '400px';
  
  let autoRefreshInterval: NodeJS.Timeout;
  let showCompleted = true;
  let selectedTab: 'recent' | 'stats' = 'recent';
  
  onMount(() => {
    // Auto-refresh every 5 seconds
    autoRefreshInterval = setInterval(() => {
      // In real implementation, this would check blockchain status
      // For now, just update timestamps
      queueStore.setProcessing(false);
    }, 5000);
  });
  
  onDestroy(() => {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
    }
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
        return RefreshCw;
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
        // For losing spins being auto-claimed, use neutral blue color
        if (spin && typeof spin.winnings === 'number' && spin.winnings === 0) {
          return 'text-blue-400';
        }
        return 'text-orange-400';
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
        return 'Ready to Claim';
      case SpinStatus.CLAIMING:
        // For losing spins being auto-claimed, show neutral status to keep it silent
        if (spin && typeof spin.winnings === 'number' && spin.winnings === 0) {
          return 'Processing...';
        }
        return 'Claiming...';
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
  
  function handleRetrySpin(spin: QueuedSpin) {
    queueStore.retrySpin(spin.id);
  }
  
  async function handleClaimSpin(spin: QueuedSpin) {
    console.log('🎯 Manual claim triggered for spin:', spin.id);
    
    // Update status to claiming
    queueStore.updateSpin({
      id: spin.id,
      status: SpinStatus.CLAIMING
    });
    
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
</script>

<div class="game-queue card">
  <!-- Header -->
  <div class="queue-header">
    <div class="flex items-center gap-2">
      <Clock class="w-5 h-5 text-gray-400" />
      <h3 class="text-lg font-semibold text-white">Game Queue</h3>
      {#if $queueStats.pendingSpins > 0}
        <span class="pending-badge">{$queueStats.pendingSpins}</span>
      {/if}
    </div>
    
    <div class="flex items-center gap-2">
      {#if $queueStats.totalSpins > 0}
        <button
          on:click={clearCompleted}
          class="text-xs text-gray-400 hover:text-white transition-colors"
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
  
  <!-- Ready to Claim Banner -->
  {#if $readyToClaim.length > 0}
    <div class="claim-banner" in:fly={{ y: -20, duration: 300 }}>
      <div class="flex items-center gap-2">
        <AlertCircle class="w-4 h-4 text-yellow-400" />
        <span class="text-sm font-medium text-white">
          {$readyToClaim.length} spin{$readyToClaim.length > 1 ? 's' : ''} ready to claim
        </span>
      </div>
      <button
        on:click={() => $readyToClaim.forEach(spin => handleClaimSpin(spin))}
        class="claim-all-button"
      >
        Claim All
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
            {#if [SpinStatus.SUBMITTING, SpinStatus.WAITING, SpinStatus.PROCESSING, SpinStatus.CLAIMING].includes(spin.status)}
              <svelte:component this={getStatusIcon(spin.status)} class="w-4 h-4 animate-spin" />
            {:else}
              <svelte:component this={getStatusIcon(spin.status)} class="w-4 h-4" />
            {/if}
          </div>
          
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
            {#if spin.status === SpinStatus.COMPLETED && spin.winnings}
              <div class="win-amount text-green-400">
                +{formatVOI(spin.winnings)} VOI
              </div>
            {:else if (spin.status === SpinStatus.READY_TO_CLAIM || spin.status === SpinStatus.CLAIMING) && typeof spin.winnings === 'number'}
              <!-- Show win/loss amount immediately when outcome is known -->
              <div class="result-display">
                {#if spin.winnings > 0}
                  <div class="win-amount text-green-400">
                    +{formatVOI(spin.winnings)} VOI
                  </div>
                {:else}
                  <div class="loss-amount text-red-400">
                    {formatVOI(spin.winnings)} VOI
                  </div>
                {/if}
                {#if spin.status === SpinStatus.READY_TO_CLAIM && !spin.isAutoClaimInProgress}
                  <button
                    on:click={() => handleClaimSpin(spin)}
                    class="claim-button"
                    style="margin-top: 0.25rem;"
                  >
                    Claim
                  </button>
                {:else if spin.status === SpinStatus.READY_TO_CLAIM && spin.isAutoClaimInProgress}
                  <div class="text-xs text-blue-400 font-medium" style="margin-top: 0.25rem;">
                    Auto-claiming...
                  </div>
                {:else if spin.status === SpinStatus.CLAIMING && !spin.error}
                  <div class="text-xs font-medium" style="margin-top: 0.25rem;"
                       class:text-blue-400={spin.winnings === 0}
                       class:text-orange-400={spin.winnings !== 0}>
                    {spin.winnings === 0 ? 'Processing...' : 'Claiming...'}
                  </div>
                {:else if spin.status === SpinStatus.CLAIMING && spin.error}
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
              <button
                on:click={() => handleClaimSpin(spin)}
                class="claim-button"
              >
                Claim
              </button>
            {:else if spin.status === SpinStatus.READY_TO_CLAIM && spin.isAutoClaimInProgress}
              <div class="text-xs text-blue-400 font-medium">
                Auto-claiming...
              </div>
            {:else if spin.status === SpinStatus.CLAIMING && spin.error}
              <button
                on:click={() => handleRetryClaim(spin)}
                class="retry-button"
              >
                Retry Claim
              </button>
            {:else if spin.status === SpinStatus.FAILED && spin.retryCount < 3}
              <button
                on:click={() => handleRetrySpin(spin)}
                class="retry-button"
              >
                Retry
              </button>
            {:else if [SpinStatus.COMPLETED, SpinStatus.FAILED].includes(spin.status)}
              <div class="loss-amount text-red-400">
                -{formatVOI(spin.totalBet)} VOI
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

<style>
  .game-queue {
    @apply bg-slate-800/50 border border-slate-700/50 overflow-hidden;
  }
  
  .queue-header {
    @apply flex items-center justify-between p-4 border-b border-slate-700/50;
  }
  
  .pending-badge {
    @apply bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full;
  }
  
  .queue-stats {
    @apply grid grid-cols-4 gap-3 p-3 bg-slate-700/30;
  }
  
  .stat {
    @apply text-center;
  }
  
  .stat-value {
    @apply text-sm font-bold text-white;
  }
  
  .stat-label {
    @apply text-xs text-gray-400;
    margin-top: 0.25rem;
  }
  
  .queue-tabs {
    @apply flex border-b border-slate-700/50;
  }
  
  .tab {
    @apply flex-1 py-3 px-4 text-sm font-medium text-gray-400 hover:text-white transition-colors;
  }
  
  .tab.active {
    @apply text-white bg-slate-700/50 border-b-2 border-voi-500;
  }
  
  .claim-banner {
    @apply flex items-center justify-between p-3 bg-yellow-900/20 border-b border-yellow-700/50;
  }
  
  .claim-all-button {
    @apply bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-semibold px-3 py-1 rounded-md transition-colors;
  }
  
  .spin-list {
    @apply overflow-y-auto;
  }
  
  .spin-item {
    @apply flex items-center gap-3 p-3 border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors;
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
    @apply flex items-center gap-2 text-xs text-gray-400 mb-1;
  }
  
  .bet-amount {
    @apply font-semibold text-white;
  }
  
  .paylines, .timestamp {
    @apply text-gray-500;
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
    @apply bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-semibold px-3 py-1 rounded-md transition-colors;
  }
  
  .retry-button {
    @apply bg-gray-600 hover:bg-gray-700 text-white text-xs font-semibold px-3 py-1 rounded-md transition-colors;
  }
  
  .empty-state {
    @apply text-center py-12 px-4;
  }
  
  .empty-icon {
    @apply text-4xl mb-4;
  }
  
  .empty-title {
    @apply text-lg font-semibold text-white mb-2;
  }
  
  .empty-description {
    @apply text-sm text-gray-400;
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
    @apply bg-slate-700/30 rounded-lg p-3 flex items-center gap-3;
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
    @apply text-xs text-gray-400 font-medium;
  }
  
  .stat-value {
    @apply text-lg font-bold text-white;
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
</style>