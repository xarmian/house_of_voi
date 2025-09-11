<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import SpinDetails from '$lib/components/game/SpinDetails.svelte';
  import { formatVOI } from '$lib/constants/betting';
  import { Home, ArrowLeft, ExternalLink, Play } from 'lucide-svelte';
  import { contractSelectionStore, initializeMultiContractStores, multiContractStore } from '$lib/stores/multiContract';

  export let data;

  $: replayData = data.replayData;
  $: error = data.error;
  
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

  // Create spin object for SpinDetails from replay data or bet key data
  $: detailSpin = (() => {
    if (replayData) {
      return {
        totalBet: replayData.betAmount || 0,
        selectedPaylines: replayData.paylines || 20,
        winnings: replayData.winnings || 0,
        timestamp: replayData.timestamp || Date.now(),
        txId: replayData.txId || txId,
        contractId: replayData.contractId,
        betKey: betKey, // Pass the bet key we already have
        claimRound: claimRound, // Pass the claim round we already have
        outcome: replayData.outcome // Pass the outcome grid
      };
    } else if (betKey && claimRound) {
      // For bet key mode, create a minimal spin object
      return {
        totalBet: initialBetAmount || 0,
        selectedPaylines: initialPaylines || 20,
        winnings: 0, // Will be computed by SpinDetails component
        timestamp: initialTimestamp,
        txId: txId,
        contractId: contractId,
        betKey: betKey,
        claimRound: claimRound,
        outcome: null // Will be computed by SpinDetails component
      };
    }
    return null;
  })();

  function goHome() {
    goto('/');
  }

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      goHome();
    }
  }

  function getGameUrl(): string {
    // Navigate to specific machine if contractId is available, otherwise to main app page
    if (replayData?.contractId) {
      const contract = multiContractStore.getContract(replayData.contractId);
      if (contract) {
        return `/app/${contract.slotMachineAppId}`;
      }
    } else if (contractId) {
      const contract = multiContractStore.getContract(contractId);
      if (contract) {
        return `/app/${contract.slotMachineAppId}`;
      }
    }
    return '/app';
  }

  function viewReplay() {
    // Generate replay URL with same parameters
    const currentUrl = new URL(window.location.href);
    const replayUrl = new URL('/replay', window.location.origin);
    
    // Copy all search parameters to replay URL
    currentUrl.searchParams.forEach((value, key) => {
      replayUrl.searchParams.set(key, value);
    });
    
    goto(replayUrl.pathname + replayUrl.search);
  }

  onMount(async () => {
    // Initialize multi-contract stores
    await initializeMultiContractStores();
    // Import Algorand service once for use below
    const { algorandService } = await import('$lib/services/algorand');

    // Priority 1: explicit slotAppId param in URL
    if (slotAppId && slotAppId > 0) {
      // Prefer direct app id when provided for compact links
      algorandService.updateAppId(slotAppId);
    } else if (contractId) {
      try {
        await contractSelectionStore.selectContract(contractId);
      } catch (error) {
        console.warn('Failed to select contract for details (cid):', contractId, error);
      }
    } else if (replayData?.contractId) {
      // Priority 2: contract from legacy replay data
      try {
        await contractSelectionStore.selectContract(replayData.contractId);
      } catch (error) {
        console.warn('Failed to select contract for details (legacy):', replayData.contractId, error);
      }
    }
  });
</script>

<svelte:head>
  <title>{data.pageMetaTags?.title || 'Spin Details - House of Voi'}</title>
  <meta name="description" content={data.pageMetaTags?.description || 'View detailed spin verification and analysis'} />
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content={$page.url.toString()} />
  <meta property="og:title" content={data.pageMetaTags?.openGraph?.title || 'Spin Details - House of Voi'} />
  <meta property="og:description" content={data.pageMetaTags?.openGraph?.description || 'View detailed spin verification and analysis'} />
  <meta property="og:image" content={data.pageMetaTags?.openGraph?.images?.[0]?.url || 'https://house-of-voi.vercel.app/og-image-replay.png'} />

  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image" />
  <meta property="twitter:url" content={$page.url.toString()} />
  <meta property="twitter:title" content={data.pageMetaTags?.twitter?.title || 'Spin Details - House of Voi'} />
  <meta property="twitter:description" content={data.pageMetaTags?.twitter?.description || 'View detailed spin verification and analysis'} />
  <meta property="twitter:image" content={data.pageMetaTags?.twitter?.image || 'https://house-of-voi.vercel.app/og-image-replay.png'} />
</svelte:head>

<div class="detail-page">
  <!-- Header -->
  <div class="page-header">
    <div class="header-content">
      <div class="header-left">
        <button on:click={goBack} class="nav-button" title="Go back">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <div class="header-info">
          <h1 class="page-title">Spin Details & Verification</h1>
          {#if replayData}
            <p class="page-subtitle">
              {formatVOI(replayData.betAmount)} VOI bet • {replayData.paylines} paylines
              {#if replayData.winnings > 0}
                • Won {formatVOI(replayData.winnings)} VOI 🎉
              {/if}
            </p>
          {:else if detailSpin}
            <p class="page-subtitle">
              {initialBetAmount ? formatVOI(initialBetAmount) : '—'} VOI bet • {initialPaylines || '—'} paylines
            </p>
          {/if}
        </div>
      </div>
      
      <div class="header-actions">
        <button on:click={viewReplay} class="action-btn secondary">
          <ExternalLink class="w-4 h-4" />
          View Replay
        </button>
        <button on:click={() => goto(getGameUrl())} class="action-btn primary">
          <Play class="w-4 h-4" />
          Play Game
        </button>
        <button on:click={goHome} class="nav-button" title="Go home">
          <Home class="w-5 h-5" />
        </button>
      </div>
    </div>
  </div>

  <!-- Main Content -->
  <div class="page-content">
    {#if error}
      <div class="error-container">
        <div class="error-content">
          <h2 class="error-title">Unable to Load Spin Details</h2>
          <p class="error-message">{error}</p>
          <div class="error-actions">
            <button on:click={goBack} class="action-btn secondary">
              <ArrowLeft class="w-4 h-4" />
              Go Back
            </button>
            <button on:click={goHome} class="action-btn primary">
              <Home class="w-4 h-4" />
              Go Home
            </button>
          </div>
        </div>
      </div>
    {:else if detailSpin}
      <SpinDetails spin={detailSpin} isStandalone={true} />
    {:else}
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <p class="loading-text">Loading spin details...</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .detail-page {
    @apply min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900;
  }

  .page-header {
    @apply bg-slate-800/80 backdrop-blur border-b border-slate-700/50 sticky top-0 z-40;
  }

  .header-content {
    @apply container mx-auto px-4 py-4 flex items-center justify-between;
    max-width: 1200px;
  }

  .header-left {
    @apply flex items-center gap-4;
  }

  .header-info {
    @apply flex flex-col;
  }

  .page-title {
    @apply text-lg sm:text-xl font-bold text-theme flex items-center gap-2;
  }

  .page-subtitle {
    @apply text-sm text-theme-text opacity-70 mt-1;
  }

  .header-actions {
    @apply flex items-center gap-3;
  }

  .nav-button {
    @apply p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-theme-text hover:text-theme transition-colors;
  }

  .action-btn {
    @apply px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm;
  }

  .action-btn.primary {
    @apply bg-voi-600 hover:bg-voi-700 text-white;
  }

  .action-btn.secondary {
    @apply bg-slate-700 hover:bg-slate-600 text-theme;
  }

  .page-content {
    @apply container mx-auto px-4 py-8;
    max-width: 1200px;
  }

  .error-container {
    @apply flex items-center justify-center min-h-[50vh];
  }

  .error-content {
    @apply text-center max-w-md;
  }

  .error-title {
    @apply text-xl font-semibold text-theme mb-4;
  }

  .error-message {
    @apply text-theme-text opacity-70 mb-6;
  }

  .error-actions {
    @apply flex justify-center gap-4;
  }

  .loading-container {
    @apply flex flex-col items-center justify-center min-h-[50vh] text-center;
  }

  .loading-spinner {
    @apply w-8 h-8 border-2 border-voi-600 border-t-transparent rounded-full animate-spin mb-4;
  }

  .loading-text {
    @apply text-theme-text opacity-70;
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .header-content {
      @apply flex-col gap-4;
    }

    .header-left {
      @apply w-full justify-between;
    }

    .header-actions {
      @apply w-full justify-center;
    }

    .action-btn {
      @apply px-3 py-2 text-xs;
    }

    .nav-button {
      @apply p-2;
    }
  }
</style>