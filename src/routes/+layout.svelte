<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { MetaTags, deepMerge } from 'svelte-meta-tags';
  import { soundService } from '$lib/services/soundService';
  import WarningProvider from '$lib/components/ui/WarningProvider.svelte';
  import UnifiedHeader from '$lib/components/navigation/UnifiedHeader.svelte';
  import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
  import { checkForPurchaseResult, clearPurchaseParams, showPurchaseNotification } from '$lib/utils/voiPurchase';
  import { updateDetector } from '$lib/services/updateDetector';
  import { themeStore } from '$lib/stores/theme';
  
  export let data;
  
  $: isGameRoute = $page.route.id?.startsWith('/app');
  $: isHouseRoute = $page.route.id?.startsWith('/house');
  $: isProfileRoute = $page.route.id?.startsWith('/profile');
  $: showUnifiedHeader = isGameRoute || isHouseRoute || isProfileRoute;
  $: metaTags = deepMerge(data.baseMetaTags, $page.data.pageMetaTags || {});
  
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
    
    return () => {
      // Clean up update detector on component destroy
      updateDetector.stop();
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