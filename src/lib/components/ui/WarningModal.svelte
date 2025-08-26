<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { AlertTriangle, X } from 'lucide-svelte';

  const dispatch = createEventDispatcher<{
    dismiss: { dontShowAgain: boolean };
  }>();

  export let isVisible = false;
  export let message = '';
  export let showDontAskAgain = true;

  function handleDismiss(dontAsk = false) {
    dispatch('dismiss', { dontShowAgain: dontAsk });
  }

  function handleBackdropClick() {
    handleDismiss(false);
  }
</script>

{#if isVisible}
  <!-- Modal backdrop -->
  <div 
    class="modal-backdrop"
    on:click={handleBackdropClick}
    transition:fade={{ duration: 200 }}
    role="dialog"
    aria-labelledby="warning-modal-title"
    aria-modal="true"
  >
    <!-- Modal content -->
    <div 
      class="modal-content"
      on:click|stopPropagation
      transition:fly={{ y: 20, duration: 300, delay: 100 }}
    >
      <!-- Header -->
      <div class="modal-header">
        <div class="flex items-center gap-3">
          <AlertTriangle class="w-8 h-8 text-amber-400" />
          <h2 id="warning-modal-title" class="text-2xl font-bold text-amber-200">Important Notice</h2>
        </div>
        <button
          class="close-button"
          on:click={() => handleDismiss(false)}
          aria-label="Close warning"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="modal-body">
        <div class="warning-message">
          {message}
        </div>

        <div class="button-container">
          <button
            class="dismiss-button"
            on:click={() => handleDismiss(false)}
          >
            I Understand
          </button>
          {#if showDontAskAgain}
            <button
              class="dismiss-forever-button"
              on:click={() => handleDismiss(true)}
            >
              I Understand & Don't Show Again
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    @apply fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4;
  }

  .modal-content {
    @apply border rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden;
    background: linear-gradient(135deg, rgba(120, 53, 15, 0.95) 0%, rgba(146, 64, 14, 0.95) 100%);
    border-color: rgb(217, 119, 6);
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(217, 119, 6, 0.2);
  }

  .modal-header {
    @apply flex items-center justify-between p-6 border-b;
    border-color: rgba(217, 119, 6, 0.3);
  }

  .close-button {
    @apply p-2 rounded-lg transition-colors;
    background: rgba(0, 0, 0, 0.2);
    color: rgb(251, 191, 36);
  }

  .close-button:hover {
    background: rgba(0, 0, 0, 0.4);
    color: rgb(252, 211, 77);
  }

  .modal-body {
    @apply p-6 space-y-6;
  }

  .warning-message {
    @apply text-amber-100 text-lg leading-relaxed;
    line-height: 1.6;
  }

  .button-container {
    @apply flex flex-col sm:flex-row gap-3 justify-center;
  }

  .dismiss-button {
    @apply px-6 py-3 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-transparent;
    background: rgba(217, 119, 6, 0.8);
    color: white;
  }

  .dismiss-button:hover {
    background: rgba(217, 119, 6, 1);
  }

  .dismiss-forever-button {
    @apply px-6 py-3 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-transparent;
    background: rgba(0, 0, 0, 0.4);
    color: rgb(251, 191, 36);
    border: 1px solid rgba(217, 119, 6, 0.5);
  }

  .dismiss-forever-button:hover {
    background: rgba(0, 0, 0, 0.6);
    color: rgb(252, 211, 77);
    border-color: rgba(217, 119, 6, 0.8);
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .modal-content,
    .close-button,
    .dismiss-button,
    .dismiss-forever-button {
      transition: none !important;
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .modal-content {
      @apply border-2 border-amber-300;
    }
    
    .dismiss-button,
    .dismiss-forever-button {
      @apply border-2 border-current;
    }
  }

  /* Mobile optimizations */
  @media (max-width: 640px) {
    .modal-content {
      @apply mx-2 max-w-full;
    }
    
    .modal-header {
      @apply p-4;
    }
    
    .modal-body {
      @apply p-4;
    }
    
    .warning-message {
      @apply text-base;
    }
    
    .button-container {
      @apply flex-col;
    }
    
    .dismiss-button,
    .dismiss-forever-button {
      @apply py-4 text-base; /* Larger touch targets */
    }
  }
</style>