<script lang="ts">
  import { Github, Twitter, MessageCircle } from 'lucide-svelte';
</script>

<footer class="bg-slate-900 border-t border-slate-800 py-12">
  <div class="max-w-6xl mx-auto px-4">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <!-- Brand -->
      <div>
        <h3 class="text-2xl font-bold text-theme mb-4">House of Voi</h3>
        <p class="text-gray-400 mb-4">
          The premier blockchain slot machine experience on Voi Network.
        </p>
        <div class="flex space-x-4">
          <a href="javascript:void(0)" class="text-gray-400 hover:text-theme transition-colors" aria-label="GitHub">
            <Github class="w-5 h-5" />
          </a>
          <a href="javascript:void(0)" class="text-gray-400 hover:text-theme transition-colors" aria-label="Twitter">
            <Twitter class="w-5 h-5" />
          </a>
          <a href="javascript:void(0)" class="text-gray-400 hover:text-theme transition-colors" aria-label="Discord">
            <MessageCircle class="w-5 h-5" />
          </a>
        </div>
      </div>
      
      <!-- Quick Links -->
      <div>
        <h4 class="text-lg font-semibold text-theme mb-4">Quick Links</h4>
        <ul class="space-y-2">
          <li><a href="/app" class="text-gray-400 hover:text-theme transition-colors">Play Game</a></li>
          <li><a href="javascript:void(0)" class="text-gray-400 hover:text-theme transition-colors">How to Play</a></li>
          <li><a href="javascript:void(0)" class="text-gray-400 hover:text-theme transition-colors">Fairness</a></li>
          <li><a href="javascript:void(0)" class="text-gray-400 hover:text-theme transition-colors">Support</a></li>
        </ul>
      </div>
      
      <!-- Network Info -->
      <div>
        <h4 class="text-lg font-semibold text-theme mb-4">Network</h4>
        <ul class="space-y-2">
          <li><a href="https://voi.network" class="text-gray-400 hover:text-theme transition-colors" target="_blank" rel="noopener noreferrer">Voi Network</a></li>
          <li><a href="javascript:void(0)" class="text-gray-400 hover:text-theme transition-colors">VOI Token</a></li>
          <li><a href="javascript:void(0)" class="text-gray-400 hover:text-theme transition-colors">Explorer</a></li>
          <li><a href="javascript:void(0)" class="text-gray-400 hover:text-theme transition-colors">Documentation</a></li>
        </ul>
      </div>
    </div>
    
    <div class="border-t border-slate-800 mt-8 pt-8 text-center">
      <p class="text-gray-400 text-sm">
        © {new Date().getFullYear()} House of Voi. Built on Voi Network. Play responsibly.
      </p>
      <p class="text-gray-500 text-xs mt-2">
        This is a gaming wallet for entertainment purposes only. Not for long-term storage.
      </p>
    </div>
  </div>
</footer>