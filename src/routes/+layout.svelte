<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { soundService } from '$lib/services/soundService';
  import SoundToggleButton from '$lib/components/ui/SoundToggleButton.svelte';
  
  $: isGameRoute = $page.route.id?.startsWith('/app');
  
  let mounted = false;
  
  onMount(async () => {
    mounted = true;
  });
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0f172a" />
  <link rel="icon" href="/favicon.ico" />
</svelte:head>

{#if mounted}
  <div 
    class="min-h-screen bg-slate-900 relative"
    in:fade={{ duration: 300 }}
  >
    <!-- Sound Toggle - Desktop: full button top-right, Mobile: handled in app page -->
    <div class="hidden lg:block fixed top-4 right-4 z-50">
      <SoundToggleButton showSettings />
    </div>
    
    <slot />
  </div>
{:else}
  <!-- Loading screen -->
  <div class="min-h-screen bg-slate-900 flex items-center justify-center">
    <div class="text-center">
      <div class="w-12 h-12 border-4 border-voi-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-white">Loading House of Voi...</p>
    </div>
  </div>
{/if}