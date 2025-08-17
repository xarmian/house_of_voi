<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { Shield, Eye, Zap, Coins, Users, Award } from 'lucide-svelte';
  
  let sectionVisible = false;
  let sectionElement: HTMLElement;
  
  onMount(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          sectionVisible = true;
        }
      },
      { threshold: 0.2 }
    );
    
    if (sectionElement) {
      observer.observe(sectionElement);
    }
    
    return () => observer.disconnect();
  });
  
  const features = [
    {
      icon: Shield,
      title: 'Provably Fair',
      description: 'Every spin outcome is verifiable on the blockchain. No hidden algorithms or manipulation.',
      color: 'text-voi-400'
    },
    {
      icon: Eye,
      title: 'Transparent',
      description: 'All game logic is open source. See exactly how wins and losses are determined.',
      color: 'text-blue-400'
    },
    {
      icon: Zap,
      title: 'Instant Payouts',
      description: 'Winnings are paid out immediately through smart contracts. No delays or approval processes.',
      color: 'text-yellow-400'
    },
    {
      icon: Coins,
      title: 'VOI Powered',
      description: 'Play with VOI tokens on the fast and efficient Voi Network blockchain.',
      color: 'text-green-400'
    },
    {
      icon: Users,
      title: 'No Registration',
      description: 'Start playing immediately with an auto-generated gaming wallet. No personal information required.',
      color: 'text-purple-400'
    },
    {
      icon: Award,
      title: 'High Payouts',
      description: 'Competitive payout rates up to 1000x your bet with our premium symbol combinations.',
      color: 'text-red-400'
    }
  ];
</script>

<section 
  bind:this={sectionElement}
  class="py-20 bg-slate-900/50"
>
  <div class="max-w-7xl mx-auto px-4">
    {#if sectionVisible}
      <div
        in:fly={{ y: 30, duration: 600 }}
        class="text-center mb-16"
      >
        <h2 class="text-4xl md:text-5xl font-bold text-white mb-6">
          Why Choose House of Voi?
        </h2>
        <p class="text-xl text-gray-400 max-w-3xl mx-auto">
          Experience the future of online gaming with blockchain technology that puts fairness and transparency first.
        </p>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {#each features as feature, index}
          <div
            in:fly={{ y: 30, duration: 600, delay: index * 100 }}
            class="card p-8 hover:transform hover:scale-105 transition-all duration-300 group"
          >
            <div class="flex items-center mb-4">
              <div class="p-3 rounded-lg bg-slate-700/50 mr-4">
                <svelte:component this={feature.icon} class="w-6 h-6 {feature.color}" />
              </div>
              <h3 class="text-xl font-semibold text-white">{feature.title}</h3>
            </div>
            <p class="text-gray-400 leading-relaxed">
              {feature.description}
            </p>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>