<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { X, Grid3x3 } from 'lucide-svelte';
  import SpinDetails from '$lib/components/game/SpinDetails.svelte';
  import type { QueuedSpin } from '$lib/types/queue';
  import type { PlayerSpin } from '$lib/types/hovStats';

  // Props
  export let isVisible = false;
  export let spin: QueuedSpin | PlayerSpin | null = null;

  const dispatch = createEventDispatcher();


  function closeModal() {
    dispatch('close');
  }
</script>

{#if isVisible}
  <div class="modal-backdrop" on:click={closeModal} transition:fade={{ duration: 200 }}>
    <div class="modal-content" on:click|stopPropagation transition:fly={{ y: 20, duration: 300 }}>
      <!-- Modal Header -->
      <div class="modal-header">
        <h3 class="modal-title">
          <Grid3x3 class="w-5 h-5 mr-2" />
          Spin Details & Verification
        </h3>
        <button class="modal-close" on:click={closeModal}>
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body">
        <SpinDetails {spin} isStandalone={false} />
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    @apply fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4;
  }

  .modal-content {
    @apply bg-slate-800 border border-slate-700 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden;
  }

  .modal-header {
    @apply flex items-center justify-between p-4 border-b border-slate-700;
  }

  .modal-title {
    @apply text-lg font-semibold text-theme flex items-center;
  }

  .modal-close {
    @apply p-1 rounded-lg hover:bg-slate-700 text-theme-text opacity-70 hover:opacity-100 transition-colors;
  }

  .modal-body {
    @apply p-6 max-h-[calc(90vh-120px)] overflow-y-auto;
  }

  /* Custom scrollbar for modal */
  .modal-body::-webkit-scrollbar {
    width: 4px;
  }
  
  .modal-body::-webkit-scrollbar-track {
    background: rgba(51, 65, 85, 0.3);
  }
  
  .modal-body::-webkit-scrollbar-thumb {
    background: rgba(16, 185, 129, 0.5);
    border-radius: 2px;
  }
  
  .modal-body::-webkit-scrollbar-thumb:hover {
    background: rgba(16, 185, 129, 0.7);
  }
</style>