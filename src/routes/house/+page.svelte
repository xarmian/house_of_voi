<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Web3Wallet, selectedWallet, connectedWallets } from 'avm-wallet-svelte';
  import { ybtStore } from '$lib/stores/ybt';
  import { NETWORK_CONFIG } from '$lib/constants/network';
  import { houseBalanceService } from '$lib/services/houseBalance';
  import { houseBalanceManager } from '$lib/stores/houseBalance';
  import YBTDashboard from '$lib/components/house/YBTDashboard.svelte';
  import YBTStats from '$lib/components/house/YBTStats.svelte';
  import OddsAnalysis from '$lib/components/analytics/OddsAnalysis.svelte';
  import LoadingOverlay from '$lib/components/ui/LoadingOverlay.svelte';
  import Leaderboard from '$lib/components/game/Leaderboard.svelte';
  import algosdk from 'algosdk';
  import { hovStatsStore, platformStats, connectionStatus, timeStats } from '$lib/stores/hovStats';
  import { formatVOI } from '$lib/constants/betting';
  import { BarChart3, TrendingUp, Users, Coins, Target, Zap, Clock, Crown, Wallet, Trophy, PieChart } from 'lucide-svelte';
  import { PUBLIC_WALLETCONNECT_PROJECT_ID } from '$env/static/public';

  let isLoaded = false;
  let algodClient: algosdk.Algodv2;
  let houseBalance: any = null;
  let balanceLoading = true;
  let activeTab = 'portfolio';
  
  // Initialize Algorand client for avm-wallet-svelte
  algodClient = new algosdk.Algodv2(
    NETWORK_CONFIG.token,
    NETWORK_CONFIG.nodeUrl,
    NETWORK_CONFIG.port
  );

  // Available wallets to enable (all supported by avm-wallet-svelte)
  const availableWallets = ['Kibisis', 'LuteWallet', 'WalletConnect'];

  onMount(async () => {
    // Initialize YBT store - wallet connection will be handled by avm-wallet-svelte
    await ybtStore.initialize();
    
    // Initialize HOV stats store
    await hovStatsStore.initialize();
    
    // Load house balance information
    loadHouseBalance();
    
    isLoaded = true;
  });

  onDestroy(() => {
    // Clear YBT store intervals and reset state
    ybtStore.reset();
    
    // Clear house balance intervals
    houseBalanceManager.stopPeriodicRefresh();
  });

  async function loadHouseBalance() {
    try {
      balanceLoading = true;
      houseBalance = await houseBalanceService.getHouseBalance();
    } catch (error) {
      console.error('Failed to load house balance:', error);
      houseBalance = null;
    } finally {
      balanceLoading = false;
    }
  }

  async function refreshHouseBalance() {
    try {
      balanceLoading = true;
      houseBalance = await houseBalanceService.refreshHouseBalance();
      
      // Also refresh YBT data since portfolio value depends on contract balances
      await ybtStore.refresh();
    } catch (error) {
      console.error('Failed to refresh house balance:', error);
    } finally {
      balanceLoading = false;
    }
  }
  
  // Reactive statements to track wallet connection
  $: isWalletConnected = $selectedWallet !== null;
</script>

<svelte:head>
  <title>House - House of Voi</title>
  <meta name="description" content="Manage your YBT shares and yield-bearing investments on Voi Network" />
</svelte:head>

{#if !isLoaded}
  <LoadingOverlay 
    isVisible={!isLoaded}
    loadingState={{ type: 'connection', progress: 0, isLoading: true }}
  />
{:else}
  <main class="min-h-screen bg-slate-900 px-3 sm:px-4 py-4 sm:py-6">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="text-center mb-4 sm:mb-6">
        <h1 class="text-2xl sm:text-3xl md:text-4xl font-bold text-theme mb-2 sm:mb-3">
          The <span class="text-voi-400">House</span>
        </h1>
        <p class="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto px-2">
          Deposit funds into our yield-bearing token (YBT) and earn your share of the house profits.
        </p>
      </div>

      <!-- Compact Wallet Header Bar -->
      <div class="wallet-header-bar">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
          <!-- Wallet Status & Connection -->
          <div class="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-center sm:justify-start">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 sm:w-5 sm:h-5 text-voi-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V8a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
              {#if $selectedWallet}
                <div class="flex flex-col sm:flex-row items-center gap-1 sm:gap-3">
                  <div class="text-center sm:text-left">
                    <span class="text-xs text-gray-400 block sm:inline">Connected:</span>
                    <span class="font-mono text-xs sm:text-sm text-theme sm:ml-1">
                      {$selectedWallet.address.slice(0, 6)}...{$selectedWallet.address.slice(-4)}
                    </span>
                  </div>
                  <div class="flex items-center gap-1">
                    <div class="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full"></div>
                    <span class="text-xs text-voi-400 font-medium">{$selectedWallet.app}</span>
                  </div>
                </div>
              {:else}
                <span class="text-xs sm:text-sm text-gray-400">Connect Wallet</span>
              {/if}
            </div>
          </div>
          
          <!-- Wallet Component (Compact) -->
          <div class="avm-wallet-container w-full sm:w-auto">
            <Web3Wallet 
              {algodClient} 
              {availableWallets}
              allowWatchAccounts={true}
              wcProject={{
                projectId: PUBLIC_WALLETCONNECT_PROJECT_ID,
                projectName: 'House of Voi',
                projectDescription: 'House of Voi',
                projectUrl: 'https://demo.houseofvoi.com',
                projectIcons: ['https://demo.houseofvoi.com/android-chrome-192x192.png']
              }}
            />
          </div>
        </div>
      </div>


      <!-- Public Content Always Visible -->
        <div class="dashboard-grid">
          <!-- Primary Dashboard - Left Column with Tabs -->
          <div class="dashboard-primary">
            <!-- Tab Navigation -->
            <div class="card p-0 mb-4 sm:mb-6">
              <div class="flex border-b border-slate-700">
                <button 
                  class="tab-button {activeTab === 'portfolio' ? 'active' : ''}" 
                  on:click={() => activeTab = 'portfolio'}
                >
                  <Wallet class="w-4 h-4 sm:w-5 sm:h-5" />
                  <span class="hidden sm:inline">Portfolio</span>
                  <span class="sm:hidden text-xs">Portfolio</span>
                </button>
                <button 
                  class="tab-button {activeTab === 'leaderboard' ? 'active' : ''}" 
                  on:click={() => activeTab = 'leaderboard'}
                >
                  <Trophy class="w-4 h-4 sm:w-5 sm:h-5" />
                  <span class="hidden sm:inline">Leaderboard</span>
                  <span class="sm:hidden text-xs">Leaders</span>
                </button>
                <button 
                  class="tab-button {activeTab === 'analytics' ? 'active' : ''}" 
                  on:click={() => activeTab = 'analytics'}
                >
                  <PieChart class="w-4 h-4 sm:w-5 sm:h-5" />
                  <span class="hidden sm:inline">Analytics</span>
                  <span class="sm:hidden text-xs">Stats</span>
                </button>
              </div>
            </div>

            <!-- Tab Content -->
            <div class="tab-content">
              <!-- Portfolio Tab - Mixed Public/Private Content -->
              <div class:hidden={activeTab !== 'portfolio'}>
                {#if isWalletConnected}
                  <!-- Full YBT Dashboard for connected users -->
                  <YBTDashboard 
                    {houseBalance} 
                    {balanceLoading} 
                    onRefreshBalance={refreshHouseBalance}
                    on:balanceChanged={loadHouseBalance} 
                  />
                {:else}
                  <!-- Public YBT Dashboard - adapted from YBTDashboard.svelte -->
                  <div class="space-y-4 sm:space-y-6">
                    <!-- Unified Portfolio Overview ---->
                    <div class="card p-4 sm:p-6">
                      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3">
                        <div class="flex-1">
                          <h2 class="text-xl sm:text-2xl font-bold text-theme">YBT Portfolio</h2>
                          <p class="text-xs sm:text-sm text-slate-400 mt-1">Contract status and yield-bearing token information</p>
                        </div>
                        <button
                          on:click={refreshHouseBalance}
                          disabled={balanceLoading}
                          class="btn-secondary text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto min-h-[44px]"
                        >
                          {#if balanceLoading}
                            <svg class="animate-spin -ml-1 mr-1 h-3 w-3 text-theme" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Refreshing...
                          {:else}
                            Refresh
                          {/if}
                        </button>
                      </div>

                      <!-- Portfolio Value Highlight -->
                      <div class="bg-gradient-to-r from-slate-700 to-slate-600 rounded-lg p-4 sm:p-6 border border-yellow-400/20 mb-4 sm:mb-6">
                        <div class="text-slate-400 text-xs sm:text-sm font-medium mb-2">Total Contract Value</div>
                        <div class="text-2xl sm:text-3xl md:text-4xl font-bold text-yellow-400 mb-2">
                          {#if balanceLoading || !houseBalance}
                            <div class="flex items-center">
                              <svg class="animate-spin h-8 w-8 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 818-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Loading...
                            </div>
                          {:else}
                            {(houseBalance.total / 1_000_000).toFixed(6)} VOI
                          {/if}
                        </div>
                        {#if !balanceLoading && houseBalance}
                          <div class="text-xs sm:text-sm text-slate-400">
                            Total pool available to YBT holders
                          </div>
                        {/if}
                      </div>

                      <!-- Key Metrics Grid -->
                      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
                        <!-- Your Shares / Connect Message -->
                        <div class="bg-slate-700 rounded-lg p-3 sm:p-4 sm:col-span-2 lg:col-span-1">
                          <div class="text-slate-400 text-xs font-medium mb-2">Your Shares</div>
                          <div class="text-lg sm:text-xl font-bold text-slate-400 mb-1">
                            Connect wallet to deposit
                          </div>
                          <div class="text-xs text-slate-500">
                            Start earning from house profits
                          </div>
                        </div>

                        <!-- Contract Balance -->
                        <div class="bg-slate-700 rounded-lg p-3 sm:p-4">
                          <div class="text-slate-400 text-xs font-medium mb-2 flex items-center gap-1 sm:gap-2">
                            Contract Balance
                            {#if houseBalance}
                              <span class="text-xs px-1.5 py-0.5 sm:px-2 rounded-full {houseBalance.isOperational ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}">
                                {houseBalance.isOperational ? '●' : '⚠'}
                              </span>
                            {/if}
                          </div>
                          {#if balanceLoading || !houseBalance}
                            <div class="text-lg sm:text-xl font-bold text-slate-400">Loading...</div>
                          {:else}
                            <div class="text-lg sm:text-xl font-bold text-theme mb-1">
                              {(houseBalance.total / 1e6).toFixed(2)} VOI
                            </div>
                            <div class="text-xs text-slate-500">
                              <span class="block sm:inline">{(houseBalance.available / 1e6).toFixed(1)} available</span>
                              <span class="hidden sm:inline"> • </span>
                              <span class="block sm:inline">{(houseBalance.locked / 1e6).toFixed(1)} locked</span>
                            </div>
                          {/if}
                        </div>

                        <!-- Documentation -->
                        <div class="bg-slate-700 rounded-lg p-3 sm:p-4">
                          <div class="text-slate-400 text-xs font-medium mb-2">Learn More</div>
                          <div class="text-xs sm:text-sm text-slate-300 mb-2">Yield-bearing token earning from house profits</div>
                          <a 
                            href="https://docs.houseofvoi.com" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            class="text-voi-400 hover:text-voi-300 text-xs sm:text-sm font-medium transition-colors duration-200 flex items-center gap-1 min-h-[44px] items-center"
                          >
                            Documentation
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                            </svg>
                          </a>
                        </div>
                      </div>

                      <!-- Action Buttons -->
                      <div class="space-y-3 mt-4 sm:mt-6">
                        <div class="btn-primary-large w-full opacity-50 cursor-not-allowed flex items-center justify-center">
                          <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                          </svg>
                          <span class="text-sm sm:text-base">Connect Wallet to Deposit</span>
                        </div>
                      </div>

                    </div>
                  </div>
                {/if}
              </div>
              
              <!-- Public Leaderboard -->
              <div class:hidden={activeTab !== 'leaderboard'}>
                <div class="card p-4">
                  <div class="flex items-center gap-2 mb-4">
                    <Crown class="w-5 h-5 text-yellow-400" />
                    <h2 class="text-lg font-bold text-theme">Top Players</h2>
                  </div>
                  <Leaderboard maxHeight="700px" showPlayerHighlight={isWalletConnected} autoRefresh={true} />
                </div>
              </div>
              
              <!-- Public Analytics -->
              <div class:hidden={activeTab !== 'analytics'}>
                <div class="card p-4">
                  <div class="flex items-center gap-2 mb-4">
                    <PieChart class="w-5 h-5 text-voi-400" />
                    <h2 class="text-lg font-bold text-theme">Game Analytics & Transparency</h2>
                  </div>
                  
                  <div class="text-slate-300 mb-6">
                    <p class="mb-2">
                      Our slot machine operates with full transparency. All game mechanics, odds, and payouts 
                      are calculated from verifiable blockchain data.
                    </p>
                    <p class="text-sm text-slate-400">
                      All calculations are performed using real-time blockchain data from the slot machine contract.
                    </p>
                  </div>
                  
                  <OddsAnalysis compact={false} showHouseMetrics={true} isModal={false} />
                </div>
              </div>
            </div>
          </div>
          
          <!-- Platform Statistics - Always Visible -->
          <div class="dashboard-secondary">
            <div class="card p-3 sm:p-4 h-fit">
              <div class="flex items-center gap-2 mb-3 sm:mb-4">
                <BarChart3 class="w-4 h-4 sm:w-5 sm:h-5 text-voi-400" />
                <h2 class="text-base sm:text-lg font-bold text-theme">Platform Analytics</h2>
                {#if $connectionStatus.fallbackActive}
                  <span class="px-1.5 py-0.5 sm:px-2 sm:py-1 text-xs bg-amber-900/50 text-amber-300 rounded-full border border-amber-600/30">
                    <span class="hidden sm:inline">Limited Data</span>
                    <span class="sm:hidden">Limited</span>
                  </span>
                {/if}
              </div>
            
            {#if $platformStats.loading}
              <div class="flex items-center justify-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-400"></div>
              </div>
            {:else if $platformStats.error}
              <div class="text-red-400 text-center py-8">
                Failed to load platform statistics: {$platformStats.error}
              </div>
            {:else if $platformStats.data}
              <div class="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
                <!-- Total Bets -->
                <div class="bg-slate-700 rounded-lg p-2 sm:p-3">
                  <div class="flex items-center gap-1 sm:gap-2 mb-1">
                    <Target class="w-3 h-3 sm:w-4 sm:h-4 text-blue-400" />
                    <span class="text-xs text-gray-400">Total Bets</span>
                  </div>
                  <div class="text-sm sm:text-lg font-bold text-blue-400">
                    {$platformStats.data.total_bets.toLocaleString()}
                  </div>
                </div>

                <!-- Unique Players -->
                <div class="bg-slate-700 rounded-lg p-2 sm:p-3">
                  <div class="flex items-center gap-1 sm:gap-2 mb-1">
                    <Users class="w-3 h-3 sm:w-4 sm:h-4 text-purple-400" />
                    <span class="text-xs text-gray-400">Players</span>
                  </div>
                  <div class="text-sm sm:text-lg font-bold text-purple-400">
                    {Number($platformStats.data.unique_players).toLocaleString()}
                  </div>
                </div>

                <!-- Volume -->
                <div class="bg-slate-700 rounded-lg p-2 sm:p-3">
                  <div class="flex items-center gap-1 sm:gap-2 mb-1">
                    <Coins class="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400" />
                    <span class="text-xs text-gray-400">Volume</span>
                  </div>
                  <div class="text-sm sm:text-lg font-bold text-yellow-400">
                    {formatVOI(Number($platformStats.data.total_amount_bet))} VOI
                  </div>
                </div>

                <!-- Total Payouts -->
                <div class="bg-slate-700 rounded-lg p-2 sm:p-3">
                  <div class="flex items-center gap-1 sm:gap-2 mb-1">
                    <TrendingUp class="w-3 h-3 sm:w-4 sm:h-4 text-green-400" />
                    <span class="text-xs text-gray-400">Paid Out</span>
                  </div>
                  <div class="text-sm sm:text-lg font-bold text-green-400">
                    {formatVOI(Number($platformStats.data.total_amount_paid))} VOI
                  </div>
                </div>
              </div>

              <!-- Key Metrics -->
              <div class="grid grid-cols-1 gap-2 sm:gap-3">
                <!-- House Edge -->
                <div class="bg-slate-700 rounded-lg p-2 sm:p-3">
                  <div class="flex items-center gap-1 sm:gap-2 mb-1">
                    <Zap class="w-3 h-3 sm:w-4 sm:h-4 text-orange-400" />
                    <span class="text-xs text-gray-400">House Edge</span>
                  </div>
                  <div class="text-sm sm:text-lg font-bold text-orange-400">
                    {$platformStats.data.house_edge.toFixed(2)}% 
                    <span class="text-xs text-gray-500 ml-1 sm:ml-2 block sm:inline">RTP: {$platformStats.data.rtp.toFixed(2)}%</span>
                  </div>
                </div>

                <!-- Win Rate -->
                <div class="bg-slate-700 rounded-lg p-2 sm:p-3">
                  <div class="flex items-center gap-1 sm:gap-2 mb-1">
                    <Target class="w-3 h-3 sm:w-4 sm:h-4 text-green-400" />
                    <span class="text-xs text-gray-400">Win Rate</span>
                  </div>
                  <div class="text-sm sm:text-lg font-bold text-green-400">
                    {$platformStats.data.win_percentage.toFixed(1)}%
                    <span class="text-xs text-gray-500 ml-1 sm:ml-2 block sm:inline">{Number($platformStats.data.total_winning_spins).toLocaleString()} wins</span>
                  </div>
                </div>

                <!-- Biggest Win -->
                <div class="bg-slate-700 rounded-lg p-2 sm:p-3">
                  <div class="flex items-center gap-1 sm:gap-2 mb-1">
                    <Crown class="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400" />
                    <span class="text-xs text-gray-400">Biggest Win</span>
                  </div>
                  <div class="text-sm sm:text-lg font-bold text-yellow-400">
                    {formatVOI(Number($platformStats.data.largest_single_win))} VOI
                    <span class="text-xs text-gray-500 ml-1 sm:ml-2 block sm:inline">Avg: {formatVOI($platformStats.data.average_bet_size)} VOI</span>
                  </div>
                </div>
              </div>

              {#if $platformStats.source === 'local'}
                <div class="mt-2 sm:mt-3 p-2 bg-amber-900/20 border border-amber-600/30 rounded-lg">
                  <div class="flex items-center gap-1 sm:gap-2 text-xs text-amber-300">
                    <Clock class="w-3 h-3" />
                    <span>Limited local data</span>
                  </div>
                </div>
              {/if}
            {/if}
            </div>
          </div>

        </div>
    </div>
  </main>
{/if}

<style>
  .text-voi-400 {
    color: #10b981;
  }
  
  .card {
    @apply bg-slate-800 rounded-xl shadow-lg border border-slate-700;
  }
  
  /* Compact Wallet Header Bar */
  .wallet-header-bar {
    @apply bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-lg px-3 py-3 mb-4 sm:px-4 sm:mb-6;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  }
  
  /* Tab Navigation Styles */
  .tab-button {
    @apply flex flex-1 items-center justify-center gap-1 px-2 py-2 text-xs font-medium text-slate-400 border-b-2 border-transparent transition-all duration-200 sm:gap-2 sm:px-4 sm:py-3 sm:text-sm;
    border-bottom: 2px solid transparent;
    min-height: 44px; /* Touch target */
  }
  
  .tab-button:hover {
    @apply text-slate-200 bg-slate-700/30;
  }
  
  .tab-button.active {
    @apply text-voi-400 border-voi-400 bg-slate-700/20;
  }
  
  .tab-content {
    min-height: 400px;
  }
  
  /* Dashboard Grid Layout */
  .dashboard-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
    align-items: start;
  }
  
  @media (min-width: 1024px) {
    .dashboard-grid {
      grid-template-columns: 1fr 360px;
      gap: 1.5rem;
    }
  }
  
  .dashboard-primary {
    min-width: 0; /* Prevent overflow */
  }
  
  .dashboard-secondary {
    /* Remove sticky positioning to fix wallet modal z-index issues */
    /* position: sticky;
    top: 1rem; */
  }
  
  
  /* Responsive Dashboard Layout */
  @media (min-width: 1280px) {
    .dashboard-grid {
      grid-template-columns: 1fr 340px;
    }
  }
  
  @media (max-width: 640px) {
    .tab-button {
      @apply px-2 py-2 text-xs;
      gap: 0.25rem;
    }
    
    /* Stack platform stats cards on very small screens */
    .dashboard-secondary .grid-cols-2 {
      grid-template-columns: 1fr !important;
    }
  }
  
  /* Compact wallet header styling */
  .wallet-header-bar .avm-wallet-container {
    color-scheme: dark;
  }
  
  /* Compact wallet connect button */
  .wallet-header-bar .avm-wallet-container button,
  .wallet-header-bar .avm-wallet-container [role="button"] {
    background-color: #1e293b !important; /* slate-800 */
    color: #f8fafc !important; /* slate-50 */
    padding: 0.5rem 1rem !important;
    transition: all 0.2s ease-in-out !important;
    font-weight: 500 !important;
    font-size: 0.875rem !important;
    min-height: auto !important;
  }
  
  .wallet-header-bar .avm-wallet-container button:hover,
  .wallet-header-bar .avm-wallet-container [role="button"]:hover {
    background-color: #334155 !important; /* slate-700 */
    transform: none !important;
  }
  
  /* Wallet modal and dropdown styling for compact header */
  .wallet-header-bar .avm-wallet-container div[class*="modal"],
  .wallet-header-bar .avm-wallet-container div[class*="dropdown"],
  .wallet-header-bar .avm-wallet-container div[class*="menu"],
  .wallet-header-bar .avm-wallet-container div[style*="position: fixed"],
  .wallet-header-bar .avm-wallet-container div[style*="position: absolute"] {
    background-color: #0f172a !important; /* slate-900 */
    color: #f8fafc !important; /* slate-50 */
  }
  
  /* Compact wallet option items */
  .wallet-header-bar .avm-wallet-container div[class*="wallet"],
  .wallet-header-bar .avm-wallet-container [role="menuitem"],
  .wallet-header-bar .avm-wallet-container [role="option"] {
    background-color: #1e293b !important; /* slate-800 */
    color: #f8fafc !important; /* slate-50 */
    margin: 0.125rem !important;
    transition: all 0.2s ease-in-out !important;
    font-size: 0.875rem !important;
  }
  
  /* Compact text styling */
  .wallet-header-bar .avm-wallet-container,
  .wallet-header-bar .avm-wallet-container * {
    color: #f8fafc !important; /* slate-50 */
  }
  
  /* Force avm-wallet-svelte to use dark theme styling */
  :global(.avm-wallet-container) {
    color-scheme: dark;
    --tw-bg-opacity: 1;
    --tw-text-opacity: 1;
  }
  
  /* Target the main wallet connect button */
  :global(.avm-wallet-container button),
  :global(.avm-wallet-container [role="button"]) {
    background-color: #1e293b !important; /* slate-800 */
    color: #f8fafc !important; /* slate-50 */
    transition: all 0.2s ease-in-out !important;
    font-weight: 500 !important;
  }

  :global(.avm-wallet-container [role="button"]:first-child) {
    border: 1px solid #334155 !important; /* slate-700 */
    border-radius: 0.5rem !important;
  }
  
  :global(.avm-wallet-container button:hover),
  :global(.avm-wallet-container [role="button"]:hover) {
    background-color: #334155 !important; /* slate-700 */
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
  }
  
  /* Override any modal/dropdown backgrounds */
  :global(.avm-wallet-container div[class*="modal"]),
  :global(.avm-wallet-container div[class*="dropdown"]),
  :global(.avm-wallet-container div[class*="menu"]),
  :global(.avm-wallet-container div[style*="position: fixed"]),
  :global(.avm-wallet-container div[style*="position: absolute"]) {
    background-color: #0f172a !important; /* slate-900 */
    color: #f8fafc !important; /* slate-50 */
    border: 1px solid #334155 !important; /* slate-700 */
    border-radius: 0.75rem !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
  }
  
  /* Override wallet option items */
  :global(.avm-wallet-container div[class*="wallet"]),
  :global(.avm-wallet-container [role="menuitem"]),
  :global(.avm-wallet-container [role="option"]) {
    background-color: #1e293b !important; /* slate-800 */
    color: #f8fafc !important; /* slate-50 */
    margin: 0.25rem !important;
    transition: all 0.2s ease-in-out !important;
  }
  
  
  /* Override any text elements */
  :global(.avm-wallet-container),
  :global(.avm-wallet-container *) {
    color: #f8fafc !important; /* slate-50 */
  }
  
  /* Override specific Tailwind classes that might be light-themed */
  :global(.avm-wallet-container .bg-white) { background-color: #1e293b !important; }
  :global(.avm-wallet-container .bg-gray-50) { background-color: #1e293b !important; }
  :global(.avm-wallet-container .bg-gray-100) { background-color: #334155 !important; }
  :global(.avm-wallet-container .text-gray-900) { color: #f8fafc !important; }
  :global(.avm-wallet-container .text-black) { color: #f8fafc !important; }
  :global(.avm-wallet-container .border-gray-300) { border-color: #334155 !important; }
  
  /* Button styles from YBTDashboard */
  .btn-secondary {
    @apply bg-slate-700 hover:bg-slate-600 text-theme font-semibold py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center;
    min-height: 40px;
  }
  
  @media (min-width: 640px) {
    .btn-secondary {
      @apply px-4;
    }
  }
  
  .btn-primary-large {
    @apply bg-voi-600 hover:bg-voi-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center text-sm;
    box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.2), 0 2px 4px -1px rgba(5, 150, 105, 0.1);
    min-height: 48px;
  }
  
  @media (min-width: 640px) {
    .btn-primary-large {
      @apply py-4 px-6 text-base;
    }
  }
  
  .bg-voi-600 {
    background-color: #059669;
  }
  
  .hover\:bg-voi-700:hover {
    background-color: #047857;
  }
  
</style>