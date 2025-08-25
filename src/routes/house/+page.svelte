<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Web3Wallet, selectedWallet, connectedWallets } from 'avm-wallet-svelte';
  import { ybtStore } from '$lib/stores/ybt';
  import { NETWORK_CONFIG } from '$lib/constants/network';
  import { houseBalanceService } from '$lib/services/houseBalance';
  import { houseBalanceManager } from '$lib/stores/houseBalance';
  import YBTDashboard from '$lib/components/house/YBTDashboard.svelte';
  import OddsAnalysis from '$lib/components/analytics/OddsAnalysis.svelte';
  import LoadingOverlay from '$lib/components/ui/LoadingOverlay.svelte';
  import algosdk from 'algosdk';

  let isLoaded = false;
  let algodClient: algosdk.Algodv2;
  let houseBalance: any = null;
  let balanceLoading = true;
  
  // Initialize Algorand client for avm-wallet-svelte
  algodClient = new algosdk.Algodv2(
    NETWORK_CONFIG.token,
    NETWORK_CONFIG.nodeUrl,
    NETWORK_CONFIG.port
  );

  // Available wallets to enable (all supported by avm-wallet-svelte)
  const availableWallets = ['Kibisis', 'LuteWallet'];

  onMount(async () => {
    // Initialize YBT store - wallet connection will be handled by avm-wallet-svelte
    await ybtStore.initialize();
    
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
  <main class="min-h-screen bg-slate-900 px-4 py-8">
    <div class="max-w-6xl mx-auto">
      <!-- Header -->
      <div class="text-center mb-8">
        <h1 class="text-4xl md:text-5xl font-bold text-theme mb-4">
          The <span class="text-voi-400">House</span>
        </h1>
        <p class="text-slate-300 text-lg max-w-2xl mx-auto">
          Deposit funds into our yield-bearing token (YBT) and earn your share of the house profits.
        </p>
      </div>

      <!-- Wallet Connection -->
      <div class="card p-6 mb-8 avm-wallet-container">
        <div class="flex items-center gap-3 mb-4">
          <svg class="w-6 h-6 text-voi-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V8a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
          </svg>
          <h3 class="text-lg font-semibold text-theme">Wallet Connection</h3>
        </div>
        
        <!-- AVM Wallet Component -->
        <Web3Wallet 
          {algodClient} 
          {availableWallets}
          allowWatchAccounts={false}
        />
        
        <!-- Connected Wallet Info -->
        {#if $selectedWallet}
          <div class="mt-4 p-4 bg-slate-700/50 rounded-lg">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-400 mb-1">Connected Address</p>
                <p class="font-mono text-sm text-theme">
                  {$selectedWallet.address.slice(0, 8)}...{$selectedWallet.address.slice(-8)}
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-400 mb-1">Wallet</p>
                <p class="text-sm text-voi-400 font-medium">{$selectedWallet.app}</p>
              </div>
            </div>
          </div>
        {/if}
      </div>


      <!-- YBT Dashboard -->
      {#if isWalletConnected}
        <div class="space-y-8">
          <YBTDashboard 
            {houseBalance} 
            {balanceLoading} 
            onRefreshBalance={refreshHouseBalance}
            on:balanceChanged={loadHouseBalance} 
          />
          
          <!-- Game Analytics Section -->
          <div class="card p-6 hidden">
            <div class="flex items-center gap-3 mb-6">
              <svg class="w-6 h-6 text-voi-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
              </svg>
              <h2 class="text-2xl font-bold text-theme">Game Analytics & Transparency</h2>
            </div>
            
            <div class="text-slate-300 mb-6">
              <p class="mb-2">
                As a YBT holder, you have access to detailed game analytics and performance metrics. 
                This transparency ensures you can make informed decisions about your investment.
              </p>
              <p class="text-sm text-slate-400">
                All calculations are performed using real-time blockchain data from the slot machine contract.
              </p>
            </div>
            
            <OddsAnalysis compact={false} showHouseMetrics={true} isModal={false} />
          </div>
        </div>
      {:else}
        <div class="space-y-8">
          <!-- Connect Wallet Message -->
          <div class="card p-8 text-center">
            <div class="text-slate-400 mb-4">
              <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-theme mb-2">Connect Your Wallet</h3>
            <p class="text-slate-400">
              Connect your wallet above to view and manage your YBT shares and access detailed game analytics.
            </p>
          </div>
          
          <!-- Public Game Analytics (limited view) -->
          <div class="card p-6">
            <div class="flex items-center gap-3 mb-6">
              <svg class="w-6 h-6 text-voi-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
              </svg>
              <h2 class="text-2xl font-bold text-theme">Game Transparency</h2>
            </div>
            
            <div class="text-slate-300 mb-6">
              <p class="mb-2">
                Our slot machine operates with full transparency. All game mechanics, odds, and payouts 
                are calculated from verifiable blockchain data.
              </p>
              <p class="text-sm text-slate-400">
                Connect your wallet above to access detailed analytics and house performance metrics.
              </p>
            </div>
            
            <!-- Placeholder for public view -->
            <div class="bg-slate-700/30 rounded-lg p-8 text-center">
              <svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <h3 class="text-lg font-semibold text-theme mb-2">Provably Fair Gaming</h3>
              <p class="text-slate-400 mb-4">
                All odds calculations are performed using real contract data. No hidden mechanics or server-side randomness.
              </p>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div class="bg-slate-800/50 rounded-lg p-4">
                  <div class="text-2xl font-bold text-voi-400 mb-1">100%</div>
                  <div class="text-sm text-gray-400">Transparent</div>
                </div>
                <div class="bg-slate-800/50 rounded-lg p-4">
                  <div class="text-2xl font-bold text-blue-400 mb-1">20</div>
                  <div class="text-sm text-gray-400">Paylines</div>
                </div>
                <div class="bg-slate-800/50 rounded-lg p-4">
                  <div class="text-2xl font-bold text-yellow-400 mb-1">1000x</div>
                  <div class="text-sm text-gray-400">Max Multiplier</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}
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
    border: 1px solid #334155 !important; /* slate-700 */
    border-radius: 0.5rem !important;
    padding: 0.75rem 1.5rem !important;
    transition: all 0.2s ease-in-out !important;
    font-weight: 500 !important;
  }
  
  :global(.avm-wallet-container button:hover),
  :global(.avm-wallet-container [role="button"]:hover) {
    background-color: #334155 !important; /* slate-700 */
    border-color: #475569 !important; /* slate-600 */
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
    border: 1px solid #334155 !important; /* slate-700 */
    border-radius: 0.5rem !important;
    margin: 0.25rem !important;
    padding: 0.75rem !important;
    transition: all 0.2s ease-in-out !important;
  }
  
  :global(.avm-wallet-container div[class*="wallet"]:hover),
  :global(.avm-wallet-container [role="menuitem"]:hover),
  :global(.avm-wallet-container [role="option"]:hover) {
    background-color: #334155 !important; /* slate-700 */
    border-color: #10b981 !important; /* voi-500 */
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
  
  /* Ensure proper focus styles */
  :global(.avm-wallet-container button:focus),
  :global(.avm-wallet-container [role="button"]:focus) {
    outline: 2px solid #10b981 !important; /* voi-500 */
    outline-offset: 2px !important;
  }
</style>