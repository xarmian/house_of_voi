<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { currentTheme } from '$lib/stores/theme';
  import { isMasterSoundEnabled } from '$lib/stores/sound';
  import { initializeMultiContractStores } from '$lib/stores/multiContract';
  import { machineStatsService, MachineStatsService } from '$lib/services/machineStatsService';
  import WalletManager from '$lib/components/wallet/WalletManager.svelte';
  import MachineCard from '$lib/components/game/MachineCard.svelte';
  import VoiRadioPlayer from '$lib/components/app/VoiRadioPlayer.svelte';
  import { Search, Filter, Home, Gamepad2, TrendingUp, Users } from 'lucide-svelte';
  import type { ContractPair } from '$lib/types/multiContract';
  import type { PageData } from './$types';
  
  export let data: PageData;
  
  let searchTerm = '';
  let statusFilter: 'all' | 'active' | 'maintenance' | 'testing' = 'all';
  let sortBy: 'name' | 'tvl' | 'players' | 'winRate' = 'name';
  let showFilters = false;
  let aggregateStats: {
    totalPlayers: number;
    totalBets: string;
    totalVolume: string;
    isLoading: boolean;
  } | null = null;

  // Generate dynamic background style based on current theme
  $: backgroundStyle = $currentTheme?.background?.via 
    ? `background-image: linear-gradient(${$currentTheme.background.direction}, ${$currentTheme.background.from}, ${$currentTheme.background.via}, ${$currentTheme.background.to});`
    : $currentTheme?.background 
    ? `background-image: linear-gradient(${$currentTheme.background.direction}, ${$currentTheme.background.from}, ${$currentTheme.background.to});`
    : 'background-image: linear-gradient(to bottom right, #0f172a, #1e293b, #0f172a);';
    
  $: textStyle = $currentTheme?.textColor ? `color: ${$currentTheme.textColor};` : '';
  $: combinedStyle = backgroundStyle + (textStyle ? ' ' + textStyle : '');

  // Filter and sort contracts
  $: filteredContracts = data.contracts
    .filter(contract => {
      // Search filter
      if (searchTerm && !contract.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
          !contract.description.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      // Status filter
      if (statusFilter !== 'all' && contract.status !== statusFilter) {
        return false;
      }
      
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'winRate':
          // For now, sort by display order since we don't have real-time sorting by stats
          // TODO: Implement stats-based sorting once stats are loaded
          return a.displayOrder - b.displayOrder;
        case 'tvl':
        case 'players':
        default:
          return a.displayOrder - b.displayOrder;
      }
    });

  // Navigate to machine
  function playMachine(event: CustomEvent<{ contract: ContractPair }>) {
    const { contract } = event.detail;
    goto(`/app/${contract.slotMachineAppId}`);
  }

  // Navigate home
  function goHome() {
    goto('/');
  }

  // Load aggregate statistics
  async function loadAggregateStats() {
    aggregateStats = {
      totalPlayers: 0,
      totalBets: '0',
      totalVolume: '0 VOI',
      isLoading: true
    };

    try {
      const statsMap = await machineStatsService.getMultipleMachineStats(data.contracts);
      let totalPlayers = 0;
      let totalBetsCount = BigInt(0);
      let totalVolume = BigInt(0);

      for (const stats of statsMap.values()) {
        if (!stats.error) {
          totalPlayers += Number(stats.uniquePlayers);
          totalBetsCount += stats.totalBets;
          totalVolume += stats.totalAmountBet;
        }
      }

      aggregateStats = {
        totalPlayers,
        totalBets: MachineStatsService.formatNumber(totalBetsCount),
        totalVolume: MachineStatsService.formatVOI(totalVolume) + ' VOI',
        isLoading: false
      };
    } catch (error) {
      console.error('Failed to load aggregate stats:', error);
      aggregateStats = {
        totalPlayers: 0,
        totalBets: '0',
        totalVolume: '0 VOI',
        isLoading: false
      };
    }
  }

  onMount(async () => {
    // Initialize multi-contract stores
    await initializeMultiContractStores();
    // Load aggregate statistics
    loadAggregateStats();
  });

</script>


<main class="min-h-screen transition-all duration-700 ease-in-out" style={combinedStyle}>
  <div class="max-w-7xl mx-auto px-4 py-4 lg:py-6">
    <!-- Header -->
    <div class="mb-8">
      <!-- Navigation -->
      <div class="flex items-center gap-2 mb-6">
        <button
          on:click={goHome}
          class="nav-button"
          title="Home"
        >
          <Home class="w-4 h-4" />
          <span class="hidden sm:inline">Home</span>
        </button>
        <span class="text-slate-500">/</span>
        <div class="flex items-center gap-2 text-theme">
          <Gamepad2 class="w-4 h-4" />
          <span class="font-medium">Choose Your Machine</span>
        </div>
      </div>

      <!-- Page Title and Stats -->
      <div class="text-center mb-8">
        <h1 class="text-3xl lg:text-4xl font-bold text-theme mb-3">
          Slot Machine Selection
        </h1>
        <p class="text-slate-400 text-lg mb-4">
          Choose from our collection of provably fair blockchain slot machines
        </p>
        <div class="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-400 mb-4">
          <span>{data.playableCount} Machines Available</span>
          <span>•</span>
          <span>Provably Fair</span>
          <span>•</span>
          <span>Instant Payouts</span>
        </div>

        <!-- Aggregate Statistics -->
        {#if aggregateStats}
          <div class="flex flex-wrap items-center justify-center gap-6 text-sm">
            <div class="flex items-center gap-2">
              <Users class="w-4 h-4 text-blue-400" />
              <span class="text-slate-400">Total Players:</span>
              <span class="font-semibold text-theme">
                {#if aggregateStats.isLoading}
                  Loading...
                {:else}
                  {aggregateStats.totalPlayers}
                {/if}
              </span>
            </div>
            <span class="text-slate-600">•</span>
            <div class="flex items-center gap-2">
              <Gamepad2 class="w-4 h-4 text-purple-400" />
              <span class="text-slate-400">Total Bets:</span>
              <span class="font-semibold text-theme">
                {#if aggregateStats.isLoading}
                  Loading...
                {:else}
                  {aggregateStats.totalBets}
                {/if}
              </span>
            </div>
            <span class="text-slate-600">•</span>
            <div class="flex items-center gap-2">
              <TrendingUp class="w-4 h-4 text-green-400" />
              <span class="text-slate-400">Total Volume:</span>
              <span class="font-semibold text-theme">
                {#if aggregateStats.isLoading}
                  Loading...
                {:else}
                  {aggregateStats.totalVolume}
                {/if}
              </span>
            </div>
          </div>
        {/if}
      </div>

      <!-- Search and Filters -->
      <div class="hidden flex-col sm:flex-row items-center gap-4 mb-6">
        <!-- Search -->
        <div class="relative flex-1 w-full sm:max-w-md">
          <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            bind:value={searchTerm}
            placeholder="Search machines..."
            class="search-input pl-10 pr-4"
          />
        </div>

        <!-- Filter Toggle -->
        <button
          on:click={() => showFilters = !showFilters}
          class="filter-toggle"
          class:active={showFilters}
        >
          <Filter class="w-4 h-4" />
          <span>Filters</span>
        </button>
      </div>

      <!-- Filters Panel -->
      {#if showFilters}
        <div class="filters-panel">
          <div class="filter-group">
            <label class="filter-label">Status</label>
            <select bind:value={statusFilter} class="filter-select">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="testing">Testing</option>
            </select>
          </div>

          <div class="filter-group">
            <label class="filter-label">Sort By</label>
            <select bind:value={sortBy} class="filter-select">
              <option value="name">Name</option>
              <option value="tvl">Total Value Locked</option>
              <option value="players">Active Players</option>
              <option value="winRate">Win Rate</option>
            </select>
          </div>
        </div>
      {/if}
    </div>

    <!-- Machine Grid -->
    <div class="machines-grid">
      {#if filteredContracts.length === 0}
        <div class="no-results">
          <Gamepad2 class="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 class="text-xl font-semibold text-slate-300 mb-2">No machines found</h3>
          <p class="text-slate-400 mb-4">
            {#if searchTerm}
              No machines match your search "{searchTerm}".
            {:else if statusFilter !== 'all'}
              No machines are currently {statusFilter}.
            {:else}
              No machines are available at the moment.
            {/if}
          </p>
          {#if searchTerm || statusFilter !== 'all'}
            <button
              on:click={() => { searchTerm = ''; statusFilter = 'all'; }}
              class="clear-filters-btn"
            >
              Clear Filters
            </button>
          {/if}
        </div>
      {:else}
        {#each filteredContracts as contract (contract.id)}
          <MachineCard
            {contract}
            size="md"
            showStats={true}
            showPlayButton={true}
            on:play={playMachine}
            on:select={playMachine}
          />
        {/each}
      {/if}
    </div>
  </div>
  
  <!-- VOI Radio Player -->
  {#if $isMasterSoundEnabled}
    <VoiRadioPlayer />
  {/if}
</main>

<style>
  .nav-button {
    @apply flex items-center gap-2 px-3 py-2 text-sm text-slate-400;
    @apply hover:text-theme transition-colors duration-200;
    @apply focus:outline-none focus:ring-2 focus:ring-voi-400/50 rounded-lg;
  }

  .search-input {
    @apply w-full py-3 text-sm bg-slate-800 border border-slate-700;
    @apply rounded-lg text-slate-200 placeholder-slate-400;
    @apply focus:outline-none focus:ring-2 focus:ring-voi-400/50 focus:border-voi-400;
    @apply transition-all duration-200;
  }

  .filter-toggle {
    @apply flex items-center gap-2 px-4 py-3 text-sm;
    @apply bg-slate-800 border border-slate-700 rounded-lg;
    @apply text-slate-200 hover:text-white hover:border-slate-600;
    @apply focus:outline-none focus:ring-2 focus:ring-voi-400/50;
    @apply transition-all duration-200;
  }

  .filter-toggle.active {
    @apply bg-voi-600 border-voi-500 text-white;
  }

  .filters-panel {
    @apply flex flex-wrap items-center gap-4 p-4 bg-slate-800/50;
    @apply border border-slate-700/50 rounded-lg backdrop-blur-sm mb-6;
  }

  .filter-group {
    @apply flex flex-col gap-1;
  }

  .filter-label {
    @apply text-xs font-medium text-slate-400;
  }

  .filter-select {
    @apply px-3 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg;
    @apply text-slate-200 focus:outline-none focus:ring-2 focus:ring-voi-400/50;
    @apply focus:border-voi-400 transition-all duration-200;
  }

  .machines-grid {
    @apply grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6;
  }

  .no-results {
    @apply col-span-full flex flex-col items-center justify-center py-16;
    @apply text-center;
  }

  .clear-filters-btn {
    @apply px-4 py-2 bg-voi-600 hover:bg-voi-700 text-white rounded-lg;
    @apply text-sm font-medium transition-all duration-200;
    @apply focus:outline-none focus:ring-2 focus:ring-voi-400/50;
  }

  /* Theme colors */
  .text-voi-400 {
    color: #10b981;
  }

  .bg-voi-600 {
    background-color: #059669;
  }

  .hover\:bg-voi-700:hover {
    background-color: #047857;
  }

  .border-voi-500 {
    border-color: #10b981;
  }

  .focus\:border-voi-400:focus {
    border-color: #10b981;
  }

  .focus\:ring-voi-400\/50:focus {
    --tw-ring-color: rgba(16, 185, 129, 0.5);
  }
</style>