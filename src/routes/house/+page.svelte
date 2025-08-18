<script lang="ts">
  import { onMount } from 'svelte';
  import { walletStore, isWalletConnected } from '$lib/stores/wallet';
  import { ybtStore } from '$lib/stores/ybt';
  import WalletDisplay from '$lib/components/wallet/WalletDisplay.svelte';
  import YBTDashboard from '$lib/components/house/YBTDashboard.svelte';
  import LoadingOverlay from '$lib/components/ui/LoadingOverlay.svelte';

  let isLoaded = false;

  onMount(async () => {
    // Initialize wallet and YBT stores
    await walletStore.initialize();
    await ybtStore.initialize();
    isLoaded = true;
  });
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
      <div class="mb-8">
        <WalletDisplay />
      </div>

      <!-- YBT Dashboard -->
      {#if $isWalletConnected}
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
            Connect your wallet to view and manage your YBT shares.
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
</style>