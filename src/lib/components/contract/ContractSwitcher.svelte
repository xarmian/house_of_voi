<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { contractSelectionStore, availableContracts, isMultiContractMode } from '$lib/stores/multiContract';
  import type { ContractPair } from '$lib/types/multiContract';
  import { ChevronDown, Zap, AlertCircle } from 'lucide-svelte';

  export let contractFilter: 'all' | 'gameplay' | 'houseDashboard' = 'all';
  export let showDescription = false;
  export let showHealthStatus = true;
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let variant: 'inline' | 'button' = 'inline';
  export let disabled = false;

  const dispatch = createEventDispatcher<{
    contractChanged: { previousId: string | null; newId: string; contract: ContractPair };
    switchRequested: { contractId: string; contract: ContractPair };
  }>();

  let isOpen = false;
  let isChanging = false;
  let switcherElement: HTMLElement;
  let dropdownTarget: HTMLElement;
  let dropdownElement: HTMLElement;
  let selectedContract: ContractPair | null = null;
  let dropdownPosition = '';

  // Portal action to render content outside current DOM tree
  function portal(node: HTMLElement, target: string | HTMLElement) {
    let targetEl = typeof target === 'string' ? document.querySelector(target) : target;
    if (!targetEl) targetEl = document.body;
    
    targetEl.appendChild(node);
    
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    };
  }

  // Calculate dropdown position relative to trigger
  function updateDropdownPosition() {
    if (!dropdownTarget || !isOpen) return;
    
    const rect = dropdownTarget.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    
    dropdownPosition = `
      top: ${rect.bottom + scrollY}px;
      left: ${rect.left + scrollX}px;
      min-width: ${rect.width}px;
      z-index: 9999;
    `;
  }

  // Filter contracts based on the specified filter
  function getFilteredContracts(contracts: ContractPair[]): ContractPair[] {
    switch (contractFilter) {
      case 'gameplay':
        return contracts.filter(c => c.features.gameplayEnabled && c.status === 'active');
      case 'houseDashboard':
        return contracts.filter(c => c.features.houseDashboardEnabled);
      case 'all':
      default:
        return contracts;
    }
  }

  // Handle contract switching with confirmation for important contexts
  async function switchContract(contract: ContractPair) {
    if (contract.id === selectedContract?.id) {
      isOpen = false;
      return;
    }

    const previousId = selectedContract?.id || null;
    
    // For gameplay context, we might want to show a confirmation
    if (contractFilter === 'gameplay' && selectedContract) {
      dispatch('switchRequested', { contractId: contract.id, contract });
      isOpen = false;
      return;
    }

    isChanging = true;
    
    try {
      await contractSelectionStore.selectContract(contract.id);
      
      dispatch('contractChanged', {
        previousId,
        newId: contract.id,
        contract
      });
      
    } catch (error) {
      console.error('Failed to switch contract:', error);
    }

    isChanging = false;
    isOpen = false;
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    if (switcherElement && !switcherElement.contains(event.target as Node) &&
        dropdownElement && !dropdownElement.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  // Get status color
  function getStatusColor(status: string): string {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'maintenance': return 'text-yellow-400';
      case 'inactive': return 'text-red-400';
      case 'testing': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  }

  // Get size classes
  function getSizeClasses(): { trigger: string; dropdown: string; text: string } {
    switch (size) {
      case 'sm':
        return {
          trigger: 'px-2 py-1 text-xs',
          dropdown: 'text-xs',
          text: 'text-xs'
        };
      case 'lg':
        return {
          trigger: 'px-4 py-3 text-base',
          dropdown: 'text-sm',
          text: 'text-base'
        };
      case 'md':
      default:
        return {
          trigger: 'px-3 py-2 text-sm',
          dropdown: 'text-sm',
          text: 'text-sm'
        };
    }
  }

  $: sizeClasses = getSizeClasses();
  $: filteredContracts = getFilteredContracts($availableContracts);
  $: shouldShow = $isMultiContractMode && filteredContracts.length > 1;

  // Subscribe to contract selection changes
  $: contractSelectionStore.subscribe(state => {
    selectedContract = state.selectedContractId 
      ? $availableContracts.find(c => c.id === state.selectedContractId) || null
      : null;
  });

  // Setup/cleanup click outside handler once
  import { onMount, onDestroy } from 'svelte';
  let hasBoundClickOutside = false;
  onMount(() => {
    if (typeof document !== 'undefined' && !hasBoundClickOutside) {
      document.addEventListener('click', handleClickOutside);
      hasBoundClickOutside = true;
    }
  });
  onDestroy(() => {
    if (typeof document !== 'undefined' && hasBoundClickOutside) {
      document.removeEventListener('click', handleClickOutside);
      hasBoundClickOutside = false;
    }
  });
</script>

{#if shouldShow}
  <div class="contract-switcher {variant}" bind:this={switcherElement}>
    <div class="relative">
      <!-- Trigger Button -->
      <button
        on:click={() => {
          isOpen = !isOpen;
          if (isOpen) {
            setTimeout(updateDropdownPosition, 0);
          }
        }}
        {disabled}
        class="switcher-trigger {sizeClasses.trigger}"
        class:disabled
        class:changing={isChanging}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {#if selectedContract}
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <!-- Status indicator -->
            {#if showHealthStatus}
              <span class="status-dot {getStatusColor(selectedContract.status)}">●</span>
            {/if}
            
            <!-- Contract info -->
            <div class="flex-1 min-w-0 text-left">
              <div class="font-medium text-theme truncate">{selectedContract.name}</div>
              {#if showDescription && size !== 'sm'}
                <div class="text-xs text-slate-400 truncate">{selectedContract.description}</div>
              {/if}
            </div>

            <!-- Loading indicator or switch icon -->
            {#if isChanging}
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-voi-400"></div>
            {:else}
              <ChevronDown 
                class="w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 {isOpen ? 'rotate-180' : ''}"
              />
            {/if}
          </div>
        {:else}
          <div class="flex items-center gap-2">
            <AlertCircle class="w-4 h-4 text-yellow-400" />
            <span class="text-slate-400">Select Contract</span>
            <ChevronDown class="w-4 h-4 text-slate-400" />
          </div>
        {/if}
      </button>

      <!-- Dropdown Portal Target -->
      <div bind:this={dropdownTarget} class="dropdown-target"></div>
    </div>
  </div>
{:else if !$isMultiContractMode && selectedContract}
  <!-- Single contract mode - show current contract name -->
  <div class="current-contract {sizeClasses.text}">
    <div class="flex items-center gap-2">
      {#if showHealthStatus}
        <span class="status-dot {getStatusColor(selectedContract.status)}">●</span>
      {/if}
      <span class="font-medium text-theme">{selectedContract.name}</span>
      {#if selectedContract.features.betaMode}
        <span class="text-xs px-1.5 py-0.5 bg-blue-900/30 text-blue-400 rounded-full">Beta</span>
      {/if}
    </div>
  </div>
{/if}

<!-- Portal Dropdown - rendered at document root to escape stacking contexts -->
{#if isOpen && typeof document !== 'undefined'}
  <div use:portal={'body'}>
    <div
      bind:this={dropdownElement}
      class="switcher-dropdown-portal {sizeClasses.dropdown}"
      transition:scale={{ duration: 150, start: 0.95 }}
      style="position: fixed; {dropdownPosition}"
    >
          {#each filteredContracts as contract (contract.id)}
            <button
              on:click={() => switchContract(contract)}
              class="switcher-option"
              class:selected={selectedContract?.id === contract.id}
              class:disabled={contract.status !== 'active' && contractFilter === 'gameplay'}
            >
              <div class="flex items-center gap-3 flex-1 min-w-0">
                {#if showHealthStatus}
                  <span class="status-dot {getStatusColor(contract.status)}">●</span>
                {/if}
                
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-theme truncate">{contract.name}</div>
                  {#if contract.status === 'maintenance'}
                    <div class="text-xs text-yellow-400">Under maintenance</div>
                  {:else if contract.features.betaMode}
                    <div class="text-xs text-blue-400">Beta</div>
                  {:else if showDescription}
                    <div class="text-xs text-slate-400 truncate">{contract.description}</div>
                  {/if}
                </div>

                {#if selectedContract?.id === contract.id}
                  <Zap class="w-3 h-3 text-voi-400 flex-shrink-0" />
                {/if}
              </div>
            </button>
          {/each}

          {#if filteredContracts.length === 0}
            <div class="px-3 py-2 text-slate-400 text-center">
              No contracts available
            </div>
          {/if}
    </div>
  </div>
{:else if !$isMultiContractMode && selectedContract}
  <!-- Single contract mode - show current contract name -->
  <div class="current-contract {sizeClasses.text}">
    <div class="flex items-center gap-2">
      {#if showHealthStatus}
        <span class="status-dot {getStatusColor(selectedContract.status)}">●</span>
      {/if}
      <span class="font-medium text-theme">{selectedContract.name}</span>
      {#if selectedContract.features.betaMode}
        <span class="text-xs px-1.5 py-0.5 bg-blue-900/30 text-blue-400 rounded-full">Beta</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .contract-switcher {
    @apply relative;
  }

  .contract-switcher.inline {
    @apply inline-block;
  }

  .contract-switcher.button {
    @apply block;
  }

  .switcher-trigger {
    @apply flex items-center justify-between gap-2 bg-slate-700 border border-slate-600;
    @apply rounded-lg transition-all duration-200 cursor-pointer;
    @apply hover:border-slate-500 hover:bg-slate-600;
    @apply focus:outline-none focus:ring-2 focus:ring-voi-400/50 focus:border-voi-400;
    min-height: 32px;
  }

  .switcher-trigger.disabled {
    @apply opacity-50 cursor-not-allowed;
  }

  .switcher-trigger.changing {
    @apply opacity-75;
  }

  .switcher-dropdown {
    @apply absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600;
    @apply rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto;
    min-width: 200px;
  }

  .switcher-dropdown-portal {
    @apply bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-64 overflow-y-auto;
    min-width: 200px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }

  .switcher-option {
    @apply w-full px-3 py-2 text-left transition-all duration-150;
    @apply hover:bg-slate-700 focus:outline-none focus:bg-slate-700;
    @apply border-b border-slate-700 last:border-b-0;
  }

  .switcher-option.selected {
    @apply bg-slate-700/50 border-voi-400/20;
  }

  .switcher-option.disabled {
    @apply opacity-50 cursor-not-allowed;
  }

  .switcher-option.disabled:hover {
    @apply bg-transparent;
  }

  .status-dot {
    @apply text-sm;
  }

  .current-contract {
    @apply text-slate-300;
  }

  /* Theme colors */
  .text-voi-400 {
    color: #10b981;
  }

  .focus\:ring-voi-400\/50:focus {
    --tw-ring-color: rgba(16, 185, 129, 0.5);
  }

  .focus\:border-voi-400:focus {
    border-color: #10b981;
  }

  .border-voi-400\/20 {
    border-color: rgba(16, 185, 129, 0.2);
  }
</style>
