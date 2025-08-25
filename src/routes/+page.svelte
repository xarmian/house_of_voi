<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import HeroSection from '$lib/components/landing/HeroSection.svelte';
  import FeaturesSection from '$lib/components/landing/FeaturesSection.svelte';
  import HowItWorksSection from '$lib/components/landing/HowItWorksSection.svelte';
  import Footer from '$lib/components/common/Footer.svelte';
  
  export let data;
  
  let isLoaded = false;
  
  onMount(() => {
    isLoaded = true;
  });
  
  function playGame() {
    goto('/app');
  }
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
  
  <!-- Schema.org Structured Data -->
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "House of Voi",
    "description": "Provably fair blockchain slot machine on Voi Network with transparent outcomes and instant payouts",
    "url": "https://house-of-voi.vercel.app",
    "applicationCategory": "GameApplication",
    "operatingSystem": "Web",
    "browserRequirements": "Requires JavaScript. Compatible with modern browsers.",
    "creator": {
      "@type": "Organization",
      "name": "House of Voi Team"
    },
    "featureList": [
      "Provably Fair Gaming",
      "Instant Payouts",
      "Low Transaction Fees", 
      "Transparent Outcomes",
      "Voi Network Integration",
      "Wallet Integration",
      "Spin Replay Sharing"
    ],
    "screenshot": "https://house-of-voi.vercel.app/og-image-app.svg",
    "image": "https://house-of-voi.vercel.app/og-image-home.svg"
  }
  </script>`}
</svelte:head>

<main class="min-h-screen">
  <div class="landing-gradient">
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