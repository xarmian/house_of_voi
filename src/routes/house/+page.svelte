<script lang="ts">
  import { onMount } from 'svelte';
  import { Web3Wallet, selectedWallet, connectedWallets } from 'avm-wallet-svelte';
  import { ybtStore } from '$lib/stores/ybt';
  import { NETWORK_CONFIG } from '$lib/constants/network';
  import YBTDashboard from '$lib/components/house/YBTDashboard.svelte';
  import LoadingOverlay from '$lib/components/ui/LoadingOverlay.svelte';
  import algosdk from 'algosdk';

  let isLoaded = false;
  let algodClient: algosdk.Algodv2;
  
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
    isLoaded = true;
  });
  
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
        <h1 class="text-4xl md:text-5xl font-bold text-white mb-4">
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
          <h3 class="text-lg font-semibold text-white">Wallet Connection</h3>
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
                <p class="font-mono text-sm text-white">
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
        <YBTDashboard />
      {:else}
        <div class="card p-8 text-center">
          <div class="text-slate-400 mb-4">
            <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
          </div>
          <h3 class="text-xl font-semibold text-white mb-2">Connect Your Wallet</h3>
          <p class="text-slate-400">
            Connect your wallet above to view and manage your YBT shares.
          </p>
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