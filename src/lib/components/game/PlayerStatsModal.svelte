<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { X } from 'lucide-svelte';
  import PlayerStats from './PlayerStats.svelte';

  const dispatch = createEventDispatcher();

  // Props
  export let isVisible = false;
  export let playerAddress: string | null = null;

  // Modal element for focus management
  let modalElement: HTMLElement;

  // Handle escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close();
    }
  }

  // Close modal
  function close() {
    dispatch('close');
  }

  // Handle backdrop click
  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  // Format address for display
  function formatAddress(address: string): string {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  }

  // Set up event listeners
  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeydown);
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeydown);
    }
  });
</script>

{#if isVisible && playerAddress}
  <!-- Modal backdrop -->
  <div 
    class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    on:click={handleBackdropClick}
    transition:fade={{ duration: 200 }}
  >
    <!-- Modal content -->
    <div 
      bind:this={modalElement}
      class="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl"
      transition:fly={{ y: 20, duration: 300 }}
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-slate-700 bg-slate-800/50">
        <div class="flex items-center gap-3">
          <div>
            <h2 class="text-xl font-bold text-theme">Player Statistics</h2>
            <p class="text-sm text-gray-400 font-mono">{formatAddress(playerAddress)}</p>
          </div>
        </div>
        
        <button
          on:click={close}
          class="p-2 text-gray-400 hover:text-theme transition-colors"
          title="Close modal"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 max-h-[calc(90vh-120px)] overflow-y-auto">
        <PlayerStats 
          {playerAddress}
          compact={false}
          autoRefresh={false}
        />
      </div>
    </div>
  </div>
{/if}