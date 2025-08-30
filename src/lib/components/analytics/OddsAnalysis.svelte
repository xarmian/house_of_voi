<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    BarChart3, 
    TrendingUp, 
    Calculator, 
    Info, 
    Download, 
    ChevronDown, 
    ChevronUp,
    AlertCircle,
    DollarSign,
    Target,
    Percent
  } from 'lucide-svelte';
  import { contractDataCache } from '$lib/services/contractDataCache';
  import { bettingStore } from '$lib/stores/betting';
  import { selectedWallet } from 'avm-wallet-svelte';
  import { formatProbability, formatHitFrequency, formatMultiplier, getRiskAssessment, getMostProfitableCombinations, calculateBreakEvenAnalysis, generateOddsSummary, validateOdds, exportOddsToCSV } from '$lib/utils/oddsAnalysis';
  import type { OddsCalculationResult } from '$lib/services/oddsCalculator';
  
  export let compact = false;
  export let showHouseMetrics = false; // For house route
  export let isModal = true; // Whether shown in a modal
  
  let odds: OddsCalculationResult | null = null;
  let isLoading = false;
  let error: string | null = null;
  let showAdvanced = false;
  let showDetailed = false;
  
  // Reactive values for current bet scenario
  $: currentBetPerLine = $bettingStore.betPerLine;
  $: currentPaylines = $bettingStore.selectedPaylines;
  $: currentTotalBet = $bettingStore.totalBet;
  
  async function loadOdds() {
    // Don't load if we already have odds and they're not stale
    if (odds && !error) {
      return;
    }
    
    // Use wallet address if available, otherwise use a dummy address for public odds
    const address = $selectedWallet?.address || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    isLoading = true;
    error = null;
    
    try {
      odds = await contractDataCache.getWinOdds(address);
      if (!odds) {
        error = 'Unable to calculate odds. Please try again.';
      }
    } catch (err) {
      error = 'Failed to load odds data';
    } finally {
      isLoading = false;
    }
  }
  
  async function recalculateOdds() {
    // Use wallet address if available, otherwise use a dummy address for public odds
    const address = $selectedWallet?.address || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    isLoading = true;
    error = null;
    
    try {
      // Clear the cached odds to force fresh calculation
      contractDataCache.clearOddsCache();
      
      odds = await contractDataCache.getWinOdds(address);
    } catch (err) {
      error = 'Failed to recalculate odds';
    } finally {
      isLoading = false;
    }
  }
  
  function exportToCsv() {
    if (!odds) return;
    
    const csvData = exportOddsToCSV(odds);
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slot-machine-odds-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  function exportDetailedReport() {
    if (!odds) return;
    
    const report = generateOddsSummary(odds);
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `odds-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  // Calculate current bet odds
  $: currentBetOdds = odds ? 
    contractDataCache.calculateBetOdds(
      $selectedWallet?.address || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 
      currentBetPerLine, 
      currentPaylines
    ) : 
    null;
  
  // Risk assessment
  $: riskAssessment = odds ? getRiskAssessment(odds) : null;
  
  // Most profitable combinations
  $: profitableCombos = odds ? getMostProfitableCombinations(odds, 3) : [];
  
  // Break-even analysis
  $: breakEvenAnalysis = odds ? calculateBreakEvenAnalysis(odds) : null;
  
  // Validation
  $: validation = odds ? validateOdds(odds) : null;
  
  onMount(() => {
    loadOdds();
  });
</script>

<div class="odds-analysis" class:compact class:modal={isModal} class:embedded={!isModal}>
  <!-- Header -->
  <div class="header">
    <div class="flex items-center gap-2 sm:gap-3">
      <BarChart3 class="w-5 h-5 sm:w-6 sm:h-6 text-voi-400" />
      <h3 class="text-lg sm:text-xl font-bold text-theme">
        {showHouseMetrics ? 'Game Analytics' : 'Win Odds & Analysis'}
      </h3>
    </div>
    
    {#if !compact}
      <div class="flex items-center gap-1 sm:gap-2">
        <button
          on:click={recalculateOdds}
          disabled={isLoading}
          class="btn-secondary-sm"
          title="Refresh odds data"
          style="min-height: 44px;"
        >
          <TrendingUp class="w-3 h-3 sm:w-4 sm:h-4" />
          <span class="hidden sm:inline ml-1">Refresh</span>
        </button>
        
        {#if odds && false}
          <button
            on:click={() => showAdvanced = !showAdvanced}
            class="btn-secondary-sm"
            title="Toggle advanced view"
            style="min-height: 44px;"
          >
            <Calculator class="w-3 h-3 sm:w-4 sm:h-4" />
            <span class="hidden sm:inline ml-1">{showAdvanced ? 'Simple' : 'Advanced'}</span>
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Loading State -->
  {#if isLoading}
    <div class="loading-state">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-500 mx-auto"></div>
      <p class="text-slate-400 mt-2">Calculating odds from blockchain data...</p>
    </div>
  
  <!-- Error State -->
  {:else if error}
    <div class="error-state">
      <AlertCircle class="w-8 h-8 text-red-400 mx-auto" />
      <p class="text-red-400 mt-2">{error}</p>
      <button on:click={loadOdds} class="btn-primary mt-3">
        Try Again
      </button>
    </div>
  
  <!-- Main Content -->
  {:else if odds}
    <div class="content" class:compact>
      <!-- Validation Warnings -->
      {#if validation && (!validation.isValid || validation.warnings.length > 0)}
        <div class="validation-notice">
          {#if !validation.isValid}
            <div class="flex items-center gap-2 text-red-400 mb-2">
              <AlertCircle class="w-4 h-4" />
              <span class="font-medium">Calculation Issues Detected</span>
            </div>
            {#each validation.errors as error}
              <p class="text-red-400 text-sm">• {error}</p>
            {/each}
          {/if}
          
          {#if validation.warnings.length > 0}
            <div class="flex items-center gap-2 text-yellow-400 mb-2">
              <Info class="w-4 h-4" />
              <span class="font-medium">Warnings</span>
            </div>
            {#each validation.warnings as warning}
              <p class="text-yellow-400 text-sm">• {warning}</p>
            {/each}
          {/if}
        </div>
      {/if}

      <!-- Quick Stats Cards -->
      <div class="stats-grid" class:compact>
        <!-- RTP -->
        <div class="stat-card primary">
          <div class="stat-icon">
            <Percent class="w-5 h-5" />
          </div>
          <div class="stat-content">
            <div class="stat-label">Return to Player</div>
            <div class="stat-value text-voi-400">
              {formatProbability(odds.overallRTP)}
            </div>
            <div class="stat-detail">
              House edge: {formatProbability(1 - odds.overallRTP)}
            </div>
          </div>
        </div>

        <!-- Hit Frequency -->
        <div class="stat-card">
          <div class="stat-icon">
            <Target class="w-5 h-5" />
          </div>
          <div class="stat-content">
            <div class="stat-label">Hit Frequency</div>
            <div class="stat-value text-blue-400">
              {formatHitFrequency(odds.totalHitFrequency)}
            </div>
            <div class="stat-detail">win rate per payline</div>
          </div>
        </div>

        <!-- Risk Level -->
        {#if riskAssessment}
          <div class="stat-card" class:risk-low={riskAssessment.level === 'low'} 
               class:risk-medium={riskAssessment.level === 'medium'}
               class:risk-high={riskAssessment.level === 'high'}
               class:risk-extreme={riskAssessment.level === 'extreme'}>
            <div class="stat-icon">
              <AlertCircle class="w-5 h-5" />
            </div>
            <div class="stat-content">
              <div class="stat-label">Risk Level</div>
              <div class="stat-value capitalize">
                {riskAssessment.level}
              </div>
              <div class="stat-detail">{riskAssessment.rtp.toFixed(1)}% RTP</div>
            </div>
          </div>
        {/if}

        <!-- Expected Value per Spin -->
        <div class="stat-card">
          <div class="stat-icon">
            <DollarSign class="w-5 h-5" />
          </div>
          <div class="stat-content">
            <div class="stat-label">Expected Value</div>
            <div class="stat-value text-yellow-400">
              {odds.expectedValuePerSpin.toFixed(4)}
            </div>
            <div class="stat-detail">per 1 VOI bet</div>
          </div>
        </div>
      </div>

      <!-- Current Bet Analysis -->
      {#if !showHouseMetrics && currentBetOdds}
        {#await currentBetOdds then betOdds}
          <div class="current-bet-analysis">
            <h4 class="section-title">
              <span class="text-sm sm:text-base">Current Bet Analysis</span>
              <span class="text-xs sm:text-sm text-gray-400 font-normal block sm:inline">
                ({(currentTotalBet / 1_000_000).toFixed(2)} VOI total)
              </span>
            </h4>
            
            <div class="bet-stats-grid">
              <div class="bet-stat">
                <span class="label">Expected Return</span>
                <span class="value text-green-400 text-sm sm:text-lg">
                  {(betOdds.expectedReturn / 1_000_000).toFixed(6)} VOI
                </span>
              </div>
              
              <div class="bet-stat">
                <span class="label">Expected Loss</span>
                <span class="value text-red-400 text-sm sm:text-lg">
                  {(betOdds.expectedLoss / 1_000_000).toFixed(6)} VOI
                </span>
              </div>
              
              <div class="bet-stat">
                <span class="label">Return Rate</span>
                <span class="value text-sm sm:text-lg">
                  {(betOdds.breakEvenProbability * 100).toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        {/await}
      {/if}

      <!-- Most Profitable Combinations -->
      {#if profitableCombos.length > 0}
        <div class="profitable-combos">
          <h4 class="section-title text-sm sm:text-base">Most Profitable Combinations</h4>
          <div class="text-xs">WARNING: This may not be accurate. It is a work in progress.</div>
          <div class="combo-list">
            {#each profitableCombos as combo, i}
              <div class="combo-item">
                <div class="combo-rank text-xs">{i + 1}</div>
                <div class="combo-symbol">
                  <div class="symbol-icon symbol-{combo.symbol.toLowerCase()} w-6 h-6 sm:w-8 sm:h-8 text-xs sm:text-sm">
                    {combo.symbol}
                  </div>
                  <span class="combo-count">×{combo.count}</span>
                </div>
                <div class="combo-stats">
                  <div class="combo-multiplier">{formatMultiplier(combo.multiplier)}</div>
                  <div class="combo-probability">{formatProbability(combo.probability)}</div>
                  <div class="combo-expected">{combo.expectedValue.toFixed(4)} EV</div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Advanced Analytics -->
      {#if showAdvanced && !compact}
        <div class="advanced-section">
          <button 
            on:click={() => showDetailed = !showDetailed}
            class="section-toggle"
          >
            <span class="section-title">Advanced Analytics</span>
            {#if showDetailed}
              <ChevronUp class="w-4 h-4" />
            {:else}
              <ChevronDown class="w-4 h-4" />
            {/if}
          </button>
          
          {#if showDetailed}
            <div class="detailed-content">
              <!-- Symbol Distribution -->
              <div class="symbol-analysis">
                <h5 class="subsection-title">Symbol Distribution by Reel</h5>
                <div class="reel-grid">
                  {#each odds.symbolAnalysis as reel}
                    <div class="reel-analysis">
                      <div class="reel-header">Reel {reel.reelIndex + 1}</div>
                      <div class="symbol-list">
                        {#each reel.symbols as symbol}
                          <div class="symbol-row">
                            <span class="symbol-char symbol-{symbol.symbol.toLowerCase()}">{symbol.symbol}</span>
                            <span class="symbol-count">{symbol.count}</span>
                            <span class="symbol-prob">{formatProbability(symbol.probability)}</span>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>

              <!-- Break-even Analysis -->
              {#if breakEvenAnalysis}
                <div class="breakeven-analysis">
                  <h5 class="subsection-title">Break-even Analysis</h5>
                  <div class="breakeven-stats">
                    <div class="breakeven-item">
                      <span class="label">Breaks Even:</span>
                      <span class="value" class:text-green-400={breakEvenAnalysis.breaksEven} 
                            class:text-red-400={!breakEvenAnalysis.breaksEven}>
                        {breakEvenAnalysis.breaksEven ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div class="breakeven-item">
                      <span class="label">Expected Loss per Spin:</span>
                      <span class="value text-red-400">
                        {(breakEvenAnalysis.expectedLossPerSpin * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div class="breakeven-item">
                      <span class="label">Spins to Lose 100 Units:</span>
                      <span class="value">
                        {breakEvenAnalysis.spinsToLose100Units === Infinity ? 'Never' : Math.round(breakEvenAnalysis.spinsToLose100Units)}
                      </span>
                    </div>
                  </div>
                </div>
              {/if}

              <!-- Export Options -->
              <div class="export-section">
                <h5 class="subsection-title">Export Data</h5>
                <div class="export-buttons">
                  <button on:click={exportToCsv} class="btn-secondary">
                    <Download class="w-4 h-4" />
                    Export CSV
                  </button>
                  <button on:click={exportDetailedReport} class="btn-secondary">
                    <Download class="w-4 h-4" />
                    Detailed Report
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- House Metrics (for house route) -->
      {#if showHouseMetrics && riskAssessment}
        <div class="house-metrics">
          <h4 class="section-title">House Performance</h4>
          <div class="house-stats">
            <div class="house-stat">
              <span class="label">House Edge</span>
              <span class="value text-green-400">
                {riskAssessment.houseEdge.toFixed(2)}%
              </span>
            </div>
            <div class="house-stat">
              <span class="label">Expected Profit per 1K VOI</span>
              <span class="value text-green-400">
                {((1 - odds.expectedValuePerSpin) * 1000).toFixed(2)} VOI
              </span>
            </div>
            <div class="house-stat">
              <span class="label">Game Classification</span>
              <span class="value">{riskAssessment.description}</span>
            </div>
          </div>
        </div>
      {/if}

      <!-- Calculation Metadata -->
      {#if showAdvanced}
        <div class="metadata">
          <p class="text-xs text-gray-500">
            Calculated: {new Date(odds.calculatedAt).toLocaleString()}
            • Data from blockchain contract
            • {odds.symbolAnalysis.length} reels analyzed
            • {odds.winAnalysis.reduce((sum, analysis) => sum + analysis.combinations.length, 0)} combinations calculated
          </p>
        </div>
      {/if}
    </div>
  
  <!-- No Data State -->
  {:else}
    <div class="no-data-state">
      <BarChart3 class="w-12 h-12 text-gray-400 mx-auto" />
      <p class="text-gray-400 mt-2">No odds data available</p>
      <button on:click={loadOdds} class="btn-primary mt-3">
        Load Odds
      </button>
    </div>
  {/if}
</div>

<style>
  .odds-analysis {
    @apply bg-slate-800 rounded-lg border border-slate-700;
  }
  
  .odds-analysis.modal {
    @apply p-4 sm:p-6;
  }
  
  .odds-analysis.compact {
    @apply p-3 sm:p-4;
  }

  .odds-analysis.embedded {
    @apply bg-transparent border-none rounded-none p-0;
  }
  
  .header {
    @apply flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3;
  }
  
  .loading-state,
  .error-state,
  .no-data-state {
    @apply text-center py-8;
  }
  
  .validation-notice {
    @apply bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 mb-6;
  }
  
  .content {
    @apply space-y-6;
  }
  
  .content.compact {
    @apply space-y-4;
  }
  
  /* Stats Grid */
  .stats-grid {
    @apply grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4;
  }
  
  .stats-grid.compact {
    @apply grid-cols-1 sm:grid-cols-2;
  }
  
  .stat-card {
    @apply bg-slate-700/50 rounded-lg p-3 sm:p-4 border border-slate-600/50;
  }
  
  .stat-card.primary {
    @apply bg-voi-900/20 border-voi-600/30;
  }
  
  .stat-card.risk-low {
    @apply bg-green-900/20 border-green-600/30;
  }
  
  .stat-card.risk-medium {
    @apply bg-yellow-900/20 border-yellow-600/30;
  }
  
  .stat-card.risk-high {
    @apply bg-orange-900/20 border-orange-600/30;
  }
  
  .stat-card.risk-extreme {
    @apply bg-red-900/20 border-red-600/30;
  }
  
  .stat-icon {
    @apply text-gray-400 mb-2;
  }
  
  .stat-label {
    @apply text-sm text-gray-400 font-medium;
  }
  
  .stat-value {
    @apply text-lg sm:text-xl font-bold text-theme mt-1;
  }
  
  .stat-detail {
    @apply text-xs text-gray-500 mt-1;
  }
  
  /* Current Bet Analysis */
  .current-bet-analysis {
    @apply bg-blue-900/20 border border-blue-600/30 rounded-lg p-3 sm:p-4;
  }
  
  .bet-stats-grid {
    @apply grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-3;
  }
  
  .bet-stat {
    @apply text-center;
  }
  
  .bet-stat .label {
    @apply block text-sm text-gray-400;
  }
  
  .bet-stat .value {
    @apply block text-base sm:text-lg font-bold text-theme mt-1;
  }
  
  /* Profitable Combinations */
  .profitable-combos {
    @apply bg-slate-700/30 rounded-lg p-3 sm:p-4;
  }
  
  .combo-list {
    @apply space-y-2 mt-3;
  }
  
  .combo-item {
    @apply flex items-center gap-2 sm:gap-3 bg-slate-800/50 rounded-lg p-2 sm:p-3;
  }
  
  .combo-rank {
    @apply w-5 h-5 sm:w-6 sm:h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-bold;
  }
  
  .combo-symbol {
    @apply flex items-center gap-2;
  }
  
  .symbol-icon {
    @apply w-6 h-6 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-theme font-bold text-xs sm:text-sm;
  }
  
  .symbol-a { @apply bg-blue-600; }
  .symbol-b { @apply bg-yellow-600; }
  .symbol-c { @apply bg-gray-600; }
  .symbol-d { @apply bg-orange-800; }
  
  .combo-count {
    @apply text-sm text-gray-400;
  }
  
  .combo-stats {
    @apply ml-auto flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-4 text-xs sm:text-sm;
  }
  
  .combo-multiplier {
    @apply text-green-400 font-medium;
  }
  
  .combo-probability {
    @apply text-blue-400;
  }
  
  .combo-expected {
    @apply text-gray-300;
  }
  
  /* Advanced Section */
  .advanced-section {
    @apply border-t border-slate-700 pt-6;
  }
  
  .section-toggle {
    @apply w-full flex items-center justify-between p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors;
  }
  
  .detailed-content {
    @apply mt-4 space-y-6;
  }
  
  /* Symbol Analysis */
  .reel-grid {
    @apply grid grid-cols-1 md:grid-cols-5 gap-4 mt-3;
  }
  
  .reel-analysis {
    @apply bg-slate-800/50 rounded-lg p-3;
  }
  
  .reel-header {
    @apply text-sm font-medium text-voi-400 mb-2;
  }
  
  .symbol-list {
    @apply space-y-1;
  }
  
  .symbol-row {
    @apply flex items-center justify-between text-xs;
  }
  
  .symbol-char {
    @apply w-6 h-6 rounded flex items-center justify-center text-theme font-bold;
  }
  
  .symbol-count {
    @apply text-gray-400;
  }
  
  .symbol-prob {
    @apply text-gray-300;
  }
  
  /* Break-even Analysis */
  .breakeven-stats {
    @apply space-y-2 mt-3;
  }
  
  .breakeven-item {
    @apply flex justify-between;
  }
  
  .breakeven-item .label {
    @apply text-gray-400;
  }
  
  .breakeven-item .value {
    @apply text-theme font-medium;
  }
  
  /* Export Section */
  .export-buttons {
    @apply flex gap-2 mt-3;
  }
  
  /* House Metrics */
  .house-metrics {
    @apply bg-green-900/20 border border-green-600/30 rounded-lg p-4;
  }
  
  .house-stats {
    @apply space-y-3 mt-3;
  }
  
  .house-stat {
    @apply flex justify-between;
  }
  
  .house-stat .label {
    @apply text-gray-300;
  }
  
  .house-stat .value {
    @apply text-theme font-medium;
  }
  
  /* Common Elements */
  .section-title {
    @apply text-lg font-semibold text-theme;
  }
  
  .subsection-title {
    @apply text-base font-medium text-gray-300;
  }
  
  .btn-primary {
    @apply bg-voi-600 hover:bg-voi-700 text-theme font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2;
  }
  
  .btn-secondary {
    @apply bg-slate-700 hover:bg-slate-600 text-theme font-medium py-2 px-3 rounded-lg transition-colors duration-200 flex items-center gap-2;
  }
  
  .btn-secondary-sm {
    @apply bg-slate-700 hover:bg-slate-600 text-theme font-medium py-1.5 px-3 rounded-md transition-colors duration-200 flex items-center gap-1 text-sm;
  }
  
  .metadata {
    @apply border-t border-slate-700 pt-4 text-center;
  }
  
  /* Responsive Design */
  @media (max-width: 768px) {
    .stats-grid {
      @apply grid-cols-1;
    }
    
    .bet-stats-grid {
      @apply grid-cols-1 gap-2;
    }
    
    .combo-stats {
      @apply flex-col gap-1 items-end;
    }
    
    .reel-grid {
      @apply grid-cols-1;
    }
    
    .export-buttons {
      @apply flex-col;
    }
  }
  
  /* Dark mode enhancements */
  .text-voi-400 {
    color: #10b981;
  }
  
  /* Animation for loading spinner */
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  
  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>