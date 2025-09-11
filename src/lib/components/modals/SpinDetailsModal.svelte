<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { 
    X, 
    ExternalLink, 
    Copy, 
    Share2, 
    Check, 
    Eye, 
    AlertTriangle, 
    Loader, 
    Grid3x3,
    TrendingUp,
    RefreshCw
  } from 'lucide-svelte';
  import { spinDetailsService, type ReconstructedSpinData } from '$lib/services/spinDetailsService';
  import { formatVOI } from '$lib/constants/betting';
  import { ensureBase32TxId, formatTxIdForDisplay } from '$lib/utils/transactionUtils';
  import { encodeReplayData, encodeBetKeyReplay } from '$lib/utils/replayEncoder';
  import { multiContractStore } from '$lib/stores/multiContract';
  import { toastStore } from '$lib/stores/toast';
  import { getSymbolColorScheme } from '$lib/utils/winLineDetection';
  import { getThemeSymbolImagePath, getSymbol } from '$lib/constants/symbols';
  import { goto } from '$app/navigation';
  import { currentTheme } from '$lib/stores/theme';
  import type { QueuedSpin } from '$lib/types/queue';
  import type { PlayerSpin } from '$lib/types/hovStats';
  import { SpinStatus } from '$lib/types/queue';

  // Props
  export let isVisible = false;
  export let spin: QueuedSpin | PlayerSpin | null = null;

  const dispatch = createEventDispatcher();

  // State
  let reconstructedData: ReconstructedSpinData | null = null;
  let isReconstruction = false;
  let copyingBetKey = false;
  let sharingReplay = false;
  let highlightedPaylineIndex: number | null = null;

  // Reactive properties
  $: if (isVisible && spin && !reconstructedData) {
    loadSpinDetails();
  }

  // Clear data when modal is closed
  $: if (!isVisible) {
    reconstructedData = null;
    isReconstruction = false;
    highlightedPaylineIndex = null;
  }

  function highlightPayline(paylineIndex: number) {
    highlightedPaylineIndex = paylineIndex;
  }

  function clearHighlight() {
    highlightedPaylineIndex = null;
  }

  async function loadSpinDetails() {
    if (!spin) return;
    
    try {
      isReconstruction = true;
      
      // If we already have bet key and outcome data, use it directly
      if ('betKey' in spin && 'claimRound' in spin && 'outcome' in spin && spin.betKey && spin.outcome) {
        // Get the actual block seed from the blockchain
        const { algorandService } = await import('$lib/services/algorand');
        const blockSeed = await algorandService.getBlockSeed(spin.claimRound);
        
        // Calculate winning paylines from the grid
        const { detectWinningPaylines } = await import('$lib/utils/winLineDetection');
        const betPerLine = spin.selectedPaylines > 0 ? Math.floor(spin.totalBet / spin.selectedPaylines) : 0;
        const winningPaylines = await detectWinningPaylines(spin.outcome, betPerLine, spin.selectedPaylines);
        
        reconstructedData = {
          originalSpin: spin,
          outcome: {
            grid: spin.outcome,
            gridString: spin.outcome.flat().join(''),
            betKey: spin.betKey,
            blockSeed: blockSeed,
            claimRound: spin.claimRound,
            winningPaylines: winningPaylines,
            totalWinnings: winningPaylines.reduce((sum, line) => sum + line.winAmount, 0),
            isVerified: true,
          },
          loading: false
        };
      } else {
        // Use the service for spins without direct data
        reconstructedData = await spinDetailsService.reconstructSpinDetails(spin);
      }
    } catch (error) {
      console.error('Failed to load spin details:', error);
      reconstructedData = {
        originalSpin: spin,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load details'
      };
    } finally {
      isReconstruction = false;
    }
  }

  function closeModal() {
    dispatch('close');
  }

  function getStatusIcon(status: SpinStatus) {
    switch (status) {
      case SpinStatus.PENDING:
      case SpinStatus.SUBMITTING:
      case SpinStatus.WAITING:
      case SpinStatus.PROCESSING:
        return Loader;
      case SpinStatus.READY_TO_CLAIM:
      case SpinStatus.CLAIMING:
      case SpinStatus.COMPLETED:
        return Check;
      case SpinStatus.FAILED:
      case SpinStatus.EXPIRED:
        return X;
      default:
        return Loader;
    }
  }

  function getStatusColor(status: SpinStatus): string {
    switch (status) {
      case SpinStatus.PENDING:
      case SpinStatus.SUBMITTING:
      case SpinStatus.WAITING:
      case SpinStatus.PROCESSING:
        return 'text-blue-400';
      case SpinStatus.READY_TO_CLAIM:
      case SpinStatus.CLAIMING:
      case SpinStatus.COMPLETED:
        return 'text-green-400';
      case SpinStatus.FAILED:
      case SpinStatus.EXPIRED:
        return 'text-red-400';
      default:
        return 'text-blue-400';
    }
  }

  function getStatusText(status: SpinStatus): string {
    switch (status) {
      case SpinStatus.PENDING:
      case SpinStatus.SUBMITTING:
        return 'Submitting';
      case SpinStatus.WAITING:
      case SpinStatus.PROCESSING:
        return 'Confirming';
      case SpinStatus.READY_TO_CLAIM:
      case SpinStatus.CLAIMING:
      case SpinStatus.COMPLETED:
        return 'Completed';
      case SpinStatus.FAILED:
      case SpinStatus.EXPIRED:
        return 'Failed';
      default:
        return 'Unknown';
    }
  }

  function getExplorerUrl(txId: string): string {
    const base32TxId = ensureBase32TxId(txId);
    return `https://block.voi.network/explorer/transaction/${base32TxId}`;
  }

  function formatTxId(txId: string): string {
    return formatTxIdForDisplay(txId, 8);
  }

  async function copyBetKey() {
    if (!reconstructedData?.outcome?.betKey) return;
    
    try {
      copyingBetKey = true;
      await navigator.clipboard.writeText(reconstructedData.outcome.betKey);
      toastStore.success('Bet key copied!', 'Bet key copied to clipboard', 2000);
    } catch (error) {
      console.error('Failed to copy bet key:', error);
      toastStore.error('Copy failed', 'Failed to copy bet key');
    } finally {
      copyingBetKey = false;
    }
  }

  async function shareReplay() {
    if (!spin || !reconstructedData?.outcome) return;
    
    try {
      sharingReplay = true;
      
      let url: string;
      const { betKey, claimRound } = reconstructedData.outcome;
      
      // Prefer bet key replay format for compact URLs
      if (betKey && claimRound) {
        let slotAppId: number | undefined = undefined;
        if ('contractId' in spin && spin.contractId) {
          const contract = multiContractStore.getContract(spin.contractId);
          if (contract?.slotMachineAppId) slotAppId = contract.slotMachineAppId;
        }
        
        const totalBet = 'totalBet' in spin ? spin.totalBet : 
                        'total_bet_amount' in spin ? Number(spin.total_bet_amount) : 0;
        const paylines = 'selectedPaylines' in spin ? spin.selectedPaylines :
                        'paylines_count' in spin ? Number(spin.paylines_count) : 20;
        
        const r = encodeBetKeyReplay({
          betKeyHex: betKey,
          claimRound,
          betAmount: totalBet,
          paylines,
          contractId: slotAppId ? undefined : ('contractId' in spin ? spin.contractId : undefined),
          slotAppId
        });
        url = `${window.location.origin}/replay?r=${encodeURIComponent(r)}`;
      } else {
        // Fallback to legacy format
        const winnings = 'winnings' in spin ? spin.winnings : 
                        'payout' in spin ? Number(spin.payout) : 0;
        const totalBet = 'totalBet' in spin ? spin.totalBet : 
                        'total_bet_amount' in spin ? Number(spin.total_bet_amount) : 0;
        const paylines = 'selectedPaylines' in spin ? spin.selectedPaylines :
                        'paylines_count' in spin ? Number(spin.paylines_count) : 20;
        const timestamp = 'timestamp' in spin ? spin.timestamp : 
                         'created_at' in spin ? spin.created_at.getTime() : Date.now();
        
        if (!reconstructedData.outcome.grid || typeof winnings !== 'number') {
          throw new Error('Insufficient data for replay link');
        }
        
        const encoded = encodeReplayData({
          outcome: reconstructedData.outcome.grid,
          winnings,
          totalBet,
          selectedPaylines: paylines,
          timestamp,
          contractId: 'contractId' in spin ? spin.contractId : undefined,
          txId: 'txId' in spin ? spin.txId : 'txid' in spin ? spin.txid : undefined
        });
        url = `${window.location.origin}/replay?d=${encoded}`;
      }

      await navigator.clipboard.writeText(url);
      toastStore.success('Replay link copied!', 'Share it with your friends!', 3000);
    } catch (error) {
      console.error('Failed to share replay:', error);
      toastStore.error('Share failed', 'Failed to generate replay link');
    } finally {
      sharingReplay = false;
    }
  }

  async function viewReplay() {
    if (!spin || !reconstructedData?.outcome) return;
    
    try {
      let url: string;
      const { betKey, claimRound } = reconstructedData.outcome;
      
      // Use the same logic as shareReplay to generate URL
      if (betKey && claimRound) {
        let slotAppId: number | undefined = undefined;
        if ('contractId' in spin && spin.contractId) {
          const contract = multiContractStore.getContract(spin.contractId);
          if (contract?.slotMachineAppId) slotAppId = contract.slotMachineAppId;
        }
        
        const totalBet = 'totalBet' in spin ? spin.totalBet : 
                        'total_bet_amount' in spin ? Number(spin.total_bet_amount) : 0;
        const paylines = 'selectedPaylines' in spin ? spin.selectedPaylines :
                        'paylines_count' in spin ? Number(spin.paylines_count) : 20;
        
        const r = encodeBetKeyReplay({
          betKeyHex: betKey,
          claimRound,
          betAmount: totalBet,
          paylines,
          contractId: slotAppId ? undefined : ('contractId' in spin ? spin.contractId : undefined),
          slotAppId
        });
        url = `/replay?r=${encodeURIComponent(r)}`;
      } else {
        // Fallback to legacy format
        const winnings = 'winnings' in spin ? spin.winnings : 
                        'payout' in spin ? Number(spin.payout) : 0;
        const totalBet = 'totalBet' in spin ? spin.totalBet : 
                        'total_bet_amount' in spin ? Number(spin.total_bet_amount) : 0;
        const paylines = 'selectedPaylines' in spin ? spin.selectedPaylines :
                        'paylines_count' in spin ? Number(spin.paylines_count) : 20;
        const timestamp = 'timestamp' in spin ? spin.timestamp : 
                         'created_at' in spin ? spin.created_at.getTime() : Date.now();
        
        if (!reconstructedData.outcome.grid || typeof winnings !== 'number') {
          throw new Error('Insufficient data for replay link');
        }
        
        const encoded = encodeReplayData({
          outcome: reconstructedData.outcome.grid,
          winnings,
          totalBet,
          selectedPaylines: paylines,
          timestamp,
          contractId: 'contractId' in spin ? spin.contractId : undefined,
          txId: 'txId' in spin ? spin.txId : 'txid' in spin ? spin.txid : undefined
        });
        url = `/replay?d=${encoded}`;
      }

      // Navigate to replay page with details modal open
      goto(url);
    } catch (error) {
      console.error('Failed to navigate to replay:', error);
      toastStore.error('Navigation failed', 'Failed to open replay page');
    }
  }

  async function retryReconstruction() {
    if (!spin) return;
    reconstructedData = null;
    await loadSpinDetails();
  }

  function getSymbolImagePath(symbolId: string): string {
    return getThemeSymbolImagePath(symbolId, $currentTheme);
  }

  function getSymbolInfo(symbolId: string) {
    return getSymbol(symbolId);
  }

  // Get payline color for visual distinction
  function getPaylineColor(paylineIndex: number): string {
    const colors = [
      'rgb(16, 185, 129)', // Green
      'rgb(59, 130, 246)', // Blue  
      'rgb(139, 92, 246)', // Purple
      'rgb(245, 158, 11)', // Amber
      'rgb(239, 68, 68)',  // Red
      'rgb(14, 165, 233)', // Sky
      'rgb(168, 85, 247)', // Violet
      'rgb(34, 197, 94)',  // Emerald
    ];
    return colors[paylineIndex % colors.length];
  }

  // Get SVG path for a payline overlay (using percentage-based coordinates like PaylinePayoutModal)
  function getPaylinePath(payline: number[]): string {
    const cellWidth = 100 / 5; // 20% per reel
    const cellHeight = 100 / 3; // 33.33% per row
    
    let path = '';
    
    payline.forEach((row, reel) => {
      const x = (reel * cellWidth) + (cellWidth / 2);
      const y = (row * cellHeight) + (cellHeight / 2);
      
      if (reel === 0) {
        path += `M ${x} ${y}`;
      } else {
        path += ` L ${x} ${y}`;
      }
    });
    
    return path;
  }

  function formatDate(date: Date | number): string {
    const d = typeof date === 'number' ? new Date(date) : date;
    return d.toLocaleString();
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
        {#if spin}
          <!-- Basic Spin Info -->
          <div class="detail-section">
            <h4 class="detail-section-title">Spin Information</h4>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">Bet Amount:</span>
                <span class="detail-value">
                  {formatVOI('totalBet' in spin ? spin.totalBet : Number(spin.total_bet_amount || 0))} VOI
                </span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Paylines:</span>
                <span class="detail-value">
                  {'selectedPaylines' in spin ? spin.selectedPaylines : spin.paylines_count} lines
                </span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Status:</span>
                <span class="detail-value {getStatusColor('status' in spin ? spin.status : SpinStatus.COMPLETED)}">
                  {'status' in spin ? getStatusText(spin.status) : 'Completed'}
                </span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Timestamp:</span>
                <span class="detail-value">
                  {formatDate('timestamp' in spin ? spin.timestamp : spin.created_at)}
                </span>
              </div>
              {#if ('winnings' in spin && typeof spin.winnings === 'number') || 'payout' in spin}
                <div class="detail-item">
                  <span class="detail-label">Winnings:</span>
                  <span class="detail-value" 
                    class:text-green-400={('winnings' in spin ? spin.winnings : Number(spin.payout)) > 0} 
                    class:text-red-400={('winnings' in spin ? spin.winnings : Number(spin.payout)) <= 0}>
                    {('winnings' in spin ? spin.winnings : Number(spin.payout)) > 0 ? '+' : ''}
                    {formatVOI('winnings' in spin ? spin.winnings || 0 : Number(spin.payout || 0))} VOI
                  </span>
                </div>
              {/if}
            </div>
          </div>

          <!-- Outcome Verification Section -->
          {#if isReconstruction}
            <div class="detail-section">
              <h4 class="detail-section-title">
                <Loader class="w-4 h-4 mr-2 animate-spin inline" />
                Reconstructing Outcome...
              </h4>
              <div class="loading-message">
                <p class="text-sm text-gray-400">
                  Fetching transaction data and reconstructing the bet grid from blockchain...
                </p>
              </div>
            </div>
          {:else if reconstructedData?.error}
            <div class="detail-section">
              <h4 class="detail-section-title text-red-400">
                <AlertTriangle class="w-4 h-4 mr-2 inline" />
                Reconstruction Failed
              </h4>
              <div class="error-message">
                {reconstructedData.error}
              </div>
              <button on:click={retryReconstruction} class="retry-button">
                <RefreshCw class="w-3 h-3 mr-1" />
                Retry
              </button>
            </div>
          {:else if reconstructedData?.outcome}
            <!-- Outcome Grid Display -->
            <div class="detail-section">
              <h4 class="detail-section-title">
                <Eye class="w-4 h-4 mr-2 inline" />
                Reconstructed Outcome
              </h4>
              
              <!-- Grid Display with Payline Numbers and Overlays -->
              <div class="grid-container">
                <!-- Payline Numbers List -->
                {#if reconstructedData.outcome.winningPaylines.length > 0}
                  <div class="payline-numbers-list">
                    <div class="payline-numbers-header">Lines</div>
                    {#each reconstructedData.outcome.winningPaylines as paylineData, index}
                      <button
                        class="payline-number-item"
                        class:highlighted={highlightedPaylineIndex === paylineData.paylineIndex}
                        style="--payline-color: {getPaylineColor(paylineData.paylineIndex)}"
                        on:mouseenter={() => highlightPayline(paylineData.paylineIndex)}
                        on:mouseleave={clearHighlight}
                        on:click={() => highlightedPaylineIndex === paylineData.paylineIndex ? clearHighlight() : highlightPayline(paylineData.paylineIndex)}
                      >
                        <div class="payline-number-bg"></div>
                        <span class="payline-number-text">{paylineData.paylineIndex + 1}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
                
                <div class="grid-display-wrapper">
                  <!-- Symbol Grid -->
                  <div class="grid-display">
                    {#each reconstructedData.outcome.grid as reel, col}
                      <div class="reel">
                        {#each reel as symbol, row}
                          <div class="symbol-cell" data-symbol={symbol}>
                            <div class="symbol-image-container">
                              <img 
                                src={getSymbolImagePath(symbol)} 
                                alt={getSymbolInfo(symbol).displayName}
                                class="symbol-grid-image"
                                loading="lazy"
                              />
                            </div>
                            <span class="symbol-text">{symbol}</span>
                          </div>
                        {/each}
                      </div>
                    {/each}
                  </div>
                  
                  <!-- Payline Overlays -->
                  {#if reconstructedData.outcome.winningPaylines.length > 0}
                    <svg class="payline-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {#each reconstructedData.outcome.winningPaylines as paylineData, index}
                        <g class="payline-group" style="--payline-color: {getPaylineColor(paylineData.paylineIndex)}">
                          <!-- Payline path -->
                          <path
                            d={getPaylinePath(paylineData.payline)}
                            stroke="var(--payline-color)"
                            stroke-width="1.5"
                            fill="none"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            opacity={highlightedPaylineIndex === null ? "0.3" : (highlightedPaylineIndex === paylineData.paylineIndex ? "0.9" : "0.1")}
                            class="payline-path"
                            class:highlighted-path={highlightedPaylineIndex === paylineData.paylineIndex}
                            style="animation-delay: {index * 0.3}s"
                          />
                          
                        </g>
                      {/each}
                    </svg>
                  {/if}
                </div>
              </div>
              
              <!-- Technical Details -->
              <div class="technical-details">
                <div class="detail-item">
                  <span class="detail-label">Block Seed:</span>
                  <span class="detail-value font-mono text-xs">{reconstructedData.outcome.blockSeed}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Claim Round:</span>
                  <span class="detail-value font-mono">{reconstructedData.outcome.claimRound}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Grid String:</span>
                  <span class="detail-value font-mono text-xs">{reconstructedData.outcome.gridString}</span>
                </div>
              </div>
            </div>

            <!-- Payline Analysis -->
            {#if reconstructedData.outcome.winningPaylines.length > 0}
              <div class="detail-section">
                <h4 class="detail-section-title">
                  <TrendingUp class="w-4 h-4 mr-2 inline" />
                  Payline Analysis ({reconstructedData.outcome.winningPaylines.length} winning lines)
                </h4>
                
                <div class="paylines-container">
                  {#each reconstructedData.outcome.winningPaylines as payline, index}
                    <div class="payline-item" style="--payline-color: {getPaylineColor(payline.paylineIndex)}">
                      <div class="payline-color-indicator"></div>
                      <div class="payline-content">
                        <div class="payline-header">
                          <span class="payline-number">Line {payline.paylineIndex + 1}</span>
                          <div class="payline-combo">
                            <span>{payline.count}x</span>
                            <img 
                              src={getSymbolImagePath(payline.symbol)} 
                              alt={getSymbolInfo(payline.symbol).displayName}
                              class="payline-symbol-image"
                              loading="lazy"
                            />
                            <span class="symbol-name">({getSymbolInfo(payline.symbol).displayName})</span>
                          </div>
                          <span class="payline-multiplier">{payline.multiplier}x</span>
                          <span class="payline-win">{formatVOI(payline.winAmount)} VOI</span>
                        </div>
                        <div class="payline-path">
                          Path: [{payline.payline.join(', ')}]
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
                
                <div class="total-winnings">
                  <span class="label">Total Calculated:</span>
                  <span class="value text-green-400 font-bold">
                    {formatVOI(reconstructedData.outcome.totalWinnings)} VOI
                  </span>
                </div>
              </div>
            {/if}
          {/if}

          <!-- Blockchain Details -->
          {#if ('txId' in spin && spin.txId) || ('txid' in spin && spin.txid) || ('claimTxId' in spin && spin.claimTxId) || ('commitmentRound' in spin && spin.commitmentRound) || ('outcomeRound' in spin && spin.outcomeRound)}
            <div class="detail-section">
              <h4 class="detail-section-title">Blockchain Details</h4>
              <div class="detail-grid">
                {#if 'commitmentRound' in spin && spin.commitmentRound}
                  <div class="detail-item">
                    <span class="detail-label">Block Number (Commitment):</span>
                    <span class="detail-value font-mono">{spin.commitmentRound}</span>
                  </div>
                {/if}
                {#if 'outcomeRound' in spin && spin.outcomeRound}
                  <div class="detail-item">
                    <span class="detail-label">Block Number (Outcome):</span>
                    <span class="detail-value font-mono">{spin.outcomeRound}</span>
                  </div>
                {/if}
                {#if ('txId' in spin && spin.txId) || ('txid' in spin && spin.txid)}
                  <div class="detail-item full-width">
                    <span class="detail-label">Transaction ID:</span>
                    <div class="tx-link-container">
                      <span class="detail-value font-mono tx-id">
                        {formatTxId('txId' in spin ? spin.txId : spin.txid)}
                      </span>
                      <a 
                        href={getExplorerUrl('txId' in spin ? spin.txId : spin.txid)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        class="explorer-link"
                        title="View on block explorer"
                      >
                        View on Explorer
                      </a>
                    </div>
                  </div>
                {/if}
                {#if 'claimTxId' in spin && spin.claimTxId}
                  <div class="detail-item full-width">
                    <span class="detail-label">Claim Transaction ID:</span>
                    <div class="tx-link-container">
                      <span class="detail-value font-mono tx-id">{formatTxId(spin.claimTxId)}</span>
                      <a 
                        href={getExplorerUrl(spin.claimTxId)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        class="explorer-link"
                        title="View on block explorer"
                      >
                        View on Explorer
                      </a>
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Error Information -->
          {#if 'error' in spin && spin.error}
            <div class="detail-section">
              <h4 class="detail-section-title text-red-400">Error Details</h4>
              <div class="error-message">
                {spin.error}
              </div>
            </div>
          {/if}

          <!-- Action Buttons -->
          <div class="modal-actions">
            {#if reconstructedData?.outcome?.betKey}
              <button 
                on:click={copyBetKey}
                disabled={copyingBetKey}
                class="action-button secondary"
                title="Copy bet key"
              >
                {#if copyingBetKey}
                  <Loader class="w-4 h-4 animate-spin" />
                {:else}
                  <Copy class="w-4 h-4" />
                {/if}
                Copy Bet Key
              </button>
            {/if}
            
            {#if reconstructedData?.outcome}
              <button 
                on:click={viewReplay}
                class="action-button secondary"
                title="View on replay page"
              >
                <ExternalLink class="w-4 h-4" />
                View Replay
              </button>
              <button 
                on:click={shareReplay}
                disabled={sharingReplay}
                class="action-button primary"
                title="Share replay link"
              >
                {#if sharingReplay}
                  <Loader class="w-4 h-4 animate-spin" />
                {:else}
                  <Share2 class="w-4 h-4" />
                {/if}
                Share Replay
              </button>
            {/if}
          </div>
        {/if}
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
    @apply p-6 max-h-[calc(90vh-120px)] overflow-y-auto space-y-6;
  }

  .detail-section {
    @apply space-y-4;
  }

  .detail-section-title {
    @apply text-sm font-semibold text-theme-text flex items-center;
  }

  .detail-grid {
    @apply grid grid-cols-1 sm:grid-cols-2 gap-3;
  }

  .detail-item {
    @apply flex flex-col gap-1;
  }

  .detail-item.full-width {
    @apply sm:col-span-2;
  }

  .detail-label {
    @apply text-xs text-theme-text opacity-70 font-medium;
  }

  .detail-value {
    @apply text-sm text-theme font-medium;
  }

  .tx-link-container {
    @apply flex items-center justify-between gap-3 bg-slate-700/50 rounded-lg border border-slate-600/50 p-2;
  }

  .tx-id {
    @apply text-xs text-theme-text;
  }

  .explorer-link {
    @apply text-xs bg-voi-600 hover:bg-voi-700 text-theme px-3 py-1 rounded-md transition-colors font-medium;
  }

  .error-message {
    @apply bg-red-900/20 border border-red-800/50 rounded-md p-3 text-sm text-red-300;
  }

  .loading-message {
    @apply bg-slate-700/30 rounded-lg p-4;
  }

  .retry-button {
    @apply mt-3 bg-slate-700 hover:bg-slate-600 text-theme text-sm px-3 py-1 rounded-md transition-colors flex items-center;
  }

  .verification-badge {
    @apply text-xs px-2 py-1 rounded-full font-medium ml-2;
  }

  .verification-badge.verified {
    @apply bg-green-900/30 text-green-400 border border-green-800/50;
  }

  .verification-badge.unverified {
    @apply bg-yellow-900/30 text-yellow-400 border border-yellow-800/50;
  }

  .grid-container {
    @apply bg-slate-900/50 rounded-lg p-4 border border-slate-600/30 flex gap-4 items-start justify-center mx-auto;
  }

  .payline-numbers-list {
    @apply grid grid-cols-2 gap-2 min-w-[80px];
  }

  .payline-numbers-header {
    @apply text-xs font-semibold text-gray-400 text-center mb-1 col-span-2;
  }

  .payline-number-item {
    @apply relative w-8 h-8 rounded-full border-2 border-transparent cursor-pointer transition-all duration-200 hover:scale-110 flex items-center justify-center;
    background: var(--payline-color, rgb(16, 185, 129));
  }

  .payline-number-item:hover {
    border-color: var(--payline-color);
    box-shadow: 0 0 8px var(--payline-color);
  }

  .payline-number-item.highlighted {
    border-color: var(--payline-color);
    box-shadow: 0 0 12px var(--payline-color);
    transform: scale(1.15);
  }

  .payline-number-item .payline-number-bg {
    @apply absolute inset-0 rounded-full opacity-20;
    background: var(--payline-color);
  }

  .payline-number-item .payline-number-text {
    @apply relative text-white text-xs font-bold z-10;
  }

  .grid-display-wrapper {
    @apply relative flex-1 max-w-md;
  }

  .grid-display {
    @apply grid grid-cols-5 gap-2;
  }

  .reel {
    @apply space-y-1;
  }

  .symbol-cell {
    @apply bg-slate-800 border border-slate-600 rounded-md p-2 text-center min-h-[80px] flex flex-col items-center justify-center relative;
  }

  .symbol-cell[data-symbol="A"] {
    @apply border-yellow-500/50 bg-yellow-900/20;
  }

  .symbol-cell[data-symbol="B"] {
    @apply border-gray-400/50 bg-gray-900/20;
  }

  .symbol-cell[data-symbol="C"] {
    @apply border-orange-500/50 bg-orange-900/20;
  }

  .symbol-cell[data-symbol="D"] {
    @apply border-green-500/50 bg-green-900/20;
  }

  .symbol-image-container {
    @apply flex items-center justify-center mb-1;
    width: 40px;
    height: 40px;
  }

  .symbol-grid-image {
    @apply w-full h-full object-contain;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  }

  .symbol-text {
    @apply text-xs text-gray-400 font-mono;
  }

  /* Payline Overlay Styles */
  .payline-overlay {
    @apply absolute inset-0 pointer-events-none;
    width: 100%;
    height: 100%;
  }

  .payline-path {
    animation: drawPath 1s ease-out both;
    stroke-dasharray: 300;
    stroke-dashoffset: 300;
    transition: opacity 0.3s ease, stroke-width 0.3s ease;
  }

  .payline-path.highlighted-path {
    stroke-width: 2;
    filter: drop-shadow(0 0 6px var(--payline-color));
  }

  .payline-number-bg {
    animation: scaleIn 0.5s ease-out both;
    transform-origin: center;
  }

  .payline-number-text {
    animation: fadeIn 0.5s ease-out both;
  }


  .technical-details {
    @apply mt-4 space-y-2 text-xs;
  }

  .paylines-container {
    @apply space-y-3;
  }

  .payline-item {
    @apply bg-slate-700/30 rounded-lg border border-slate-600/50 flex items-stretch overflow-hidden;
    position: relative;
  }

  .payline-color-indicator {
    @apply w-1 flex-shrink-0;
    background: var(--payline-color, rgb(16, 185, 129));
  }

  .payline-content {
    @apply flex-1 p-3;
  }

  .payline-header {
    @apply flex items-center justify-between text-sm;
  }

  .payline-number {
    @apply text-voi-400 font-medium;
  }

  .payline-combo {
    @apply text-theme flex items-center gap-2;
  }

  .payline-symbol-image {
    @apply w-6 h-6 object-contain;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  }

  .symbol-name {
    @apply text-xs text-gray-400;
  }

  .payline-multiplier {
    @apply text-blue-400 font-mono;
  }

  .payline-win {
    @apply text-green-400 font-semibold;
  }

  .payline-path {
    @apply text-xs text-gray-400 font-mono mt-1;
  }

  .total-winnings {
    @apply flex items-center justify-between p-3 bg-slate-700/50 rounded-lg border border-slate-600/50 mt-4;
  }

  .total-winnings .label {
    @apply text-sm text-gray-400;
  }

  .total-winnings .value {
    @apply text-lg;
  }

  .modal-actions {
    @apply flex items-center justify-end gap-3 pt-4 border-t border-slate-700;
  }

  .action-button {
    @apply px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .action-button.primary {
    @apply bg-voi-600 hover:bg-voi-700 text-white;
  }

  .action-button.secondary {
    @apply bg-slate-700 hover:bg-slate-600 text-theme;
  }

  /* Payline Animation Keyframes */
  @keyframes drawPath {
    0% {
      stroke-dashoffset: 300;
    }
    100% {
      stroke-dashoffset: 0;
    }
  }

  @keyframes scaleIn {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes fadeIn {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
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