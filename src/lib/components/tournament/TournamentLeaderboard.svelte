<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    Crown, 
    Trophy, 
    Medal, 
    Coins, 
    Percent, 
    Zap, 
    Target,
    Users,
    RefreshCw,
    Star,
    TrendingUp
  } from 'lucide-svelte';
  import { hovStatsStore, connectionStatus } from '$lib/stores/hovStats';
  import { walletStore } from '$lib/stores/wallet';
  import { formatVOI } from '$lib/constants/betting';
  import type { LeaderboardEntry } from '$lib/types/hovStats';

  // Props
  export let tournament: any;
  export let contractId: bigint;
  export let isActive = false;
  export let isEnded = false;

  // State
  let refreshing = false;
  
  // Use store data
  $: leaderboardData = $hovStatsStore.leaderboard.data || [];
  $: leaderboardLoading = $hovStatsStore.leaderboard.loading;
  $: leaderboardError = $hovStatsStore.leaderboard.error;
  $: playerAddress = $walletStore.account?.address;

  // Category configurations
  const categories = {
    volume: {
      name: 'Volume Champion',
      description: 'Highest total wagered',
      icon: Coins,
      color: 'from-orange-500 to-amber-500',
      iconColor: 'text-orange-400',
      metricKey: 'total_amount_bet',
      format: (value: bigint) => `${formatVOI(Number(value), 2)} VOI`,
      sortDesc: true
    },
    rtp: {
      name: 'RTP Champion', 
      description: 'Best Return to Player (min 500 spins, 25,000 VOI)',
      icon: Percent,
      color: 'from-green-500 to-emerald-500',
      iconColor: 'text-green-400',
      metricKey: 'rtp',
      format: (value: number) => `${value.toFixed(1)}%`,
      minRequirements: { minSpins: 500, minVolume: 25000 },
      sortDesc: true
    },
    win_streak: {
      name: 'Win Streak Champion',
      description: 'Most total spins (Win Streak data coming soon)',
      icon: Zap,
      color: 'from-purple-500 to-violet-500', 
      iconColor: 'text-purple-400',
      metricKey: 'total_spins',
      format: (value: bigint) => `${value.toString()} spins`,
      sortDesc: true
    },
    overall: {
      name: 'Overall Champion',
      description: 'Lowest combined ranking across all categories',
      icon: Crown,
      color: 'from-yellow-400 via-amber-500 to-yellow-600',
      iconColor: 'text-yellow-400',
      metricKey: 'overall_rank',
      format: (value: number) => `Rank ${value}`,
      sortDesc: false
    }
  };

  // Calculate RTP for an entry
  function calculateRTP(entry: LeaderboardEntry): number {
    if (!entry.total_amount_bet || entry.total_amount_bet === 0n) {
      return 0;
    }
    return (Number(entry.total_amount_won) / Number(entry.total_amount_bet)) * 100;
  }

  // Check if entry meets RTP requirements
  function meetsRTPRequirements(entry: LeaderboardEntry): boolean {
    const minSpins = 500;
    const minVolume = 25000; // VOI in atomic units (25000 * 1000000)
    return Number(entry.total_spins) >= minSpins && 
           Number(entry.total_amount_bet) >= (minVolume * 1000000);
  }

  // Get top players for each category
  function getTopPlayersForCategory(categoryKey: string): LeaderboardEntry[] {
    if (!leaderboardData.length) return [];
    
    let filteredData = [...leaderboardData];
    const category = categories[categoryKey];
    
    // Apply RTP filtering if needed
    if (categoryKey === 'rtp') {
      filteredData = filteredData.filter(meetsRTPRequirements);
      
      // Sort by RTP
      filteredData.sort((a, b) => {
        const rtpA = calculateRTP(a);
        const rtpB = calculateRTP(b);
        return rtpB - rtpA; // Descending
      });
    } else if (categoryKey === 'overall') {
      // Calculate overall ranking for each player
      const playersWithRanks = filteredData.map(player => {
        const volumeRank = getRankInCategory(player, 'volume');
        const rtpRank = getRankInCategory(player, 'rtp');
        const streakRank = getRankInCategory(player, 'win_streak');
        
        const totalRank = volumeRank + rtpRank + streakRank;
        
        return {
          ...player,
          overall_rank: totalRank
        };
      });
      
      // Sort by lowest combined rank
      playersWithRanks.sort((a, b) => a.overall_rank - b.overall_rank);
      filteredData = playersWithRanks;
    } else {
      // Standard sorting by metric value
      const metricKey = category.metricKey;
      filteredData.sort((a, b) => {
        const valueA = Number(a[metricKey] || 0);
        const valueB = Number(b[metricKey] || 0);
        return category.sortDesc ? valueB - valueA : valueA - valueB;
      });
    }
    
    return filteredData.slice(0, 3);
  }

  // Get player's rank in a specific category  
  function getRankInCategory(player: LeaderboardEntry, categoryKey: string): number {
    const topPlayers = getTopPlayersForCategory(categoryKey);
    const index = topPlayers.findIndex(p => p.who === player.who);
    return index >= 0 ? index + 1 : 999; // High number if not in top 3
  }

  // Get player's position in category (including beyond top 3)
  function getPlayerPositionInCategory(categoryKey: string): { rank: number; player: LeaderboardEntry } | null {
    if (!playerAddress || !leaderboardData.length) return null;
    
    const category = categories[categoryKey];
    let filteredData = [...leaderboardData];
    
    if (categoryKey === 'rtp') {
      filteredData = filteredData.filter(meetsRTPRequirements);
      filteredData.sort((a, b) => calculateRTP(b) - calculateRTP(a));
    } else if (categoryKey === 'overall') {
      const playersWithRanks = filteredData.map(player => ({
        ...player,
        overall_rank: getRankInCategory(player, 'volume') + 
                     getRankInCategory(player, 'rtp') + 
                     getRankInCategory(player, 'win_streak')
      }));
      filteredData = playersWithRanks.sort((a, b) => a.overall_rank - b.overall_rank);
    } else {
      const metricKey = category.metricKey;
      filteredData.sort((a, b) => {
        const valueA = Number(a[metricKey] || 0);
        const valueB = Number(b[metricKey] || 0);
        return category.sortDesc ? valueB - valueA : valueA - valueB;
      });
    }
    
    const playerIndex = filteredData.findIndex(p => p.who === playerAddress);
    if (playerIndex >= 0) {
      return {
        rank: playerIndex + 1,
        player: filteredData[playerIndex]
      };
    }
    return null;
  }

  // Get trophy icon and color for rank
  function getTrophyDisplay(rank: number) {
    switch (rank) {
      case 1: return { icon: Crown, color: 'text-yellow-400' };
      case 2: return { icon: Trophy, color: 'text-gray-300' };
      case 3: return { icon: Medal, color: 'text-amber-600' };
      default: return { icon: Target, color: 'text-gray-500' };
    }
  }

  // Format address
  function formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  // Format metric value for category
  function formatCategoryValue(entry: LeaderboardEntry, categoryKey: string): string {
    const category = categories[categoryKey];
    
    if (categoryKey === 'rtp') {
      return category.format(calculateRTP(entry));
    } else if (categoryKey === 'overall') {
      const overallRank = getRankInCategory(entry, 'volume') + 
                         getRankInCategory(entry, 'rtp') + 
                         getRankInCategory(entry, 'win_streak');
      return category.format(overallRank);
    } else {
      const value = entry[category.metricKey];
      return category.format(value);
    }
  }

  // Refresh all category data
  async function refreshData() {
    if (refreshing || !contractId) return;
    
    refreshing = true;
    try {
      await hovStatsStore.refreshLeaderboard('total_bet'); // Get all data
    } catch (error) {
      console.error('Failed to refresh tournament data:', error);
    } finally {
      refreshing = false;
    }
  }

  onMount(() => {
    if (contractId > 0n) {
      refreshData();
    }
  });
</script>

<div class="tournament-leaderboard">
  <!-- Header -->
  <div class="mb-8">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 bg-gradient-to-r from-yellow-400 to-amber-500 rounded-xl flex items-center justify-center">
          <Trophy class="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 class="text-2xl font-bold text-theme">Tournament Leaderboard</h3>
          <p class="text-gray-400">Live rankings across all categories</p>
        </div>
      </div>
      
      <button
        on:click={refreshData}
        disabled={refreshing || !contractId}
        class="btn-secondary p-3"
        title="Refresh tournament data"
      >
        <RefreshCw class="w-5 h-5 {refreshing ? 'animate-spin' : ''}" />
      </button>
    </div>
  </div>

  {#if !contractId}
    <div class="text-center py-12 text-gray-400">
      <Trophy class="w-16 h-16 mx-auto mb-4 opacity-50" />
      <p class="text-lg font-medium">No Contract Selected</p>
      <p>Please select a slot machine contract to view tournament rankings.</p>
    </div>
  {:else if leaderboardLoading}
    <div class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-4 border-voi-500 border-t-transparent mx-auto mb-4"></div>
      <p class="text-gray-400">Loading tournament data...</p>
    </div>
  {:else if leaderboardError || !leaderboardData.length}
    <div class="text-center py-12 text-red-400">
      <Trophy class="w-16 h-16 mx-auto mb-4 opacity-50" />
      <p class="text-lg font-medium">Unable to load tournament data</p>
      <p class="text-sm text-gray-400 mb-4">{leaderboardError || 'No data available'}</p>
      <button on:click={refreshData} class="btn-primary">
        Try Again
      </button>
    </div>
  {:else}
    <!-- Category Leaderboards Grid -->
    <div class="grid lg:grid-cols-2 gap-6">
      {#each Object.entries(categories) as [categoryKey, category]}
        {@const topPlayers = getTopPlayersForCategory(categoryKey)}
        {@const playerPosition = getPlayerPositionInCategory(categoryKey)}
        {@const isPlayerInTop3 = playerPosition && playerPosition.rank <= 3}
        
        <div class="category-card">
          <!-- Category Header -->
          <div class="category-header bg-gradient-to-r {category.color}">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-black/20 rounded-lg flex items-center justify-center">
                <svelte:component this={category.icon} class="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 class="text-lg font-bold text-white">{category.name}</h4>
                <p class="text-white/80 text-sm">{category.description}</p>
              </div>
            </div>
          </div>
          
          <!-- Top 3 Players -->
          <div class="category-body">
            {#if topPlayers.length === 0}
              <div class="text-center py-6 text-gray-500">
                <Users class="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p class="text-sm">No qualifying players yet</p>
              </div>
            {:else}
              <div class="space-y-3">
                {#each topPlayers as player, index}
                  {@const rank = index + 1}
                  {@const trophy = getTrophyDisplay(rank)}
                  {@const isCurrentPlayer = player.who === playerAddress}
                  
                  <div class="player-row {isCurrentPlayer ? 'current-player' : ''}">
                    <div class="flex items-center gap-4">
                      <!-- Rank & Trophy -->
                      <div class="flex items-center gap-2">
                        <svelte:component this={trophy.icon} class="w-5 h-5 {trophy.color}" />
                        <span class="text-sm font-bold text-gray-400">#{rank}</span>
                      </div>
                      
                      <!-- Player Info -->
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="font-mono text-sm text-theme truncate">
                            {formatAddress(player.who)}
                          </span>
                          {#if isCurrentPlayer}
                            <span class="you-badge">YOU</span>
                          {/if}
                        </div>
                        <div class="text-xs text-gray-400">
                          {Number(player.total_spins)} spins
                        </div>
                      </div>
                      
                      <!-- Metric Value -->
                      <div class="text-right">
                        <div class="text-sm font-bold {category.iconColor}">
                          {formatCategoryValue(player, categoryKey)}
                        </div>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
            
            <!-- Current Player Position (if not in top 3) -->
            {#if playerPosition && !isPlayerInTop3}
              <div class="mt-4 pt-4 border-t border-slate-700">
                <div class="player-row current-player">
                  <div class="flex items-center gap-4">
                    <div class="flex items-center gap-2">
                      <Target class="w-4 h-4 text-voi-400" />
                      <span class="text-sm font-bold text-voi-400">#{playerPosition.rank}</span>
                    </div>
                    
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <span class="font-mono text-sm text-theme">
                          {formatAddress(playerPosition.player.who)}
                        </span>
                        <span class="you-badge">YOU</span>
                      </div>
                    </div>
                    
                    <div class="text-right">
                      <div class="text-sm font-bold {category.iconColor}">
                        {formatCategoryValue(playerPosition.player, categoryKey)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    
    <!-- Tournament Status Notice -->
    {#if isActive || isEnded}
      <div class="mt-8 p-4 bg-amber-900/30 border border-amber-600/30 rounded-lg">
        <div class="flex items-start gap-3">
          <Star class="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <h5 class="text-amber-300 font-medium">Tournament Data</h5>
            <p class="text-amber-200 text-sm mt-1">
              Currently showing live leaderboard data. Tournament-specific time filtering will be added soon to show results only from the tournament period ({tournament.startDate.toLocaleDateString()} - {tournament.endDate.toLocaleDateString()}).
            </p>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .tournament-leaderboard {
    @apply space-y-6;
  }
  
  .category-card {
    @apply bg-slate-800 border border-slate-700 rounded-xl overflow-hidden;
  }
  
  .category-header {
    @apply p-4;
  }
  
  .category-body {
    @apply p-4;
  }
  
  .player-row {
    @apply p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors;
  }
  
  .player-row.current-player {
    @apply bg-voi-900/30 border border-voi-600/40 ring-1 ring-voi-500/30;
  }
  
  .you-badge {
    @apply px-2 py-0.5 text-xs bg-voi-600 text-white rounded-full whitespace-nowrap;
  }
</style>