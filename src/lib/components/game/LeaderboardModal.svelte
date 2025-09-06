<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { 
    X, 
    Trophy, 
    Medal, 
    Crown, 
    TrendingUp, 
    TrendingDown,
    User,
    BarChart3,
    Target,
    Coins,
    Calendar,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Eye,
    Percent
  } from 'lucide-svelte';
  import { hovStatsService } from '$lib/services/hovStats';
  import { connectionStatus } from '$lib/stores/hovStats';
  import type { LeaderboardEntry } from '$lib/types/hovStats';
  import { formatVOI } from '$lib/constants/betting';
  import { goto } from '$app/navigation';

  const dispatch = createEventDispatcher();

  // Props
  export let isVisible = false;
  export let initialMetric = 'total_won';
  export let contractId: bigint; // Required: contract ID for leaderboard data
  
  // State
  let entries: LeaderboardEntry[] = [];
  let loading = false;
  let error: string | null = null;
  let selectedMetric = initialMetric;
  let currentPage = 1;
  let pageSize = 50;
  let refreshing = false;
  let lastUpdated: Date | null = null;
  
  // Local leaderboard state (bypass store)
  let leaderboardData: LeaderboardEntry[] = [];
  let initialized = false;

  // Modal element for focus management
  let modalElement: HTMLElement;

  // Available metrics - SAME ORDER as Leaderboard.svelte
  const metrics = {
    total_won: {
      label: 'Total Won', 
      icon: Trophy,
      color: 'text-yellow-400',
      property: 'total_amount_won'
    },
    total_bet: {
      label: 'Total Bet',
      icon: Coins,
      color: 'text-orange-400',
      property: 'total_amount_bet'
    },
    largest_win: {
      label: 'Biggest Win',
      icon: Crown,
      color: 'text-purple-400', 
      property: 'largest_single_win'
    },
    rtp: {
      label: 'RTP',
      icon: Percent,
      color: 'text-green-400',
      property: 'rtp'
    },
    total_spins: {
      label: 'Total Spins',
      icon: Target,
      color: 'text-blue-400',
      property: 'total_spins'
    },
  };

  // Computed values
  $: metricConfig = metrics[selectedMetric as keyof typeof metrics];
  $: totalPages = Math.max(1, Math.ceil(leaderboardData.length / pageSize));
  $: startRank = (currentPage - 1) * pageSize + 1;
  $: endRank = Math.min(currentPage * pageSize, leaderboardData.length);
  $: paginatedEntries = leaderboardData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  
  // Update entries for template compatibility
  $: entries = paginatedEntries;

  // Load leaderboard data
  async function loadLeaderboard() {
    if (!$connectionStatus.initialized || loading) return;
    
    loading = true;
    error = null;
    
    try {
      const data = await hovStatsService.getLeaderboard({
        p_app_id: contractId,
        p_metric: selectedMetric as any,
        p_limit: 100,
        forceRefresh: true
      });
      
      leaderboardData = data;
      lastUpdated = new Date();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load leaderboard';
      leaderboardData = [];
    } finally {
      loading = false;
    }
  }

  // Refresh leaderboard
  async function refresh() {
    refreshing = true;
    try {
      await loadLeaderboard();
    } finally {
      refreshing = false;
    }
  }

  // Change metric
  async function changeMetric(metric: string) {
    if (loading) return;
    
    selectedMetric = metric;
    currentPage = 1; // Reset to first page
    
    // Clear existing data immediately to show loading state
    leaderboardData = [];
    
    // Load data immediately for the new metric
    await loadLeaderboard();
  }

  // Pagination
  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      currentPage = page;
    }
  }

  // View player stats - don't close modal
  function viewPlayerStats(address: string) {
    dispatch('viewPlayerStats', { address });
  }

  // View player profile
  function viewPlayerProfile(address: string) {
    goto(`/profile/${address}`);
  }

  // Format address for display
  function formatAddress(address: string): string {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  }

  // Helper function to calculate RTP from entry data
  function calculateRTP(entry: LeaderboardEntry): number {
    if (!entry.total_amount_bet || entry.total_amount_bet === 0n) {
      return 0;
    }
    return (Number(entry.total_amount_won) / Number(entry.total_amount_bet)) * 100;
  }

  // Format metric value
  function formatMetricValue(entry: LeaderboardEntry, metric: string): string {
    if (metric === 'rtp') {
      return `${calculateRTP(entry).toFixed(1)}%`;
    }
    
    const config = metrics[metric as keyof typeof metrics];
    const value = entry[config.property as keyof LeaderboardEntry];
    
    if (typeof value === 'bigint') {
      if (metric === 'total_won' || metric === 'largest_win' || metric === 'total_bet') {
        return formatVOI(Number(value)) + ' VOI';
      }
      return value.toString();
    } else if (typeof value === 'number') {
      if (metric === 'win_rate') {
        return `${value.toFixed(1)}%`;
      } else if (metric === 'avg_bet_size') {
        return formatVOI(value) + ' VOI';
      }
      return value.toString();
    }
    return String(value);
  }

  // Get rank icon
  function getRankIcon(rank: number) {
    if (rank === 1) return Crown;
    if (rank === 2) return Medal;  
    if (rank === 3) return Trophy;
    return User;
  }

  // Get rank color
  function getRankColor(rank: number): string {
    if (rank === 1) return 'text-yellow-400';
    if (rank === 2) return 'text-gray-300';
    if (rank === 3) return 'text-amber-600';
    return 'text-gray-400';
  }

  // Handle escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close();
    }
  }

  // Close modal
  function close() {
    dispatch('close');
  }

  // Handle backdrop click
  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  // Load data when modal becomes visible
  $: if (isVisible && $connectionStatus.initialized && !leaderboardData.length && !loading && !initialized) {
    loadLeaderboard();
    initialized = true;
  }

  // Reset initialization when modal closes
  $: if (!isVisible) {
    initialized = false;
  }

  // Reload data when contractId changes
  $: if (contractId && isVisible && $connectionStatus.initialized && initialized) {
    loadLeaderboard();
  }

  // Set up event listeners and body scroll management
  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeydown);
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeydown);
      // Restore body scroll when component is destroyed
      document.body.style.overflow = '';
    }
  });

  // Manage body scroll when modal visibility changes
  $: if (typeof document !== 'undefined') {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }
</script>

{#if isVisible}
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
          <Trophy class="w-6 h-6 text-voi-400" />
          <div>
            <h2 class="text-xl font-bold text-theme">Leaderboard</h2>
            <p class="text-sm text-gray-400">Top players by {metricConfig.label.toLowerCase()}</p>
          </div>
        </div>
        
        <div class="flex items-center gap-3">
          {#if lastUpdated}
            <span class="text-xs text-gray-500">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          {/if}
          
          <button
            on:click={refresh}
            disabled={loading || refreshing}
            class="p-2 text-gray-400 hover:text-theme transition-colors"
            title="Refresh leaderboard"
          >
            <RefreshCw class="w-4 h-4 {(loading || refreshing) ? 'animate-spin' : ''}" />
          </button>
          
          <button
            on:click={close}
            class="p-2 text-gray-400 hover:text-theme transition-colors"
            title="Close modal"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Metric selector -->
      <div class="p-4 border-b border-surface-border bg-surface-primary/30">
        <div class="flex flex-wrap gap-2">
          {#each Object.entries(metrics) as [key, config]}
            <button
              on:click={() => changeMetric(key)}
              class="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors {selectedMetric === key 
                ? 'bg-voi-600 text-white' 
                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'}"
            >
              <svelte:component this={config.icon} class="w-4 h-4" />
              {config.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto">
        {#if loading && leaderboardData.length === 0}
          <!-- Loading -->
          <div class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-400 mb-4"></div>
          </div>
        {:else if error && leaderboardData.length === 0}
          <!-- Error -->
          <div class="flex flex-col items-center justify-center py-12">
            <div class="text-red-400 mb-2">Failed to load leaderboard</div>
            <p class="text-sm text-gray-400 text-center mb-4">{error}</p>
            <button on:click={refresh} class="btn-primary">
              Retry
            </button>
          </div>
        {:else if leaderboardData.length === 0}
          <!-- Empty -->
          <div class="flex flex-col items-center justify-center py-12">
            <Trophy class="w-16 h-16 text-gray-600 mb-4" />
            <p class="text-gray-400 text-center">No leaderboard data available</p>
          </div>
        {:else}
          <!-- Leaderboard table -->
          <div class="p-4">
            <!-- Pagination info -->
            <div class="flex items-center justify-between mb-4">
              <p class="text-sm text-gray-400">
                Showing ranks {startRank}-{endRank} of top players
              </p>
              
              <!-- Pagination controls -->
              <div class="flex items-center gap-2">
                <button
                  on:click={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1 || loading}
                  class="p-2 text-gray-400 hover:text-theme disabled:opacity-50 disabled:hover:text-gray-400 transition-colors"
                >
                  <ChevronLeft class="w-4 h-4" />
                </button>
                
                <span class="text-sm text-gray-400 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                
                <button
                  on:click={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages || loading}
                  class="p-2 text-gray-400 hover:text-theme disabled:opacity-50 disabled:hover:text-gray-400 transition-colors"
                >
                  <ChevronRight class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Table -->
            <div class="bg-slate-900/50 rounded-lg overflow-hidden">
              <table class="w-full">
                <thead>
                  <tr class="bg-surface-primary/50 border-b border-surface-border">
                    <th class="text-left py-3 px-4 text-sm font-medium text-gray-300">Rank</th>
                    <th class="text-left py-3 px-4 text-sm font-medium text-gray-300">Player</th>
                    <th class="text-right py-3 px-4 text-sm font-medium text-gray-300">{metricConfig.label}</th>
                    <th class="text-right py-3 px-4 text-sm font-medium text-gray-300">Total Spins</th>
                    <th class="text-right py-3 px-4 text-sm font-medium text-gray-300">Win Rate</th>
                    <th class="text-right py-3 px-4 text-sm font-medium text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each paginatedEntries as entry, index}
                    {@const rank = startRank + index}
                    {@const RankIcon = getRankIcon(rank)}
                    <tr class="border-b border-surface-border/50 hover:bg-surface-primary/30 transition-colors">
                      <td class="py-3 px-4">
                        <div class="flex items-center gap-2">
                          <RankIcon class="w-4 h-4 {getRankColor(rank)}" />
                          <span class="font-medium text-theme">#{rank}</span>
                        </div>
                      </td>
                      <td class="py-3 px-4">
                        <span class="font-mono text-sm text-theme">{formatAddress(entry.who)}</span>
                      </td>
                      <td class="py-3 px-4 text-right">
                        <div class="font-semibold {metricConfig.color}">
                          {formatMetricValue(entry, selectedMetric)}
                        </div>
                      </td>
                      <td class="py-3 px-4 text-right text-gray-300">
                        {entry.total_spins.toString()}
                      </td>
                      <td class="py-3 px-4 text-right text-gray-300">
                        {entry.win_rate.toFixed(1)}%
                      </td>
                      <td class="py-3 px-4 text-right">
                        <div class="flex gap-1 justify-end">
                          <button
                            on:click={() => viewPlayerProfile(entry.who)}
                            class="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-gray-300 hover:text-white rounded transition-colors"
                            title="View player profile"
                          >
                            <User class="w-3 h-3" />
                            Profile
                          </button>
                          <button
                            on:click={() => viewPlayerStats(entry.who)}
                            class="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-gray-300 hover:text-white rounded transition-colors"
                            title="View player statistics"
                          >
                            <Eye class="w-3 h-3" />
                            Stats
                          </button>
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  table {
    border-collapse: separate;
    border-spacing: 0;
  }
</style>