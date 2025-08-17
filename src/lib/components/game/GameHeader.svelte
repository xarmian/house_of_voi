<script lang="ts">
  import { Zap, Trophy, Info } from 'lucide-svelte';
  import { gameStore } from '$lib/stores/game';
  
  let showPaytable = false;
  
  function togglePaytable() {
    showPaytable = !showPaytable;
  }
</script>

<div class="game-header mb-6">
  <!-- Main Title -->
  <div class="text-center">
    <h1 class="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-voi-400 to-blue-400 mb-2">
      House of Voi
    </h1>
    <p class="text-gray-400 text-lg">Blockchain Slot Machine</p>
  </div>
  
  <!-- Paytable Modal -->
  {#if showPaytable}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div class="card max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-xl font-semibold text-white">Paytable</h3>
            <button
              on:click={() => showPaytable = false}
              class="text-gray-400 hover:text-white"
            >
              ×
            </button>
          </div>
          
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <!-- Symbol A -->
              <div class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                <div class="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span class="text-white font-bold">A</span>
                </div>
                <div>
                  <p class="text-white font-medium">Diamond</p>
                  <p class="text-sm text-gray-400">3: 50x | 4: 200x | 5: 1000x</p>
                </div>
              </div>
              
              <!-- Symbol B -->
              <div class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                <div class="w-12 h-12 bg-yellow-600 rounded-lg flex items-center justify-center">
                  <span class="text-white font-bold">B</span>
                </div>
                <div>
                  <p class="text-white font-medium">Gold</p>
                  <p class="text-sm text-gray-400">3: 20x | 4: 100x | 5: 500x</p>
                </div>
              </div>
              
              <!-- Symbol C -->
              <div class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                <div class="w-12 h-12 bg-gray-600 rounded-lg flex items-center justify-center">
                  <span class="text-white font-bold">C</span>
                </div>
                <div>
                  <p class="text-white font-medium">Silver</p>
                  <p class="text-sm text-gray-400">3: 10x | 4: 50x | 5: 200x</p>
                </div>
              </div>
              
              <!-- Symbol D -->
              <div class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                <div class="w-12 h-12 bg-orange-800 rounded-lg flex items-center justify-center">
                  <span class="text-white font-bold">D</span>
                </div>
                <div>
                  <p class="text-white font-medium">Bronze</p>
                  <p class="text-sm text-gray-400">3: 5x | 4: 20x | 5: 100x</p>
                </div>
              </div>
            </div>
            
            <div class="border-t border-slate-700 pt-4">
              <h4 class="text-white font-medium mb-2">How to Win</h4>
              <ul class="text-sm text-gray-400 space-y-1">
                <li>• Match 3 or more identical symbols on a payline</li>
                <li>• Symbols must be consecutive from left to right</li>
                <li>• Higher value symbols pay more</li>
                <li>• Activate more paylines for more chances to win</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>