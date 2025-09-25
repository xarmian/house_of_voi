<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
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
    TrendingUp,
    TrendingDown,
    AlertCircle,
    CheckCircle
  } from 'lucide-svelte';
  import { walletStore } from '$lib/stores/wallet';
  import AddressDisplay from '$lib/components/ui/AddressDisplay.svelte';
  import { tournamentService, type TournamentData, type TournamentPlayer } from '$lib/services/tournamentService';

  // Props
  export let tournament: any;
  export let contractId: bigint;
  export let isActive = false;
  export let isEnded = false;

  // State
  let tournamentData: TournamentData | null = null;
  let loading = false;
  let error: string | null = null;
  let refreshing = false;
  
  $: playerAddress = $walletStore.account?.address;

  // Category configurations
  const categories = {
    volume: {
      name: 'Volume Champion',
      description: 'Highest total wagered',
      icon: Coins,
      color: 'from-orange-500 to-amber-500',
      iconColor: 'text-orange-400'
    },
    rtp: {
      name: 'RTP Champion', 
      description: 'Best Return to Player (min 500 spins, 25,000 VOI)',
      icon: Percent,
      color: 'from-green-500 to-emerald-500',
      iconColor: 'text-green-400'
    },
    win_streak: {
      name: 'Win Streak Champion',
      description: 'Longest consecutive wins',
      icon: Zap,
      color: 'from-purple-500 to-violet-500', 
      iconColor: 'text-purple-400'
    },
    losing_streak: {
      name: 'Losing Streak Champion',
      description: 'Longest consecutive losses (20 lines, 5 VOI/line minimum)',
      icon: TrendingDown,
      color: 'from-red-500 to-rose-500',
      iconColor: 'text-red-400'
    },
    overall: {
      name: 'Overall Champion',
      description: 'Lowest combined ranking across all categories',
      icon: Crown,
      color: 'from-yellow-400 via-amber-500 to-yellow-600',
      iconColor: 'text-yellow-400'
    }
  };

  // Fetch tournament data
  async function fetchTournamentData() {
    if (!contractId || contractId === 0n) {
      console.warn('No contract ID provided for tournament data');
      return;
    }

    loading = true;
    error = null;
    
    try {
      console.log('🏆 Fetching tournament data...', {
        contractId: contractId.toString(),
        startDate: tournament.startDate,
        endDate: tournament.endDate
      });
      
      tournamentData = await tournamentService.getTournamentData({
        appId: Number(contractId),
        startDate: tournament.startDate,
        endDate: tournament.endDate,
        limit: 100,
        minSpins: 500,
        minVolumeMicroVOI: 25000000000 // 25,000 VOI
      });
      
      console.log('✅ Tournament data loaded:', tournamentData);
    } catch (err) {
      console.error('❌ Failed to fetch tournament data:', err);
      error = err instanceof Error ? err.message : 'Failed to load tournament data';
    } finally {
      loading = false;
      refreshing = false;
    }
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

  // Format metric value for category
  function formatCategoryValue(player: TournamentPlayer, categoryKey: string): string {
    switch (categoryKey) {
      case 'volume':
        return `${tournamentService.formatVOI(player.total_volume)} VOI`;
      case 'rtp':
        return `${player.rtp_percent?.toFixed(1) || '0.0'}%`;
      case 'win_streak':
        return `${player.longest_win_streak || 0} wins`;
      case 'losing_streak':
        return `${player.longest_losing_streak || 0} losses`;
      case 'overall':
        return `Combined: ${player.combined_rank}`;
      default:
        return 'N/A';
    }
  }

  // Get players for category
  function getPlayersForCategory(categoryKey: string): TournamentPlayer[] {
    if (!tournamentData) return [];
    
    switch (categoryKey) {
      case 'volume': return tournamentData.categories.volume || [];
      case 'rtp': return tournamentData.categories.rtp || [];
      case 'win_streak': return tournamentData.categories.win_streak || [];
      case 'losing_streak': return tournamentData.categories.losing_streak || [];
      case 'overall': return tournamentData.categories.overall || [];
      default: return [];
    }
  }

  // Calculate display ranks with tie handling
  function calculateDisplayRanks(players: TournamentPlayer[], categoryKey: string): TournamentPlayer[] {
    if (!players || players.length === 0) return players;
    
    // Create a copy to avoid mutating the original
    const playersWithDisplayRank = players.map(p => ({ ...p }));
    
    let currentRank = 1;
    for (let i = 0; i < playersWithDisplayRank.length; i++) {
      if (i === 0) {
        // First player always gets rank 1
        playersWithDisplayRank[i].displayRank = currentRank;
      } else {
        const currentPlayer = playersWithDisplayRank[i];
        const previousPlayer = playersWithDisplayRank[i - 1];
        
        // Check if current player has same value as previous player
        const hasSameValue = compareMetricValues(currentPlayer, previousPlayer, categoryKey);
        
        if (hasSameValue) {
          // Same value = same rank
          playersWithDisplayRank[i].displayRank = playersWithDisplayRank[i - 1].displayRank;
        } else {
          // Different value = new rank (skip numbers for tied players)
          currentRank = i + 1;
          playersWithDisplayRank[i].displayRank = currentRank;
        }
      }
    }
    
    return playersWithDisplayRank;
  }
  
  // Compare metric values for tie detection
  function compareMetricValues(player1: TournamentPlayer, player2: TournamentPlayer, categoryKey: string): boolean {
    switch (categoryKey) {
      case 'volume':
        return player1.total_volume === player2.total_volume;
      case 'rtp':
        // Round to 1 decimal for comparison to handle floating point precision
        const rtp1 = Math.round((player1.rtp_percent || 0) * 10) / 10;
        const rtp2 = Math.round((player2.rtp_percent || 0) * 10) / 10;
        return rtp1 === rtp2;
      case 'win_streak':
        return (player1.longest_win_streak || 0) === (player2.longest_win_streak || 0);
      case 'losing_streak':
        return (player1.longest_losing_streak || 0) === (player2.longest_losing_streak || 0);
      case 'overall':
        return (player1.combined_rank || 0) === (player2.combined_rank || 0);
      default:
        return false;
    }
  }

  // Check if player is in top 3 (using display rank)
  function isTop3(displayRank: number): boolean {
    return displayRank <= 3;
  }

  // Navigate to player profile
  function goToProfile(address: string): void {
    goto(`/profile/${address}`);
  }

  // Refresh tournament data
  async function refreshData() {
    if (refreshing) return;
    refreshing = true;
    
    // Clear cache to force fresh data
    tournamentService.clearCache();
    await fetchTournamentData();
  }

  onMount(() => {
    if (contractId > 0n && (isActive || isEnded)) {
      fetchTournamentData();
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

  {#if !contractId || contractId === 0n}
    <div class="text-center py-12 text-gray-400">
      <Trophy class="w-16 h-16 mx-auto mb-4 opacity-50" />
      <p class="text-lg font-medium">No Contract Selected</p>
      <p>Please select a slot machine contract to view tournament rankings.</p>
    </div>
  {:else if loading}
    <div class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-4 border-voi-500 border-t-transparent mx-auto mb-4"></div>
      <p class="text-gray-400">Loading tournament data...</p>
    </div>
  {:else if error}
    <div class="text-center py-12 text-red-400">
      <AlertCircle class="w-16 h-16 mx-auto mb-4 opacity-50" />
      <p class="text-lg font-medium">Unable to load tournament data</p>
      <p class="text-sm text-gray-400 mb-4">{error}</p>
      <button on:click={refreshData} class="btn-primary" disabled={refreshing}>
        {refreshing ? 'Refreshing...' : 'Try Again'}
      </button>
    </div>
  {:else if !tournamentData}
    <div class="text-center py-12 text-gray-400">
      <Trophy class="w-16 h-16 mx-auto mb-4 opacity-50" />
      <p class="text-lg font-medium">No tournament data available</p>
      <p class="text-sm">Try refreshing to load the latest tournament standings.</p>
    </div>
  {:else}
    <!-- Category Leaderboards Grid -->
    <div class="grid lg:grid-cols-2 gap-6">
      {#each Object.entries(categories) as [categoryKey, category]}
        {@const players = calculateDisplayRanks(getPlayersForCategory(categoryKey), categoryKey)}
        {@const currentPlayer = players.find(p => p.who === playerAddress)}
        
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
                {#if categoryKey === 'rtp'}
                  <div class="text-white/60 text-xs mt-1">
                    Qualified players: {players.length}
                  </div>
                {/if}
              </div>
            </div>
          </div>
          
          <!-- Players List -->
          <div class="category-body">
            {#if players.length === 0}
              <div class="text-center py-6 text-gray-500">
                <Users class="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p class="text-sm">
                  {categoryKey === 'rtp' 
                    ? 'No players meet qualification requirements' 
                    : 'No qualifying players yet'
                  }
                </p>
              </div>
            {:else}
              <!-- All Players (with max height and scroll) -->
              <div class="space-y-2 max-h-80 overflow-y-auto">
                {#each players as player (player.who)}
                  {@const displayRank = player.displayRank || player.rank}
                  {@const trophy = getTrophyDisplay(displayRank)}
                  {@const isCurrentPlayer = player.who === playerAddress}
                  {@const isTopThree = isTop3(displayRank)}
                  
                  <div class="player-row {isCurrentPlayer ? 'current-player' : ''} {isTopThree ? 'top-three' : ''}">
                    <div class="flex items-center gap-4">
                      <!-- Rank & Trophy -->
                      <div class="flex items-center gap-2">
                        {#if isTopThree}
                          <svelte:component this={trophy.icon} class="w-5 h-5 {trophy.color}" />
                        {:else}
                          <div class="w-5 h-5 flex items-center justify-center">
                            <span class="text-xs font-bold text-gray-500">#{displayRank}</span>
                          </div>
                        {/if}
                      </div>
                      
                      <!-- Player Info -->
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <AddressDisplay
                            address={player.who}
                            showProfileLink={true}
                            maxLength="short"
                            className="address-display-compact"
                            linkClassName="font-mono text-sm text-theme truncate hover:text-voi-400 transition-colors"
                          />
                          {#if isCurrentPlayer}
                            <span class="you-badge">YOU</span>
                          {/if}
                          {#if categoryKey === 'overall' && isTopThree}
                            <span class="champion-badge">CHAMPION</span>
                          {/if}
                        </div>
                        <div class="text-xs text-gray-400 flex items-center gap-3">
                          <span>{player.total_spins.toLocaleString()} spins</span>
                          {#if categoryKey === 'overall'}
                            <span>
                              Vol: #{player.volume_rank} | 
                              RTP: #{player.rtp_rank} | 
                              Win Streak: #{player.streak_rank}
                            </span>
                          {/if}
                        </div>
                      </div>
                      
                      <!-- Metric Value -->
                      <div class="text-right">
                        <div class="text-sm font-bold {isTopThree ? category.iconColor : 'text-gray-300'}">
                          {formatCategoryValue(player, categoryKey)}
                        </div>
                        {#if categoryKey === 'rtp'}
                          <div class="text-xs text-gray-400">
                            {tournamentService.formatVOI(player.total_volume)} VOI
                          </div>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
              
              <!-- Current Player Summary (if not visible in top players) -->
              {#if currentPlayer && !players.slice(0, 5).includes(currentPlayer)}
                <div class="mt-4 pt-4 border-t border-slate-700">
                  <div class="text-xs text-gray-400 mb-2">Your Position:</div>
                  <div class="player-row current-player">
                    <div class="flex items-center gap-4">
                      <div class="flex items-center gap-2">
                        <Target class="w-4 h-4 text-voi-400" />
                        <span class="text-sm font-bold text-voi-400">#{currentPlayer.displayRank || currentPlayer.rank}</span>
                      </div>
                      
                      <div class="flex-1">
                        <div class="flex items-center gap-2">
                          <AddressDisplay
                            address={currentPlayer.who}
                            showProfileLink={true}
                            maxLength="short"
                            className="address-display-compact"
                            linkClassName="font-mono text-sm text-theme hover:text-voi-400 transition-colors"
                          />
                          <span class="you-badge">YOU</span>
                        </div>
                      </div>
                      
                      <div class="text-right">
                        <div class="text-sm font-bold {category.iconColor}">
                          {formatCategoryValue(currentPlayer, categoryKey)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    </div>
    
    <!-- Tournament Status Notice -->
    <div class="mt-8 p-4 bg-emerald-900/30 border border-emerald-600/30 rounded-lg">
      <div class="flex items-start gap-3">
        <CheckCircle class="w-5 h-5 text-emerald-400 mt-0.5" />
        <div>
          <h5 class="text-emerald-300 font-medium">Live Tournament Data</h5>
          <p class="text-emerald-200 text-sm mt-1">
            Showing live tournament rankings for the period: <strong>{tournament.startDate.toLocaleDateString()} - {tournament.endDate.toLocaleDateString()}</strong>
          </p>
          <div class="text-emerald-200/80 text-xs mt-2">
            Data refreshes automatically. Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
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
  
  .player-row.top-three {
    @apply bg-gradient-to-r from-slate-700/30 to-slate-600/30 border-l-4;
  }
  
  .player-row.top-three:nth-child(1) {
    @apply border-l-yellow-400;
  }
  
  .player-row.top-three:nth-child(2) {
    @apply border-l-gray-300;
  }
  
  .player-row.top-three:nth-child(3) {
    @apply border-l-amber-600;
  }
  
  .you-badge {
    @apply px-2 py-0.5 text-xs bg-voi-600 text-white rounded-full whitespace-nowrap;
  }
  
  .champion-badge {
    @apply px-2 py-0.5 text-xs bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-full whitespace-nowrap font-bold;
  }
  
  .player-address-link {
    @apply bg-transparent border-none cursor-pointer p-0 text-left underline-offset-2 hover:underline;
  }
  
  .player-address-link:focus {
    @apply outline-none ring-2 ring-voi-500/50 rounded;
  }
</style>