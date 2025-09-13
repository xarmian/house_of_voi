<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { 
    Trophy, 
    Crown, 
    Medal, 
    Coins, 
    Percent, 
    Zap, 
    Calendar,
    Clock,
    Users,
    Shield,
    Star,
    Target,
    TrendingUp,
    ChevronRight
  } from 'lucide-svelte';
  import TournamentLeaderboard from '$lib/components/tournament/TournamentLeaderboard.svelte';
  import { walletStore } from '$lib/stores/wallet';
  import { selectedContract } from '$lib/stores/multiContract';
  
  export let data;
  
  $: tournament = data.tournament;
  $: tournamentId = $page.params.id;
  
  // Tournament status
  $: now = new Date();
  $: isActive = now >= tournament.startDate && now <= tournament.endDate;
  $: isPending = now < tournament.startDate;
  $: isEnded = now > tournament.endDate;
  
  // Format dates
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(date);
  };
  
  // Format time remaining
  const getTimeRemaining = (targetDate: Date) => {
    const diff = targetDate.getTime() - now.getTime();
    if (diff <= 0) return null;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  
  // Get category icon
  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case 'coins': return Coins;
      case 'percent': return Percent;
      case 'zap': return Zap;
      case 'crown': return Crown;
      default: return Target;
    }
  };
  
  // Get trophy icon
  const getTrophyIcon = (trophy: string) => {
    switch (trophy) {
      case 'Gold': return Crown;
      case 'Silver': return Trophy;
      case 'Bronze': return Medal;
      default: return Trophy;
    }
  };
  
  // Get trophy color
  const getTrophyColor = (trophy: string) => {
    switch (trophy) {
      case 'Gold': return 'text-yellow-400';
      case 'Silver': return 'text-gray-300';
      case 'Bronze': return 'text-amber-600';
      default: return 'text-gray-400';
    }
  };
  
  // Selected category for UI highlighting (not needed for new component but kept for category cards)
  let selectedCategory = 'volume';
  
  // Get contract ID from selected contract store
  $: contractId = BigInt("40879920");
  
  // Timer for countdown
  let timeRemaining: string | null = null;
  let countdownInterval: NodeJS.Timeout;
  
  onMount(() => {
    // Update countdown every minute
    const updateCountdown = () => {
      if (isPending) {
        timeRemaining = getTimeRemaining(tournament.startDate);
      } else if (isActive) {
        timeRemaining = getTimeRemaining(tournament.endDate);
      } else {
        timeRemaining = null;
      }
    };
    
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 60000);
    
    return () => {
      if (countdownInterval) clearInterval(countdownInterval);
    };
  });
</script>

<!-- Tournament Header -->
<div class="min-h-screen bg-slate-900">
  <div class="container mx-auto px-4 py-8">
    
    <!-- Tournament Banner -->
    <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 p-8 mb-8">
      <div class="absolute inset-0 bg-black/20 pointer-events-none"></div>
      <div class="relative z-10 text-center text-white">
        <div class="flex items-center justify-center gap-3 mb-4">
          <Crown class="w-12 h-12" />
          <h1 class="text-4xl md:text-5xl font-bold">{tournament.name}</h1>
          <Crown class="w-12 h-12" />
        </div>
        <p class="text-xl md:text-2xl mb-6 max-w-3xl mx-auto">{tournament.description}</p>
        
        <!-- Tournament Status -->
        <div class="flex flex-col sm:flex-row items-center justify-center gap-6">
          <div class="flex items-center gap-2 text-lg font-semibold">
            {#if isPending}
              <Clock class="w-6 h-6 text-blue-300" />
              <span class="text-blue-300">Starts in {timeRemaining}</span>
            {:else if isActive}
              <Target class="w-6 h-6 text-green-300" />
              <span class="text-green-300">Active - Ends in {timeRemaining}</span>
            {:else}
              <Trophy class="w-6 h-6 text-gray-300" />
              <span class="text-gray-300">Tournament Ended</span>
            {/if}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Tournament Details -->
    <div class="grid lg:grid-cols-3 gap-8 mb-8">
      
      <!-- Schedule -->
      <div class="card">
        <div class="flex items-center gap-3 mb-4">
          <Calendar class="w-6 h-6 text-voi-400" />
          <h2 class="text-xl font-bold text-theme">Schedule</h2>
        </div>
        <div class="space-y-3">
          <div>
            <div class="text-sm text-gray-400">Starts</div>
            <div class="font-semibold text-theme">{formatDate(tournament.startDate)}</div>
          </div>
          <div>
            <div class="text-sm text-gray-400">Ends</div>
            <div class="font-semibold text-theme">{formatDate(tournament.endDate)}</div>
          </div>
        </div>
      </div>
      
      <!-- Overall Champion Prizes -->
      <div class="card">
        <div class="flex items-center gap-3 mb-4">
          <Crown class="w-6 h-6 text-yellow-400" />
          <h2 class="text-xl font-bold text-theme">Overall Champion</h2>
        </div>
        <div class="space-y-3">
          {#each tournament.prizes.overall as prize}
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <svelte:component 
                  this={getTrophyIcon(prize.trophy)} 
                  class="w-5 h-5 {getTrophyColor(prize.trophy)}" 
                />
                <span class="font-medium">{prize.place === 1 ? '1st' : prize.place === 2 ? '2nd' : '3rd'}</span>
              </div>
              <div class="text-sm text-right">
                <div class="font-bold text-voi-400">
                  {prize.voi > 0 ? `${prize.voi.toLocaleString()} VOI` : ''}
                </div>
                <div class="text-xs text-gray-400">{prize.trophy} Trophy</div>
              </div>
            </div>
          {/each}
        </div>
      </div>
      
      <!-- Rules -->
      <div class="card">
        <div class="flex items-center gap-3 mb-4">
          <Shield class="w-6 h-6 text-voi-400" />
          <h2 class="text-xl font-bold text-theme">Rules</h2>
        </div>
        <div class="space-y-2">
          {#each tournament.rules as rule}
            <div class="flex items-start gap-2">
              <ChevronRight class="w-4 h-4 text-voi-400 mt-0.5 flex-shrink-0" />
              <span class="text-sm text-gray-300">{rule}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
    
    <!-- Categories -->
    <div class="card mb-8">
      <div class="flex items-center gap-3 mb-6">
        <Star class="w-6 h-6 text-voi-400" />
        <h2 class="text-2xl font-bold text-theme">Tournament Categories</h2>
      </div>
      
      <div class="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
        {#each tournament.categories as category}
          <div class="category-card {selectedCategory === category.id ? 'active' : ''}" 
               on:click={() => selectedCategory = category.id}
               role="button" 
               tabindex="0">
            <div class="flex items-center gap-3 mb-3">
              <svelte:component 
                this={getCategoryIcon(category.icon)} 
                class="w-8 h-8 text-voi-400" 
              />
              <h3 class="text-lg font-bold text-theme">{category.name}</h3>
            </div>
            <p class="text-sm text-gray-300 mb-4">{category.description}</p>
            
            {#if category.requirements}
              <div class="text-xs text-amber-300 bg-amber-900/30 px-2 py-1 rounded">
                Min: {category.requirements.minSpins} spins, {category.requirements.minVolume.toLocaleString()} VOI
              </div>
            {/if}
            
            <!-- Category Prizes -->
            <div class="mt-4 pt-4 border-t border-slate-700">
              <div class="text-xs text-gray-400 mb-2">Prizes:</div>
              <div class="space-y-1">
                {#each tournament.prizes.category as prize}
                  <div class="flex items-center justify-between text-xs">
                    <div class="flex items-center gap-1">
                      <svelte:component 
                        this={getTrophyIcon(prize.trophy)} 
                        class="w-3 h-3 {getTrophyColor(prize.trophy)}" 
                      />
                      <span>{prize.place === 1 ? '1st' : prize.place === 2 ? '2nd' : '3rd'}</span>
                    </div>
                    <span class="text-gray-300">
                      {prize.voi > 0 ? `${prize.voi.toLocaleString()} VOI + ` : ''}{prize.trophy}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
    
    <!-- Tournament Leaderboard -->
    <div class="card">
      {#if isActive || isEnded}
        <TournamentLeaderboard 
          {tournament}
          {contractId}
          {isActive}
          {isEnded}
        />
      {:else}
        <div class="text-center py-12">
          <Clock class="w-16 h-16 mx-auto mb-4 opacity-50 text-gray-400" />
          <h3 class="text-xl font-bold text-theme mb-2">Tournament Hasn't Started</h3>
          <p class="text-gray-400 mb-4">The leaderboard will be available once the tournament begins!</p>
          <div class="flex items-center justify-center gap-2 text-sm text-voi-400">
            <Clock class="w-4 h-4" />
            <span>Starts {formatDate(tournament.startDate)}</span>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .card {
    @apply bg-slate-800 rounded-xl border border-slate-700 p-6;
  }
  
  .category-card {
    @apply bg-slate-700 border border-slate-600 rounded-lg p-4 cursor-pointer transition-all duration-200 hover:bg-slate-600 hover:border-voi-500/50;
  }
  
  .category-card.active {
    @apply bg-voi-900/30 border-voi-500 ring-2 ring-voi-500/30;
  }
  
  .category-card:hover {
    @apply transform translate-y-[-2px] shadow-lg;
  }
</style>
