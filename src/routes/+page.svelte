<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { MetaTags } from 'svelte-meta-tags';
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

<MetaTags
  title={data.meta.title}
  description={data.meta.description}
  canonical={data.meta.canonical}
  openGraph={{
    type: 'website',
    url: data.meta.ogUrl,
    title: data.meta.title,
    description: data.meta.description,
    images: [
      {
        url: data.meta.ogImage,
        width: 1200,
        height: 630,
        alt: 'House of Voi - Provably Fair Blockchain Slots'
      }
    ],
    siteName: data.meta.siteName
  }}
  twitter={{
    cardType: 'summary_large_image',
    title: data.meta.title,
    description: data.meta.description,
    image: data.meta.twitterImage,
    imageAlt: 'House of Voi - Provably Fair Blockchain Slots'
  }}
  additionalMetaTags={[
    { name: 'keywords', content: data.meta.keywords },
    { name: 'author', content: data.meta.author },
    { name: 'robots', content: 'index, follow' },
    { name: 'theme-color', content: data.meta.themeColor }
  ]}
  jsonLd={{
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
  }}
/>

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