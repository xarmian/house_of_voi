<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import SlotMachine from '$lib/components/game/SlotMachine.svelte';
  import { formatVOI } from '$lib/constants/betting';
  import { bettingStore } from '$lib/stores/betting';
  import { Play, Home, ExternalLink, RotateCcw } from 'lucide-svelte';
  import WarningModal from '$lib/components/ui/WarningModal.svelte';

  export let data;

  $: replayData = data.replayData;
  $: error = data.error;
  $: isLoading = false; // Server-side loading is already complete
  
  // Warning modal state
  let showWarningModal = false;
  const warningMessage = "This is an experimental prototype deployed on Voi Mainnet. It is provided as-is, with no guarantees of reliability, availability, or accuracy. Outcomes are random and for entertainment purposes only. Do not expect consistent performance, returns, or support. Play at your own risk.";

  function goHome() {
    goto('/');
  }

  function playGame() {
    // Check if user has already dismissed the warning
    const warningDismissed = localStorage.getItem('hov-warning-dismissed');
    if (!warningDismissed || warningDismissed !== 'true') {
      // Show warning modal before navigating
      showWarningModal = true;
    } else {
      // Direct navigation if warning already dismissed
      goto('/app');
    }
  }
  
  function handleWarningDismiss(event: CustomEvent<{ dontShowAgain: boolean }>) {
    const { dontShowAgain } = event.detail;
    showWarningModal = false;
    
    if (dontShowAgain) {
      localStorage.setItem('hov-warning-dismissed', 'true');
    }
    
    // Navigate to game after dismissing warning
    goto('/app');
  }

  function replayAgain() {
    // Trigger the replay again by dispatching a custom event to the SlotMachine
    const slotMachineContainer = document.querySelector('.slot-machine-container');
    if (slotMachineContainer && replayData) {
      const replayEvent = new CustomEvent('replay-spin', {
        detail: {
          spin: {
            id: `manual-replay-${Date.now()}`,
            ...replayData
          },
          outcome: replayData.outcome,
          winnings: replayData.winnings,
          betAmount: replayData.betAmount
        }
      });
      document.dispatchEvent(replayEvent);
    }
  }

  function shareReplay() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: 'House of Voi - Spin Replay',
        text: `Check out this spin replay! ${replayData?.winnings && replayData.winnings > 0 ? `Won ${formatVOI(replayData.winnings)} VOI!` : 'See the outcome!'}`,
        url: window.location.href
      }).catch(() => {
        // Fallback to clipboard
        navigator.clipboard.writeText(window.location.href);
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }
</script>


<main class="replay-page">
  {#if isLoading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading replay...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <h2>Unable to Load Replay</h2>
      <p class="error-message">{error}</p>
      <div class="error-actions">
        <button on:click={goHome} class="home-button">
          <Home class="w-4 h-4" />
          Back to Home
        </button>
      </div>
    </div>
  {:else if replayData}
    <div class="replay-container">
      <!-- Header -->
      <div class="replay-header">
        <div class="replay-title">
          <h1>Spin Replay</h1>
          <div class="replay-badge">REPLAY MODE</div>
        </div>
        <div class="replay-details">
          <div class="detail">
            <span class="label">Bet:</span>
            <span class="value">{formatVOI(replayData.betAmount)} VOI</span>
          </div>
          <div class="detail">
            <span class="label">Paylines:</span>
            <span class="value">{replayData.paylines}</span>
          </div>
          <div class="detail">
            <span class="label">Result:</span>
            <span class="value" class:win={replayData.winnings > 0} class:loss={replayData.winnings === 0}>
              {replayData.winnings > 0 ? `+${formatVOI(replayData.winnings)} VOI` : 'Loss'}
            </span>
          </div>
          <div class="detail">
            <span class="label">Date:</span>
            <span class="value">{new Date(replayData.timestamp).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <!-- Slot Machine -->
      <div class="slot-machine-container">
        <SlotMachine initialReplayData={replayData} />
      </div>

      <!-- Actions -->
      <div class="replay-actions">
        <button on:click={replayAgain} class="play-button">
          <RotateCcw class="w-4 h-4" />
          Replay
        </button>
        <button on:click={playGame} class="play-button">
          <Play class="w-4 h-4" />
          Play This Game
        </button>
        <button on:click={shareReplay} class="share-button">
          <ExternalLink class="w-4 h-4" />
          Share Replay
        </button>
        <button on:click={goHome} class="home-button">
          <Home class="w-4 h-4" />
          Home
        </button>
      </div>
    </div>
  {/if}
</main>

<!-- Warning Modal for "Play This Game" action -->
<WarningModal 
  isVisible={showWarningModal}
  message={warningMessage}
  showDontAskAgain={true}
  on:dismiss={handleWarningDismiss}
/>

<style>
  .replay-page {
    @apply min-h-screen bg-gradient-to-br from-voi-900 via-slate-900 to-slate-800 p-4;
  }

  .loading-state {
    @apply flex flex-col items-center justify-center min-h-screen gap-4;
  }

  .loading-spinner {
    @apply w-8 h-8 border-4 border-voi-600 border-t-transparent rounded-full animate-spin;
  }

  .loading-state p {
    @apply text-theme-text opacity-70;
  }

  .error-state {
    @apply flex flex-col items-center justify-center min-h-screen gap-6 text-center max-w-md mx-auto;
  }

  .error-icon {
    @apply text-6xl;
  }

  .error-state h2 {
    @apply text-2xl font-bold text-theme mb-2;
  }

  .error-message {
    @apply text-theme-text opacity-70 mb-4;
  }

  .error-actions {
    @apply flex gap-4;
  }

  .replay-container {
    @apply max-w-4xl mx-auto;
  }

  .replay-header {
    @apply bg-surface-primary rounded-lg shadow-lg border border-surface-border p-6 mb-6;
  }

  .replay-title {
    @apply flex items-center justify-between mb-4;
  }

  .replay-title h1 {
    @apply text-2xl font-bold text-theme;
  }

  .replay-badge {
    @apply bg-amber-600 text-theme text-xs font-bold px-3 py-1 rounded-full;
  }

  .replay-details {
    @apply grid grid-cols-2 md:grid-cols-4 gap-4;
  }

  .detail {
    @apply flex flex-col gap-1;
  }

  .detail .label {
    @apply text-xs text-theme-text opacity-70 font-medium;
  }

  .detail .value {
    @apply text-sm text-theme font-semibold;
  }

  .detail .value.win {
    @apply text-green-400;
  }

  .detail .value.loss {
    @apply text-red-400;
  }

  .slot-machine-container {
    @apply mb-6;
  }

  .replay-actions {
    @apply flex flex-wrap items-center justify-center gap-4;
  }

  .play-button {
    @apply bg-voi-600 hover:bg-voi-700 text-theme font-semibold px-6 py-3 rounded-lg transition-colors flex items-center gap-2;
  }

  .share-button {
    @apply bg-surface-secondary hover:bg-surface-hover text-theme font-medium px-4 py-3 rounded-lg transition-colors flex items-center gap-2;
  }

  .home-button {
    @apply bg-surface-secondary hover:bg-surface-hover text-theme font-medium px-4 py-3 rounded-lg transition-colors flex items-center gap-2;
  }

  @media (max-width: 768px) {
    .replay-details {
      @apply grid-cols-2;
    }
    
    .replay-actions {
      @apply flex-col w-full;
    }
    
    .play-button,
    .share-button,
    .home-button {
      @apply w-full justify-center;
    }
  }
</style>