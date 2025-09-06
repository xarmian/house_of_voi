<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { 
    availableContracts, 
    aggregatedPortfolioStore, 
    contractPerformanceStore,
    isMultiContractMode 
  } from '$lib/stores/multiContract';
  import { formatVOI } from '$lib/constants/betting';
  import ContractCard from './ContractCard.svelte';
  import { 
    TrendingUp, 
    PieChart, 
    BarChart3, 
    DollarSign, 
    Target, 
    AlertCircle,
    Users
  } from 'lucide-svelte';

  export let userAddress: string | null = null;
  export let showDetailedBreakdown = true;
  export let compact = false;

  let isLoading = false;
  let portfolioData: any = null;
  let performanceMetrics: any = {};

  // Load portfolio data when component mounts or user address changes
  $: if (userAddress) {
    loadPortfolioData();
  }

  async function loadPortfolioData() {
    if (!userAddress) return;
    
    isLoading = true;
    try {
      // Load aggregated portfolio calculation
      await aggregatedPortfolioStore.calculatePortfolio(userAddress);
      await contractPerformanceStore.loadPerformanceMetrics();
      
      // Get the calculated data
      portfolioData = aggregatedPortfolioStore.getPortfolio();
      performanceMetrics = $contractPerformanceStore.performanceMetrics;
    } catch (error) {
      console.error('Failed to load portfolio data:', error);
    } finally {
      isLoading = false;
    }
  }

  // Calculate total value across all contracts
  function getTotalPortfolioValue(): number {
    if (!portfolioData) return 0;
    return Number(portfolioData.totalValue) / 1e6; // Convert from microVOI
  }

  // Calculate total shares across all contracts
  function getTotalShares(): number {
    if (!portfolioData) return 0;
    return Number(portfolioData.totalShares);
  }

  // Get diversification score color
  function getDiversificationColor(score: number): string {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  }

  // Format percentage
  function formatPercentage(value: number): string {
    return value.toFixed(1);
  }

  onMount(() => {
    if (userAddress) {
      // Load portfolio data initially
      loadPortfolioData();

      const interval = setInterval(() => {
        loadPortfolioData();
      }, 120000); // Refresh every 2 minutes

      // Clear interval on destroy
      return () => clearInterval(interval);
    }
  });
</script>

{#if $isMultiContractMode}
  <div class="aggregated-portfolio {compact ? 'compact' : ''}">
    <!-- Portfolio Summary Header -->
    <div class="portfolio-header">
      <div class="flex items-center gap-3 mb-4">
        <PieChart class="w-6 h-6 text-voi-400" />
        <h2 class="text-xl font-bold text-theme">
          {compact ? 'Portfolio' : 'Aggregated Portfolio'}
        </h2>
        {#if isLoading}
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-voi-400"></div>
        {/if}
      </div>

      <!-- Total Value Display -->
      <div class="value-highlight">
        <div class="text-slate-400 text-sm mb-1">Total Portfolio Value</div>
        <div class="text-3xl font-bold text-yellow-400">
          {#if isLoading}
            Loading...
          {:else}
            {formatVOI(getTotalPortfolioValue())} VOI
          {/if}
        </div>
        {#if !isLoading && portfolioData}
          <div class="text-sm text-slate-400 mt-1">
            {getTotalShares().toLocaleString()} total shares across {$availableContracts.length} contracts
          </div>
        {/if}
      </div>
    </div>

    {#if !isLoading && portfolioData}
      <!-- Quick Stats Grid -->
      <div class="stats-grid">
        <!-- Best Performer -->
        <div class="stat-card">
          <div class="stat-header">
            <TrendingUp class="w-4 h-4 text-green-400" />
            <span>Best Performer</span>
          </div>
          <div class="stat-value text-green-400">
            {portfolioData.performance.bestPerformer || 'N/A'}
          </div>
        </div>

        <!-- Diversification Score -->
        <div class="stat-card">
          <div class="stat-header">
            <Target class="w-4 h-4 {getDiversificationColor(portfolioData.performance.diversificationScore)}" />
            <span>Diversification</span>
          </div>
          <div class="stat-value {getDiversificationColor(portfolioData.performance.diversificationScore)}">
            {portfolioData.performance.diversificationScore}%
          </div>
        </div>

        <!-- Total Return -->
        <div class="stat-card">
          <div class="stat-header">
            <DollarSign class="w-4 h-4 text-blue-400" />
            <span>Total Return</span>
          </div>
          <div class="stat-value text-blue-400">
            {formatPercentage(portfolioData.performance.totalReturnPercentage)}%
          </div>
        </div>
      </div>

      {#if showDetailedBreakdown && !compact}
        <!-- Contract Breakdown -->
        <div class="contract-breakdown">
          <h3 class="text-lg font-semibold text-theme mb-4 flex items-center gap-2">
            <BarChart3 class="w-5 h-5" />
            Contract Breakdown
          </h3>

          {#if portfolioData.positions.length > 0}
            <div class="contracts-grid">
              {#each portfolioData.positions as position}
                {@const contract = $availableContracts.find(c => c.id === position.contractId)}
                {#if contract}
                  <div class="position-card">
                    <div class="position-header">
                      <h4 class="font-semibold text-theme">{contract.name}</h4>
                      <span class="position-percentage">
                        {formatPercentage(position.portfolioPercentage)}%
                      </span>
                    </div>
                    
                    <div class="position-details">
                      <div class="detail-row">
                        <span class="label">Value:</span>
                        <span class="value">{formatVOI(Number(position.value) / 1e6)} VOI</span>
                      </div>
                      <div class="detail-row">
                        <span class="label">Shares:</span>
                        <span class="value">{Number(position.shares).toLocaleString()}</span>
                      </div>
                      <div class="detail-row">
                        <span class="label">Return:</span>
                        <span class="value {position.performance.totalReturnPercentage >= 0 ? 'text-green-400' : 'text-red-400'}">
                          {formatPercentage(position.performance.totalReturnPercentage)}%
                        </span>
                      </div>
                    </div>

                    <!-- Portfolio percentage bar -->
                    <div class="percentage-bar">
                      <div class="bar-fill" style="width: {position.portfolioPercentage}%"></div>
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          {:else}
            <div class="empty-state">
              <AlertCircle class="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p class="text-slate-400 text-sm">No active positions found</p>
            </div>
          {/if}
        </div>

        <!-- Risk Distribution -->
        {#if portfolioData.riskDistribution}
          <div class="risk-distribution">
            <h3 class="text-lg font-semibold text-theme mb-4 flex items-center gap-2">
              <Target class="w-5 h-5" />
              Risk Distribution
            </h3>

            <div class="risk-levels">
              <div class="risk-level">
                <div class="risk-header">
                  <span class="risk-label">Low Risk</span>
                  <span class="risk-percentage text-green-400">{portfolioData.riskDistribution.riskLevels.low}%</span>
                </div>
                <div class="risk-bar">
                  <div class="risk-fill bg-green-400" style="width: {portfolioData.riskDistribution.riskLevels.low}%"></div>
                </div>
              </div>

              <div class="risk-level">
                <div class="risk-header">
                  <span class="risk-label">Medium Risk</span>
                  <span class="risk-percentage text-yellow-400">{portfolioData.riskDistribution.riskLevels.medium}%</span>
                </div>
                <div class="risk-bar">
                  <div class="risk-fill bg-yellow-400" style="width: {portfolioData.riskDistribution.riskLevels.medium}%"></div>
                </div>
              </div>

              <div class="risk-level">
                <div class="risk-header">
                  <span class="risk-label">High Risk</span>
                  <span class="risk-percentage text-red-400">{portfolioData.riskDistribution.riskLevels.high}%</span>
                </div>
                <div class="risk-bar">
                  <div class="risk-fill bg-red-400" style="width: {portfolioData.riskDistribution.riskLevels.high}%"></div>
                </div>
              </div>
            </div>
          </div>
        {/if}
      {/if}
    {:else if !isLoading}
      <!-- Empty State -->
      <div class="empty-state">
        <AlertCircle class="w-12 h-12 text-slate-400 mx-auto mb-4" />
        <h3 class="text-lg font-semibold text-slate-300 mb-2">No Portfolio Data</h3>
        <p class="text-sm text-slate-400">
          {#if !userAddress}
            Connect your wallet to view your portfolio
          {:else}
            You don't have any YBT positions yet
          {/if}
        </p>
      </div>
    {/if}

    <!-- Loading State -->
    {#if isLoading}
      <div class="loading-state">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-400 mx-auto mb-4"></div>
        <p class="text-sm text-slate-400 text-center">Loading portfolio data...</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .aggregated-portfolio {
    @apply bg-slate-800 rounded-lg p-6 space-y-6;
  }

  .aggregated-portfolio.compact {
    @apply p-4 space-y-4;
  }

  .portfolio-header {
    @apply border-b border-slate-700 pb-4;
  }

  .value-highlight {
    @apply bg-gradient-to-r from-slate-700 to-slate-600 rounded-lg p-6 border border-yellow-400/20;
  }

  .stats-grid {
    @apply grid grid-cols-1 sm:grid-cols-3 gap-4;
  }

  .stat-card {
    @apply bg-slate-700/50 rounded-lg p-4;
  }

  .stat-header {
    @apply flex items-center gap-2 mb-2 text-sm text-slate-400;
  }

  .stat-value {
    @apply text-lg font-semibold;
  }

  .contract-breakdown {
    @apply space-y-4;
  }

  .contracts-grid {
    @apply grid grid-cols-1 md:grid-cols-2 gap-4;
  }

  .position-card {
    @apply bg-slate-700/50 rounded-lg p-4 space-y-3;
  }

  .position-header {
    @apply flex items-center justify-between;
  }

  .position-percentage {
    @apply text-sm font-medium text-voi-400;
  }

  .position-details {
    @apply space-y-1;
  }

  .detail-row {
    @apply flex justify-between text-sm;
  }

  .label {
    @apply text-slate-400;
  }

  .value {
    @apply font-medium text-slate-200;
  }

  .percentage-bar {
    @apply w-full bg-slate-600 rounded-full h-2;
  }

  .bar-fill {
    @apply bg-voi-400 h-2 rounded-full transition-all duration-300;
  }

  .risk-distribution {
    @apply space-y-4;
  }

  .risk-levels {
    @apply space-y-3;
  }

  .risk-level {
    @apply space-y-2;
  }

  .risk-header {
    @apply flex justify-between text-sm;
  }

  .risk-label {
    @apply text-slate-300;
  }

  .risk-percentage {
    @apply font-medium;
  }

  .risk-bar {
    @apply w-full bg-slate-600 rounded-full h-2;
  }

  .risk-fill {
    @apply h-2 rounded-full transition-all duration-300;
  }

  .empty-state,
  .loading-state {
    @apply text-center py-8;
  }

  /* Theme colors */
  .text-voi-400 {
    color: #10b981;
  }

  .bg-voi-400 {
    background-color: #10b981;
  }
</style>