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
    History,
    ChevronLeft,
    ChevronRight
  } from 'lucide-svelte';
  import { hovStatsStore, connectionStatus } from '$lib/stores/hovStats';
import { hovStatsService } from '$lib/services/hovStats';
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
  export let initialStats: PlayerStats | null = null;

  const dispatch = createEventDispatcher();

  // Use wallet address if no specific address provided
  // Try connected wallet first, then public wallet data for locked wallets
  $: targetAddress = playerAddress || $walletStore.account?.address || walletService.getPublicWalletData()?.address;

  
  // Reset hasLoaded when target address changes (unless initialStats provided)
  $: if (targetAddress && !initialStats) {
    hasLoaded = false;
  }

  // State
  let stats: PlayerStats | null = initialStats;
  let loading = false;
  let error: string | null = null;
  let lastUpdated: Date | null = null;
  let refreshing = false;
  let autoRefreshInterval: NodeJS.Timeout | null = null;
  let hasLoaded = !!initialStats;
  let showHistoryModal = false;

  // View mode state for Daily/All Time functionality
  let viewMode: 'all_time' | 'daily' = 'daily';
  let selectedDate: string = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  let isLoadingDateRange = false;

  // Computed values
  $: roi = stats && Number(stats.total_amount_bet) > 0 
    ? (Number(stats.net_result) / Number(stats.total_amount_bet)) * 100 
    : 0;


  $: isProfit = stats ? Number(stats.net_result) >= 0 : false;

  // Stat configurations for display
  const statConfigs = [
    {
      key: 'total_spins',
      label: 'Total Spins',
      icon: Target,
      color: 'text-blue-400',
      format: (value: bigint) => value.toString()
    },
    {
      key: 'total_amount_bet',
      label: 'Total Wagered',
      icon: Coins,
      color: 'text-yellow-400',
      format: (value: bigint) => formatVOI(Number(value)) + ' VOI'
    },
    {
      key: 'total_amount_won',
      label: 'Total Won',
      icon: Trophy,
      color: 'text-green-400',
      format: (value: bigint) => formatVOI(Number(value)) + ' VOI'
    },
    {
      key: 'win_rate',
      label: 'Win Rate',
      icon: Percent,
      color: 'text-purple-400',
      format: (value: number) => `${value.toFixed(1)}%`
    },
    {
      key: 'rtp',
      label: 'RTP',
      icon: Percent,
      color: 'text-purple-400',
      format: (value: number) => `${value.toFixed(1)}%`
    },
    {
      key: 'largest_single_win',
      label: 'Biggest Win',
      icon: Crown,
      color: 'text-orange-400',
      format: (value: bigint) => formatVOI(Number(value)) + ' VOI'
    },
    {
      key: 'average_bet_size',
      label: 'Avg Bet Size',
      icon: BarChart3,
      color: 'text-indigo-400',
      format: (value: number) => formatVOI(value) + ' VOI'
    },
  ];

  onMount(() => {
    if (autoRefresh) {
      startAutoRefresh();
    }

    return () => {
      stopAutoRefresh();
    };
  });

  // Reactive statements for address changes
  $: if (targetAddress && !loading && !isLoadingDateRange && !hasLoaded && !initialStats) {
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

    if (viewMode === 'daily') {
      await loadDateRangeStats();
    } else {
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
  }

  async function refresh() {
    if (!targetAddress) return;

    if (viewMode === 'daily') {
      await loadDateRangeStats();
    } else {
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
  }

  async function loadDateRangeStats() {
    if (!targetAddress || isLoadingDateRange) return;

    isLoadingDateRange = true;
    error = null;

    try {
      // Clear cache to force fresh data
      hovStatsService.clearCache();

      const startDate = new Date(selectedDate);
      const endDate = new Date(selectedDate);
      endDate.setUTCHours(23, 59, 59, 999); // End of day in UTC

      stats = await hovStatsStore.getPlayerStats(targetAddress, {
        startDate,
        endDate
      });
      lastUpdated = new Date();
      hasLoaded = true;
      dispatch('statsLoaded', { stats, address: targetAddress });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load player statistics for selected date';
      stats = null;
      dispatch('statsError', { error, address: targetAddress });
    } finally {
      isLoadingDateRange = false;
    }
  }

  async function changeViewMode(mode: 'all_time' | 'daily') {
    if (loading || isLoadingDateRange) return;

    viewMode = mode;

    if (mode === 'daily') {
      await loadDateRangeStats();
    } else {
      await loadPlayerStats();
    }
  }

  async function changeDateSelection(newDate: string) {
    if (isLoadingDateRange) return;

    selectedDate = newDate;

    if (viewMode === 'daily') {
      await loadDateRangeStats();
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
    return 'text-theme-text opacity-60';
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
      </div>
      
      <div class="flex items-center gap-2">
        {#if lastUpdated}
          <span class="text-xs text-gray-500">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        {/if}
        <button
          on:click={() => showHistoryModal = true}
          disabled={!targetAddress}
          class="btn-secondary text-sm"
          title="View full playing history"
        >
          <History class="w-4 h-4" />
        </button>
        <button
          on:click={refresh}
          disabled={loading || refreshing || isLoadingDateRange || !targetAddress}
          class="btn-secondary text-sm"
          title="Refresh statistics"
        >
          <RefreshCw class="w-4 h-4 {(loading || refreshing || isLoadingDateRange) ? 'animate-spin' : ''}" />
        </button>
      </div>
    </div>

  </div>
    <!-- View Mode Controls -->
    {#if targetAddress}
      <div class="px-4 pt-4">
        <!-- Combined Layout: Toggle and Date Picker (horizontal on larger screens, vertical on mobile) -->
        <div class="flex {compact ? 'flex-col' : 'flex-row'} lg:items-center justify-center gap-3">
          <!-- View Mode Toggle Slider -->
          <div class="flex items-center justify-center lg:justify-start">
            <div class="relative bg-surface-secondary rounded-lg p-1 border border-surface-border flex">
              <div
                class="absolute top-1 bottom-1 bg-voi-600 rounded-md transition-all duration-200 ease-in-out"
                style="left: {viewMode === 'daily' ? '50%' : '4px'}; right: {viewMode === 'daily' ? '4px' : '50%'};"
              ></div>
              <button
                on:click={() => changeViewMode('all_time')}
                class="relative z-10 flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors duration-200 {viewMode === 'all_time' ? 'text-white' : 'text-theme-text hover:text-theme'}"
                disabled={loading || isLoadingDateRange}
                title="All Time statistics"
              >
                <Trophy class="w-4 h-4" />
                <span class="text-nowrap">All Time</span>
              </button>
              <button
                on:click={() => changeViewMode('daily')}
                class="relative z-10 flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors duration-200 {viewMode === 'daily' ? 'text-white' : 'text-theme-text hover:text-theme'}"
                disabled={loading || isLoadingDateRange}
                title="Daily statistics"
              >
                <Calendar class="w-4 h-4" />
                <span>Daily</span>
              </button>
            </div>
          </div>

          <!-- Date Picker (only shown for daily mode) -->
          {#if viewMode === 'daily'}
            <div class="flex items-center justify-center lg:justify-end gap-2" transition:fly={{ y: -10, duration: 200 }}>
              <button
                on:click={() => {
                  const prevDate = new Date(selectedDate);
                  prevDate.setDate(prevDate.getDate() - 1);
                  changeDateSelection(prevDate.toISOString().split('T')[0]);
                }}
                class="btn-secondary text-sm p-2"
                disabled={isLoadingDateRange}
                title="Previous day"
              >
                <ChevronLeft class="w-4 h-4" />
              </button>
              <input
                type="date"
                bind:value={selectedDate}
                on:change={(e) => changeDateSelection((e.target as HTMLInputElement).value)}
                class="px-3 py-2 bg-surface-secondary border border-surface-border rounded-lg text-sm text-theme focus:border-theme-primary focus:outline-none transition-all duration-200"
                disabled={isLoadingDateRange}
                max={new Date().toISOString().split('T')[0]}
              />
              <button
                on:click={() => {
                  const nextDate = new Date(selectedDate);
                  nextDate.setDate(nextDate.getDate() + 1);
                  const today = new Date().toISOString().split('T')[0];
                  const nextDateStr = nextDate.toISOString().split('T')[0];
                  if (nextDateStr <= today) {
                    changeDateSelection(nextDateStr);
                  }
                }}
                class="btn-secondary text-sm p-2"
                disabled={isLoadingDateRange || selectedDate === new Date().toISOString().split('T')[0]}
                title="Next day"
              >
                <ChevronRight class="w-4 h-4" />
              </button>
            </div>
          {/if}
        </div>

        <!-- Date Display (only for daily mode) -->
        {#if viewMode === 'daily'}
          <div class="text-xs text-gray-400 mt-3 text-center">
            Showing statistics for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
        {/if}
      </div>
    {/if}

  {#if !targetAddress}
    <!-- No address -->
    <div class="empty-state">
      <User class="w-16 h-16 text-gray-600 mx-auto mb-4" />
      <p class="text-gray-400 text-center">Connect your wallet to view player statistics</p>
    </div>
  {:else if (loading || isLoadingDateRange) && !stats}
    <!-- Loading -->
    <div class="loading-state">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-400 mx-auto mb-4"></div>
      <p class="text-gray-400 text-center">Loading player statistics...</p>
    </div>
  {:else if (loading || isLoadingDateRange) && stats}
    <!-- Loading with skeleton placeholders -->
    <div class="stats-content">
      <div class="stats-grid">
        {#each statConfigs as config}
          <div class="stat-card skeleton" transition:fade={{ duration: 150 }}>
            <div class="flex items-center justify-between mb-2">
              <svelte:component this={config.icon} class="w-5 h-5 {config.color} opacity-40" />
              <div class="skeleton-text h-4 w-16"></div>
            </div>
            <div class="skeleton-text h-6 w-24 mb-1"></div>
            <div class="skeleton-text h-3 w-20"></div>
          </div>
        {/each}
      </div>
      
      <!-- Performance section skeleton -->
      <div class="performance-section mt-6">
        <div class="skeleton-text h-5 w-32 mb-4"></div>
        <div class="performance-grid">
          <div class="performance-card skeleton">
            <div class="skeleton-text h-4 w-16 mb-2"></div>
            <div class="skeleton-text h-8 w-20 mb-1"></div>
            <div class="skeleton-text h-3 w-24"></div>
          </div>
          <div class="performance-card skeleton">
            <div class="skeleton-text h-4 w-20 mb-2"></div>
            <div class="skeleton-text h-8 w-16 mb-1"></div>
            <div class="skeleton-text h-3 w-20"></div>
          </div>
        </div>
      </div>
    </div>
  {:else if error && !stats}
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
            </div>
            <div class="stat-value">
              {#if stats}
                {#if typeof stats[config.key] === 'bigint'}
                  {config.format(stats[config.key] as bigint)}
                {:else}
                  {config.format(stats[config.key] as number)}
                {/if}
              {:else}
                -
              {/if}
            </div>
            <div class="stat-label">{config.label}</div>
          </div>
        {/each}
      </div>

      {#if stats}
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

            <div class="advanced-stat-card">
              <div class="flex items-center gap-2 mb-2">
                <Zap class="w-5 h-5 text-yellow-400" />
                <span class="text-sm font-medium text-gray-300">Longest Streak</span>
              </div>
              <div class="text-xl font-bold text-yellow-400">
                {stats.longest_streak_days} days
              </div>
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
    @apply bg-surface-primary rounded-b-xl border border-surface-border overflow-hidden;
  }

  .compact {
    @apply text-sm;
  }

  .stats-header {
    @apply p-4 border-b border-surface-border bg-surface-primary bg-opacity-50;
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
    @apply bg-surface-secondary bg-opacity-50 rounded-lg p-4 border border-surface-border border-opacity-50;
  }

  .stat-value {
    @apply text-xl font-bold text-theme mb-1;
  }

  .stat-label {
    @apply text-xs text-theme-text opacity-60 font-medium;
  }

  .advanced-stats {
    @apply space-y-4;
  }

  .advanced-stats-grid {
    @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4;
  }

  .advanced-stat-card {
    @apply bg-surface-secondary bg-opacity-30 rounded-lg p-4 border border-surface-border border-opacity-30;
  }

  .performance-summary {
    @apply bg-surface-secondary bg-opacity-20 rounded-lg p-4 border border-surface-border border-opacity-20;
  }

  .summary-content {
    @apply space-y-2;
  }

  .fallback-notice {
    @apply mt-4;
  }

  .skeleton {
    @apply opacity-60;
  }

  .skeleton-text {
    @apply bg-slate-600 rounded animate-pulse;
  }
</style>