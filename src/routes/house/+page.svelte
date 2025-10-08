<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { selectedWallet, connectedWallets } from 'avm-wallet-svelte';
  import { ybtStore } from '$lib/stores/ybt';
  import { ybtService } from '$lib/services/ybt';
  import { walletStore, isWalletConnected } from '$lib/stores/wallet';
  import { walletService } from '$lib/services/wallet';
  import { NETWORK_CONFIG } from '$lib/constants/network';
  import { houseBalanceService } from '$lib/services/houseBalance';
  import { houseBalanceManager } from '$lib/stores/houseBalance';
  import YBTDashboard from '$lib/components/house/YBTDashboard.svelte';
  import YBTStats from '$lib/components/house/YBTStats.svelte';
  import WalletSourceSelector from '$lib/components/house/WalletSourceSelector.svelte';
  import MachineHistory from '$lib/components/house/MachineHistory.svelte';
  import ContractSelector from '$lib/components/contract/ContractSelector.svelte';
  import ContractSwitcher from '$lib/components/contract/ContractSwitcher.svelte';
  // import OddsAnalysis from '$lib/components/analytics/OddsAnalysis.svelte';
  import LoadingOverlay from '$lib/components/ui/LoadingOverlay.svelte';
  import Leaderboard from '$lib/components/game/Leaderboard.svelte';
  import PlatformCharts from '$lib/components/analytics/PlatformCharts.svelte';
  import algosdk from 'algosdk';
  import { hovStatsStore, platformStats, connectionStatus, timeStats } from '$lib/stores/hovStats';
  import { formatVOI } from '$lib/constants/betting';
  import { BarChart3, TrendingUp, Users, Coins, Target, Zap, Clock, Crown, Wallet, Trophy, PieChart, AlertTriangle, History } from 'lucide-svelte';
  import { PUBLIC_WALLETCONNECT_PROJECT_ID } from '$env/static/public';
  import { isMaintenanceMode, maintenanceModeMessage } from '$lib/stores/maintenanceMode';
  import { 
    contractSelectionStore, 
    selectedContract, 
    isMultiContractMode,
    initializeMultiContractStores
  } from '$lib/stores/multiContract';
  import type { ContractPair } from '$lib/types/multiContract';
  import { themeStore } from '$lib/stores/theme';

  let isLoaded = false;
  let algodClient: algosdk.Algodv2;
  let houseBalance: any = null;
  let balanceLoading = true;
  let activeTab = 'portfolio';
  let selectedWalletSource: 'gaming' | 'external' = 'external';
  let isSelectedWalletLocked = false;
  
  // Lazy loading flags for tabs
  let historyTabViewed = false;
  let leaderboardTabViewed = false;
  
  // Track when tabs are viewed for lazy loading
  $: if (activeTab === 'history') historyTabViewed = true;
  $: if (activeTab === 'leaderboard') leaderboardTabViewed = true;
  
  $: viewingAddress = selectedWalletSource === 'external' 
    ? ($selectedWallet?.address || null)
    : ($walletStore.account?.address || (isSelectedWalletLocked ? (browser && walletService.hasStoredWallet() ? walletService.getStoredWalletAddress() : null) : null));
  let refreshDebounceTimer: NodeJS.Timeout | null = null;
  let isYBTRefreshing = false;
  
  // Initialize Algorand client for avm-wallet-svelte
  algodClient = new algosdk.Algodv2(
    NETWORK_CONFIG.token,
    NETWORK_CONFIG.nodeUrl,
    NETWORK_CONFIG.port
  );

  // Available wallets to enable (all supported by avm-wallet-svelte)
  const availableWallets = ['Kibisis', 'LuteWallet', 'VoiWallet', 'WalletConnect'];

  onMount(async () => {
    // Initialize multi-contract stores first
    await initializeMultiContractStores();
    
    // Initialize gaming wallet store - this now preserves existing unlocked state
    await walletStore.initialize();
    
    // Initialize YBT store - wallet connection will be handled by avm-wallet-svelte  
    await ybtStore.initialize();
    
    // Initialize HOV stats store
    await hovStatsStore.initialize();
    
    // Load house balance information
    loadHouseBalance();
    
    isLoaded = true;
  });

  onDestroy(() => {
    // Clear debounce timers
    if (refreshDebounceTimer) {
      clearTimeout(refreshDebounceTimer);
      refreshDebounceTimer = null;
    }
    
    // Stop HOV stats periodic refresh to prevent background API calls
    hovStatsStore.stopPeriodicRefresh();
    
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

  // Helper to prevent concurrent YBT refreshes
  async function safeYBTRefresh() {
    if (isYBTRefreshing) {
      console.log('YBT refresh already in progress, skipping');
      return;
    }
    isYBTRefreshing = true;
    try {
      await ybtStore.refresh();
    } finally {
      isYBTRefreshing = false;
    }
  }

  async function refreshHouseBalance() {
    try {
      balanceLoading = true;
      houseBalance = await houseBalanceService.refreshHouseBalance();
      
      // Also refresh YBT data since portfolio value depends on contract balances
      await safeYBTRefresh();
    } catch (error) {
      console.error('Failed to refresh house balance:', error);
    } finally {
      balanceLoading = false;
    }
  }
  
  // Stable wallet connection state - only update when actually changed
  let stableWalletState = false;
  let lastWalletCheck = { thirdParty: false, gaming: false };
  
  $: {
    const thirdPartyConnected = $selectedWallet !== null;
    const gamingConnected = $isWalletConnected;
    
    // Only update if the connection states actually changed
    if (thirdPartyConnected !== lastWalletCheck.thirdParty || gamingConnected !== lastWalletCheck.gaming) {
      lastWalletCheck = { thirdParty: thirdPartyConnected, gaming: gamingConnected };
      stableWalletState = thirdPartyConnected || gamingConnected;
    }
  }
  
  // Use stable state for display
  $: anyWalletConnected = stableWalletState;
  
  // Handle wallet source changes with debouncing
  async function handleWalletSourceChange(event: CustomEvent<{ source: 'gaming' | 'external'; isLocked: boolean }>) {
    const { source, isLocked } = event.detail;
    const previousSource = selectedWalletSource;
    const previousLocked = isSelectedWalletLocked;
    
    selectedWalletSource = source;
    isSelectedWalletLocked = isLocked;
    
    // If only the lock state changed (wallet unlocked), just update the preferred wallet type
    // No need to refresh portfolio data since it's the same wallet
    if (source === previousSource && previousLocked && !isLocked) {
      // Just unlocked the same wallet - only update wallet type, don't refresh
      const walletType = selectedWalletSource === 'external' ? 'third-party' : 'gaming';
      ybtService.setPreferredWalletType(walletType);
      return;
    }
    
    // Actual wallet source change - need to refresh data
    // Debounce wallet source changes to prevent rapid updates
    if (refreshDebounceTimer) {
      clearTimeout(refreshDebounceTimer);
    }
    
    refreshDebounceTimer = setTimeout(async () => {
      // Set the preferred wallet type in YBT service (convert 'external' to 'third-party')
      const walletType = selectedWalletSource === 'external' ? 'third-party' : 'gaming';
      ybtService.setPreferredWalletType(walletType);
      // Force refresh YBT data with new wallet source
      await safeYBTRefresh();
      refreshDebounceTimer = null;
    }, 200); // 200ms debounce
  }
  
  // Track last wallet state to prevent loops
  let lastWalletState = { connected: false, source: 'external' };
  
  // Only refresh when wallet state actually changes
  $: {
    const currentState = { connected: anyWalletConnected, source: selectedWalletSource };
    if (isLoaded && 
        (currentState.connected !== lastWalletState.connected || 
         currentState.source !== lastWalletState.source)) {
      
      lastWalletState = currentState;
      
      if (currentState.connected) {
        // Clear any existing timer
        if (refreshDebounceTimer) {
          clearTimeout(refreshDebounceTimer);
        }
        
        refreshDebounceTimer = setTimeout(() => {
          const walletType = selectedWalletSource === 'external' ? 'third-party' : 'gaming';
          ybtService.setPreferredWalletType(walletType);
          safeYBTRefresh();
          refreshDebounceTimer = null;
        }, 300);
      }
    }
  }

  // Track last contract ID to prevent unnecessary refreshes
  let lastContractId: string | null = null;
  
  // Reactive statement to refresh house balance when contract changes
  $: if (isLoaded && $selectedContract?.id) {
    // Only refresh if contract actually changed
    if (lastContractId && lastContractId !== $selectedContract.id) {
      console.log('Contract changed, refreshing house balance');
      loadHouseBalance();
    }
    lastContractId = $selectedContract.id;
  }

  // Handle contract selection changes
  async function handleContractSelection(event: CustomEvent<{ contractId: string; contract: ContractPair }>) {
    const { contractId, contract } = event.detail;
    console.log('Contract selected in House page:', contract.name);
    
    // Select the contract in the store
    await contractSelectionStore.selectContract(contractId);
  }

  // Handle contract switching
  async function handleContractChange(event: CustomEvent<{ previousId: string | null; newId: string; contract: ContractPair }>) {
    const { previousId, newId, contract } = event.detail;
    console.log('Contract switched from', previousId, 'to', newId);

    await safeYBTRefresh();
  }
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

      <!-- Maintenance Mode Banner - always rendered, shown when needed -->
      <div class:hidden={!($isMaintenanceMode && $maintenanceModeMessage)} class="bg-gradient-to-r from-amber-900/90 to-orange-900/90 border border-amber-600/50 rounded-lg p-4 mb-4 sm:mb-6">
        <div class="flex items-start gap-3">
          <AlertTriangle class="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div class="flex-1">
            <h3 class="text-amber-300 font-semibold text-sm sm:text-base mb-1">Platform Under Maintenance</h3>
            <p class="text-amber-200 text-xs sm:text-sm leading-relaxed">{$maintenanceModeMessage || ''}</p>
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
                  class="tab-button {activeTab === 'history' ? 'active' : ''}" 
                  on:click={() => activeTab = 'history'}
                >
                  <History class="w-4 h-4 sm:w-5 sm:h-5" />
                  <span class="hidden sm:inline">History</span>
                  <span class="sm:hidden text-xs">Wins</span>
                </button>
                <button 
                  class="tab-button {activeTab === 'analytics' ? 'active' : ''}" 
                  on:click={() => activeTab = 'analytics'}
                >
                  <BarChart3 class="w-4 h-4 sm:w-5 sm:h-5" />
                  <span class="hidden sm:inline">Analytics</span>
                  <span class="sm:hidden text-xs">Charts</span>
                </button>
              </div>
            </div>

            <!-- Tab Content -->
            <div class="tab-content">
              <!-- Portfolio Tab - Mixed Public/Private Content -->
              <div class:hidden={activeTab !== 'portfolio'}>
                <!-- Wallet Source Selector - only show when wallet connected -->
                {#if anyWalletConnected}
                <div class="mb-6">
                  <WalletSourceSelector 
                    bind:selectedSource={selectedWalletSource}
                    on:change={handleWalletSourceChange}
                    {algodClient}
                    {availableWallets}
                    wcProject={{
                      projectId: PUBLIC_WALLETCONNECT_PROJECT_ID,
                      projectName: 'House of Voi',
                      projectDescription: 'House of Voi',
                      projectUrl: 'https://demo.houseofvoi.com',
                      projectIcons: ['https://demo.houseofvoi.com/android-chrome-192x192.png']
                    }}
                  />
                </div>
                {/if}

                
                <!-- YBT Dashboard - always rendered and visible -->
                <YBTDashboard 
                  {houseBalance} 
                  {balanceLoading} 
                  onRefreshBalance={refreshHouseBalance}
                  on:balanceChanged={loadHouseBalance}
                  isGamingWalletLocked={selectedWalletSource === 'gaming' && isSelectedWalletLocked}
                  showConnectedView={true}
                  hasWalletConnected={anyWalletConnected}
                  viewingAddress={viewingAddress}
                />
                
                <!-- Public YBT Dashboard - show when no wallet connected -->
                <div class:hidden={anyWalletConnected}>
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
                          <!-- Loading state -->
                          <div class:hidden={!(balanceLoading || !houseBalance)} class="flex items-center">
                            <svg class="animate-spin h-8 w-8 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 818-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Loading...
                          </div>
                          <!-- Loaded content -->
                          <div class:hidden={balanceLoading || !houseBalance}>
                            {houseBalance ? (houseBalance.total / 1_000_000).toFixed(6) : '0.000000'} VOI
                          </div>
                        </div>
                        <!-- Pool info - always rendered, shown when loaded -->
                        <div class:hidden={balanceLoading || !houseBalance} class="text-xs sm:text-sm text-slate-400">
                          Total pool available to YBT holders
                        </div>
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
                            <!-- Status indicator - always rendered, shown when balance exists -->
                            <span class:hidden={!houseBalance} class="text-xs px-1.5 py-0.5 sm:px-2 rounded-full {houseBalance?.isOperational ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}">
                              {houseBalance?.isOperational ? '●' : '⚠'}
                            </span>
                          </div>
                          <!-- Loading state -->
                          <div class:hidden={!(balanceLoading || !houseBalance)} class="text-lg sm:text-xl font-bold text-slate-400">Loading...</div>
                          
                          <!-- Loaded content -->
                          <div class:hidden={balanceLoading || !houseBalance}>
                            <div class="text-lg sm:text-xl font-bold text-theme mb-1">
                              {houseBalance ? (houseBalance.total / 1e6).toFixed(2) : '0.00'} VOI
                            </div>
                            <div class="text-xs text-slate-500">
                              <span class="block sm:inline">{houseBalance ? (houseBalance.available / 1e6).toFixed(1) : '0.0'} available</span>
                              <span class="hidden sm:inline"> • </span>
                              <span class="block sm:inline">{houseBalance ? (houseBalance.locked / 1e6).toFixed(1) : '0.0'} locked</span>
                            </div>
                          </div>
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

                      <!-- Gaming Wallet Notice -->
                      <div class="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-4">
                        <div class="flex">
                          <svg class="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 mt-0.5 mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
                          </svg>
                          <div class="text-xs sm:text-sm">
                            <p class="text-blue-300 font-medium">Multiple Ways to Stake</p>
                            <p class="text-blue-400 mt-1">
                              You can stake VOI using either an external wallet (Kibisis, Lute, etc.) or your 
                              <a href="/app" class="text-voi-400 hover:text-voi-300 underline">gaming wallet</a> 
                              from the slot machine.
                            </p>
                          </div>
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
                </div>
              </div>
              
              <!-- Public Leaderboard - Lazy Loaded -->
              <div class:hidden={activeTab !== 'leaderboard'}>
                <div class="card p-4">
                  <div class="flex items-center gap-2 mb-4">
                    <Crown class="w-5 h-5 text-yellow-400" />
                    <h2 class="text-lg font-bold text-theme">Top Players</h2>
                  </div>
                  {#if leaderboardTabViewed}
                    <Leaderboard compact={false} showPlayerHighlight={anyWalletConnected} contractId={$selectedContract?.slotMachineAppId ? BigInt($selectedContract.slotMachineAppId) : 0n} />
                  {:else}
                    <div class="flex items-center justify-center py-8">
                      <div class="text-center">
                        <Crown class="w-8 h-8 text-gray-500 mx-auto mb-2" />
                        <p class="text-gray-400">Loading leaderboard...</p>
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
              
              <!-- History Tab - Lazy Loaded -->
              <div class:hidden={activeTab !== 'history'}>
                <div class="card p-4">
                  {#if historyTabViewed}
                    <MachineHistory 
                      appId={$selectedContract?.slotMachineAppId ? BigInt($selectedContract.slotMachineAppId) : 0n} 
                      compact={false}
                    />
                  {:else}
                    <div class="flex items-center justify-center py-8">
                      <div class="text-center">
                        <History class="w-8 h-8 text-gray-500 mx-auto mb-2" />
                        <p class="text-gray-400">Loading machine history...</p>
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
              
              <!-- Analytics Tab -->
              <div class:hidden={activeTab !== 'analytics'}>
                <PlatformCharts />
              </div>
            </div>
          </div>
          
          <!-- Platform Statistics - Always Visible -->
          <div class="dashboard-secondary">
            <!-- Contract Selection - show when multi-contract mode -->
            {#if $isMultiContractMode}
            <div class="card p-4 mb-4">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <h3 class="text-lg font-semibold text-theme">Machine Contract</h3>
                </div>
                <div class="text-right">
                  <ContractSwitcher 
                    contractFilter="houseDashboard"
                    size="md"
                    showDescription={false}
                    showHealthStatus={true}
                    on:contractChanged={handleContractChange}
                  />
                </div>
              </div>
            </div>
            {/if}
            <div class="card p-3 sm:p-4 h-fit">
              <div class="flex items-center gap-2 mb-3 sm:mb-4">
                <BarChart3 class="w-4 h-4 sm:w-5 sm:h-5 text-voi-400" />
                <h2 class="text-base sm:text-lg font-bold text-theme">Platform Analytics</h2>
                <!-- Fallback indicator - always rendered, shown when fallback active -->
                <span class:hidden={!$connectionStatus.fallbackActive} class="px-1.5 py-0.5 sm:px-2 sm:py-1 text-xs bg-amber-900/50 text-amber-300 rounded-full border border-amber-600/30">
                  <span class="hidden sm:inline">Limited Data</span>
                  <span class="sm:hidden">Limited</span>
                </span>
              </div>
            
            <!-- Loading state - always rendered, shown based on loading -->
            <div class:hidden={!$platformStats.loading} class="flex items-center justify-center py-8">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-400"></div>
            </div>
            
            <!-- Error state - always rendered, shown based on error -->
            <div class:hidden={!$platformStats.error || $platformStats.loading} class="text-red-400 text-center py-8">
              Failed to load platform statistics: {$platformStats.error || ''}
            </div>
            
            <!-- Data content - always rendered, shown when data exists -->
            <div class:hidden={$platformStats.loading || $platformStats.error || !$platformStats.data}>
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

              <!-- Local data indicator - always rendered, shown based on source -->
              <div class:hidden={$platformStats.source !== 'local'} class="mt-2 sm:mt-3 p-2 bg-amber-900/20 border border-amber-600/30 rounded-lg">
                <div class="flex items-center gap-1 sm:gap-2 text-xs text-amber-300">
                  <Clock class="w-3 h-3" />
                  <span>Limited local data</span>
                </div>
              </div>
            </div>
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