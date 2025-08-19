<script lang="ts">
  import { onMount } from 'svelte';
  import { walletStore } from '$lib/stores/wallet';
  import { contractDataCache } from '$lib/services/contractDataCache';
  import WalletDisplay from '$lib/components/wallet/WalletDisplay.svelte';
  import SlotMachine from '$lib/components/game/SlotMachine.svelte';
  import GameQueue from '$lib/components/game/GameQueue.svelte';
  import GameHeader from '$lib/components/game/GameHeader.svelte';
  
  let hasPreloadedCache = false;

  onMount(async () => {
    await walletStore.initialize();
    
    // Pre-load contract data after wallet is initialized - but only once per session
    const unsubscribe = walletStore.subscribe(async (state) => {
      if (state.account && !state.isLocked && !hasPreloadedCache) {
        hasPreloadedCache = true; // Prevent multiple preloads
        try {
          console.log('🚀 Initializing contract data cache...');
          await contractDataCache.preloadContractData(state.account.address);
          console.log('✅ Contract data cache initialized');
        } catch (error) {
          console.warn('⚠️ Failed to pre-load contract data:', error);
          hasPreloadedCache = false; // Allow retry on next wallet connection
        }
        unsubscribe(); // Stop listening after successful preload
      }
    });
  });
</script>

<svelte:head>
  <title>Game - House of Voi</title>
</svelte:head>

<main class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
  <div class="max-w-7xl mx-auto px-4 py-2 lg:py-2">
    <!-- Desktop Layout: Horizontal -->
    <div class="hidden lg:block min-h-screen">
      <!-- Header across full width -->
      <div class="mb-4">
        <GameHeader />
      </div>
      
      <!-- Main content grid -->
      <div class="grid grid-cols-12 gap-4 items-start">
        <!-- Main game area -->
        <div class="col-span-8">
          <SlotMachine disabled={!$walletStore.isConnected} />
        </div>
        
        <!-- Right sidebar: Wallet and Queue - aligned with game status bar -->
        <div class="col-span-4 space-y-4">
          <WalletDisplay />
          <GameQueue maxHeight="calc(100vh - 20rem)" />
        </div>
      </div>
    </div>
    
    <!-- Mobile Layout: Fixed viewport optimized -->
    <div class="lg:hidden min-h-screen flex flex-col safe-area-top safe-area-bottom">
      <!-- Fixed header with compact wallet -->
      <div class="flex-shrink-0 px-2 py-1 safe-area-left safe-area-right">
        <WalletDisplay compact={true} />
      </div>
      
      <!-- Main game area - allows natural scrolling -->
      <div class="flex-1 flex flex-col px-2 pb-2 safe-area-left safe-area-right">
        <SlotMachine disabled={!$walletStore.isConnected} compact={true} />
      </div>
    </div>
  </div>
</main>