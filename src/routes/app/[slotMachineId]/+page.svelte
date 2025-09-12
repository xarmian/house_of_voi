<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { walletStore } from '$lib/stores/wallet';
  import { contractDataCache } from '$lib/services/contractDataCache';
  import { balanceManager } from '$lib/services/balanceManager';
  import { currentTheme } from '$lib/stores/theme';
  
  import { contractSelectionStore, initializeMultiContractStores } from '$lib/stores/multiContract';
  import WalletManager from '$lib/components/wallet/WalletManager.svelte';
  import SlotMachine from '$lib/components/game/SlotMachine.svelte';
  import GameQueue from '$lib/components/game/GameQueue.svelte';
  
  // MEMORY OPTIMIZATION: Lazy load heavy components to reduce initial bundle size
  // import Leaderboard from '$lib/components/game/Leaderboard.svelte';
  // import PlayerStats from '$lib/components/game/PlayerStats.svelte';
  // import GameStaking from '$lib/components/game/GameStaking.svelte';
  import { ArrowLeft, Home } from 'lucide-svelte';
  import type { PageData } from './$types';
  
  export let data: PageData;
  
  let hasPreloadedCache = false;
  let walletUnsubscribe: (() => void) | null = null;
  let showLeaderboard = false;
  let showPlayerStats = false;
  let showStaking = false;
  
  // MEMORY OPTIMIZATION: Dynamic component loading state
  let LazyLeaderboard: any = null;
  let LazyPlayerStats: any = null;
  let LazyGameStaking: any = null;
  let componentLoadingStates = {
    leaderboard: false,
    playerStats: false,
    gameStaking: false
  };

  // Generate dynamic background style based on current theme
  $: backgroundStyle = $currentTheme?.background?.via 
    ? `background-image: linear-gradient(${$currentTheme.background.direction}, ${$currentTheme.background.from}, ${$currentTheme.background.via}, ${$currentTheme.background.to});`
    : $currentTheme?.background 
    ? `background-image: linear-gradient(${$currentTheme.background.direction}, ${$currentTheme.background.from}, ${$currentTheme.background.to});`
    : 'background-image: linear-gradient(to bottom right, #0f172a, #1e293b, #0f172a);';
    
  $: textStyle = $currentTheme?.textColor ? `color: ${$currentTheme.textColor};` : '';
  $: combinedStyle = backgroundStyle + (textStyle ? ' ' + textStyle : '');

  // Navigate back to machine selection
  function goBack() {
    goto('/app');
  }

  // Navigate to home
  function goHome() {
    goto('/');
  }

  // MEMORY OPTIMIZATION: Dynamic component loading functions
  async function loadLeaderboard() {
    if (LazyLeaderboard) return LazyLeaderboard;
    
    componentLoadingStates.leaderboard = true;
    try {
      console.log('🎯 Loading Leaderboard component and initializing HOV stats...');
      
      // Initialize HOV stats for leaderboard functionality
      const { hovStatsStore } = await import('$lib/stores/hovStats');
      await hovStatsStore.initializeForAppRoute();
      
      // Load the component
      const module = await import('$lib/components/game/Leaderboard.svelte');
      LazyLeaderboard = module.default;
      return LazyLeaderboard;
    } catch (error) {
      console.error('Failed to load Leaderboard component:', error);
      return null;
    } finally {
      componentLoadingStates.leaderboard = false;
    }
  }

  async function loadPlayerStats() {
    if (LazyPlayerStats) return LazyPlayerStats;
    
    componentLoadingStates.playerStats = true;
    try {
      // Ensure HOV stats are initialized for app route before loading component
      // so that PlayerStats can fetch data without requiring an unlocked wallet
      try {
        const { hovStatsStore } = await import('$lib/stores/hovStats');
        await hovStatsStore.initializeForAppRoute();
      } catch (e) {
        console.warn('Failed to initialize HOV stats for PlayerStats:', e);
      }

      const module = await import('$lib/components/game/PlayerStats.svelte');
      LazyPlayerStats = module.default;
      return LazyPlayerStats;
    } catch (error) {
      console.error('Failed to load PlayerStats component:', error);
      return null;
    } finally {
      componentLoadingStates.playerStats = false;
    }
  }

  async function loadGameStaking() {
    if (LazyGameStaking) return LazyGameStaking;
    
    componentLoadingStates.gameStaking = true;
    try {
      const module = await import('$lib/components/game/GameStaking.svelte');
      LazyGameStaking = module.default;
      return LazyGameStaking;
    } catch (error) {
      console.error('Failed to load GameStaking component:', error);
      return null;
    } finally {
      componentLoadingStates.gameStaking = false;
    }
  }

  onMount(async () => {
    // Initialize multi-contract stores first
    await initializeMultiContractStores();
    
    // Select the contract for this machine
    await contractSelectionStore.selectContract(data.contract.id);
    
    // MEMORY OPTIMIZATION: Defer contract data preloading to reduce initial load
    walletUnsubscribe = walletStore.subscribe(async (state) => {
      if (state.account && !state.isLocked && !hasPreloadedCache) {
        hasPreloadedCache = true;
        // Defer preloading to avoid blocking initial page load
        setTimeout(async () => {
          try {
            console.log('🚀 Initializing contract data cache (deferred)...');
            await contractDataCache.preloadContractData(state.account!.address);
            console.log('✅ Contract data cache initialized');
          } catch (error) {
            console.warn('⚠️ Failed to pre-load contract data:', error);
            hasPreloadedCache = false;
          }
        }, 2000); // Defer by 2 seconds
      }
    });
  });

  onDestroy(() => {
    if (walletUnsubscribe) {
      walletUnsubscribe();
      walletUnsubscribe = null;
    }
    
    balanceManager.reset();
  });
</script>

<main class="min-h-screen transition-all duration-700 ease-in-out overflow-x-hidden" style={combinedStyle}>
  <div class="max-w-7xl mx-auto px-4 py-2 lg:py-2 mobile-no-padding">
    <!-- Unified Layout - Single SlotMachine instance -->
    <div class="min-h-screen">
      <!-- Header with navigation and machine info -->
      <div class="mb-0">
        <!-- Navigation breadcrumb -->
        <div class="hidden items-center gap-2 mb-4">
          <button
            on:click={goHome}
            class="nav-button"
            title="Home"
          >
            <Home class="w-4 h-4" />
          </button>
          <span class="text-theme-text opacity-60">/</span>
          <button
            on:click={goBack}
            class="nav-button flex items-center gap-2"
            title="Back to Machine Selection"
          >
            <ArrowLeft class="w-4 h-4" />
            <span class="hidden sm:inline">Machines</span>
          </button>
          <span class="text-theme-text opacity-60">/</span>
          <span class="text-theme font-medium truncate">{data.contract.name}</span>
        </div>

        <!-- Machine header - responsive -->
        <div class="p-2 bg-surface-primary/60 backdrop-blur-sm">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-xl lg:text-2xl font-bold text-theme mb-2">{data.contract.name}</h1>
            </div>
            
            <div class="flex items-center gap-2">
              {#if data.contract.features.betaMode}
                <span class="beta-badge text-xs">Beta</span>
              {/if}
              <button
                on:click={goBack}
                class="back-button"
              >
                <ArrowLeft class="w-5 h-5" />
                <span class="inline">All Machines</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Responsive content layout -->
      <div class="responsive-layout">
        <div class="wallet-section lg:hidden mb-4">
          <WalletManager compact={true} />
        </div>
        
        <!-- Main content grid -->
        <div class="content-grid">
          <!-- Main game area -->
          <div class="game-section">
            <SlotMachine disabled={false} contractContext={data.contract} />
          </div>
          
          <!-- Right sidebar: Wallet and Tabbed panels -->
          <div class="sidebar-section">
            <div class="hidden lg:block mb-4">
              <WalletManager />
            </div>
            
            <!-- Tabbed panels -->
            <div class="tabbed-panels">
              <!-- Tab buttons -->
              <div class="tab-buttons">
                <button 
                  class="tab-button {!showLeaderboard && !showPlayerStats && !showStaking ? 'active' : ''}"
                  on:click={() => { showLeaderboard = false; showPlayerStats = false; showStaking = false; }}
                >
                  Queue
                </button>
                <button 
                  class="tab-button {showLeaderboard ? 'active' : ''}"
                  on:click={async () => { 
                    await loadLeaderboard(); 
                    showLeaderboard = true; 
                    showPlayerStats = false; 
                    showStaking = false; 
                  }}
                >
                  Leaderboard
                  {#if componentLoadingStates.leaderboard}
                    <span class="loading-spinner">⏳</span>
                  {/if}
                </button>
                <button 
                  class="tab-button {showPlayerStats ? 'active' : ''}"
                  on:click={async () => { 
                    await loadPlayerStats(); 
                    showPlayerStats = true; 
                    showLeaderboard = false; 
                    showStaking = false; 
                  }}
                >
                  Stats
                  {#if componentLoadingStates.playerStats}
                    <span class="loading-spinner">⏳</span>
                  {/if}
                </button>
                <button 
                  class="tab-button {showStaking ? 'active' : ''}"
                  on:click={async () => { 
                    await loadGameStaking(); 
                    showStaking = true; 
                    showLeaderboard = false; 
                    showPlayerStats = false; 
                  }}
                >
                  Staking
                  {#if componentLoadingStates.gameStaking}
                    <span class="loading-spinner">⏳</span>
                  {/if}
                </button>
              </div>
              
              <!-- Tab content -->
              <div class="tab-content">
                {#if showLeaderboard}
                  {#if LazyLeaderboard && !componentLoadingStates.leaderboard}
                    <svelte:component this={LazyLeaderboard} compact={true} contractId={BigInt(data.contract.slotMachineAppId)} />
                  {:else}
                    <!-- Leaderboard Skeleton -->
                    <div class="skeleton-container">
                      <div class="skeleton-header">
                        <div class="skeleton-title"></div>
                        <div class="skeleton-metric-buttons">
                          <div class="skeleton-button"></div>
                          <div class="skeleton-button"></div>
                          <div class="skeleton-button"></div>
                        </div>
                      </div>
                      <div class="skeleton-list">
                        {#each Array(8) as _, i}
                          <div class="skeleton-row">
                            <div class="skeleton-rank"></div>
                            <div class="skeleton-address"></div>
                            <div class="skeleton-stat"></div>
                            <div class="skeleton-badge"></div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}
                {:else if showPlayerStats}
                  {#if LazyPlayerStats && !componentLoadingStates.playerStats}
                    <svelte:component this={LazyPlayerStats} compact={true} />
                  {:else}
                    <!-- Player Stats Skeleton -->
                    <div class="skeleton-container">
                      <div class="skeleton-header">
                        <div class="skeleton-title"></div>
                      </div>
                      <div class="skeleton-stats-grid">
                        {#each Array(6) as _, i}
                          <div class="skeleton-stat-card">
                            <div class="skeleton-stat-value"></div>
                            <div class="skeleton-stat-label"></div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}
                {:else if showStaking}
                  {#if LazyGameStaking && !componentLoadingStates.gameStaking}
                    <svelte:component this={LazyGameStaking} compact={true} contractContext={data.contract} />
                  {:else}
                    <!-- Game Staking Skeleton -->
                    <div class="skeleton-container">
                      <div class="skeleton-header">
                        <div class="skeleton-title"></div>
                      </div>
                      <div class="skeleton-staking-form">
                        <div class="skeleton-input"></div>
                        <div class="skeleton-button-large"></div>
                        <div class="skeleton-info-box"></div>
                      </div>
                    </div>
                  {/if}
                {:else}
                  <GameQueue />
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  
</main>

<style lang="postcss">
  .nav-button {
    @apply flex items-center gap-1 px-2 py-1 text-sm text-theme-text;
    opacity: 0.7;
    @apply hover:text-theme-primary hover:opacity-100 transition-all duration-200;
    @apply focus:outline-none focus:ring-2 rounded;
    --tw-ring-color: rgba(var(--theme-primary-rgb), 0.5);
  }

  .back-button {
    @apply flex items-center gap-2 px-4 py-2 bg-surface-secondary hover:bg-surface-hover;
    @apply border border-surface-border hover:border-theme-primary rounded-lg;
    @apply text-theme-text hover:text-theme-primary transition-all duration-200;
    @apply focus:outline-none focus:ring-2;
    --tw-ring-color: rgba(var(--theme-primary-rgb), 0.5);
  }

  .mobile-nav-button {
    @apply flex items-center gap-2 px-3 py-2 bg-surface-secondary hover:bg-surface-hover;
    @apply border border-surface-border rounded-lg text-sm;
    @apply text-theme-text hover:text-theme-primary transition-all duration-200;
  }

  .status-badge {
    @apply px-2 py-1 text-xs font-medium rounded-full border;
  }

  .status-active {
    @apply bg-green-900/30 text-green-400 border-green-500/30;
  }

  .status-maintenance {
    @apply bg-yellow-900/30 text-yellow-400 border-yellow-500/30;
  }

  .status-testing {
    @apply bg-blue-900/30 text-blue-400 border-blue-500/30;
  }

  .beta-badge {
    @apply px-2 py-1 text-xs font-medium rounded-full bg-blue-900/30 text-blue-400 border border-blue-500/30;
  }

  /* Responsive Layout Grid */
  .responsive-layout {
    @apply w-full;
  }

  .content-grid {
    @apply grid gap-4 lg:gap-6 items-start;
    grid-template-columns: 1fr;
  }
  
  @media (max-width: 767px) {
    .content-grid {
      gap: 0.5rem;
    }
  }

  @media (min-width: 1024px) {
    .content-grid {
      grid-template-columns: 2fr 1fr;
    }
  }

  .game-section {
    @apply w-full;
  }

  .sidebar-section {
    @apply space-y-4 relative w-full;
  }

  .wallet-section {
    @apply w-full;
  }

  .tabbed-panels {
    @apply rounded-xl border overflow-hidden;
    background: var(--theme-surface-primary);
    border-color: var(--theme-surface-border);
    margin: 4px;
  }

  .tab-buttons {
    @apply flex border-b;
    border-color: var(--theme-surface-border);
  }

  .tab-button {
    @apply flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 border-b-2 border-transparent;
    color: var(--theme-text, #9ca3af);
  }

  .tab-button:hover {
    color: var(--theme-primary);
    background: var(--theme-surface-hover);
  }

  .tab-button.active {
    color: var(--theme-primary);
    border-color: var(--theme-primary);
    background: var(--theme-surface-secondary);
  }

  .tab-content {
    @apply overflow-hidden;
    min-height: calc(100vh - 22rem);
  }

  @media (max-width: 1023px) {
    .tab-content {
      max-height: calc(50vh - 60px);
      min-height: auto;
    }

    .tabbed-panels {
      max-height: 50vh;
    }
  }
  
  @media (max-width: 767px) {
    .tabbed-panels {
      max-width: calc(100vw - 1rem); /* Constrain tabs to fit within viewport minus container padding */
    }
  }

    .tab-buttons {
      @apply overflow-x-auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .tab-buttons::-webkit-scrollbar {
      display: none;
    }

    .tab-button {
      @apply flex-shrink-0 whitespace-nowrap;
      min-width: 100px;
    }

  .text-voi-400 {
    color: #10b981;
  }

  .loading-spinner {
    @apply inline-block ml-2 text-xs opacity-70;
    animation: pulse 1s infinite;
  }

  .loading-placeholder {
    @apply flex items-center justify-center p-8 text-slate-400;
    min-height: 200px;
  }

  /* Skeleton Loading Styles */
  .skeleton-container {
    @apply p-4 space-y-4;
  }

  .skeleton-header {
    @apply space-y-3;
  }

  .skeleton-title {
    @apply h-6 bg-slate-700 rounded-md animate-pulse;
    width: 120px;
  }

  .skeleton-metric-buttons {
    @apply flex gap-2;
  }

  .skeleton-button {
    @apply h-8 bg-slate-700 rounded-md animate-pulse;
    width: 80px;
  }

  .skeleton-button-large {
    @apply h-10 bg-slate-700 rounded-md animate-pulse w-full;
  }

  .skeleton-list {
    @apply space-y-2;
  }

  .skeleton-row {
    @apply flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg animate-pulse;
  }

  .skeleton-rank {
    @apply h-5 bg-slate-700 rounded;
    width: 24px;
  }

  .skeleton-address {
    @apply h-5 bg-slate-700 rounded flex-1;
    max-width: 120px;
  }

  .skeleton-stat {
    @apply h-5 bg-slate-700 rounded;
    width: 80px;
  }

  .skeleton-badge {
    @apply h-5 bg-slate-700 rounded;
    width: 60px;
  }

  .skeleton-stats-grid {
    @apply grid grid-cols-2 gap-4;
  }

  .skeleton-stat-card {
    @apply p-4 bg-slate-800/30 rounded-lg space-y-2;
  }

  .skeleton-stat-value {
    @apply h-8 bg-slate-700 rounded animate-pulse;
  }

  .skeleton-stat-label {
    @apply h-4 bg-slate-700 rounded animate-pulse;
    width: 70%;
  }

  .skeleton-staking-form {
    @apply space-y-4;
  }

  .skeleton-input {
    @apply h-12 bg-slate-700 rounded-md animate-pulse w-full;
  }

  .skeleton-info-box {
    @apply h-20 bg-slate-700 rounded-md animate-pulse w-full;
  }

  /* Staggered animation for skeleton rows */
  .skeleton-row:nth-child(1) { animation-delay: 0ms; }
  .skeleton-row:nth-child(2) { animation-delay: 100ms; }
  .skeleton-row:nth-child(3) { animation-delay: 200ms; }
  .skeleton-row:nth-child(4) { animation-delay: 300ms; }
  .skeleton-row:nth-child(5) { animation-delay: 400ms; }
  .skeleton-row:nth-child(6) { animation-delay: 500ms; }
  .skeleton-row:nth-child(7) { animation-delay: 600ms; }
  .skeleton-row:nth-child(8) { animation-delay: 700ms; }

  /* Remove padding on mobile to eliminate left margin while maintaining box-sizing */
  @media (max-width: 767px) {
    .mobile-no-padding {
      padding-left: 0.25rem !important; /* Keep minimal padding to prevent overflow */
      padding-right: 0.25rem !important;
    }
    
    .mobile-no-padding > * {
      box-sizing: border-box; /* Ensure all child elements respect container bounds */
    }
  }

</style>
