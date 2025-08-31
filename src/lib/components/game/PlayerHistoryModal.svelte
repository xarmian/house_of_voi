<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { X } from 'lucide-svelte';
  import PlayerHistory from './PlayerHistory.svelte';

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

  // Handle events from PlayerHistory component
  function handleCopied(event: CustomEvent) {
    // Could show toast notification here
    console.log('Copied:', event.detail);
  }

  function handleExported(event: CustomEvent) {
    // Could show success notification here
    console.log('Exported:', event.detail);
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

{#if isVisible}
  <!-- Modal backdrop -->
  <div 
    class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    on:click={handleBackdropClick}
    transition:fade={{ duration: 200 }}
  >
    <!-- Modal content -->
    <div 
      bind:this={modalElement}
      class="bg-surface-primary rounded-xl border border-surface-border w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl"
      transition:fly={{ y: 20, duration: 300 }}
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-surface-border bg-surface-primary/50">
        <div class="flex items-center gap-3">
          <div>
            <h2 class="text-xl font-bold text-theme">Playing History</h2>
            {#if playerAddress}
              <p class="text-sm text-gray-400 font-mono">{formatAddress(playerAddress)}</p>
            {:else}
              <p class="text-sm text-gray-400">Your complete playing history</p>
            {/if}
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
      <div class="max-h-[calc(90vh-120px)] overflow-hidden">
        <PlayerHistory 
          {playerAddress}
          compact={false}
          pageSize={50}
          hideHeader={true}
          on:copied={handleCopied}
          on:exported={handleExported}
        />
      </div>
    </div>
  </div>
{/if}

<style>
  /* Override PlayerHistory styles for modal */
  :global(.player-history-container) {
    @apply border-none rounded-none bg-transparent;
  }

  :global(.history-header) {
    @apply border-none bg-transparent pt-0;
  }
</style>