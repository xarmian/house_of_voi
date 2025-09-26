<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { 
    TrendingUp, 
    TrendingDown, 
    Trophy, 
    Crown, 
    Medal, 
    Users,
    Coins,
    Target,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Search,
    BarChart3,
    Maximize2,
    Percent,
    User,
    Calendar
  } from 'lucide-svelte';
  import LeaderboardModal from './LeaderboardModal.svelte';
  import PlayerStats from './PlayerStats.svelte';
  import AddressDisplay from '$lib/components/ui/AddressDisplay.svelte';
  import { hovStatsStore, connectionStatus } from '$lib/stores/hovStats';
  import { hovStatsService } from '$lib/services/hovStats';
  import { tournamentService } from '$lib/services/tournamentService';
  import { walletStore } from '$lib/stores/wallet';
  import { goto } from '$app/navigation';
  import type { LeaderboardEntry } from '$lib/types/hovStats';
  import { formatVOI } from '$lib/constants/betting';

  // Props
  export let compact = false;
  export let showPlayerHighlight = true;
  export let contractId: bigint; // Required: contract ID for leaderboard data

  const dispatch = createEventDispatcher();

  // State
  let selectedMetric: 'total_won' | 'total_bet' | 'largest_win' | 'rtp' | 'total_spins' = 'total_won';
  let currentPage = 0;
  let itemsPerPage = compact ? 10 : 20;
  let searchTerm = '';
  let refreshing = false;
  let highlightedPlayer: string | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  
  // New state for Daily leaderboards - Daily is now default
  let viewMode: 'all_time' | 'daily' = 'daily';
  let selectedDate: string = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  let localLeaderboardData: LeaderboardEntry[] = [];
  let isLoadingDateRange = false;
  
  // Use different data sources based on view mode
  $: leaderboardData = viewMode === 'all_time' ? ($hovStatsStore.leaderboard.data || []) : localLeaderboardData;
  $: leaderboardLoading = viewMode === 'all_time' ? $hovStatsStore.leaderboard.loading : isLoadingDateRange;
  $: leaderboardError = viewMode === 'all_time' ? $hovStatsStore.leaderboard.error : null;
  let initialized = false;
  
  // Modal state
  let showLeaderboardModal = false;
  let showPlayerStatsModal = false;
  let selectedPlayerAddress: string | null = null;
  $: playerAddress = $walletStore.account?.address;
  
  // Use local data directly - no client-side filtering to preserve server order
  $: filteredData = leaderboardData || [];
  $: totalPages = Math.ceil(filteredData.length / itemsPerPage);
  $: paginatedData = filteredData.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );
  
  // Find current player's rank
  $: playerEntry = playerAddress ? filteredData.find(entry => entry.who === playerAddress) : null;
  $: playerRank = playerEntry?.rank_position || null;

  // Metric configurations (reordered as requested)
  const metrics = {
    total_won: {
      label: 'Total Won',
      icon: Trophy,
      color: 'text-yellow-400',
      format: (value: bigint) => formatVOI(Number(value), 2),
      unit: 'VOI',
      property: 'total_amount_won'
    },
    total_bet: {
      label: 'Total Bet',
      icon: Coins,
      color: 'text-orange-400',
      format: (value: bigint) => formatVOI(Number(value), 2),
      unit: 'VOI',
      property: 'total_amount_bet'
    },
    largest_win: {
      label: 'Biggest Win',
      icon: Crown,
      color: 'text-purple-400',
      format: (value: bigint) => formatVOI(Number(value), 2),
      unit: 'VOI',
      property: 'largest_single_win'
    },
    rtp: {
      label: 'RTP',
      icon: Percent,
      color: 'text-green-400',
      format: (value: number) => `${value.toFixed(1)}%`,
      unit: '',
      property: 'rtp'
    },
    total_spins: {
      label: 'Total Spins',
      icon: Target,
      color: 'text-blue-400',
      format: (value: bigint) => value.toString(),
      unit: 'spins',
      property: 'total_spins'
    }
  };


  // Auto-load data when connection is ready and we haven't loaded yet
  $: if ($connectionStatus.initialized && !initialized && !leaderboardLoading && !isLoadingDateRange && contractId) {
    initialized = true;
    if (viewMode === 'daily') {
      loadDateRangeData();
    } else {
      // All-time mode is handled automatically by the store
    }
  }

  onDestroy(() => {
    // Clean up debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  });


  // Prevent concurrent leaderboard loads
  let isLoadingLeaderboard = false;
  
  async function loadLeaderboardData() {
    if (!$connectionStatus.initialized || leaderboardLoading || isLoadingLeaderboard) return;
    
    isLoadingLeaderboard = true;
    
    try {
      // Use the store's refresh method - store data will be updated automatically
      await hovStatsStore.refreshLeaderboard(selectedMetric);
    } catch (error) {
      console.error('Failed to refresh leaderboard:', error);
    } finally {
      isLoadingLeaderboard = false;
    }
  }

  async function refresh() {
    // Don't refresh if not initialized or already loading
    if (!$connectionStatus.initialized || (leaderboardLoading && isLoadingDateRange)) return;
    
    if (viewMode === 'daily') {
      await loadDateRangeData();
    } else {
      await loadLeaderboardData();
    }
  }

  async function changeMetric(metric: typeof selectedMetric) {
    if (leaderboardLoading) return;
    
    selectedMetric = metric;
    currentPage = 0;
    
    // Clear any existing debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // Load data for the new metric based on view mode
    if (viewMode === 'daily') {
      await loadDateRangeData();
    } else {
      // Clear existing data immediately to show loading state
      leaderboardData = [];
      await loadLeaderboardData();
    }
  }

  async function changeViewMode(mode: 'all_time' | 'daily') {
    if (leaderboardLoading || isLoadingDateRange) return;
    
    viewMode = mode;
    currentPage = 0;
    
    
    if (mode === 'daily') {
      await loadDateRangeData();
    } else {
      await loadLeaderboardData();
    }
  }

  async function changeDateSelection(newDate: string) {
    if (isLoadingDateRange) return;
    
    selectedDate = newDate;
    currentPage = 0;
    
    if (viewMode === 'daily') {
      await loadDateRangeData();
    }
  }

  async function loadDateRangeData() {
    if (!$connectionStatus.initialized || isLoadingDateRange) return;

    isLoadingDateRange = true;
    localLeaderboardData = [];

    try {
      // Clear cache to force fresh data
      hovStatsService.clearCache();
      tournamentService.clearCache();

      const startDate = new Date(selectedDate);
      const endDate = new Date(selectedDate);
      endDate.setUTCHours(23, 59, 59, 999); // End of day in UTC

      const data = await hovStatsService.getLeaderboardByDate({
        p_app_id: contractId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_metric: selectedMetric,
        p_limit: 100,
        forceRefresh: true
      });

      localLeaderboardData = data;
    } catch (error) {
      console.error('Failed to load date range leaderboard:', error);
      localLeaderboardData = [];
    } finally {
      isLoadingDateRange = false;
    }
  }

  function goToPage(page: number) {
    currentPage = Math.max(0, Math.min(page, totalPages - 1));
  }

  function gotoProfile(address: string) {
    goto(`/profile/${address}`);
  }

  function getRankIcon(rank: bigint) {
    const rankNum = Number(rank);
    if (rankNum === 1) return Crown;
    if (rankNum === 2) return Trophy;
    if (rankNum === 3) return Medal;
    return null;
  }

  function getRankColor(rank: bigint) {
    const rankNum = Number(rank);
    if (rankNum === 1) return 'text-yellow-400';
    if (rankNum === 2) return 'text-gray-300';
    if (rankNum === 3) return 'text-amber-600';
    return 'text-slate-400';
  }

  function formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  // Modal functions
  function expandLeaderboard() {
    showLeaderboardModal = true;
  }

  function viewPlayerStats(address: string) {
    selectedPlayerAddress = address;
    showPlayerStatsModal = true;
  }

  function viewPlayerProfile(address: string) {
    goto(`/profile/${address}`);
  }

  function handleLeaderboardModalPlayerStats(event: CustomEvent) {
    // Don't close leaderboard modal when viewing player stats
    viewPlayerStats(event.detail.address);
  }

  function highlightPlayer(address: string) {
    highlightedPlayer = highlightedPlayer === address ? null : address;
  }

  // Helper function to calculate RTP from entry data
  function calculateRTP(entry: LeaderboardEntry): number {
    if (!entry.total_amount_bet || entry.total_amount_bet === 0n) {
      return 0;
    }
    return (Number(entry.total_amount_won) / Number(entry.total_amount_bet)) * 100;
  }

  // Helper function to format metric value
  function formatMetricValue(entry: LeaderboardEntry): string {
    if (selectedMetric === 'rtp') {
      return metricConfig.format(calculateRTP(entry));
    } else if (selectedMetric === 'win_rate') {
      return metricConfig.format(entry[metricConfig.property]);
    } else {
      return metricConfig.format(entry[metricConfig.property] as bigint);
    }
  }

  $: metricConfig = metrics[selectedMetric];
  $: Icon = metricConfig.icon;
</script>

<div class="leaderboard-container {compact ? 'compact' : ''}">
  <!-- Header -->
  <div class="leaderboard-header">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
      <div class="flex items-center gap-2 sm:gap-3 flex-wrap">
        <Trophy class="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400" />
        <h3 class="text-lg sm:text-xl font-bold text-theme">
          {compact ? 'Top Players' : 'Leaderboard'}
        </h3>
        {#if $connectionStatus.fallbackActive}
          <span class="px-1.5 py-0.5 sm:px-2 sm:py-1 text-xs bg-amber-900/50 text-amber-300 rounded-full border border-amber-600/30">
            <span class="hidden sm:inline">Limited Data</span>
            <span class="sm:hidden">Limited</span>
          </span>
        {/if}
      </div>
      
      <div class="flex items-center gap-1 sm:gap-2 flex-1 justify-end">
        <!-- View Mode Toggle (only in non-compact mode) -->
        {#if !compact}
          <div class="flex items-center gap-1 mr-2">
            <button
              on:click={() => changeViewMode('all_time')}
              class="view-mode-button-header {viewMode === 'all_time' ? 'active' : ''}"
              disabled={leaderboardLoading || isLoadingDateRange}
              title="All Time leaderboard"
            >
              <Trophy class="w-3 h-3 sm:w-4 sm:h-4" />
              <span class="hidden sm:inline">All Time</span>
            </button>
            <button
              on:click={() => changeViewMode('daily')}
              class="view-mode-button-header {viewMode === 'daily' ? 'active' : ''}"
              disabled={leaderboardLoading || isLoadingDateRange}
              title="Daily leaderboard"
            >
              <Calendar class="w-3 h-3 sm:w-4 sm:h-4" />
              <span class="hidden sm:inline">Daily</span>
            </button>
          </div>
        {/if}

        <!-- Date Picker (only shown for daily mode in header) -->
        {#if viewMode === 'daily' && !compact}
          <div class="flex items-center gap-1 mr-2" transition:fly={{ x: -20, duration: 200 }}>
            <button
              on:click={() => {
                const prevDate = new Date(selectedDate);
                prevDate.setDate(prevDate.getDate() - 1);
                changeDateSelection(prevDate.toISOString().split('T')[0]);
              }}
              class="date-nav-button-header"
              disabled={isLoadingDateRange}
              title="Previous day"
            >
              <ChevronLeft class="w-3 h-3 sm:w-4 sm:h-4" />
            </button>
            <input
              type="date"
              bind:value={selectedDate}
              on:change={(e) => changeDateSelection((e.target as HTMLInputElement).value)}
              class="date-picker-header"
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
              class="date-nav-button-header"
              disabled={isLoadingDateRange || selectedDate === new Date().toISOString().split('T')[0]}
              title="Next day"
            >
              <ChevronRight class="w-3 h-3 sm:w-4 sm:h-4" />
            </button>
          </div>
        {/if}

        <!-- Expand -->
        <button
          on:click={expandLeaderboard}
          class="btn-secondary text-xs sm:text-sm p-2 sm:p-3"
          title="Expand leaderboard"
          style="min-height: 44px; min-width: 44px;"
        >
          <Maximize2 class="w-3 h-3 sm:w-4 sm:h-4" />
        </button>

        <!-- Refresh -->
        <button
          on:click={refresh}
          disabled={leaderboardLoading}
          class="btn-secondary text-xs sm:text-sm p-2 sm:p-3"
          title="Refresh leaderboard"
          style="min-height: 44px; min-width: 44px;"
        >
          <RefreshCw class="w-3 h-3 sm:w-4 sm:h-4 {leaderboardLoading ? 'animate-spin' : ''}" />
        </button>
      </div>
    </div>

    <!-- Metric selection -->
    <div class="metric-filters">
      {#if compact}
        <!-- Dropdown for compact mode -->
        <div class="mb-4">
          <select
            bind:value={selectedMetric}
            on:change={(e) => changeMetric((e.target as HTMLSelectElement).value as typeof selectedMetric)}
            class="metric-select w-full"
            disabled={leaderboardLoading}
          >
            {#each Object.entries(metrics) as [key, config]}
              <option value={key}>{config.label}</option>
            {/each}
          </select>
        </div>
      {:else}
        <!-- Buttons for regular mode -->
        <div class="grid grid-cols-2 lg:grid-cols-3 xl:flex xl:flex-wrap gap-2 mb-4">
          {#each Object.entries(metrics) as [key, config]}
            <button
              on:click={() => changeMetric(key as typeof selectedMetric)}
              class="metric-button {selectedMetric === key ? 'active' : ''}"
              disabled={leaderboardLoading}
            >
              <svelte:component this={config.icon} class="w-3 h-3 sm:w-4 sm:h-4" />
              <span class="text-xs sm:text-sm">{config.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Date Range Display (only for daily mode) -->
    {#if viewMode === 'daily' && !compact}
      <div class="text-xs text-gray-400 mb-4 text-center">
        Showing results for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}
      </div>
    {/if}

    <!-- Player rank highlight -->
    {#if showPlayerHighlight && playerRank && playerAddress}
      <div class="player-rank-card mt-4" transition:fly={{ y: -20, duration: 300 }}>
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="w-6 h-6 sm:w-8 sm:h-8 bg-voi-500/20 rounded-full flex items-center justify-center">
              <Users class="w-3 h-3 sm:w-4 sm:h-4 text-voi-400" />
            </div>
            <div>
              <div class="text-xs sm:text-sm text-gray-400">Your Rank</div>
              <div class="text-base sm:text-lg font-bold text-voi-400">#{playerRank}</div>
            </div>
          </div>
          <div class="text-left sm:text-right">
            <div class="text-xs sm:text-sm text-gray-400">{metricConfig.label}</div>
            <div class="text-sm sm:text-base font-semibold text-theme">
              {playerEntry ? formatMetricValue(playerEntry) : '--'}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Loading state -->
  {#if leaderboardLoading && !initialized}
    <div class="loading-container">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-400 mx-auto mb-4"></div>
      <p class="text-gray-400 text-center">Loading leaderboard...</p>
    </div>
  {:else if leaderboardLoading}
    <!-- Loading with skeleton placeholders -->
    <div class="leaderboard-list">
      {#each Array(itemsPerPage) as _, i}
        <div class="leaderboard-entry skeleton" transition:fade={{ duration: 150 }}>
          <div class="hidden sm:flex sm:items-center sm:justify-between sm:w-full sm:gap-4">
              <div class="flex-shrink-0 w-8">
              <div class="skeleton-text h-6 w-8"></div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="skeleton-text h-4 w-24 mb-2"></div>
              <div class="skeleton-text h-3 w-16"></div>
            </div>
            <div class="flex-shrink-0 text-right w-28">
              <div class="skeleton-text h-5 w-20 mb-1"></div>
              <div class="skeleton-text h-3 w-12"></div>
            </div>
            <div class="flex-shrink-0 w-12">
              <div class="skeleton-text h-8 w-8 rounded"></div>
            </div>
          </div>
          
          <div class="block sm:hidden">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <div class="skeleton-text h-4 w-6"></div>
                <div class="skeleton-text h-4 w-20"></div>
              </div>
              <div class="skeleton-text h-6 w-6 rounded"></div>
            </div>
            <div class="flex items-center justify-between">
              <div class="skeleton-text h-3 w-16"></div>
              <div class="text-right">
                <div class="skeleton-text h-4 w-16 mb-1"></div>
                <div class="skeleton-text h-3 w-8"></div>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else if leaderboardError && !leaderboardData.length}
    <!-- Error state -->
    <div class="error-container">
      <div class="text-red-400 text-center mb-2">Failed to load leaderboard</div>
      <p class="text-sm text-gray-400 text-center mb-4">{leaderboardError}</p>
      <button on:click={refresh} class="btn-primary text-sm mx-auto block">
        Retry
      </button>
    </div>
  {:else if paginatedData.length === 0}
    <!-- Empty state -->
    <div class="empty-container">
      <Trophy class="w-16 h-16 text-gray-600 mx-auto mb-4" />
      <p class="text-gray-400 text-center">
        No leaderboard data available
      </p>
    </div>
  {:else}
    <!-- Leaderboard list -->
    <div class="leaderboard-list">
      {#each paginatedData as entry, i (entry.who)}
        <div 
          class="leaderboard-entry {playerAddress === entry.who ? 'player-entry' : ''}"
          transition:fly={{ y: 20, duration: 200, delay: i * 50 }}
        >
          <!-- Mobile Layout (< sm) -->
          <div class="block sm:hidden">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <!-- Rank -->
                {#if getRankIcon(entry.rank_position)}
                  <svelte:component 
                    this={getRankIcon(entry.rank_position)} 
                    class="w-4 h-4 {getRankColor(entry.rank_position)}" 
                  />
                {:else}
                  <span class="text-sm font-bold {getRankColor(entry.rank_position)}">
                    #{entry.rank_position}
                  </span>
                {/if}
                
                <!-- Player Address -->
                <AddressDisplay
                  address={entry.who}
                  showProfileLink={false}
                  maxLength="short"
                  className="address-display-compact"
                  linkClassName="text-sm hover:text-voi-400 transition-colors"
                />
              </div>
              
              <!-- Action Buttons -->
              <div class="action-buttons">
                <button
                  on:click={() => viewPlayerProfile(entry.who)}
                  class="action-btn"
                  title="View player profile"
                >
                  <User class="w-4 h-4" />
                </button>
                <button
                  on:click={() => viewPlayerStats(entry.who)}
                  class="action-btn"
                  title="View player stats"
                >
                  <BarChart3 class="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-xs text-gray-400">
                <Target class="w-3 h-3" />
                <span>{entry.total_spins} spins</span>
                {#if playerAddress === entry.who}
                <span class="you-badge">YOU</span>
              {/if}
           </div>
              
              <!-- Metric value -->
              <div class="text-right">
                <div class="text-sm font-bold {metricConfig.color}">
                  {formatMetricValue(entry)}
                </div>
                <div class="text-xs text-gray-400">{metricConfig.unit}</div>
              </div>
            </div>
          </div>

          <!-- Desktop Layout (>= sm) -->
          <div class="hidden sm:flex sm:items-center sm:justify-between sm:w-full sm:gap-4">
            <!-- Rank -->
            <div class="flex-shrink-0 w-8">
              {#if getRankIcon(entry.rank_position)}
                <svelte:component 
                  this={getRankIcon(entry.rank_position)} 
                  class="w-6 h-6 {getRankColor(entry.rank_position)}" 
                />
              {:else}
                <span class="rank-number {getRankColor(entry.rank_position)}">
                  #{entry.rank_position}
                </span>
              {/if}
            </div>

            <!-- Player info -->
            <div class="flex-1 min-w-0">
              <div class="player-address">
                <AddressDisplay
                  address={entry.who}
                  showProfileLink={false}
                  maxLength="medium"
                  linkClassName="text-sm hover:text-voi-400 transition-colors"
                />
              </div>
              <div class="player-stats">
                <span class="stat-item">
                  <Target class="w-3 h-3" />
                  {entry.total_spins} spins
                </span>
                {#if playerAddress === entry.who}
                  <span class="you-badge">YOU</span>
                {/if}
              </div>
            </div>

            <!-- Metric value -->
            <div class="flex-shrink-0 text-right w-28">
              <div class="value {metricConfig.color}">
                {formatMetricValue(entry)}
              </div>
              <div class="unit">{metricConfig.unit}</div>
            </div>

            <!-- Actions -->
            <div class="flex-shrink-0 w-20">
              <div class="action-buttons">
                <button
                  on:click={() => viewPlayerProfile(entry.who)}
                  class="action-btn"
                  title="View player profile"
                >
                  <User class="w-4 h-4" />
                </button>
                <button
                  on:click={() => viewPlayerStats(entry.who)}
                  class="action-btn"
                  title="View player stats"
                >
                  <BarChart3 class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1 && !compact}
      <div class="pagination">
        <button
          on:click={() => goToPage(currentPage - 1)}
          disabled={currentPage === 0}
          class="pagination-btn"
        >
          <ChevronLeft class="w-4 h-4" />
        </button>
        
        <span class="page-info">
          {currentPage + 1} of {totalPages}
        </span>
        
        <button
          on:click={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
          class="pagination-btn"
        >
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>
    {/if}
  {/if}
</div>

<!-- Modals -->
{#if showLeaderboardModal}
  <LeaderboardModal 
    bind:isVisible={showLeaderboardModal}
    initialMetric={selectedMetric}
    {contractId}
    on:close={() => showLeaderboardModal = false}
    on:viewPlayerStats={handleLeaderboardModalPlayerStats}
  />
{/if}

{#if showPlayerStatsModal && selectedPlayerAddress}
  <!-- Player Stats Modal -->
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-surface-primary rounded-xl border border-surface-border w-full max-w-4xl max-h-[90vh] overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-surface-border">
        <h2 class="text-xl font-bold text-theme">Player Statistics</h2>
        <button
          on:click={() => {
            showPlayerStatsModal = false;
            selectedPlayerAddress = null;
          }}
          class="btn-secondary p-2"
          title="Close"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="max-h-[calc(90vh-120px)] overflow-y-auto">
        <PlayerStats
          playerAddress={selectedPlayerAddress}
          compact={false}
          autoRefresh={false}
        />
      </div>
    </div>
  </div>
{/if}

<style lang="postcss">
  .leaderboard-container {
    @apply w-full;
  }
  
  .leaderboard-container:not(.compact) {
    @apply bg-slate-800 rounded-xl border border-slate-700 overflow-hidden;
  }

  .compact {
    @apply text-sm;
  }

  .leaderboard-header {
    @apply p-3 sm:p-4;
  }
  
  .leaderboard-container:not(.compact) .leaderboard-header {
    @apply border-b border-slate-700 bg-slate-800/50;
  }

  .metric-filters {
    @apply space-y-2;
  }

  .metric-button {
    @apply flex items-center justify-center gap-1 sm:gap-2 px-2 py-2 bg-slate-700 border border-slate-600 rounded-lg text-xs sm:text-sm transition-all duration-200;
    min-height: 44px;
  }
  
  @media (min-width: 640px) {
    .metric-button {
      @apply px-3;
    }
  }

  .metric-button:hover {
    @apply bg-slate-600 border-slate-500;
  }

  .metric-button.active {
    @apply bg-voi-600 border-voi-500 text-white;
  }

  .metric-select {
    @apply px-3 py-2 bg-surface-secondary border border-surface-border rounded-lg text-sm focus:border-theme-primary focus:outline-none transition-all duration-200;
    min-height: 44px;
    color: var(--theme-text);
  }

  .metric-select:hover {
    @apply bg-surface-hover border-surface-hover;
  }

  .metric-select:disabled {
    @apply opacity-50 cursor-not-allowed;
  }

  .player-rank-card {
    @apply p-2 sm:p-3 bg-voi-900/30 border border-voi-600/30 rounded-lg;
  }

  .loading-container, .error-container, .empty-container {
    @apply p-8 text-center;
  }

  .leaderboard-list {
    @apply divide-y divide-slate-700;
  }

  .leaderboard-entry {
    @apply p-3 sm:p-4 hover:bg-slate-700/50 transition-all duration-200 relative;
  }

  .leaderboard-entry.player-entry {
    @apply bg-voi-900/20 border-l-4 border-voi-500;
  }

  .leaderboard-entry.highlighted {
    @apply bg-slate-700/50;
    grid-template-columns: 1fr;
  }

  .rank-section {
    @apply flex items-center justify-center w-12;
  }

  .rank-number {
    @apply font-bold text-lg;
  }

  .player-info {
    @apply min-w-0;
  }

  .player-address {
    @apply font-mono font-semibold text-theme flex items-center min-w-0;
  }

  .you-badge {
    @apply px-2 py-0.5 text-xs bg-voi-600 text-white rounded-full flex-shrink-0 whitespace-nowrap;
  }

  .player-stats {
    @apply flex items-center gap-3 mt-1 text-xs text-gray-400;
  }

  .stat-item {
    @apply flex items-center gap-1 whitespace-nowrap;
  }

  .metric-value {
    @apply text-right;
  }

  .metric-value .value {
    @apply font-bold text-lg;
  }

  .metric-value .unit {
    @apply text-xs text-gray-400;
  }

  .entry-actions {
    @apply flex items-center gap-1;
  }

  .action-buttons {
    @apply flex gap-1;
  }

  .action-btn {
    @apply p-2 text-gray-400 hover:text-theme hover:bg-slate-600 rounded-lg transition-all duration-200;
    min-height: 40px;
    min-width: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pagination {
    @apply flex items-center justify-center gap-4 p-4 border-t border-slate-700 bg-slate-800/50;
  }

  .pagination-btn {
    @apply p-2 text-gray-400 hover:text-theme hover:bg-slate-600 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
    min-height: 44px;
    min-width: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .page-info {
    @apply text-sm text-gray-400 font-medium;
  }

  .skeleton {
    @apply opacity-60;
  }

  .skeleton-text {
    @apply bg-slate-600 rounded animate-pulse;
  }

  /* Header View Mode Toggle Styles */
  .view-mode-button-header {
    @apply flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 bg-slate-700 border border-slate-600 rounded-lg text-xs sm:text-sm transition-all duration-200 hover:bg-slate-600 hover:border-slate-500;
  }

  .view-mode-button-header.active {
    @apply bg-voi-600 border-voi-500 text-white;
  }

  .view-mode-button-header:disabled {
    @apply opacity-50 cursor-not-allowed;
  }

  .date-picker-header {
    @apply px-2 sm:px-3 py-1 sm:py-2 bg-slate-700 border border-slate-600 rounded-lg text-xs sm:text-sm text-white focus:border-voi-500 focus:outline-none transition-all duration-200 min-w-[120px];
  }

  .date-picker-header:disabled {
    @apply opacity-50 cursor-not-allowed;
  }

  .date-nav-button-header {
    @apply p-1 sm:p-2 bg-slate-700 border border-slate-600 rounded-lg text-gray-300 hover:bg-slate-600 hover:border-slate-500 hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
  }
</style>
