<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { 
    User, 
    Trophy, 
    Target, 
    TrendingUp, 
    TrendingDown,
    Zap,
    Calendar,
    Coins,
    Crown,
    BarChart3,
    RefreshCw,
    Clock,
    Activity,
    Award,
    Percent,
    History
  } from 'lucide-svelte';
  import { hovStatsStore, connectionStatus } from '$lib/stores/hovStats';
  import { walletStore } from '$lib/stores/wallet';
  import { walletService } from '$lib/services/wallet';
  import { queueStats } from '$lib/stores/queue';
  import PlayerHistoryModal from './PlayerHistoryModal.svelte';
  import type { PlayerStats } from '$lib/types/hovStats';
  import { formatVOI } from '$lib/constants/betting';

  // Props
  export let playerAddress: string | null = null;
  export let compact = false;
  export let showComparison = true;
  export let autoRefresh = true;

  const dispatch = createEventDispatcher();

  // Use wallet address if no specific address provided
  // Try connected wallet first, then public wallet data for locked wallets
  $: targetAddress = playerAddress || $walletStore.account?.address || walletService.getPublicWalletData()?.address;
  
  // Reset hasLoaded when target address changes
  $: if (targetAddress) {
    hasLoaded = false;
  }

  // State
  let stats: PlayerStats | null = null;
  let loading = false;
  let error: string | null = null;
  let lastUpdated: Date | null = null;
  let refreshing = false;
  let autoRefreshInterval: NodeJS.Timeout | null = null;
  let hasLoaded = false;
  let showHistoryModal = false;

  // Local stats for comparison/fallback
  $: localStats = $queueStats;
  $: usingFallback = $connectionStatus.fallbackActive || !stats;

  // Computed values
  $: roi = stats && Number(stats.total_amount_bet) > 0 
    ? (Number(stats.net_result) / Number(stats.total_amount_bet)) * 100 
    : 0;

  $: avgProfitPerSpin = stats && Number(stats.total_spins) > 0 
    ? Number(stats.net_result) / Number(stats.total_spins)
    : 0;

  $: isProfit = stats ? Number(stats.net_result) >= 0 : false;

  // Stat configurations for display
  const statConfigs = [
    {
      key: 'total_spins',
      label: 'Total Spins',
      icon: Target,
      color: 'text-blue-400',
      format: (value: bigint) => value.toString(),
      fallback: () => localStats.totalSpins.toString()
    },
    {
      key: 'total_amount_bet',
      label: 'Total Wagered',
      icon: Coins,
      color: 'text-yellow-400',
      format: (value: bigint) => formatVOI(Number(value)) + ' VOI',
      fallback: () => formatVOI(localStats.totalWagered) + ' VOI'
    },
    {
      key: 'total_amount_won',
      label: 'Total Won',
      icon: Trophy,
      color: 'text-green-400',
      format: (value: bigint) => formatVOI(Number(value)) + ' VOI',
      fallback: () => formatVOI(localStats.totalWinnings) + ' VOI'
    },
    {
      key: 'win_rate',
      label: 'Win Rate',
      icon: Percent,
      color: 'text-purple-400',
      format: (value: number) => `${value.toFixed(1)}%`,
      fallback: () => localStats.totalSpins > 0 
        ? `${((localStats.completedSpins / localStats.totalSpins) * 100).toFixed(1)}%`
        : '0%'
    },
    {
      key: 'largest_single_win',
      label: 'Biggest Win',
      icon: Crown,
      color: 'text-orange-400',
      format: (value: bigint) => formatVOI(Number(value)) + ' VOI',
      fallback: () => 'Not Available'
    },
    {
      key: 'average_bet_size',
      label: 'Avg Bet Size',
      icon: BarChart3,
      color: 'text-indigo-400',
      format: (value: number) => formatVOI(value) + ' VOI',
      fallback: () => localStats.totalSpins > 0 
        ? formatVOI(localStats.totalWagered / localStats.totalSpins) + ' VOI'
        : '0 VOI'
    }
  ];

  onMount(() => {
    if (targetAddress && $connectionStatus.initialized) {
      loadPlayerStats();
    }
    if (autoRefresh) {
      startAutoRefresh();
    }

    return () => {
      stopAutoRefresh();
    };
  });

  // Reactive statements for initialization and address changes
  $: if (targetAddress && $connectionStatus.initialized && !loading && !hasLoaded) {
    loadPlayerStats();
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(() => {
      if (targetAddress && !loading && $connectionStatus.isConnected) {
        loadPlayerStats();
      }
    }, 120000); // Refresh every 2 minutes
  }

  function stopAutoRefresh() {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  }

  async function loadPlayerStats() {
    if (!targetAddress || !$connectionStatus.initialized) return;

    loading = true;
    error = null;

    try {
      stats = await hovStatsStore.getPlayerStats(targetAddress);
      lastUpdated = new Date();
      hasLoaded = true;
      dispatch('statsLoaded', { stats, address: targetAddress });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load player statistics';
      stats = null;
      dispatch('statsError', { error, address: targetAddress });
    } finally {
      loading = false;
    }
  }

  async function refresh() {
    if (!targetAddress) return;
    
    refreshing = true;
    try {
      stats = await hovStatsStore.refreshPlayerStats(targetAddress);
      lastUpdated = new Date();
      hasLoaded = true;
      dispatch('statsLoaded', { stats, address: targetAddress });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to refresh player statistics';
      stats = null;
      dispatch('statsError', { error, address: targetAddress });
    } finally {
      refreshing = false;
    }
  }

  function formatTimespan(days: number): string {
    if (days < 1) return 'Less than a day';
    if (days === 1) return '1 day';
    if (days < 7) return `${Math.round(days)} days`;
    if (days < 30) return `${Math.round(days / 7)} weeks`;
    if (days < 365) return `${Math.round(days / 30)} months`;
    return `${Math.round(days / 365)} years`;
  }

  function getStreakColor(streak: number): string {
    if (streak >= 10) return 'text-yellow-400';
    if (streak >= 5) return 'text-green-400';
    if (streak >= 3) return 'text-blue-400';
    return 'text-gray-400';
  }

  function formatAddress(address: string): string {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  }
</script>

<div class="player-stats-container {compact ? 'compact' : ''}">
  <!-- Header -->
  <div class="stats-header">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <User class="w-6 h-6 text-voi-400" />
        <div>
          <h3 class="text-xl font-bold text-theme">
            {compact ? 'Stats' : 'Player Statistics'}
          </h3>
          {#if targetAddress}
            <p class="text-sm text-gray-400 font-mono" title={targetAddress}>
              {playerAddress ? 'Custom Player' : 'Your Stats'}: {formatAddress(targetAddress)}
            </p>
          {/if}
        </div>
        {#if usingFallback}
          <span class="px-2 py-1 text-xs bg-amber-900/50 text-amber-300 rounded-full border border-amber-600/30">
            {$connectionStatus.fallbackActive ? 'Limited Data' : 'Local Only'}
          </span>
        {/if}
      </div>
      
      <div class="flex items-center gap-2">
        {#if lastUpdated && !usingFallback}
          <span class="text-xs text-gray-500">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        {/if}
        <button
          on:click={() => showHistoryModal = true}
          disabled={!targetAddress || usingFallback}
          class="btn-secondary text-sm"
          title="View full playing history"
        >
          <History class="w-4 h-4" />
        </button>
        <button
          on:click={refresh}
          disabled={loading || refreshing || !targetAddress}
          class="btn-secondary text-sm"
          title="Refresh statistics"
        >
          <RefreshCw class="w-4 h-4 {(loading || refreshing) ? 'animate-spin' : ''}" />
        </button>
      </div>
    </div>
  </div>

  {#if !targetAddress}
    <!-- No address -->
    <div class="empty-state">
      <User class="w-16 h-16 text-gray-600 mx-auto mb-4" />
      <p class="text-gray-400 text-center">Connect your wallet to view player statistics</p>
    </div>
  {:else if loading && !stats}
    <!-- Loading -->
    <div class="loading-state">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-400 mx-auto mb-4"></div>
      <p class="text-gray-400 text-center">Loading player statistics...</p>
    </div>
  {:else if error && !stats && !usingFallback}
    <!-- Error -->
    <div class="error-state">
      <div class="text-red-400 text-center mb-2">Failed to load statistics</div>
      <p class="text-sm text-gray-400 text-center mb-4">{error}</p>
      <button on:click={refresh} class="btn-primary text-sm mx-auto block">
        Retry
      </button>
    </div>
  {:else}
    <!-- Statistics content -->
    <div class="stats-content" transition:fade={{ duration: 300 }}>
      <!-- Overview cards -->
      <div class="stats-grid">
        {#each statConfigs as config}
          <div class="stat-card" transition:fly={{ y: 20, duration: 300 }}>
            <div class="flex items-center justify-between mb-2">
              <svelte:component this={config.icon} class="w-5 h-5 {config.color}" />
              {#if usingFallback}
                <span class="text-xs text-amber-400">Local</span>
              {/if}
            </div>
            <div class="stat-value">
              {#if stats}
                {#if typeof stats[config.key] === 'bigint'}
                  {config.format(stats[config.key] as bigint)}
                {:else}
                  {config.format(stats[config.key] as number)}
                {/if}
              {:else}
                {config.fallback()}
              {/if}
            </div>
            <div class="stat-label">{config.label}</div>
          </div>
        {/each}
      </div>

      {#if stats && !usingFallback}
        <!-- Advanced stats (only when connected) -->
        <div class="advanced-stats" transition:fly={{ y: 20, duration: 300, delay: 200 }}>
          <h4 class="text-lg font-semibold text-theme mb-4 flex items-center gap-2">
            <BarChart3 class="w-5 h-5" />
            Detailed Analytics
          </h4>

          <div class="advanced-stats-grid">
            <!-- Win Streaks -->
            <div class="advanced-stat-card">
              <div class="flex items-center gap-2 mb-2">
                <Zap class="w-5 h-5 text-yellow-400" />
                <span class="text-sm font-medium text-gray-300">Streaks</span>
              </div>
              <div class="text-xl font-bold {getStreakColor(stats.longest_winning_streak)}">
                {stats.longest_winning_streak} wins
              </div>
              <div class="text-sm text-gray-400">
                Longest losing: {stats.longest_losing_streak}
              </div>
            </div>

            <!-- Activity -->
            <div class="advanced-stat-card">
              <div class="flex items-center gap-2 mb-2">
                <Activity class="w-5 h-5 text-blue-400" />
                <span class="text-sm font-medium text-gray-300">Activity</span>
              </div>
              <div class="text-xl font-bold text-blue-400">
                {formatTimespan(stats.days_active)}
              </div>
              <div class="text-sm text-gray-400">
                Since first bet
              </div>
            </div>

            <!-- Favorite Bet -->
            <div class="advanced-stat-card">
              <div class="flex items-center gap-2 mb-2">
                <Award class="w-5 h-5 text-purple-400" />
                <span class="text-sm font-medium text-gray-300">Favorite Bet</span>
              </div>
              <div class="text-xl font-bold text-purple-400">
                {formatVOI(Number(stats.favorite_bet_amount))} VOI
              </div>
              <div class="text-sm text-gray-400">
                Most common size
              </div>
            </div>

            <!-- Paylines -->
            <div class="advanced-stat-card">
              <div class="flex items-center gap-2 mb-2">
                <Target class="w-5 h-5 text-orange-400" />
                <span class="text-sm font-medium text-gray-300">Paylines</span>
              </div>
              <div class="text-xl font-bold text-orange-400">
                {stats.total_paylines_played.toString()}
              </div>
              <div class="text-sm text-gray-400">
                Total played
              </div>
            </div>

            <!-- Profit per Spin -->
            <div class="advanced-stat-card">
              <div class="flex items-center gap-2 mb-2">
                <Coins class="w-5 h-5 text-green-400" />
                <span class="text-sm font-medium text-gray-300">Avg Profit</span>
              </div>
              <div class="text-xl font-bold {avgProfitPerSpin >= 0 ? 'text-green-400' : 'text-red-400'}">
                {formatVOI(avgProfitPerSpin)} VOI
              </div>
              <div class="text-sm text-gray-400">
                Per spin
              </div>
            </div>
          </div>
        </div>

        <!-- Performance summary -->
        <div class="performance-summary" transition:fly={{ y: 20, duration: 300, delay: 300 }}>
          <h4 class="text-lg font-semibold text-theme mb-3 flex items-center gap-2">
            <Trophy class="w-5 h-5" />
            Performance Summary
          </h4>
          
          <div class="summary-content">
            <p class="text-gray-300 mb-2">
              {#if Number(stats.total_spins) === 0}
                No gaming activity recorded for this player.
              {:else if isProfit}
                🎉 This player is ahead by <span class="text-green-400 font-semibold">{formatVOI(Number(stats.net_result))} VOI</span> 
                over {stats.total_spins} spins with a {stats.win_rate.toFixed(1)}% win rate.
              {:else}
                This player has wagered <span class="text-yellow-400 font-semibold">{formatVOI(Number(stats.total_amount_bet))} VOI</span> 
                across {stats.total_spins} spins with a {stats.win_rate.toFixed(1)}% win rate.
              {/if}
            </p>
            
            {#if Number(stats.total_spins) > 0}
              <p class="text-sm text-gray-400 mb-3">
                {#if stats.longest_winning_streak > 5}
                  🔥 Impressive {stats.longest_winning_streak}-win streak!
                {:else if Number(stats.largest_single_win) > Number(stats.average_bet_size) * 10}
                  💎 Biggest win was {formatVOI(Number(stats.largest_single_win))} VOI
                {:else}
                  🎲 Active for {formatTimespan(stats.days_active)} with {stats.total_paylines_played} total paylines played
                {/if}
              </p>

              <!-- View History button -->
              <button
                on:click={() => showHistoryModal = true}
                class="btn-primary text-sm flex items-center gap-2"
                title="View complete playing history"
              >
                <History class="w-4 h-4" />
                View Full History
              </button>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Fallback info -->
      {#if usingFallback && $connectionStatus.fallbackActive}
        <div class="fallback-notice" transition:fade={{ duration: 300 }}>
          <div class="flex items-start gap-3 p-4 bg-amber-900/20 border border-amber-600/30 rounded-lg">
            <Clock class="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p class="text-amber-300 font-medium mb-1">Limited Statistics</p>
              <p class="text-sm text-amber-200/80">
                Showing local data only. Connect to Supabase for complete historical statistics.
              </p>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Player History Modal -->
<PlayerHistoryModal 
  bind:isVisible={showHistoryModal}
  {playerAddress}
  on:close={() => showHistoryModal = false}
/>

<style>
  .player-stats-container {
    @apply bg-slate-800 rounded-b-xl border border-slate-700 overflow-hidden;
  }

  .compact {
    @apply text-sm;
  }

  .stats-header {
    @apply p-4 border-b border-slate-700 bg-slate-800/50;
  }

  .empty-state, .loading-state, .error-state {
    @apply p-8 text-center;
  }

  .stats-content {
    @apply p-4 space-y-6;
  }

  .stats-grid {
    @apply grid grid-cols-2 md:grid-cols-3 gap-4;
  }

  .stat-card {
    @apply bg-slate-700/50 rounded-lg p-4 border border-slate-600/50;
  }

  .stat-value {
    @apply text-xl font-bold text-theme mb-1;
  }

  .stat-label {
    @apply text-xs text-gray-400 font-medium;
  }

  .advanced-stats {
    @apply space-y-4;
  }

  .advanced-stats-grid {
    @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4;
  }

  .advanced-stat-card {
    @apply bg-slate-700/30 rounded-lg p-4 border border-slate-600/30;
  }

  .performance-summary {
    @apply bg-slate-700/20 rounded-lg p-4 border border-slate-600/20;
  }

  .summary-content {
    @apply space-y-2;
  }

  .fallback-notice {
    @apply mt-4;
  }
</style>