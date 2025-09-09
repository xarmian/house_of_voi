<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { 
    History,
    ChevronLeft, 
    ChevronRight,
    RefreshCw,
    ExternalLink,
    Copy,
    TrendingUp,
    Search,
    Download,
    Crown,
    Users
  } from 'lucide-svelte';
  import { hovStatsService } from '$lib/services/hovStats';
  import { BLOCKCHAIN_CONFIG } from '$lib/constants/network';
  import { formatVOI } from '$lib/constants/betting';
  import { ensureBase32TxId, formatTxIdForDisplay } from '$lib/utils/transactionUtils';
  import type { PlayerSpin } from '$lib/types/hovStats';

  // Props
  export let appId: bigint;
  export let compact = false;
  export let pageSize = 6;

  const dispatch = createEventDispatcher();

  // State
  let searchTerm = '';
  let loading = false;
  let refreshing = false;
  let error: string | null = null;
  let currentPage = 0;
  let hasNextPage = false;
  let hasPreviousPage = false;
  let events: PlayerSpin[] = [];
  let totalEvents = 0;
  let searchTimeout: NodeJS.Timeout | null = null;
  let pageInputValue = '1';

  // Computed values  
  $: totalPages = totalEvents ? Math.ceil(totalEvents / pageSize) : 0;
  $: pageStart = currentPage * pageSize + 1;
  $: pageEnd = pageStart + events.length - 1;

  // Update page input when currentPage changes
  $: pageInputValue = (currentPage + 1).toString();

  // Search handling with debouncing
  $: if (searchTerm !== undefined) {
    handleSearchChange(searchTerm);
  }

  // Reload when page changes
  $: if (currentPage !== undefined && appId && appId > 0n) {
    loadEventsForPageChange();
  }

  async function loadEventsForPageChange() {
    if (loading) return; // Prevent duplicate calls
    try {
      loading = true;
      await loadEvents();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load events';
    } finally {
      loading = false;
    }
  }

  // Statistics
  $: totalWins = events.length;
  $: totalPayouts = events.reduce((sum, event) => sum + Number(event.payout), 0);
  $: biggestWin = events.length > 0 ? Math.max(...events.map(e => Number(e.payout))) : 0;
  $: averageWin = totalWins > 0 ? totalPayouts / totalWins : 0;

  onMount(() => {
    if (appId && appId > 0n) {
      loadInitialData();
    }
  });

  // Reload when app ID changes
  let lastAppId: bigint | null = null;
  $: if (appId !== lastAppId && appId && appId > 0n) {
    lastAppId = appId;
    loadInitialData();
  }

  async function loadInitialData() {
    if (!appId || appId === 0n) return;
    
    try {
      loading = true;
      error = null;
      currentPage = 0;
      await loadEvents();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load machine history';
    } finally {
      loading = false;
    }
  }

  async function loadEvents() {
    if (!appId || appId === 0n) return;
    
    const offset = currentPage * pageSize;
    const result = await hovStatsService.getMachineEvents(appId, pageSize, offset, searchTerm || undefined);
    
    events = result.events;
    hasNextPage = result.hasMore;
    hasPreviousPage = currentPage > 0;
    
    if (result.total !== undefined) {
      totalEvents = result.total;
    }
  }

  function handleSearchChange(newSearchTerm: string) {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(() => {
      // Reset to first page when searching
      if (currentPage !== 0) {
        currentPage = 0;
      } else {
        // If already on first page, just reload
        if (appId && appId > 0n) {
          loadEvents().catch(err => {
            error = err instanceof Error ? err.message : 'Failed to search';
          });
        }
      }
    }, 500); // 500ms debounce
  }

  function nextPage() {
    if (!hasNextPage || loading || !appId) return;
    currentPage++;
  }

  function previousPage() {
    if (!hasPreviousPage || loading || !appId) return;
    currentPage--;
  }

  function goToPage() {
    const pageNum = parseInt(pageInputValue);
    if (isNaN(pageNum) || pageNum < 1 || (totalPages > 0 && pageNum > totalPages)) return;
    currentPage = pageNum - 1;
  }

  function handlePageInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      goToPage();
    }
  }

  async function refresh() {
    if (!appId || appId === 0n) return;
    
    try {
      refreshing = true;
      error = null;
      await loadEvents();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to refresh machine history';
    } finally {
      refreshing = false;
    }
  }

  async function copyTxId(txid: string) {
    try {
      const base32TxId = ensureBase32TxId(txid);
      await navigator.clipboard.writeText(base32TxId);
      dispatch('copied', { type: 'txid', value: base32TxId });
    } catch (error) {
      console.error('Failed to copy transaction ID:', error);
    }
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      dispatch('copied', { type: 'address', value: address });
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  }

  function getExplorerUrl(txid: string): string {
    const base32TxId = ensureBase32TxId(txid);
    return `${BLOCKCHAIN_CONFIG.explorerUrl}/transaction/${base32TxId}`;
  }

  function formatTxId(txid: string): string {
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
    if (!events.length) return;
    
    const headers = [
      'Date',
      'Round',
      'Player',
      'Transaction ID',
      'Bet per Line (VOI)',
      'Paylines',
      'Total Bet (VOI)',
      'Payout (VOI)',
      'Multiplier'
    ];
    
    const csvContent = [
      headers.join(','),
      ...events.map(event => [
        formatDate(event.created_at),
        event.round.toString(),
        event.who || '',
        ensureBase32TxId(event.txid),
        formatVOI(Number(event.bet_amount_per_line)),
        event.paylines_count,
        formatVOI(Number(event.total_bet_amount)),
        formatVOI(Number(event.payout)),
        (Number(event.payout) / Number(event.total_bet_amount)).toFixed(2) + 'x'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `machine-wins-${appId.toString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    dispatch('exported', { format: 'csv', count: events.length });
  }
</script>

<div class="machine-history-container {compact ? 'compact' : ''}">
  <!-- Header -->
  <div class="history-header">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <History class="w-6 h-6 text-voi-400" />
        <div>
          <h3 class="text-xl font-bold text-theme">
            {compact ? 'Wins' : 'All Wins'}
          </h3>
          <p class="text-sm text-gray-400">
            Recent winning spins on this machine
          </p>
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        <button
          on:click={exportToCSV}
          disabled={!events.length}
          class="btn-secondary text-sm"
          title="Export to CSV"
        >
          <Download class="w-4 h-4" />
        </button>
        <button
          on:click={refresh}
          disabled={loading || refreshing}
          class="btn-secondary text-sm"
          title="Refresh history"
        >
          <RefreshCw class="w-4 h-4 {(loading || refreshing) ? 'animate-spin' : ''}" />
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
            placeholder="Search by player address, transaction ID, or amount..."
            class="search-input"
          />
        </div>
      </div>
    {/if}
  </div>

  {#if !appId || appId === 0n}
    <!-- No app selected -->
    <div class="empty-state">
      <History class="w-16 h-16 text-gray-600 mx-auto mb-4" />
      <p class="text-gray-400 text-center">Select a machine to view win history</p>
    </div>
  {:else if loading && !events.length}
    <!-- Loading -->
    <div class="loading-state">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-400 mx-auto mb-4"></div>
      <p class="text-gray-400 text-center">Loading win history...</p>
    </div>
  {:else if error && !events.length}
    <!-- Error -->
    <div class="error-state">
      <div class="text-red-400 text-center mb-2">Failed to load history</div>
      <p class="text-sm text-gray-400 text-center mb-4">{error}</p>
      <button on:click={loadInitialData} class="btn-primary text-sm mx-auto block">
        Retry
      </button>
    </div>
  {:else if !events.length}
    <!-- No data -->
    <div class="empty-state">
      <Crown class="w-16 h-16 text-gray-600 mx-auto mb-4" />
      <p class="text-gray-400 text-center">No wins found</p>
      <p class="text-sm text-gray-500 text-center mt-2">Winning spins will appear here</p>
    </div>
  {:else}
    <!-- History content -->
    <div class="history-content" transition:fade={{ duration: 300 }}>
      {#if loading}
        <!-- Loading state during pagination -->
        <div class="loading-overlay">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-400 mx-auto mb-4"></div>
          <p class="text-gray-400 text-center">Loading...</p>
        </div>
      {:else}
        <!-- Events table/list -->
        <div class="events-container">
          {#if events.length === 0 && searchTerm}
            <div class="empty-search">
              <Search class="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p class="text-gray-400 text-center text-sm">
                No wins match your search for "{searchTerm}"
              </p>
            </div>
          {:else}
            {#each events as event, i (event.txid)}
            <div 
              class="event-item" 
              transition:fly={{ y: 20, duration: 300, delay: i * 50 }}
            >
              <!-- Mobile layout -->
              <div class="mobile-event-item md:hidden">
                <div class="flex items-start justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <TrendingUp class="w-4 h-4 text-green-400" />
                    <span class="text-sm font-mono text-gray-300">
                      {formatTxId(event.txid)}
                    </span>
                    <button
                      on:click={() => copyTxId(event.txid)}
                      class="text-gray-400 hover:text-theme p-1"
                      title="Copy transaction ID"
                    >
                      <Copy class="w-3 h-3" />
                    </button>
                  </div>
                  <a
                    href={getExplorerUrl(event.txid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-gray-400 hover:text-voi-400 p-1"
                    title="View on explorer"
                  >
                    <ExternalLink class="w-4 h-4" />
                  </a>
                </div>
                
                {#if event.who}
                  <div class="mb-2">
                    <span class="text-gray-500 text-sm">Player:</span>
                    <button
                      on:click={() => copyAddress(event.who)}
                      class="text-voi-400 hover:text-voi-300 font-mono text-sm ml-1"
                      title="Copy player address"
                    >
                      {formatAddress(event.who)}
                    </button>
                  </div>
                {/if}
                
                <div class="grid grid-cols-2 gap-2 text-sm mb-2">
                  <div>
                    <span class="text-gray-500">Bet:</span>
                    <span class="text-theme font-semibold ml-1">
                      {formatVOI(Number(event.total_bet_amount))} VOI
                    </span>
                  </div>
                  <div>
                    <span class="text-gray-500">Lines:</span>
                    <span class="text-gray-300 ml-1">{event.paylines_count}</span>
                  </div>
                  <div>
                    <span class="text-gray-500">Won:</span>
                    <span class="text-green-400 font-semibold ml-1">
                      {formatVOI(Number(event.payout))} VOI
                    </span>
                  </div>
                  <div>
                    <span class="text-gray-500">Multiplier:</span>
                    <span class="text-green-400 font-semibold ml-1">
                      {(Number(event.payout) / Number(event.total_bet_amount)).toFixed(2)}x
                    </span>
                  </div>
                </div>
                
                <div class="flex items-center justify-between text-xs text-gray-500">
                  <span>Round {event.round.toString()}</span>
                  <span>{formatDate(event.created_at)}</span>
                </div>
              </div>

              <!-- Desktop layout -->
              <div class="desktop-event-item hidden md:grid">
                <div class="flex items-center gap-2 min-w-0">
                  <TrendingUp class="w-4 h-4 text-green-400 flex-shrink-0" />
                  <span class="text-sm font-mono text-gray-300 truncate">
                    {formatTxId(event.txid)}
                  </span>
                  <button
                    on:click={() => copyTxId(event.txid)}
                    class="text-gray-400 hover:text-theme p-1 flex-shrink-0"
                    title="Copy transaction ID"
                  >
                    <Copy class="w-3 h-3" />
                  </button>
                </div>

                {#if event.who}
                  <div class="min-w-0">
                    <button
                      on:click={() => copyAddress(event.who)}
                      class="text-voi-400 hover:text-voi-300 font-mono text-sm truncate block"
                      title="Copy player address: {event.who}"
                    >
                      {formatAddress(event.who)}
                    </button>
                  </div>
                {:else}
                  <div class="text-gray-500 text-sm">-</div>
                {/if}

                <div class="text-sm text-gray-400 text-right">
                  Round {event.round.toString()}
                </div>

                <div class="text-sm">
                  <div class="text-theme font-semibold">
                    {formatVOI(Number(event.total_bet_amount))} VOI
                  </div>
                  <div class="text-xs text-gray-500">
                    {event.paylines_count} lines
                  </div>
                </div>

                <div class="text-sm">
                  <div class="text-green-400 font-semibold">
                    {formatVOI(Number(event.payout))} VOI
                  </div>
                  <div class="text-xs text-gray-500">
                    {(Number(event.payout) / Number(event.total_bet_amount)).toFixed(2)}x
                  </div>
                </div>

                <div class="text-sm text-gray-400 whitespace-nowrap">
                  {formatDate(event.created_at)}
                </div>

                <div class="flex items-center justify-end">
                  <a
                    href={getExplorerUrl(event.txid)}
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
      {#if hasNextPage || hasPreviousPage || totalEvents > pageSize}
        <div class="pagination" transition:fly={{ y: 20, duration: 300, delay: 200 }}>
          <div class="flex items-center justify-between">
            <div class="pagination-info">
              <span class="text-sm text-gray-400">
                {#if events.length > 0}
                  Showing {pageStart}-{pageEnd}
                  {#if totalEvents > 0}
                    of {totalEvents} total
                  {/if}
                  wins
                {:else}
                  No results
                {/if}
              </span>
            </div>

            <div class="pagination-controls">
              <button
                on:click={previousPage}
                disabled={!hasPreviousPage || loading}
                class="pagination-btn"
                title="Previous page"
              >
                <ChevronLeft class="w-4 h-4" />
              </button>
              
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-400">Page</span>
                <input
                  type="number"
                  bind:value={pageInputValue}
                  on:keydown={handlePageInputKeydown}
                  on:blur={goToPage}
                  min="1"
                  max={totalPages || undefined}
                  class="page-input"
                />
                {#if totalPages > 0}
                  <span class="text-sm text-gray-400">of {totalPages}</span>
                {/if}
              </div>
              
              <button
                on:click={nextPage}
                disabled={!hasNextPage || loading}
                class="pagination-btn"
                title="Next page"
              >
                <ChevronRight class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .machine-history-container {
    @apply bg-slate-800 rounded-xl border border-slate-700 overflow-hidden;
  }

  .compact {
    @apply text-sm;
  }

  .history-header {
    @apply p-4 border-b border-slate-700 bg-slate-800/50;
  }

  .search-container {
    @apply w-full;
  }

  .search-input {
    @apply w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-voi-400 focus:border-transparent;
  }

  .empty-state, .loading-state, .error-state {
    @apply p-8 text-center;
  }

  .loading-overlay {
    @apply flex flex-col items-center justify-center py-16;
    min-height: 300px;
  }

  .empty-search {
    @apply p-8 text-center;
  }

  .history-content {
    @apply p-4 space-y-6;
    min-height: 600px; /* Prevent container expansion during pagination */
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

  .events-container {
    @apply space-y-3;
  }

  .event-item {
    @apply bg-slate-700/30 rounded-lg p-4 border border-slate-600/50 hover:bg-slate-700/50 transition-colors;
  }

  .mobile-event-item {
    @apply space-y-2;
  }

  .desktop-event-item {
    @apply grid gap-4 items-center;
    grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr 1fr auto;
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

  .page-input {
    @apply w-16 px-2 py-1 text-sm bg-slate-700 border border-slate-600 rounded text-center text-white focus:outline-none focus:ring-2 focus:ring-voi-400 focus:border-transparent;
  }


  .btn-secondary {
    @apply bg-slate-700 hover:bg-slate-600 text-theme font-semibold py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center;
    min-height: 40px;
  }

  .btn-primary {
    @apply bg-voi-600 hover:bg-voi-700 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center;
  }
</style>