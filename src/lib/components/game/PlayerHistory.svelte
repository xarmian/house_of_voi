<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { 
    History,
    ChevronLeft, 
    ChevronRight,
    RefreshCw,
    ExternalLink,
    Copy,
    TrendingUp,
    TrendingDown,
    Clock,
    Search,
    Calendar,
    Filter,
    Download,
    MoreHorizontal
  } from 'lucide-svelte';
  import { hovStatsStore, playerSpins, connectionStatus } from '$lib/stores/hovStats';
  import { walletStore } from '$lib/stores/wallet';
  import { walletService } from '$lib/services/wallet';
  import { BLOCKCHAIN_CONFIG } from '$lib/constants/network';
  import { formatVOI } from '$lib/constants/betting';
  import { ensureBase32TxId, formatTxIdForDisplay } from '$lib/utils/transactionUtils';
  import type { PlayerSpin } from '$lib/types/hovStats';

  // Props
  export let playerAddress: string | null = null;
  export let compact = false;
  export let pageSize = 50;
  export let hideHeader = false;

  const dispatch = createEventDispatcher();

  // Use wallet address if no specific address provided
  $: targetAddress = playerAddress || $walletStore.account?.address || walletService.getPublicWalletData()?.address;

  // State
  let searchTerm = '';
  let loading = false;
  let refreshing = false;
  let error: string | null = null;
  let currentPageSize = pageSize;

  // Reactive data from store
  $: spinsData = $playerSpins.data;
  $: spins = spinsData?.spins || [];
  $: currentPage = spinsData?.currentPage ?? 0;
  $: hasNextPage = spinsData?.hasNextPage ?? false;
  $: hasPreviousPage = spinsData?.hasPreviousPage ?? false;
  $: storeLoading = $playerSpins.loading;
  $: storeError = $playerSpins.error;

  // Computed values  
  $: totalCount = spinsData?.totalCount ?? 0;
  $: totalPages = totalCount > 0 ? Math.ceil(totalCount / (spinsData?.pageSize ?? pageSize)) : 0;
  $: pageStart = currentPage * (spinsData?.pageSize ?? pageSize) + 1;
  $: pageEnd = pageStart + spins.length - 1;

  // Filtered spins based on search
  $: filteredSpins = spins.filter(spin => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const base32TxId = ensureBase32TxId(spin.txid);
    return (
      spin.txid.toLowerCase().includes(term) ||
      base32TxId.toLowerCase().includes(term) ||
      spin.round.toString().includes(term) ||
      formatVOI(Number(spin.total_bet_amount)).includes(term)
    );
  });

  onMount(() => {
    if (targetAddress) {
      loadInitialData();
    }
  });

  // Only reload when target address changes
  let lastTargetAddress: string | null = null;
  $: if (targetAddress !== lastTargetAddress && targetAddress) {
    lastTargetAddress = targetAddress;
    loadInitialData();
  }

  async function loadInitialData() {
    if (!targetAddress) return;
    
    try {
      loading = true;
      error = null;
      await hovStatsStore.loadPlayerSpins(targetAddress, 0, pageSize);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load player history';
    } finally {
      loading = false;
    }
  }

  async function nextPage() {
    if (!hasNextPage || storeLoading || !targetAddress) return;
    await hovStatsStore.loadPlayerSpins(targetAddress, currentPage + 1, spinsData?.pageSize ?? pageSize);
  }

  async function previousPage() {
    if (!hasPreviousPage || storeLoading || !targetAddress) return;
    await hovStatsStore.loadPlayerSpins(targetAddress, currentPage - 1, spinsData?.pageSize ?? pageSize);
  }

  async function refresh() {
    if (!targetAddress) return;
    
    try {
      refreshing = true;
      await hovStatsStore.refreshPlayerSpins();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to refresh player history';
    } finally {
      refreshing = false;
    }
  }

  async function changePageSize(newSize: number) {
    if (!targetAddress) return;
    
    try {
      loading = true;
      error = null;
      // Load first page with new page size
      await hovStatsStore.loadPlayerSpins(targetAddress, 0, newSize);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load player history';
    } finally {
      loading = false;
    }
  }

  async function copyTxId(txid: string) {
    try {
      // Copy the base32 version of the transaction ID
      const base32TxId = ensureBase32TxId(txid);
      await navigator.clipboard.writeText(base32TxId);
      dispatch('copied', { type: 'txid', value: base32TxId });
    } catch (error) {
      console.error('Failed to copy transaction ID:', error);
    }
  }

  function getExplorerUrl(txid: string): string {
    // Ensure we use the base32 format for the explorer URL
    const base32TxId = ensureBase32TxId(txid);
    return `${BLOCKCHAIN_CONFIG.explorerUrl}/transaction/${base32TxId}`;
  }

  function formatTxId(txid: string): string {
    // Use the utility function that handles conversion and formatting
    return formatTxIdForDisplay(txid, 8);
  }

  function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function formatAddress(address: string): string {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  }

  // Export to CSV functionality
  function exportToCSV() {
    if (!spins.length) return;
    
    const headers = [
      'Date',
      'Round',
      'Transaction ID',
      'Bet per Line (VOI)',
      'Paylines',
      'Total Bet (VOI)',
      'Payout (VOI)',
      'Net Result (VOI)',
      'Win/Loss'
    ];
    
    const csvContent = [
      headers.join(','),
      ...spins.map(spin => [
        formatDate(spin.created_at),
        spin.round.toString(),
        ensureBase32TxId(spin.txid),
        formatVOI(Number(spin.bet_amount_per_line)),
        spin.paylines_count,
        formatVOI(Number(spin.total_bet_amount)),
        formatVOI(Number(spin.payout)),
        formatVOI(Number(spin.net_result)),
        spin.is_win ? 'Win' : 'Loss'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `player-history-${formatAddress(targetAddress || '')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    dispatch('exported', { format: 'csv', count: spins.length });
  }
</script>

<div class="player-history-container {compact ? 'compact' : ''}">
  <!-- Header -->
  {#if !hideHeader}
    <div class="history-header">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <History class="w-6 h-6 text-voi-400" />
        <div>
          <h3 class="text-xl font-bold text-theme">
            {compact ? 'History' : 'Playing History'}
          </h3>
          {#if targetAddress}
            <p class="text-sm text-gray-400 font-mono" title={targetAddress}>
              {playerAddress ? 'Custom Player' : 'Your History'}: {formatAddress(targetAddress)}
            </p>
          {/if}
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        {#if !compact}
          <select
            bind:value={currentPageSize}
            on:change={() => changePageSize(currentPageSize)}
            class="page-size-select"
            title="Items per page"
          >
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
        {/if}
        <button
          on:click={exportToCSV}
          disabled={!spins.length}
          class="btn-secondary text-sm"
          title="Export to CSV"
        >
          <Download class="w-4 h-4" />
        </button>
        <button
          on:click={refresh}
          disabled={storeLoading || refreshing || !targetAddress}
          class="btn-secondary text-sm"
          title="Refresh history"
        >
          <RefreshCw class="w-4 h-4 {(storeLoading || refreshing) ? 'animate-spin' : ''}" />
        </button>
      </div>
    </div>

    <!-- Search -->
    {#if !compact}
      <div class="search-container mb-4">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            bind:value={searchTerm}
            placeholder="Search by transaction ID, round, or amount..."
            class="search-input"
          />
        </div>
      </div>
    {/if}
  </div>
  {:else}
    <!-- Controls bar when header is hidden -->
    <div class="controls-bar">
      <div class="flex items-center justify-between p-4">
        <div class="flex items-center gap-2">
          <select
            bind:value={currentPageSize}
            on:change={() => changePageSize(currentPageSize)}
            class="page-size-select"
            title="Items per page"
          >
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
        </div>
        
        <div class="flex items-center gap-2">
          <button
            on:click={exportToCSV}
            disabled={!spins.length}
            class="btn-secondary text-sm"
            title="Export to CSV"
          >
            <Download class="w-4 h-4" />
          </button>
          <button
            on:click={refresh}
            disabled={storeLoading || refreshing || !targetAddress}
            class="btn-secondary text-sm"
            title="Refresh history"
          >
            <RefreshCw class="w-4 h-4 {(storeLoading || refreshing) ? 'animate-spin' : ''}" />
          </button>
        </div>
      </div>

      <!-- Search -->
      <div class="search-container px-4 pb-4">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            bind:value={searchTerm}
            placeholder="Search by transaction ID, round, or amount..."
            class="search-input"
          />
        </div>
      </div>
    </div>
  {/if}

  {#if !targetAddress}
    <!-- No address -->
    <div class="empty-state">
      <History class="w-16 h-16 text-gray-600 mx-auto mb-4" />
      <p class="text-gray-400 text-center">Connect your wallet to view playing history</p>
    </div>
  {:else if (loading || storeLoading) && !spins.length}
    <!-- Loading -->
    <div class="loading-state">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-400 mx-auto mb-4"></div>
      <p class="text-gray-400 text-center">Loading playing history...</p>
    </div>
  {:else if (error || storeError) && !spins.length}
    <!-- Error -->
    <div class="error-state">
      <div class="text-red-400 text-center mb-2">Failed to load history</div>
      <p class="text-sm text-gray-400 text-center mb-4">{error || storeError}</p>
      <button on:click={loadInitialData} class="btn-primary text-sm mx-auto block">
        Retry
      </button>
    </div>
  {:else if !spins.length}
    <!-- No data -->
    <div class="empty-state">
      <Clock class="w-16 h-16 text-gray-600 mx-auto mb-4" />
      <p class="text-gray-400 text-center">No playing history found</p>
      <p class="text-sm text-gray-500 text-center mt-2">Start playing to see your history here</p>
    </div>
  {:else}
    <!-- History content -->
    <div class="history-content" transition:fade={{ duration: 300 }}>
      <!-- Statistics summary -->
      <div class="stats-summary mb-6" transition:fly={{ y: 20, duration: 300 }}>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="stat-item">
            <div class="stat-value text-blue-400">{totalCount}</div>
            <div class="stat-label">Total Spins</div>
          </div>
          <div class="stat-item">
            <div class="stat-value text-yellow-400">
              {formatVOI(Number(spinsData?.totalAmountBet ?? 0))} VOI
            </div>
            <div class="stat-label">Total Wagered</div>
          </div>
          <div class="stat-item">
            <div class="stat-value text-green-400">
              {formatVOI(Number(spinsData?.totalAmountWon ?? 0))} VOI
            </div>
            <div class="stat-label">Total Won</div>
          </div>
          <div class="stat-item">
            <div class="stat-value {(spinsData?.winRate ?? 0) > 50 ? 'text-green-400' : 'text-gray-400'}">
              {(spinsData?.winRate ?? 0).toFixed(1)}%
            </div>
            <div class="stat-label">Win Rate</div>
          </div>
        </div>
      </div>

      <!-- Spins table/list -->
      <div class="spins-container">
        {#if filteredSpins.length === 0 && searchTerm}
          <div class="empty-search">
            <Search class="w-8 h-8 text-gray-500 mx-auto mb-2" />
            <p class="text-gray-400 text-center text-sm">
              No spins match your search for "{searchTerm}"
            </p>
          </div>
        {:else}
          {#each filteredSpins as spin, i (spin.txid)}
            <div 
              class="spin-item" 
              transition:fly={{ y: 20, duration: 300, delay: i * 50 }}
            >
              <!-- Mobile layout -->
              <div class="mobile-spin-item md:hidden">
                <div class="flex items-start justify-between mb-2">
                  <div class="flex items-center gap-2">
                    {#if spin.is_win}
                      <TrendingUp class="w-4 h-4 text-green-400" />
                    {:else}
                      <TrendingDown class="w-4 h-4 text-red-400" />
                    {/if}
                    <span class="text-sm font-mono text-gray-300">
                      {formatTxId(spin.txid)}
                    </span>
                    <button
                      on:click={() => copyTxId(spin.txid)}
                      class="text-gray-400 hover:text-theme p-1"
                      title="Copy transaction ID"
                    >
                      <Copy class="w-3 h-3" />
                    </button>
                  </div>
                  <a
                    href={getExplorerUrl(spin.txid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-gray-400 hover:text-voi-400 p-1"
                    title="View on explorer"
                  >
                    <ExternalLink class="w-4 h-4" />
                  </a>
                </div>
                
                <div class="grid grid-cols-2 gap-2 text-sm mb-2">
                  <div>
                    <span class="text-gray-500">Bet:</span>
                    <span class="text-theme font-semibold ml-1">
                      {formatVOI(Number(spin.total_bet_amount))} VOI
                    </span>
                  </div>
                  <div>
                    <span class="text-gray-500">Paylines:</span>
                    <span class="text-gray-300 ml-1">{spin.paylines_count}</span>
                  </div>
                  {#if spin.is_win}
                    <div>
                      <span class="text-gray-500">Won:</span>
                      <span class="text-green-400 font-semibold ml-1">
                        {formatVOI(Number(spin.payout))} VOI
                      </span>
                    </div>
                    <div>
                      <span class="text-gray-500">Profit:</span>
                      <span class="text-green-400 font-semibold ml-1">
                        +{formatVOI(Number(spin.net_result))} VOI
                      </span>
                    </div>
                  {:else}
                    <div class="col-span-2">
                      <span class="text-gray-500">Loss:</span>
                      <span class="text-red-400 font-semibold ml-1">
                        {formatVOI(Number(spin.net_result))} VOI
                      </span>
                    </div>
                  {/if}
                </div>
                
                <div class="flex items-center justify-between text-xs text-gray-500">
                  <span>Round {spin.round.toString()}</span>
                  <span>{formatDate(spin.created_at)}</span>
                </div>
              </div>

              <!-- Desktop layout -->
              <div class="desktop-spin-item hidden md:grid">
                <div class="flex items-center gap-2 min-w-0">
                  {#if spin.is_win}
                    <TrendingUp class="w-4 h-4 text-green-400 flex-shrink-0" />
                  {:else}
                    <TrendingDown class="w-4 h-4 text-red-400 flex-shrink-0" />
                  {/if}
                  <span class="text-sm font-mono text-gray-300 truncate">
                    {formatTxId(spin.txid)}
                  </span>
                  <button
                    on:click={() => copyTxId(spin.txid)}
                    class="text-gray-400 hover:text-theme p-1 flex-shrink-0"
                    title="Copy transaction ID"
                  >
                    <Copy class="w-3 h-3" />
                  </button>
                </div>

                <div class="text-sm text-gray-400 text-right">
                  Round {spin.round.toString()}
                </div>

                <div class="text-sm">
                  <div class="text-theme font-semibold">
                    {formatVOI(Number(spin.total_bet_amount))} VOI
                  </div>
                  <div class="text-xs text-gray-500">
                    {spin.paylines_count} lines
                  </div>
                </div>

                {#if spin.is_win}
                  <div class="text-sm">
                    <div class="text-green-400 font-semibold">
                      {formatVOI(Number(spin.payout))} VOI
                    </div>
                    <div class="text-xs text-gray-500">payout</div>
                  </div>
                {:else}
                  <div class="text-sm">
                    <div class="text-gray-400">-</div>
                    <div class="text-xs text-gray-500">no payout</div>
                  </div>
                {/if}

                <div class="text-sm font-semibold {spin.is_win ? 'text-green-400' : 'text-red-400'}">
                  {spin.is_win ? '+' : ''}{formatVOI(Number(spin.net_result))} VOI
                </div>

                <div class="text-sm text-gray-400 whitespace-nowrap">
                  {formatDate(spin.created_at)}
                </div>

                <div class="flex items-center justify-end">
                  <a
                    href={getExplorerUrl(spin.txid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-gray-400 hover:text-voi-400 p-2"
                    title="View on explorer"
                  >
                    <ExternalLink class="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Pagination -->
      {#if !searchTerm && totalPages > 1}
        <div class="pagination" transition:fly={{ y: 20, duration: 300, delay: 200 }}>
          <div class="flex items-center justify-between">
            <div class="pagination-info">
              <span class="text-sm text-gray-400">
                {#if spins.length > 0}
                  Showing {pageStart}-{pageEnd} of {totalCount} total
                {:else}
                  No results
                {/if}
              </span>
            </div>

            <div class="pagination-controls">
              <button
                on:click={previousPage}
                disabled={!hasPreviousPage || storeLoading}
                class="pagination-btn"
                title="Previous page"
              >
                <ChevronLeft class="w-4 h-4" />
              </button>
              
              <span class="pagination-page">
                Page {currentPage + 1} of {totalPages}
              </span>
              
              <button
                on:click={nextPage}
                disabled={!hasNextPage || storeLoading}
                class="pagination-btn"
                title="Next page"
              >
                <ChevronRight class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .player-history-container {
    @apply bg-slate-800 rounded-xl border border-slate-700 overflow-hidden;
  }

  .compact {
    @apply text-sm;
  }

  .history-header {
    @apply p-4 border-b border-slate-700 bg-slate-800/50;
  }

  .controls-bar {
    @apply border-b border-slate-700 bg-slate-800/50;
  }

  .search-container {
    @apply w-full;
  }

  .search-input {
    @apply w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-voi-400 focus:border-transparent;
  }

  .page-size-select {
    @apply px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-voi-400 focus:border-transparent pr-7;
  }

  .empty-state, .loading-state, .error-state {
    @apply p-8 text-center;
  }

  .empty-search {
    @apply p-8 text-center;
  }

  .history-content {
    @apply p-4 space-y-6;
  }

  .stats-summary {
    @apply bg-slate-700/30 rounded-lg p-4 border border-slate-600/30;
  }

  .stat-item {
    @apply text-center;
  }

  .stat-value {
    @apply text-lg font-bold mb-1;
  }

  .stat-label {
    @apply text-xs text-gray-400 font-medium;
  }

  .spins-container {
    @apply space-y-3 max-h-96 overflow-y-auto;
  }

  .spin-item {
    @apply bg-slate-700/30 rounded-lg p-4 border border-slate-600/50 hover:bg-slate-700/50 transition-colors;
  }

  .mobile-spin-item {
    @apply space-y-2;
  }

  .desktop-spin-item {
    @apply grid gap-4 items-center;
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr auto;
  }

  .pagination {
    @apply border-t border-slate-700 pt-4;
  }

  .pagination-info {
    @apply flex-1;
  }

  .pagination-controls {
    @apply flex items-center gap-2;
  }

  .pagination-btn {
    @apply p-2 rounded-lg bg-slate-700 border border-slate-600 text-gray-300 hover:text-theme hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors;
  }

  .pagination-page {
    @apply px-3 py-1 text-sm text-gray-300 font-medium;
  }

  /* Custom scrollbar */
  .spins-container {
    scrollbar-width: thin;
    scrollbar-color: rgb(71 85 105) transparent;
  }
  
  .spins-container::-webkit-scrollbar {
    width: 6px;
  }
  
  .spins-container::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .spins-container::-webkit-scrollbar-thumb {
    background-color: rgb(71 85 105);
    border-radius: 3px;
  }
  
  .spins-container::-webkit-scrollbar-thumb:hover {
    background-color: rgb(100 116 139);
  }
</style>