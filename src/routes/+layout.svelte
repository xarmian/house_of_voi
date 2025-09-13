<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { fade } from 'svelte/transition';
  import { MetaTags, deepMerge } from 'svelte-meta-tags';
  import { soundService } from '$lib/services/soundService';
  import WarningProvider from '$lib/components/ui/WarningProvider.svelte';
  import UnifiedHeader from '$lib/components/navigation/UnifiedHeader.svelte';
  import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
  import { checkForPurchaseResult, clearPurchaseParams, showPurchaseNotification } from '$lib/utils/voiPurchase';
  import { updateDetector } from '$lib/services/updateDetector';
  import { cleanupAnimations } from '$lib/stores/animations';
  import { winFeedStore } from '$lib/stores/winFeed';
  import { supabaseService } from '$lib/services/supabase';
  import { themeStore } from '$lib/stores/theme';
  import { isMasterSoundEnabled, soundPreferences } from '$lib/stores/sound';
  import VoiRadioPlayer from '$lib/components/app/VoiRadioPlayer.svelte';
  
  export let data;
  
  $: isGameRoute = $page.route.id?.startsWith('/app');
  $: isHouseRoute = $page.route.id?.startsWith('/house');
  $: isProfileRoute = $page.route.id?.startsWith('/profile');
  $: isTournamentRoute = $page.route.id?.startsWith('/tournament');
  $: showUnifiedHeader = isGameRoute || isHouseRoute || isProfileRoute || isTournamentRoute;
  $: metaTags = deepMerge(data.baseMetaTags, $page.data.pageMetaTags || {});

  // Ensure any game overlays/animations are cleaned up when leaving the app route
  $: if (!isGameRoute) {
    try { cleanupAnimations(); } catch (e) { /* no-op */ }
  }
  
  // NAVIGATION FIX: Enhanced cleanup when leaving app routes
  // Track previous route to detect route changes
  let previousRoute = '';
  $: if (browser && $page.route.id) {
    const currentRoute = $page.route.id;
    const wasAppRoute = previousRoute.startsWith('/app');
    const isNowAppRoute = currentRoute.startsWith('/app');
    
    // If we were on an app route and now we're not, ensure thorough cleanup
    if (wasAppRoute && !isNowAppRoute) {
      console.log('🧹 Navigation cleanup: leaving app route', previousRoute, '->', currentRoute);
      
      try {
        // Import and stop global services that might interfere with navigation
        import('$lib/services/queueProcessor').then(({ queueProcessor }) => {
          queueProcessor.stop();
        }).catch(() => {});
        
        import('$lib/stores/houseBalance').then(({ houseBalanceActions }) => {
          houseBalanceActions.reset();
        }).catch(() => {});
        
        import('$lib/services/balanceManager').then(({ balanceManager }) => {
          balanceManager.reset();
        }).catch(() => {});
        
        // Clean up any remaining animations
        cleanupAnimations();
      } catch (e) {
        console.warn('Navigation cleanup warning:', e);
      }
    }
    
    previousRoute = currentRoute;
  }
  
  let mounted = false;
  
  onMount(async () => {
    mounted = true;
    
    // Check for VOI purchase result from mobile redirect
    const purchaseResult = checkForPurchaseResult();
    if (purchaseResult) {
      // Show notification for purchase result
      showPurchaseNotification(purchaseResult);
      
      // Clean up URL parameters
      clearPurchaseParams();
    }
    
    // Start the update detector
    updateDetector.start();
    
    // Initialize Supabase service (needed for real-time subscriptions) but keep win feed disabled
    supabaseService.initialize().catch(error => {
      console.error('Failed to initialize Supabase service:', error);
    });
    
    // Initialize win feed store - DISABLED: only enable when viewing MachineHistory
    // winFeedStore.initialize().catch(error => {
    //   console.error('Failed to initialize win feed store:', error);
    // });
    
    return () => {
      // Clean up update detector on component destroy
      updateDetector.stop();
      
      // Clean up win feed store - DISABLED: only enable when viewing MachineHistory
      // winFeedStore.destroy();
    };
  });
</script>

<MetaTags {...metaTags} />

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <link rel="icon" href="/favicon.ico" />
</svelte:head>

{#if mounted}
  <div 
    class="min-h-screen bg-slate-900 relative"
    in:fade={{ duration: 300 }}
  >
    <!-- Unified Header for app and house routes -->
    {#if showUnifiedHeader}
      <UnifiedHeader />
    {/if}
    
    <!-- Main content with padding when header is shown -->
    <div class="{showUnifiedHeader ? 'pt-0' : ''}">
      <slot />
    </div>
    
    <!-- Global warning provider -->
    <WarningProvider />
    
    <!-- Toast notifications -->
    <ToastContainer />

    <!-- VOI Radio Player mounted globally (respects user preference) -->
    {#if $isMasterSoundEnabled && $soundPreferences.voiRadioEnabled}
      <VoiRadioPlayer />
    {/if}
  </div>
{:else}
  <!-- Loading screen -->
  <div class="min-h-screen bg-slate-900 flex items-center justify-center">
    <div class="text-center">
      <div class="w-12 h-12 border-4 border-voi-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-theme">Loading House of Voi...</p>
    </div>
  </div>
{/if}
