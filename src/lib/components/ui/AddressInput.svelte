<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Clock, Check, ExternalLink, User, Globe } from 'lucide-svelte';
  import { nameResolutionService, type NameLookupResult } from '$lib/services/nameResolution';
  import { browser } from '$app/environment';

  export let value = '';
  export let placeholder = 'Enter Voi address or search for name...';
  export let disabled = false;
  export let label = 'Address';
  export let className = '';
  export let showValidation = false;

  const dispatch = createEventDispatcher<{
    select: { address: string };
    input: { value: string };
  }>();

  let showSuggestions = false;
  let envoiResults: NameLookupResult[] = [];
  let isSearching = false;
  let selectedIndex = -1;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  let containerEl: HTMLDivElement;
  let inputEl: HTMLInputElement;
  let dropdownEl: HTMLDivElement | null = null;

  // Debounced EnvoiName search using the enVoi API
  async function searchEnvoi(query: string) {
    if (!query || query.length < 2) {
      envoiResults = [];
      isSearching = false;
      return;
    }

    // If it looks like a full address (58 chars), don't search
    if (query.length === 58 && /^[A-Z2-7]+$/.test(query)) {
      envoiResults = [];
      isSearching = false;
      return;
    }

    try {
      isSearching = true;

      // Use the enVoi API directly
      const searchUrl = new URL('https://api.envoi.sh/api/search');
      searchUrl.searchParams.set('pattern', query);
      searchUrl.searchParams.set('type', 'contains');
      searchUrl.searchParams.set('limit', '10');

      const response = await fetch(searchUrl.toString());

      if (!response.ok) {
        throw new Error(`Envoi API error: ${response.status}`);
      }

      const data = await response.json();
      envoiResults = (data.results || []).slice(0, 5);
    } catch (error) {
      console.error('Name search error:', error);
      envoiResults = [];
    } finally {
      isSearching = false;
    }
  }

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const newValue = target.value;
    value = newValue;

    // Clear existing debounce timer
    if (debounceTimer) clearTimeout(debounceTimer);

    // Show suggestions when typing
    const shouldShowSuggestions = newValue.length >= 2;
    showSuggestions = shouldShowSuggestions;

    // Reset selection
    selectedIndex = -1;

    // Debounce the search
    debounceTimer = setTimeout(() => {
      searchEnvoi(newValue);
    }, 300);

    dispatch('input', { value: newValue });
  }

  function handleFocus() {
    if (value.length >= 2 && envoiResults.length > 0) {
      showSuggestions = true;
    }
  }

  function handleBlur() {
    // Delay hiding suggestions to allow clicking
    setTimeout(() => {
      showSuggestions = false;
      selectedIndex = -1;
    }, 200);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!showSuggestions || envoiResults.length === 0) {
      if (event.key === 'Escape') {
        showSuggestions = false;
        selectedIndex = -1;
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, envoiResults.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < envoiResults.length) {
          selectSuggestion(envoiResults[selectedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        showSuggestions = false;
        selectedIndex = -1;
        break;
    }
  }

  function selectSuggestion(result: NameLookupResult) {
    value = result.address;
    showSuggestions = false;
    selectedIndex = -1;
    dispatch('select', { address: result.address });
    dispatch('input', { value: result.address });
  }

  // Get avatar URL - check if metadata has avatar
  function getAvatarUrl(result: NameLookupResult): string | null {
    if (!result.metadata?.avatar) return null;
    const avatarUrl = result.metadata.avatar;
    // Add size parameter for known services
    if (avatarUrl.includes('envoi.sh') || avatarUrl.includes('githubusercontent.com')) {
      return `${avatarUrl}?size=32`;
    }
    return avatarUrl;
  }

  // Format address for display
  function formatAddress(address: string): string {
    if (!address || address.length < 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  }

  // Validate address format
  function isValidAddress(addr: string): boolean {
    return addr.length === 58 && /^[A-Z2-7]+$/.test(addr);
  }

  // Position dropdown
  function updateDropdownPosition() {
    if (!browser || !inputEl || !dropdownEl) return;
    const rect = inputEl.getBoundingClientRect();
    dropdownEl.style.position = 'fixed';
    dropdownEl.style.top = `${rect.bottom + 4}px`;
    dropdownEl.style.left = `${rect.left}px`;
    dropdownEl.style.width = `${rect.width}px`;
    dropdownEl.style.zIndex = '9999';

    // Check if dropdown will go off screen
    const dropdownHeight = 256;
    const viewportHeight = window.innerHeight;
    if (rect.bottom + dropdownHeight + 8 > viewportHeight) {
      dropdownEl.style.top = `${rect.top - dropdownHeight - 4}px`;
    }
  }

  // Click outside to close
  function handleClickOutside(event: MouseEvent) {
    if (!containerEl) return;
    const target = event.target as Node;
    if (dropdownEl && dropdownEl.contains(target)) return;
    if (!containerEl.contains(target)) {
      showSuggestions = false;
      selectedIndex = -1;
    }
  }

  onMount(() => {
    if (!browser) return;

    document.addEventListener('click', handleClickOutside);
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, { passive: true });

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  });

  $: if (showSuggestions && dropdownEl && inputEl) {
    updateDropdownPosition();
  }

  $: isValid = value && isValidAddress(value);
</script>

<div class="address-input-container {className}" bind:this={containerEl}>
  {#if label}
    <label for="address-input" class="block text-sm font-medium text-gray-300 mb-2">
      {label}
    </label>
  {/if}

  <div class="relative">
    <input
      id="address-input"
      bind:this={inputEl}
      type="text"
      {value}
      {placeholder}
      {disabled}
      class="w-full px-3 py-2 pr-8 bg-surface-secondary border rounded-lg text-theme placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-theme-primary transition-colors font-mono text-sm"
      class:border-surface-border={!isValid && !isSearching}
      class:border-green-500={isValid && showValidation}
      class:border-red-500={value && !isValid && value.length >= 58 && showValidation}
      on:input={handleInput}
      on:focus={handleFocus}
      on:blur={handleBlur}
      on:keydown={handleKeydown}
      autocomplete="off"
    />

    <!-- Loading indicator -->
    {#if isSearching}
      <div class="absolute right-3 top-1/2 transform -translate-y-1/2">
        <div class="w-4 h-4 border-2 border-voi-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if value && value.length > 0}
      <button
        type="button"
        class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
        on:click={() => {
          value = '';
          dispatch('input', { value: '' });
        }}
        title="Clear input"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    {/if}
  </div>

  <!-- Suggestions dropdown -->
  {#if showSuggestions && envoiResults.length > 0}
    <div
      bind:this={dropdownEl}
      class="suggestions-dropdown bg-surface-primary border border-surface-border rounded-lg shadow-2xl max-h-64 overflow-y-auto"
    >
      <div class="p-2 text-xs font-medium text-gray-400 border-b border-surface-border bg-surface-secondary/50">
        Names Found
      </div>

      {#each envoiResults as result, index}
        <button
          type="button"
          class="w-full px-3 py-3 text-left hover:bg-surface-hover transition-colors flex items-center space-x-3"
          class:bg-surface-hover={selectedIndex === index}
          on:click={() => selectSuggestion(result)}
        >
          <!-- Avatar -->
          <div class="flex-shrink-0">
            {#if getAvatarUrl(result)}
              <img
                src={getAvatarUrl(result)}
                alt={result.name}
                class="w-8 h-8 rounded-full"
              />
            {:else}
              <div class="w-8 h-8 bg-voi-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                {result.name.charAt(0).toUpperCase()}
              </div>
            {/if}
          </div>

          <!-- Name and Address -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center space-x-2">
              <span class="font-medium text-theme truncate">
                {result.name}
              </span>
            </div>
            <div class="text-sm text-gray-400 font-mono">
              {formatAddress(result.address)}
            </div>

            <!-- Metadata badges -->
            {#if result.metadata}
              <div class="flex items-center space-x-2 mt-1">
                {#if result.metadata.url}
                  <div class="flex items-center space-x-1 text-xs text-blue-400">
                    <Globe class="w-3 h-3" />
                    <span>Website</span>
                  </div>
                {/if}
                {#if result.metadata['com.twitter']}
                  <div class="flex items-center space-x-1 text-xs text-blue-400">
                    <span>@{result.metadata['com.twitter']}</span>
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <!-- External link icon -->
          <ExternalLink class="w-4 h-4 text-gray-400 flex-shrink-0" />
        </button>
      {/each}

      <!-- Footer -->
      <div class="px-3 py-2 text-xs text-gray-500 bg-surface-secondary/50 border-t border-surface-border">
        <div class="flex items-center justify-between">
          <span>Powered by enVoi</span>
          <span>Use ↑↓ to navigate</span>
        </div>
      </div>
    </div>
  {/if}

  <!-- Validation message -->
  {#if showValidation && isValid}
    <div class="mt-2 flex items-center space-x-2 text-sm text-green-400">
      <Check class="w-4 h-4" />
      <span>Valid address</span>
    </div>
  {:else if showValidation && value && !isValid && value.length >= 58}
    <div class="mt-2 text-sm text-red-400">
      Please enter a valid Voi address (58 characters)
    </div>
  {/if}
</div>

<style>
  .address-input-container {
    position: relative;
    width: 100%;
  }

  .suggestions-dropdown {
    position: fixed;
    z-index: 9999;
  }
</style>
