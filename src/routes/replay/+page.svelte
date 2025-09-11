<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import SlotMachine from '$lib/components/game/SlotMachine.svelte';
  import { formatVOI } from '$lib/constants/betting';
  import { bettingStore } from '$lib/stores/betting';
  import { Play, Home, ExternalLink, RotateCcw, Grid3x3 } from 'lucide-svelte';
  import WarningModal from '$lib/components/ui/WarningModal.svelte';
  import WarningBanner from '$lib/components/ui/WarningBanner.svelte';
  import SpinDetailsModal from '$lib/components/modals/SpinDetailsModal.svelte';
  import { contractSelectionStore, initializeMultiContractStores, multiContractStore } from '$lib/stores/multiContract';

  export let data;

  $: replayData = data.replayData;
  $: error = data.error;
  $: isLoading = false; // Server-side loading is already complete
  
  // New bet-key mode inputs passed from server
  const betKey: string | null = data.betKey || null;
  const claimRound: number | null = data.claimRound || null;
  const txId: string | null = data.txId || null;
  const contractId: string | null = data.contractId || null;
  const initialBetAmount: number | null = data.initialBetAmount || null;
  const initialPaylines: number | null = data.initialPaylines || null;
  const initialTimestamp: number = data.initialTimestamp || Date.now();
  const slotAppId: number | null = data.slotAppId || null;
  
  // Helper: convert grid string (15 chars) to 5x3 outcome grid
  function gridStringToOutcome(gridString: string): string[][] {
    const grid: string[][] = [];
    for (let col = 0; col < 5; col++) {
      grid[col] = [];
      for (let row = 0; row < 3; row++) {
        const index = col * 3 + row;
        grid[col][row] = gridString[index];
      }
    }
    return grid;
  }

  async function computeWinningsFromGrid(outcome: string[][], totalBetAtomic: number, selectedPaylines: number): Promise<number> {
    try {
      const { algorandService } = await import('$lib/services/algorand');
      const paylines = await algorandService.getPaylines('');
      const betPerLine = selectedPaylines > 0 ? Math.floor(totalBetAtomic / selectedPaylines) : 0;
      let winnings = 0;

      // Flatten grid to string in column-major order
      let gridString = '';
      for (let col = 0; col < 5; col++) {
        for (let row = 0; row < 3; row++) {
          gridString += outcome[col][row];
        }
      }

      for (let line = 0; line < Math.min(selectedPaylines, paylines.length); line++) {
        const payline = paylines[line];
        const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
        for (let col = 0; col < 5; col++) {
          const pos = col * 3 + payline[col];
          const sym = gridString[pos];
          if (counts[sym] !== undefined) counts[sym]++;
        }
        let bestSymbol = '';
        let bestCount = 0;
        for (const s of ['A','B','C','D']) {
          if (counts[s] >= 3 && counts[s] > bestCount) { bestSymbol = s; bestCount = counts[s]; }
        }
        if (bestCount >= 3) {
          const mult = await algorandService.getPayoutMultiplier(bestSymbol, bestCount, '');
          winnings += betPerLine * mult;
        }
      }
      return winnings;
    } catch (e) {
      console.warn('Failed to compute winnings from grid:', e);
      return 0;
    }
  }
  
  // Warning modal state
  let showWarningModal = false;
  const warningMessage = "This is an experimental prototype deployed on Voi Mainnet. It is provided as-is, with no guarantees of reliability, availability, or accuracy. Outcomes are random and for entertainment purposes only. Do not expect consistent performance, returns, or support. Play at your own risk.";

  // Spin details modal state
  let showSpinDetailsModal = false;

  function openSpinDetails() {
    showSpinDetailsModal = true;
  }


  // Create spin object for SpinDetailsModal from replay data
  $: replaySpin = replayData ? {
    totalBet: replayData.betAmount || 0,
    selectedPaylines: replayData.paylines || 20,
    winnings: replayData.winnings || 0,
    timestamp: replayData.timestamp || Date.now(),
    txId: replayData.txId || txId,
    contractId: replayData.contractId,
    betKey: betKey, // Pass the bet key we already have
    claimRound: claimRound, // Pass the claim round we already have
    outcome: replayData.outcome // Pass the outcome grid
  } : null;

  function goHome() {
    goto('/');
  }

  function getGameUrl(): string {
    // Navigate to specific machine if contractId is available, otherwise to main app page
    if (replayData?.contractId) {
      const contract = multiContractStore.getContract(replayData.contractId);
      if (contract) {
        return `/app/${contract.slotMachineAppId}`;
      }
    }
    return '/app';
  }

  function playGame() {
    // Check if user has already dismissed the warning
    const warningDismissed = localStorage.getItem('hov-warning-dismissed');
    if (!warningDismissed || warningDismissed !== 'true') {
      // Show warning modal before navigating
      showWarningModal = true;
    } else {
      // Direct navigation if warning already dismissed
      goto(getGameUrl());
    }
  }
  
  function handleWarningDismiss(event: CustomEvent<{ dontShowAgain: boolean }>) {
    const { dontShowAgain } = event.detail;
    showWarningModal = false;
    
    if (dontShowAgain) {
      localStorage.setItem('hov-warning-dismissed', 'true');
    }
    
    // Navigate to game after dismissing warning
    goto(getGameUrl());
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

  onMount(async () => {
    // Initialize multi-contract stores
    await initializeMultiContractStores();
    // Import Algorand service once for use below
    const { algorandService } = await import('$lib/services/algorand');

    // Priority 1: explicit contractId param in URL
    if (slotAppId && slotAppId > 0) {
      // Prefer direct app id when provided for compact links
      algorandService.updateAppId(slotAppId);
    } else if (contractId) {
      try {
        await contractSelectionStore.selectContract(contractId);
      } catch (error) {
        console.warn('Failed to select contract for replay (cid):', contractId, error);
      }
    } else if (replayData?.contractId) {
      // Priority 2: contract from legacy replay data
      try {
        await contractSelectionStore.selectContract(replayData.contractId);
      } catch (error) {
        console.warn('Failed to select contract for replay:', replayData.contractId, error);
      }
    } else {
      // Priority 3: default contract
      const defaultContract = multiContractStore.getDefaultContract();
      if (defaultContract) {
        await contractSelectionStore.selectContract(defaultContract.id);
      }
    }

    // New: compute replay data client-side from bet key + claim round
    if (!replayData && betKey) {
      try {
        isLoading = true;

        let round = claimRound;
        if (!round && txId) {
          // Derive claim round as confirmed round + 1
          try {
            const client = algorandService.getClient();
            const pendingInfo = await client.pendingTransactionInformation(txId).do();
            const confirmed = pendingInfo['confirmed-round'] || 0;
            if (confirmed > 0) round = confirmed + 1;
          } catch (e) {
            console.warn('Failed to derive round from txId; require claim round param');
          }
        }

        if (!round) {
          error = 'Missing claim round (cr). Provide cr=round or tx=txId in URL.';
          isLoading = false;
          return;
        }

        // Deterministically compute the grid from bet key + claim round
        const userAddress = '';
        // Ensure AlgorandService is on the selected app id
        if (slotAppId && slotAppId > 0) {
          algorandService.updateAppId(slotAppId);
        } else if (contractId) {
          const contract = multiContractStore.getContract(contractId);
          if (contract?.slotMachineAppId) {
            algorandService.updateAppId(contract.slotMachineAppId);
          }
        }
        const gridString = await algorandService.getBetGridDeterministic(betKey, round, userAddress);
        const outcome = gridStringToOutcome(gridString);
        const paylinesCount = initialPaylines || 20;
        const betAtomic = initialBetAmount || 0;
        const winnings = await computeWinningsFromGrid(outcome, betAtomic, paylinesCount);

        // Assemble replay data using computed winnings
        const computedReplay = {
          outcome,
          winnings,
          betAmount: betAtomic,
          paylines: paylinesCount,
          timestamp: initialTimestamp,
          contractId: contractId || multiContractStore.getSelectedContractId?.() || undefined,
          txId: txId || undefined
        };
        replayData = computedReplay;
        error = null;
      } catch (e) {
        console.error('Failed to compute replay from bet key:', e);
        error = 'Failed to compute replay from bet key';
      } finally {
        isLoading = false;
      }
    }
  });
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
      <WarningBanner />
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
        <button on:click={openSpinDetails} class="details-button">
          <Grid3x3 class="w-4 h-4" />
          View Details
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

<!-- Spin Details Modal -->
<SpinDetailsModal 
  isVisible={showSpinDetailsModal}
  spin={replaySpin}
  on:close={() => showSpinDetailsModal = false}
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
    max-width: 820px;
    margin: 10px auto;
  }

  .replay-actions {
    @apply flex flex-wrap items-center justify-center gap-4;
  }

  .play-button {
    @apply bg-voi-600 hover:bg-voi-700 text-theme font-semibold px-6 py-3 rounded-lg transition-colors flex items-center gap-2;
  }

  .details-button {
    @apply bg-slate-600 hover:bg-slate-700 text-theme font-medium px-4 py-3 rounded-lg transition-colors flex items-center gap-2;
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
    .details-button,
    .share-button,
    .home-button {
      @apply w-full justify-center;
    }
  }
</style>
