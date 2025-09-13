<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { 
    History,
    ChevronLeft, 
    ChevronRight,
    RefreshCw,
    ExternalLink,
    Share,
    TrendingUp,
    Search,
    Download,
    Crown,
    Copy,
    Info,
    Play,
  } from 'lucide-svelte';
  import { hovStatsService } from '$lib/services/hovStats';
  import { supabaseService } from '$lib/services/supabase';
  import { BLOCKCHAIN_CONFIG } from '$lib/constants/network';
  import { formatVOI } from '$lib/constants/betting';
  import { ensureBase32TxId, formatTxIdForDisplay } from '$lib/utils/transactionUtils';
  import type { PlayerSpin } from '$lib/types/hovStats';
  import SpinDetailsModal from '$lib/components/modals/SpinDetailsModal.svelte';
    import { goto } from '$app/navigation';

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
  let realtimeUnsubscribe: (() => void) | null = null;
  let isInitialized = false;
  let highlightedTxids = new Set<string>(); // Track highlighted rows
  let showSpinDetailsModal = false;
  let selectedEvent: PlayerSpin | null = null;

  // Computed values  
  $: totalPages = totalEvents ? Math.ceil(totalEvents / pageSize) : 0;
  $: pageStart = currentPage * pageSize + 1;
  $: pageEnd = pageStart + events.length - 1;

  // Update page input when currentPage changes
  $: pageInputValue = (currentPage + 1).toString();

  // Search handling with debouncing - only after initialization
  let lastSearchTerm: string | undefined = undefined;
  $: if (isInitialized && searchTerm !== lastSearchTerm) {
    lastSearchTerm = searchTerm;
    handleSearchChange(searchTerm);
  }

  // Reload when page changes - only after initialization and when page actually changes
  let lastCurrentPage: number | null = null;
  $: if (isInitialized && currentPage !== lastCurrentPage && currentPage !== 0 && appId && appId > 0n) {
    lastCurrentPage = currentPage;
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

  onMount(async () => {
    if (appId && appId > 0n) {
      // Initialize tracking variables to current state to prevent reactive triggers
      lastSearchTerm = searchTerm;
      lastCurrentPage = currentPage;
      lastAppId = appId;
      
      await loadInitialData();
      setupRealtimeSubscription();
    }
    // Mark as initialized AFTER initial load completes to prevent reactive statement cascades
    isInitialized = true;
  });

  onDestroy(() => {
    cleanupRealtimeSubscription();
  });

  // Reload when app ID changes - only after initialization and when app actually changes
  let lastAppId: bigint | null = null;
  $: if (isInitialized && appId !== lastAppId && appId && appId > 0n) {
    lastAppId = appId;
    // Reset state for new app
    currentPage = 0;
    lastCurrentPage = 0; // Reset page tracking too
    events = [];
    totalEvents = 0;
    error = null;
    highlightedTxids.clear(); // Clear highlights when switching apps
    // Load data and setup subscription for new app ID
    loadInitialData();
    cleanupRealtimeSubscription();
    setupRealtimeSubscription();
  }

  async function setupRealtimeSubscription() {
    if (!appId || appId === 0n) return;
    
    try {
      // Ensure Supabase is properly initialized (this was previously done by winFeedStore)
      if (!supabaseService.isReady()) {
        console.log('Initializing Supabase service for real-time subscription...');
        await supabaseService.initialize();
      }

      // Add a small delay to ensure the connection is fully established
      await new Promise(resolve => setTimeout(resolve, 100));

      // Subscribe to real-time events for this specific app - receive ALL wins (payout > 0) regardless of amount
      realtimeUnsubscribe = supabaseService.subscribe(
        'hov_events',
        (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new && payload.new.payout > 0) {
            handleRealtimeWinEvent(payload.new);
          }
        },
        `app_id=eq.${appId.toString()}`
      );

      console.log(`✅ Real-time subscription setup for app ${appId}`);
    } catch (error) {
      console.error('Failed to setup real-time subscription:', error);
    }
  }

  function cleanupRealtimeSubscription() {
    if (realtimeUnsubscribe) {
      realtimeUnsubscribe();
      realtimeUnsubscribe = null;
      console.log('Real-time subscription cleaned up');
    }
  }

  function handleRealtimeWinEvent(eventData: any) {
    try {
      // Convert raw event data to PlayerSpin format
      const newEvent: PlayerSpin = {
        round: BigInt(eventData.round || 0),
        intra: eventData.intra || 0,
        txid: eventData.txid || '',
        bet_amount_per_line: BigInt(eventData.amount || 0),
        paylines_count: Number(eventData.max_payline_index || 0) + 1,
        total_bet_amount: BigInt((eventData.amount || 0) * (Number(eventData.max_payline_index || 0) + 1)),
        payout: BigInt(eventData.payout || 0),
        net_result: BigInt((eventData.payout || 0) - ((eventData.amount || 0) * (Number(eventData.max_payline_index || 0) + 1))),
        is_win: (eventData.payout || 0) > 0,
        claim_round: BigInt(eventData.claim_round || 0),
        created_at: new Date(eventData.created_at || eventData.updated_at || Date.now()),
        who: eventData.who || ''
      };

      // Only add if it matches current search term (if any)
      if (searchTerm && searchTerm.trim()) {
        const raw = searchTerm.trim();
        const term = raw.toLowerCase();
        let matchesSearch = false;

        // Support operator-based numeric searches like ">1000", ">= 1000", "< 500"
        const opMatch = raw.match(/^([<>]=?|=)\s*(\d+(?:\.\d+)?)$/);
        if (opMatch) {
          const op = opMatch[1];
          const value = parseFloat(opMatch[2]);
          const payoutVoi = Number(newEvent.payout) / 1_000_000;
          const amountVoi = Number(newEvent.bet_amount_per_line) / 1_000_000;

          const compare = (a: number, b: number) => {
            switch (op) {
              case '>': return a > b;
              case '>=': return a >= b;
              case '<': return a < b;
              case '<=': return a <= b;
              case '=':
              case '==': return a === b;
              default: return false;
            }
          };

          // Match if either payout or bet amount per line satisfies the condition
          matchesSearch = compare(payoutVoi, value) || compare(amountVoi, value);
        } else {
          // Fallback to substring-based search
          matchesSearch =
            newEvent.who.toLowerCase().includes(term) ||
            newEvent.txid.toLowerCase().includes(term) ||
            newEvent.round.toString().includes(term) ||
            (Number(newEvent.payout) / 1000000).toString().includes(term);
        }

        if (!matchesSearch) return;
      }

      // Only add to current page if we're on the first page
      if (currentPage === 0) {
        // Check if event already exists (prevent duplicates)
        const existsIndex = events.findIndex(e => e.txid === newEvent.txid);
        if (existsIndex === -1) {
          // Add to beginning of events array (newest first)
          events = [newEvent, ...events].slice(0, pageSize);
          totalEvents = totalEvents + 1;
          
          // Highlight the new row
          highlightedTxids.add(newEvent.txid);
          highlightedTxids = highlightedTxids; // Trigger reactivity
          
          // Remove highlight after 4 seconds
          setTimeout(() => {
            highlightedTxids.delete(newEvent.txid);
            highlightedTxids = highlightedTxids; // Trigger reactivity
          }, 4000);
          
          console.log('New win event added:', {
            txid: newEvent.txid,
            payout: Number(newEvent.payout) / 1000000,
            who: newEvent.who
          });
        }
      } else {
        // Just update the total count if not on first page
        totalEvents = totalEvents + 1;
      }
    } catch (error) {
      console.error('Error handling real-time win event:', error);
    }
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
    // Don't trigger on initial empty search term
    if (!isInitialized) return;
    
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

  async function gotoProfile(address: string) {
    try {
      goto(`/profile/${address}`);
    } catch (error) {
      console.error('Failed to go to profile:', error);
    }
  }

  function getExplorerUrl(txid: string): string {
    const base32TxId = ensureBase32TxId(txid);
    return `${BLOCKCHAIN_CONFIG.explorerUrl}/transaction/${base32TxId}`;
  }

  function formatTxId(txid: string): string {
    return formatTxIdForDisplay(txid, 8);
  }

  // Copy simple transaction ID replay URL
  async function copyReplayLink(spin: PlayerSpin) {
    try {
      const { toastStore } = await import('$lib/stores/toast');
      const url = `${window.location.origin}/replay?tx=${encodeURIComponent(spin.txid)}`;
      await navigator.clipboard.writeText(url);
      toastStore.success('Replay link copied', 'Share it with your community!', 3000);
      dispatch('copied', { type: 'replay', value: url });
    } catch (err) {
      console.error('Failed to copy replay link:', err);
    }
  }

  async function openReplayLink(spin: PlayerSpin) {
    try {
      const url = `${window.location.origin}/replay?tx=${encodeURIComponent(spin.txid)}`;
      window.open(url, '_blank');
      dispatch('opened', { type: 'replay', value: url });
    } catch (err) {
      console.error('Failed to open replay link:', err);
    }
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
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  }

  function openEventDetails(event: PlayerSpin) {
    selectedEvent = event;
    showSpinDetailsModal = true;
  }

  function closeEventDetails() {
    selectedEvent = null;
    showSpinDetailsModal = false;
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

<!-- Event Details Modal moved outside to prevent positioning issues -->
<SpinDetailsModal 
  isVisible={showSpinDetailsModal}
  spin={selectedEvent}
  on:close={closeEventDetails}
/>

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
      <div class="search-container">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            bind:value={searchTerm}
            placeholder="Search address, txid, or amount (e.g., >1000, >= 250)"
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
              class="event-item {highlightedTxids.has(event.txid) ? 'highlighted-new' : ''}" 
              transition:fly={{ y: -30, duration: 400, delay: highlightedTxids.has(event.txid) ? 0 : i * 50 }}
            >
              <!-- Mobile layout -->
              <div class="mobile-event-item md:hidden">
                <!-- Compact header with win indicator, transaction ID, and action buttons -->
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2 min-w-0 flex-1">
                    <TrendingUp class="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span class="text-sm font-mono text-gray-300 truncate">
                      {formatTxId(event.txid)}
                    </span>
                    <button
                      on:click={() => copyTxId(event.txid)}
                      class="mobile-action-btn-small"
                      title="Copy transaction ID"
                    >
                      <Copy class="w-3 h-3" />
                    </button>
                  </div>
                  
                  <!-- Action buttons moved to top row -->
                  <div class="flex items-center gap-1">
                    <button
                      on:click={() => openReplayLink(event)}
                      class="mobile-action-btn-small text-green-400 hover:text-green-300"
                      title="Play replay"
                    >
                      <Play class="w-4 h-4" />
                    </button>
                    <button
                      on:click={() => openEventDetails(event)}
                      class="mobile-action-btn-small text-gray-400 hover:text-voi-400"
                      title="View event details"
                    >
                      <Info class="w-4 h-4" />
                    </button>
                    <a
                      href={getExplorerUrl(event.txid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="mobile-action-btn-small text-gray-400 hover:text-voi-400"
                      title="View on explorer"
                    >
                      <ExternalLink class="w-4 h-4" />
                    </a>
                    <button
                      on:click={() => copyReplayLink(event)}
                      class="mobile-action-btn-small text-gray-400 hover:text-voi-400"
                      title="Share replay link"
                    >
                      <Share class="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <!-- Player info if available -->
                {#if event.who}
                  <div class="mb-2">
                    <span class="text-xs text-gray-500">Player:</span>
                    <button
                      on:click={() => gotoProfile(event.who)}
                      class="text-voi-400 hover:text-voi-300 font-mono text-sm ml-1"
                      title="Go to player profile"
                    >
                      {formatAddress(event.who)}
                    </button>
                  </div>
                {/if}
                
                <!-- Simplified betting information in one compact row -->
                <div class="flex items-center justify-between text-sm gap-4">
                  <div class="flex items-center gap-4">
                    <div class="text-center">
                      <div class="text-xs text-gray-500">Bet</div>
                      <div class="text-theme font-semibold">
                        {formatVOI(Number(event.total_bet_amount))} VOI
                      </div>
                    </div>
                    <div class="text-center">
                      <div class="text-xs text-gray-500">Lines</div>
                      <div class="text-gray-300">{event.paylines_count}</div>
                    </div>
                    <div class="text-center">
                      <div class="text-xs text-gray-500">Won</div>
                      <div class="text-gray-300">
                        {formatVOI(Number(event.payout))} VOI
                      </div>
                    </div>
                  </div>
                  <div class="text-center">
                    <div class="text-xs text-gray-500">Multiplier</div>
                    <div class="font-semibold text-green-400">
                      {(Number(event.payout) / Number(event.total_bet_amount)).toFixed(2)}x
                    </div>
                  </div>
                </div>
                
                <!-- Round and date info in small text -->
                <div class="text-xs text-gray-500 mt-2">
                  Round {event.round.toString()} • {formatDate(event.created_at)}
                </div>
              </div>

              <!-- Desktop layout -->
              <div class="desktop-event-item hidden md:grid">
                <div class="flex items-center gap-2 min-w-0">
                  <TrendingUp class="w-4 h-4 text-green-400 flex-shrink-0" />
                  <span class="text-sm font-mono text-gray-300 truncate">
                    {formatTxIdForDisplay(event.txid,52)}
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
                      on:click={() => gotoProfile(event.who)}
                      class="text-voi-400 hover:text-voi-300 font-mono text-sm truncate block"
                      title="Go to player profile"
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
                  <button
                    on:click={() => openReplayLink(event)}
                    class="text-gray-400 hover:text-green-400 p-2"
                    title="Play replay"
                  >
                    <Play class="w-4 h-4" />
                  </button>
                  <button
                    on:click={() => openEventDetails(event)}
                    class="text-gray-400 hover:text-voi-400 p-2"
                    title="View event details"
                  >
                    <Info class="w-4 h-4" />
                  </button>
                  <a
                    href={getExplorerUrl(event.txid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-gray-400 hover:text-voi-400 p-2 hidden"
                    title="View on explorer"
                  >
                    <ExternalLink class="w-4 h-4" />
                  </a>
                  <button
                    on:click={() => copyReplayLink(event)}
                    class="text-gray-400 hover:text-voi-400 p-2"
                    title="Share replay link"
                  >
                    <Share class="w-4 h-4" />
                  </button>
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
    @apply bg-slate-800 rounded-xl border border-slate-700;
  }

  .compact {
    @apply text-sm;
  }

  .history-header {
    @apply p-4 pb-2 border-b border-slate-700 bg-slate-800/50;
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
    @apply bg-slate-700/30 rounded-lg border border-slate-600/50 hover:bg-slate-700/50 transition-colors;
  }
  
  
  .mobile-event-item {
    @apply p-3 space-y-2;
  }

  .highlighted-new {
    @apply bg-gradient-to-r from-green-500/20 to-voi-500/20 border-green-400/60 shadow-lg;
    animation: highlightPulse 4s ease-out forwards;
  }

  @keyframes highlightPulse {
    0% {
      @apply bg-gradient-to-r from-green-400/40 to-voi-400/40 border-green-400 shadow-xl;
      transform: scale(1.02);
    }
    15% {
      @apply bg-gradient-to-r from-green-400/30 to-voi-400/30 border-green-400/80;
      transform: scale(1.01);
    }
    100% {
      @apply bg-slate-700/30 border-slate-600/50;
      transform: scale(1);
    }
  }

  /* Compact mobile action buttons */
  .mobile-action-btn-small {
    @apply p-2 rounded-md hover:bg-slate-700/50 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center;
  }

  .desktop-event-item {
    @apply hidden md:grid gap-4 items-center p-4;
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
