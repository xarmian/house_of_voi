<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { hovStatsService } from '$lib/services/hovStats';

  export let value = '';
  export let placeholder = 'Enter wallet address...';
  export let disabled = false;
  export let minChars = 3;
  export let limit = 12;
  export let autofocus = false;
  export let className = '';

  const dispatch = createEventDispatcher<{ select: { address: string }, enter: { value: string } }>();

  let suggestions: string[] = [];
  let isSearching = false;
  let searchError: string | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let showSuggestions = false;
  let highlightedIndex = -1;
  let rootEl: HTMLElement | null = null;
  const destroyers: Array<() => void> = [];

  function selectAddress(addr: string) {
    dispatch('select', { address: addr });
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
        const addr = suggestions[highlightedIndex];
        selectAddress(addr);
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
          const results = await hovStatsService.searchPlayersByWho(term, limit);
          suggestions = results;
          showSuggestions = true;
          highlightedIndex = -1;
        } catch (e) {
          console.error('Wallet search failed:', e);
          searchError = 'Search failed. Please try again.';
          suggestions = [];
        } finally {
          isSearching = false;
        }
      }, 300);
    }
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
        <ul role="listbox" aria-label="Wallet suggestions" class="max-h-72 overflow-auto divide-y divide-surface-border">
          {#each suggestions as addr, i}
            <li role="option" aria-selected={i === highlightedIndex}>
              <button
                class="w-full text-left px-4 py-2 hover:bg-surface-hover text-theme-text font-mono text-sm focus:outline-none {i === highlightedIndex ? 'bg-surface-hover' : ''}"
                on:click={() => selectAddress(addr)}
                on:mousedown|preventDefault={() => selectAddress(addr)}
                title={addr}
              >
                {addr}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="px-4 py-3 text-sm text-theme-text opacity-80">No matching wallets found.</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* No component-local styles; uses theme classes */
</style>
