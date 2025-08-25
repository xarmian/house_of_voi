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
  import SoundSettingsIcon from '$lib/components/ui/SoundSettingsIcon.svelte';
  import VoiRadioPlayer from '$lib/components/app/VoiRadioPlayer.svelte';
  
  export let data;
  
  // Import odds test utility for development
  import '$lib/utils/testOddsWithRealData';
  
  let hasPreloadedCache = false;
  let walletUnsubscribe: (() => void) | null = null;

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

<svelte:head>
  <title>{data.meta.title}</title>
  <meta name="description" content={data.meta.description} />
  <meta name="keywords" content={data.meta.keywords} />
  <meta name="author" content={data.meta.author} />
  <meta name="robots" content="index, follow" />
  <meta name="theme-color" content={data.meta.themeColor} />
  
  <!-- Open Graph -->
  <meta property="og:title" content={data.meta.title} />
  <meta property="og:description" content={data.meta.description} />
  <meta property="og:image" content={data.meta.ogImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content={data.meta.ogUrl} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={data.meta.siteName} />
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={data.meta.title} />
  <meta name="twitter:description" content={data.meta.description} />
  <meta name="twitter:image" content={data.meta.twitterImage} />
  
  <!-- Canonical -->
  <link rel="canonical" href={data.meta.canonical} />
</svelte:head>

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
        
        <!-- Right sidebar: Wallet and Queue - aligned with game status bar -->
        <div class="col-span-4 space-y-4 relative">
          <WalletManager />
          <GameQueue maxHeight="calc(100vh - 20rem)" />
        </div>
      </div>
    </div>
    
    <!-- Mobile Layout: Fixed viewport optimized -->
    <div class="lg:hidden min-h-screen flex flex-col safe-area-top safe-area-bottom">
      <!-- Fixed header with compact wallet and sound settings -->
      <div class="flex-shrink-0 px-2 py-1 safe-area-left safe-area-right mb-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex-1">
            <WalletManager compact={true} />
          </div>
          <div class="flex-shrink-0">
            <SoundSettingsIcon />
          </div>
        </div>
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