<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { Wallet, Play, Trophy } from 'lucide-svelte';
  
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
  
  const steps = [
    {
      icon: Wallet,
      number: '01',
      title: 'Get Your Wallet',
      description: 'Click play and we instantly generate a secure gaming wallet for you. No signup required.',
      color: 'from-voi-500 to-voi-600'
    },
    {
      icon: Play,
      number: '02',
      title: 'Add Funds & Spin',
      description: 'Add VOI to your wallet and start spinning. Choose your bet amount and number of paylines.',
      color: 'from-blue-500 to-blue-600'
    },
    {
      icon: Trophy,
      number: '03',
      title: 'Claim Winnings',
      description: 'When you win, your payout is automatically calculated and ready to claim instantly.',
      color: 'from-yellow-500 to-yellow-600'
    }
  ];
</script>

<section 
  bind:this={sectionElement}
  class="py-20"
>
  <div class="max-w-6xl mx-auto px-4">
    {#if sectionVisible}
      <div
        in:fly={{ y: 30, duration: 600 }}
        class="text-center mb-16"
      >
        <h2 class="text-4xl md:text-5xl font-bold text-white mb-6">
          How It Works
        </h2>
        <p class="text-xl text-gray-400 max-w-2xl mx-auto">
          Getting started is simple. Follow these three steps to begin your blockchain gaming journey.
        </p>
      </div>
      
      <div class="relative">
        <!-- Connection lines -->
        <div class="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-slate-600 to-transparent transform -translate-y-1/2 z-0"></div>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-12 relative z-10">
          {#each steps as step, index}
            <div
              in:fly={{ y: 30, duration: 600, delay: index * 200 }}
              class="text-center"
            >
              <!-- Number badge -->
              <div class="relative inline-flex items-center justify-center w-20 h-20 mb-6">
                <div class="absolute inset-0 bg-gradient-to-r {step.color} rounded-full"></div>
                <div class="absolute inset-1 bg-slate-900 rounded-full flex items-center justify-center">
                  <span class="text-2xl font-bold text-white">{step.number}</span>
                </div>
              </div>
              
              <!-- Icon -->
              <div class="mb-6">
                <div class="inline-flex items-center justify-center w-16 h-16 bg-slate-800 rounded-2xl">
                  <svelte:component this={step.icon} class="w-8 h-8 text-white" />
                </div>
              </div>
              
              <!-- Content -->
              <h3 class="text-2xl font-bold text-white mb-4">{step.title}</h3>
              <p class="text-gray-400 leading-relaxed max-w-xs mx-auto">
                {step.description}
              </p>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</section>