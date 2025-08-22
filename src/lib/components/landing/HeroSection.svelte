<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ChevronRight, Zap, Shield, Coins } from 'lucide-svelte';
  
  export let playGame: () => void;
  export let isLoaded: boolean;
</script>

<section class="relative min-h-screen flex items-center justify-center px-4 py-20">
  <!-- Animated background elements -->
  <div class="absolute inset-0 overflow-hidden">
    <div class="absolute top-1/4 left-1/4 w-2 h-2 bg-voi-400 rounded-full animate-pulse"></div>
    <div class="absolute top-3/4 right-1/4 w-1 h-1 bg-blue-400 rounded-full animate-ping"></div>
    <div class="absolute top-1/2 left-3/4 w-3 h-3 bg-voi-300 rounded-full animate-bounce"></div>
  </div>
  
  <div class="relative z-10 text-center max-w-5xl mx-auto">
    {#if isLoaded}
      <!-- Main title -->
      <div
        in:fly={{ y: 30, duration: 800, easing: cubicOut }}
        class="mb-8"
      >
        <h1 class="text-6xl md:text-8xl font-bold text-theme mb-4 leading-tight">
          House of 
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-voi-400 to-voi-600 text-glow">
            Voi
          </span>
        </h1>
        
        <div class="flex items-center justify-center gap-4 text-lg text-gray-300 mb-2 flex-wrap">
          <div class="flex items-center gap-2">
            <Shield class="w-5 h-5 text-voi-400" />
            <span>Provably Fair</span>
          </div>
          <div class="w-1 h-1 bg-gray-500 rounded-full hidden sm:block"></div>
          <div class="flex items-center gap-2">
            <Zap class="w-5 h-5 text-blue-400" />
            <span>Instant Payouts</span>
          </div>
          <div class="w-1 h-1 bg-gray-500 rounded-full hidden sm:block"></div>
          <div class="flex items-center gap-2">
            <Coins class="w-5 h-5 text-yellow-400" />
            <span>Blockchain Gaming</span>
          </div>
        </div>
      </div>
      
      <!-- Tagline -->
      <div
        in:fly={{ y: 30, duration: 800, delay: 200, easing: cubicOut }}
        class="mb-12"
      >
        <p class="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
          Experience the thrill of blockchain gaming with our 
          <span class="text-voi-400 font-semibold">provably fair</span> 
          slot machine on the Voi Network. Every spin is transparent, every win is guaranteed.
        </p>
      </div>
      
      <!-- CTA Button -->
      <div
        in:fly={{ y: 30, duration: 800, delay: 400, easing: cubicOut }}
        class="mb-16"
      >
        <button
          on:click={playGame}
          class="group relative inline-flex items-center gap-3 bg-gradient-to-r from-voi-600 to-voi-700 hover:from-voi-700 hover:to-voi-800 text-theme font-bold py-6 px-10 rounded-xl text-xl transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-voi-500/25 min-h-[44px] touch-manipulation"
        >
          <span>Play in the House of Voi</span>
          <ChevronRight class="w-6 h-6 transition-transform group-hover:translate-x-1" />
          
          <!-- Button glow effect -->
          <div class="absolute inset-0 rounded-xl bg-gradient-to-r from-voi-600 to-voi-700 opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300"></div>
        </button>
        
        <p class="text-sm text-gray-400 mt-4">
          No account required • Instant wallet generation • Start with 0 VOI
        </p>
      </div>
      
      <!-- Game preview cards -->
      <div
        in:fade={{ duration: 800, delay: 600 }}
        class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto"
      >
        <div class="card p-6 backdrop-blur-sm bg-slate-800/50 border border-slate-700/50">
          <div class="text-3xl mb-3">🎰</div>
          <h3 class="text-lg font-semibold text-theme mb-2">5×3 Slot Grid</h3>
          <p class="text-gray-400 text-sm">Classic slot machine with 5 reels and 3 rows</p>
        </div>
        
        <div class="card p-6 backdrop-blur-sm bg-slate-800/50 border border-slate-700/50">
          <div class="text-3xl mb-3">📈</div>
          <h3 class="text-lg font-semibold text-theme mb-2">20 Paylines</h3>
          <p class="text-gray-400 text-sm">Multiple ways to win with up to 20 paylines</p>
        </div>
        
        <div class="card p-6 backdrop-blur-sm bg-slate-800/50 border border-slate-700/50">
          <div class="text-3xl mb-3">⚡</div>
          <h3 class="text-lg font-semibold text-theme mb-2">Instant Claims</h3>
          <p class="text-gray-400 text-sm">Claim your winnings instantly on the blockchain</p>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .text-glow {
    text-shadow: 0 0 20px rgba(16, 185, 129, 0.5);
  }
</style>