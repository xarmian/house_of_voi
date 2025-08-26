<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import HeroSection from '$lib/components/landing/HeroSection.svelte';
  import FeaturesSection from '$lib/components/landing/FeaturesSection.svelte';
  import HowItWorksSection from '$lib/components/landing/HowItWorksSection.svelte';
  import Footer from '$lib/components/common/Footer.svelte';
  import WarningBanner from '$lib/components/ui/WarningBanner.svelte';
  
  export let data;
  
  let isLoaded = false;
  
  onMount(() => {
    isLoaded = true;
  });
  
  function playGame() {
    goto('/app');
  }
</script>


<main class="min-h-screen">
  <div class="landing-gradient">
    <WarningBanner />
    <HeroSection {playGame} {isLoaded} />
  </div>
  
  
  <FeaturesSection />
  <HowItWorksSection />
  <Footer />
</main>

<style>
  .landing-gradient {
    background: linear-gradient(135deg, 
      rgb(15, 23, 42) 0%, 
      rgb(30, 41, 59) 50%, 
      rgb(15, 23, 42) 100%);
    position: relative;
    overflow: hidden;
  }
  
  .landing-gradient::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at 20% 80%, rgba(16, 185, 129, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.1) 0%, transparent 50%);
    pointer-events: none;
  }
</style>