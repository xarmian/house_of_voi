<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { contractHealthStore, contractPerformanceStore } from '$lib/stores/multiContract';
  import type { ContractPair } from '$lib/types/multiContract';
  import { formatVOI } from '$lib/constants/betting';
  import { 
    Activity, 
    TrendingUp, 
    Users, 
    DollarSign, 
    Target, 
    AlertTriangle,
    Play,
    Settings,
    BarChart3
  } from 'lucide-svelte';

  export let contract: ContractPair;
  export let variant: 'compact' | 'expanded' = 'compact';
  export let showActions = true;
  export let showPerformance = true;
  export let showHealthStatus = true;
  export let isSelected = false;

  const dispatch = createEventDispatcher<{
    select: { contract: ContractPair };
    play: { contract: ContractPair };
    manage: { contract: ContractPair };
    viewStats: { contract: ContractPair };
  }>();

  // Get contract health status
  function getHealthStatus() {
    return $contractHealthStore.healthStatuses[contract.id];
  }

  // Get contract performance metrics
  function getPerformanceMetrics() {
    return $contractPerformanceStore.performanceMetrics[contract.id];
  }

  // Get status styling
  function getStatusStyle(status: string): string {
    switch (status) {
      case 'active': return 'bg-green-900/30 text-green-400 border-green-500/30';
      case 'maintenance': return 'bg-yellow-900/30 text-yellow-400 border-yellow-500/30';
      case 'inactive': return 'bg-red-900/30 text-red-400 border-red-500/30';
      case 'testing': return 'bg-blue-900/30 text-blue-400 border-blue-500/30';
      default: return 'bg-gray-900/30 text-gray-400 border-gray-500/30';
    }
  }

  // Get health status display
  function getHealthDisplay() {
    const health = getHealthStatus();
    if (!health) return { icon: '●', class: 'text-gray-400', text: 'Unknown' };

    switch (health.status) {
      case 'healthy': return { icon: '●', class: 'text-green-400', text: 'Healthy' };
      case 'warning': return { icon: '⚠', class: 'text-yellow-400', text: 'Warning' };
      case 'error': return { icon: '⚠', class: 'text-red-400', text: 'Error' };
      default: return { icon: '●', class: 'text-gray-400', text: 'Unknown' };
    }
  }

  // Format large numbers
  function formatNumber(value: number): string {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toString();
  }

  // Get theme styling based on contract theme
  function getThemeStyle(): string {
    if (contract.theme) {
      // You could implement theme-specific styling here
      return '';
    }
    return '';
  }

  $: healthDisplay = getHealthDisplay();
  $: performanceMetrics = getPerformanceMetrics();
  $: themeStyle = getThemeStyle();
</script>

<div 
  class="contract-card {variant}"
  class:selected={isSelected}
  class:clickable={$$slots.default}
  style={themeStyle}
  on:click={() => dispatch('select', { contract })}
  on:keydown={(e) => e.key === 'Enter' && dispatch('select', { contract })}
  role={$$slots.default ? 'button' : 'article'}
  tabindex={$$slots.default ? 0 : undefined}
>
  <!-- Header -->
  <div class="contract-header">
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <h3 class="contract-title">{contract.name}</h3>
          {#if showHealthStatus}
            <span class="health-indicator {healthDisplay.class}" title={healthDisplay.text}>
              {healthDisplay.icon}
            </span>
          {/if}
        </div>
        <p class="contract-description">{contract.description}</p>
      </div>
      
      <div class="flex items-center gap-2">
        <span class="status-badge {getStatusStyle(contract.status)}">
          {contract.status}
        </span>
        {#if contract.features.betaMode}
          <span class="beta-badge">Beta</span>
        {/if}
      </div>
    </div>
  </div>

  {#if variant === 'expanded'}
    <!-- Expanded Content -->
    <div class="contract-content">
      <!-- Key Metrics Grid -->
      {#if showPerformance && performanceMetrics}
        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-header">
              <TrendingUp class="w-4 h-4 text-green-400" />
              <span class="metric-label">TVL</span>
            </div>
            <div class="metric-value">
              {formatVOI(Number(performanceMetrics.totalValueLocked) / 1e6)} VOI
            </div>
          </div>

          <div class="metric-item">
            <div class="metric-header">
              <Users class="w-4 h-4 text-blue-400" />
              <span class="metric-label">Active Users</span>
            </div>
            <div class="metric-value">
              {formatNumber(performanceMetrics.activeUsers)}
            </div>
          </div>

          <div class="metric-item">
            <div class="metric-header">
              <DollarSign class="w-4 h-4 text-yellow-400" />
              <span class="metric-label">24h Volume</span>
            </div>
            <div class="metric-value">
              {formatVOI(Number(performanceMetrics.last24h.volume) / 1e6)} VOI
            </div>
          </div>

          <div class="metric-item">
            <div class="metric-header">
              <Target class="w-4 h-4 text-purple-400" />
              <span class="metric-label">House Edge</span>
            </div>
            <div class="metric-value">
              {contract.metadata.houseEdge}%
            </div>
          </div>
        </div>
      {:else if showPerformance}
        <!-- Loading state for metrics -->
        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-header">
              <TrendingUp class="w-4 h-4 text-gray-400" />
              <span class="metric-label">TVL</span>
            </div>
            <div class="metric-value text-gray-400">Loading...</div>
          </div>
          <div class="metric-item">
            <div class="metric-header">
              <Users class="w-4 h-4 text-gray-400" />
              <span class="metric-label">Users</span>
            </div>
            <div class="metric-value text-gray-400">--</div>
          </div>
        </div>
      {/if}

      <!-- Contract Features -->
      <div class="features-section">
        <div class="features-grid">
          <div class="feature-item" class:enabled={contract.features.gameplayEnabled}>
            <Play class="w-4 h-4" />
            <span>Gameplay</span>
          </div>
          <div class="feature-item" class:enabled={contract.features.stakingEnabled}>
            <DollarSign class="w-4 h-4" />
            <span>Staking</span>
          </div>
          <div class="feature-item" class:enabled={contract.features.leaderboardEnabled}>
            <BarChart3 class="w-4 h-4" />
            <span>Leaderboards</span>
          </div>
          <div class="feature-item" class:enabled={contract.features.depositsEnabled}>
            <TrendingUp class="w-4 h-4" />
            <span>Deposits</span>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <!-- Compact Content -->
    <div class="contract-content-compact">
      {#if showPerformance}
        <div class="compact-metrics">
          <div class="compact-metric">
            <span class="label">TVL:</span>
            <span class="value">
              {performanceMetrics 
                ? formatVOI(Number(performanceMetrics.totalValueLocked) / 1e6) + ' VOI'
                : '--'
              }
            </span>
          </div>
          <div class="compact-metric">
            <span class="label">Edge:</span>
            <span class="value">{contract.metadata.houseEdge}%</span>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Actions -->
  {#if showActions}
    <div class="contract-actions">
      {#if contract.features.gameplayEnabled && contract.status === 'active'}
        <button
          on:click|stopPropagation={() => dispatch('play', { contract })}
          class="action-btn action-primary"
          disabled={!contract.features.gameplayEnabled}
        >
          <Play class="w-4 h-4" />
          <span>Play</span>
        </button>
      {/if}

      {#if contract.features.houseDashboardEnabled}
        <button
          on:click|stopPropagation={() => dispatch('manage', { contract })}
          class="action-btn action-secondary"
        >
          <Settings class="w-4 h-4" />
          <span>Manage</span>
        </button>
      {/if}

      <button
        on:click|stopPropagation={() => dispatch('viewStats', { contract })}
        class="action-btn action-secondary"
      >
        <BarChart3 class="w-4 h-4" />
        <span>Stats</span>
      </button>
    </div>
  {/if}

  <!-- Maintenance Notice -->
  {#if contract.status === 'maintenance'}
    <div class="maintenance-notice">
      <AlertTriangle class="w-4 h-4 text-yellow-400" />
      <span class="text-yellow-400 text-sm">Under maintenance</span>
    </div>
  {/if}
</div>

<style>
  .contract-card {
    @apply bg-slate-800 border border-slate-700 rounded-lg transition-all duration-200;
    @apply hover:border-slate-600 focus:outline-none;
  }

  .contract-card.compact {
    @apply p-4;
  }

  .contract-card.expanded {
    @apply p-6;
  }

  .contract-card.selected {
    @apply border-voi-400 bg-slate-800/80;
    box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.2);
  }

  .contract-card.clickable {
    @apply cursor-pointer hover:bg-slate-800/80;
  }

  .contract-card:focus {
    @apply ring-2 ring-voi-400/50;
  }

  .contract-header {
    @apply mb-4;
  }

  .contract-title {
    @apply text-lg font-semibold text-theme;
  }

  .contract-description {
    @apply text-sm text-slate-400 mt-1;
  }

  .health-indicator {
    @apply text-sm;
  }

  .status-badge {
    @apply px-2 py-1 text-xs font-medium rounded-full border;
  }

  .beta-badge {
    @apply px-2 py-1 text-xs font-medium rounded-full bg-blue-900/30 text-blue-400 border border-blue-500/30;
  }

  .contract-content {
    @apply space-y-4;
  }

  .metrics-grid {
    @apply grid grid-cols-2 gap-4;
  }

  .metric-item {
    @apply bg-slate-700/50 rounded-lg p-3;
  }

  .metric-header {
    @apply flex items-center gap-2 mb-2;
  }

  .metric-label {
    @apply text-xs text-slate-400 font-medium;
  }

  .metric-value {
    @apply text-lg font-semibold text-theme;
  }

  .features-section {
    @apply pt-2 border-t border-slate-700;
  }

  .features-grid {
    @apply grid grid-cols-2 gap-2;
  }

  .feature-item {
    @apply flex items-center gap-2 px-3 py-2 rounded-lg text-sm;
    @apply bg-slate-700/30 text-slate-500;
  }

  .feature-item.enabled {
    @apply bg-voi-900/20 text-voi-400;
  }

  .contract-content-compact {
    @apply mb-3;
  }

  .compact-metrics {
    @apply flex items-center justify-between text-sm;
  }

  .compact-metric {
    @apply flex items-center gap-1;
  }

  .compact-metric .label {
    @apply text-slate-400;
  }

  .compact-metric .value {
    @apply text-theme font-medium;
  }

  .contract-actions {
    @apply flex items-center gap-2 pt-3 border-t border-slate-700;
  }

  .action-btn {
    @apply flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200;
    @apply focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800;
  }

  .action-primary {
    @apply bg-voi-600 text-white hover:bg-voi-700;
    @apply focus:ring-voi-400;
  }

  .action-secondary {
    @apply bg-slate-700 text-slate-200 hover:bg-slate-600;
    @apply focus:ring-slate-400;
  }

  .maintenance-notice {
    @apply flex items-center gap-2 mt-3 p-2 bg-yellow-900/20 border border-yellow-500/30 rounded-lg;
  }

  /* Theme colors */
  .text-voi-400 {
    color: #10b981;
  }

  .bg-voi-600 {
    background-color: #059669;
  }

  .hover\:bg-voi-700:hover {
    background-color: #047857;
  }

  .bg-voi-900\/20 {
    background-color: rgba(6, 78, 59, 0.2);
  }

  .border-voi-400 {
    border-color: #10b981;
  }

  .ring-voi-400\/50 {
    --tw-ring-color: rgba(16, 185, 129, 0.5);
  }
</style>