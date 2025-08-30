<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { walletStore } from '$lib/stores/wallet';
  import { contractDataCache } from '$lib/services/contractDataCache';
  import { balanceManager } from '$lib/services/balanceManager';
  import { currentTheme } from '$lib/stores/theme';
  import { isMasterSoundEnabled } from '$lib/stores/sound';
  import WalletManager from '$lib/components/wallet/WalletManager.svelte';
  import SlotMachine from '$lib/components/game/SlotMachine.svelte';
  import GameQueue from '$lib/components/game/GameQueue.svelte';
  import GameHeader from '$lib/components/game/GameHeader.svelte';
  import VoiRadioPlayer from '$lib/components/app/VoiRadioPlayer.svelte';
  import Leaderboard from '$lib/components/game/Leaderboard.svelte';
  import PlayerStats from '$lib/components/game/PlayerStats.svelte';
  import GameStaking from '$lib/components/game/GameStaking.svelte';
  
  export let data;
  
  // Import odds test utility for development
  import '$lib/utils/testOddsWithRealData';
  
  let hasPreloadedCache = false;
  let walletUnsubscribe: (() => void) | null = null;
  let showLeaderboard = false;
  let showPlayerStats = false;
  let showStaking = false;

  // Generate dynamic background style based on current theme - using background-image instead of background
  $: backgroundStyle = $currentTheme?.background?.via 
    ? `background-image: linear-gradient(${$currentTheme.background.direction}, ${$currentTheme.background.from}, ${$currentTheme.background.via}, ${$currentTheme.background.to});`
    : $currentTheme?.background 
    ? `background-image: linear-gradient(${$currentTheme.background.direction}, ${$currentTheme.background.from}, ${$currentTheme.background.to});`
    : 'background-image: linear-gradient(to bottom right, #0f172a, #1e293b, #0f172a);';
    
  // Add text color for contrast when needed
  $: textStyle = $currentTheme?.textColor ? `color: ${$currentTheme.textColor};` : '';
  
  $: combinedStyle = backgroundStyle + (textStyle ? ' ' + textStyle : '');

  onMount(async () => {
    // Pre-load contract data after wallet is initialized - but only once per session
    walletUnsubscribe = walletStore.subscribe(async (state) => {
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
        // Keep subscription active in case wallet changes
      }
    });
  });

  onDestroy(() => {
    // Clean up wallet subscription
    if (walletUnsubscribe) {
      walletUnsubscribe();
      walletUnsubscribe = null;
    }
    
    // Reset balance manager to stop any intervals and clear monitoring
    balanceManager.reset();
  });
</script>


<main class="min-h-screen transition-all duration-700 ease-in-out" style={combinedStyle}>
  <div class="max-w-7xl mx-auto px-4 py-2 lg:py-2">
    <!-- Desktop Layout: Horizontal -->
    <div class="hidden lg:block min-h-screen">
      <!-- Header across full width -->
      <div class="mb-4">
        <GameHeader />
      </div>
      
      <!-- Main content grid -->
      <div class="grid grid-cols-12 gap-6 items-start">
        <!-- Main game area -->
        <div class="col-span-8 relative">
          <SlotMachine disabled={false} />
        </div>
        
        <!-- Right sidebar: Wallet and Tabbed panels -->
        <div class="col-span-4 space-y-4 relative">
          <WalletManager />
          
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
                on:click={() => { showLeaderboard = true; showPlayerStats = false; showStaking = false; }}
              >
                Leaderboard
              </button>
              <button 
                class="tab-button {showPlayerStats ? 'active' : ''}"
                on:click={() => { showPlayerStats = true; showLeaderboard = false; showStaking = false; }}
              >
                Stats
              </button>
              <button 
                class="tab-button {showStaking ? 'active' : ''}"
                on:click={() => { showStaking = true; showLeaderboard = false; showPlayerStats = false; }}
              >
                Staking
              </button>
            </div>
            
            <!-- Tab content -->
            <div class="tab-content">
              {#if showLeaderboard}
                <Leaderboard compact={true} />
              {:else if showPlayerStats}
                <PlayerStats compact={true} />
              {:else if showStaking}
                <GameStaking compact={true} />
              {:else}
                <GameQueue />
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Mobile Layout: Fixed viewport optimized -->
    <div class="lg:hidden min-h-screen flex flex-col safe-area-top safe-area-bottom">
      <!-- Compact wallet header -->
      <div class="flex-shrink-0 px-2 py-2 safe-area-left safe-area-right">
        <WalletManager compact={true} />
      </div>
      
      <!-- Main game area - allows natural scrolling -->
      <div class="flex-1 flex flex-col px-2 pb-2 safe-area-left safe-area-right">
        <SlotMachine disabled={false} compact={true} />
      </div>
    </div>
  </div>
  
  <!-- VOI Radio Player - Fixed position, visible when sound is enabled -->
  {#if $isMasterSoundEnabled}
    <VoiRadioPlayer />
  {/if}
</main>

<style>
  .tabbed-panels {
    @apply bg-slate-800 rounded-xl border border-slate-700 overflow-hidden;
  }

  .tab-buttons {
    @apply flex border-b border-slate-700;
  }

  .tab-button {
    @apply flex-1 px-4 py-3 text-sm font-medium text-gray-400 hover:text-theme hover:bg-slate-700/50 transition-all duration-200 border-b-2 border-transparent;
  }

  .tab-button.active {
    @apply text-voi-400 border-voi-400 bg-slate-700/30;
  }

  .tab-content {
    @apply overflow-hidden;
    min-height: calc(100vh - 22rem);
  }

  /* VOI color utility */
  .text-voi-400 {
    color: #10b981;
  }

  .border-voi-400 {
    border-color: #10b981;
  }

  .bg-voi-600 {
    background-color: #059669;
  }

  .bg-voi-500\/20 {
    background-color: rgba(16, 185, 129, 0.2);
  }
</style>