<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { hovStatsService } from '$lib/services/hovStats';
  import { nameResolutionService, type NameLookupResult } from '$lib/services/nameResolution';

  export let value = '';
  export let placeholder = 'Enter wallet address or domain name...';
  export let disabled = false;
  export let minChars = 3;
  export let limit = 12;
  export let autofocus = false;
  export let className = '';

  const dispatch = createEventDispatcher<{ select: { address: string }, enter: { value: string } }>();

  interface SearchSuggestion {
    type: 'address' | 'name';
    address: string;
    displayText: string;
    name?: string;
  }

  let suggestions: SearchSuggestion[] = [];
  let isSearching = false;
  let searchError: string | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let showSuggestions = false;
  let highlightedIndex = -1;
  let rootEl: HTMLElement | null = null;
  const destroyers: Array<() => void> = [];

  function selectSuggestion(suggestion: SearchSuggestion) {
    dispatch('select', { address: suggestion.address });
    showSuggestions = false;
    highlightedIndex = -1;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!showSuggestions && value.trim().length >= minChars) {
      showSuggestions = true;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (suggestions.length > 0) highlightedIndex = (highlightedIndex + 1) % suggestions.length;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (suggestions.length > 0) highlightedIndex = (highlightedIndex - 1 + suggestions.length) % suggestions.length;
      return;
    }
    if (event.key === 'Enter') {
      if (showSuggestions && highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        const suggestion = suggestions[highlightedIndex];
        selectSuggestion(suggestion);
        return;
      }
      // If there are suggestions but none highlighted, select the first one
      if (showSuggestions && suggestions.length > 0) {
        const firstSuggestion = suggestions[0];
        selectSuggestion(firstSuggestion);
        return;
      }
      dispatch('enter', { value });
      return;
    }
    if (event.key === 'Escape') {
      showSuggestions = false;
      highlightedIndex = -1;
      return;
    }
  }

  function openSuggestions() {
    if (value.trim().length >= minChars) showSuggestions = true;
  }

  onMount(() => {
    if (autofocus) {
      // Allow mount then focus
      setTimeout(() => {
        const input = rootEl?.querySelector('input');
        (input as HTMLInputElement | null)?.focus();
      }, 0);
    }

    const handleDocClick = (e: MouseEvent) => {
      if (!rootEl) return;
      const target = e.target as Node;
      if (!rootEl.contains(target)) {
        showSuggestions = false;
        highlightedIndex = -1;
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    destroyers.push(() => document.removeEventListener('mousedown', handleDocClick));
  });

  onDestroy(() => {
    destroyers.forEach((fn) => fn());
  });

  // Debounced search
  $: {
    if (debounceTimer) clearTimeout(debounceTimer as any);
    const term = value.trim();
    if (!term || term.length < minChars) {
      suggestions = [];
      searchError = null;
      isSearching = false;
      showSuggestions = false;
      highlightedIndex = -1;
    } else {
      isSearching = true;
      searchError = null;
      debounceTimer = setTimeout(async () => {
        try {
          await searchAll(term);
          showSuggestions = true;
          highlightedIndex = -1;
        } catch (e) {
          console.error('Search failed:', e);
          searchError = 'Search failed. Please try again.';
          suggestions = [];
        } finally {
          isSearching = false;
        }
      }, 300);
    }
  }

  async function searchAll(term: string): Promise<void> {
    const searchSuggestions: SearchSuggestion[] = [];

    // Determine if this looks like a domain name or an address
    const isDomainLike = term.includes('.') || /^[a-zA-Z0-9-]+$/.test(term);
    const isAddressLike = /^[A-Z2-7]{58}$/.test(term) || /^[A-Z2-7]{20,}$/.test(term);

    // Search by domain name if it looks like one
    if (isDomainLike) {
      try {
        const nameResults = await nameResolutionService.searchByName(term);
        for (const result of nameResults) {
          searchSuggestions.push({
            type: 'name',
            address: result.address,
            displayText: result.name,
            name: result.name
          });
        }
      } catch (error) {
        console.warn('Name search failed:', error);
      }
    }

    // Search by address (existing functionality) if we don't have enough name results
    if (searchSuggestions.length < limit && (isAddressLike || !isDomainLike)) {
      try {
        const addressResults = await hovStatsService.searchPlayersByWho(term, limit - searchSuggestions.length);

        // Convert addresses to resolved display names
        const addressMap = new Map<string, SearchSuggestion>();
        for (const address of addressResults) {
          addressMap.set(address, {
            type: 'address',
            address,
            displayText: address
          });
        }

        // Resolve names for these addresses
        if (addressResults.length > 0) {
          try {
            const resolvedMap = await nameResolutionService.resolveAddresses(addressResults);
            for (const [address, resolved] of resolvedMap) {
              const suggestion = addressMap.get(address);
              if (suggestion) {
                if (resolved.hasName && resolved.name) {
                  suggestion.displayText = resolved.name;
                  suggestion.name = resolved.name;
                  suggestion.type = 'name';
                } else {
                  suggestion.displayText = nameResolutionService.formatAddress(address, 'short');
                }
              }
            }
          } catch (error) {
            console.warn('Address resolution failed in search:', error);
            // Keep original address formatting as fallback
          }
        }

        // Add address results to suggestions (avoid duplicates from name search)
        const existingAddresses = new Set(searchSuggestions.map(s => s.address));
        for (const suggestion of addressMap.values()) {
          if (!existingAddresses.has(suggestion.address)) {
            searchSuggestions.push(suggestion);
          }
        }
      } catch (error) {
        console.warn('Address search failed:', error);
      }
    }

    suggestions = searchSuggestions.slice(0, limit);
  }
</script>

<div class={`relative ${className}`} bind:this={rootEl}>
  <input
    type="text"
    class="input-field w-full"
    {placeholder}
    bind:value
    {disabled}
    on:keydown={handleKeyDown}
    on:focus={openSuggestions}
    autocomplete="off"
  />

  {#if showSuggestions}
    <div class="absolute z-50 left-0 right-0 top-full mt-2 rounded-lg border border-surface-border bg-surface-primary/90 backdrop-blur-md shadow-xl overflow-hidden">
      {#if isSearching}
        <div class="px-4 py-3 text-sm text-theme-text flex items-center gap-2">
          <span class="inline-block w-4 h-4 border-2 border-theme-primary border-t-transparent rounded-full animate-spin"></span>
          <span>Searching…</span>
        </div>
      {:else if searchError}
        <div class="px-4 py-3 text-sm text-red-300">{searchError}</div>
      {:else if suggestions.length > 0}
        <ul role="listbox" aria-label="Search suggestions" class="max-h-72 overflow-auto divide-y divide-surface-border">
          {#each suggestions as suggestion, i}
            <li role="option" aria-selected={i === highlightedIndex}>
              <button
                class="w-full text-left px-4 py-2 hover:bg-surface-hover text-theme-text text-sm focus:outline-none {i === highlightedIndex ? 'bg-surface-hover' : ''}"
                on:click={() => selectSuggestion(suggestion)}
                on:mousedown|preventDefault={() => selectSuggestion(suggestion)}
                title={suggestion.address}
              >
                <div class="flex flex-col gap-0.5">
                  <div class="{suggestion.type === 'name' ? 'font-semibold text-theme-primary' : 'font-mono'}">
                    {suggestion.displayText}
                  </div>
                  {#if suggestion.type === 'name' && suggestion.address}
                    <div class="text-xs text-gray-400 font-mono">
                      {nameResolutionService.formatAddress(suggestion.address, 'short')}
                    </div>
                  {/if}
                </div>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="px-4 py-3 text-sm text-theme-text opacity-80">
          No matches found. Try a domain name (e.g., "alice.hov.voi") or wallet address.
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* No component-local styles; uses theme classes */
</style>
