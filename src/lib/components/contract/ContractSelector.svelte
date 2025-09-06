<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { contractSelectionStore, availableContracts, contractHealthStore, isMultiContractMode } from '$lib/stores/multiContract';
  import type { ContractPair, ContractContext } from '$lib/types/multiContract';
  import { ChevronDown, Check, AlertTriangle, Activity, Users, TrendingUp } from 'lucide-svelte';

  export let mode: 'dropdown' | 'modal' = 'dropdown';
  export let contractFilter: 'all' | 'gameplay' | 'houseDashboard' = 'all';
  export let showMetrics = true;
  export let showHealthStatus = true;
  export let placeholder = 'Select Contract';
  export let disabled = false;

  const dispatch = createEventDispatcher<{
    contractSelected: { contractId: string; contract: ContractPair };
    contractChanged: { previousId: string | null; newId: string; contract: ContractPair };
  }>();

  let isOpen = false;
  let selectedContract: ContractPair | null = null;
  let filteredContracts: ContractPair[] = [];
  let dropdownElement: HTMLElement;

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    if (dropdownElement && !dropdownElement.contains(event.target as Node)) {
      isOpen = false;
    }
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

  // Handle contract selection
  async function selectContract(contract: ContractPair) {
    if (contract.id === selectedContract?.id) {
      isOpen = false;
      return;
    }

    const previousId = selectedContract?.id || null;

    try {
      await contractSelectionStore.selectContract(contract.id);
      
      dispatch('contractSelected', { 
        contractId: contract.id, 
        contract 
      });
      
      if (previousId) {
        dispatch('contractChanged', {
          previousId,
          newId: contract.id,
          contract
        });
      }
    } catch (error) {
      console.error('Failed to select contract:', error);
    }

    isOpen = false;
  }

  // Get health status for a contract
  function getHealthStatus(contractId: string) {
    return $contractHealthStore.healthStatuses[contractId];
  }

  // Get status color class
  function getStatusColorClass(status: string): string {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-900/30';
      case 'maintenance': return 'text-yellow-400 bg-yellow-900/30';
      case 'inactive': return 'text-red-400 bg-red-900/30';
      case 'testing': return 'text-blue-400 bg-blue-900/30';
      default: return 'text-gray-400 bg-gray-900/30';
    }
  }

  // Get health status icon and color
  function getHealthDisplay(contractId: string) {
    const health = getHealthStatus(contractId);
    if (!health) return { icon: '●', class: 'text-gray-400' };

    switch (health.status) {
      case 'healthy': return { icon: '●', class: 'text-green-400' };
      case 'warning': return { icon: '⚠', class: 'text-yellow-400' };
      case 'error': return { icon: '⚠', class: 'text-red-400' };
      default: return { icon: '●', class: 'text-gray-400' };
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    
    // Subscribe to contract selection changes
    const unsubscribe = contractSelectionStore.subscribe(state => {
      selectedContract = state.selectedContractId 
        ? $availableContracts.find(c => c.id === state.selectedContractId) || null
        : null;
    });
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      unsubscribe();
    };
  });

  // Update filtered contracts when available contracts change
  $: filteredContracts = getFilteredContracts($availableContracts);

  // Don't show selector in single contract mode unless explicitly forced
  $: shouldShow = $isMultiContractMode || filteredContracts.length > 1;
</script>

{#if shouldShow}
  <div class="contract-selector" bind:this={dropdownElement}>
    {#if mode === 'dropdown'}
      <!-- Dropdown Mode -->
      <div class="relative">
        <button
          on:click={() => isOpen = !isOpen}
          {disabled}
          class="contract-selector-trigger"
          class:disabled
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <div class="flex items-center flex-1 min-w-0">
            {#if selectedContract}
              <div class="flex items-center gap-2 flex-1 min-w-0">
                {#if showHealthStatus}
                  {@const healthDisplay = getHealthDisplay(selectedContract.id)}
                  <span class="health-indicator {healthDisplay.class}">
                    {healthDisplay.icon}
                  </span>
                {/if}
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-theme truncate">{selectedContract.name}</div>
                  <div class="text-xs text-slate-400 truncate">{selectedContract.description}</div>
                </div>
                <span class="status-badge {getStatusColorClass(selectedContract.status)}">
                  {selectedContract.status}
                </span>
              </div>
            {:else}
              <span class="text-slate-400">{placeholder}</span>
            {/if}
          </div>
          <ChevronDown 
            class="w-4 h-4 text-slate-400 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
          />
        </button>

        {#if isOpen}
          <div
            class="contract-dropdown"
            transition:scale={{ duration: 150, start: 0.95 }}
          >
            {#each filteredContracts as contract (contract.id)}
              <button
                on:click={() => selectContract(contract)}
                class="contract-option"
                class:selected={selectedContract?.id === contract.id}
              >
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  {#if showHealthStatus}
                    {@const healthDisplay = getHealthDisplay(contract.id)}
                    <span class="health-indicator {healthDisplay.class}">
                      {healthDisplay.icon}
                    </span>
                  {/if}
                  
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-medium text-theme truncate">{contract.name}</span>
                      <span class="status-badge {getStatusColorClass(contract.status)}">
                        {contract.status}
                      </span>
                    </div>
                    <div class="text-xs text-slate-400 truncate mb-2">{contract.description}</div>
                    
                    {#if showMetrics}
                      <div class="flex items-center gap-4 text-xs text-slate-500">
                        <div class="flex items-center gap-1">
                          <TrendingUp class="w-3 h-3" />
                          <span>TVL: --</span>
                        </div>
                        <div class="flex items-center gap-1">
                          <Users class="w-3 h-3" />
                          <span>Users: --</span>
                        </div>
                        <div class="flex items-center gap-1">
                          <Activity class="w-3 h-3" />
                          <span>Edge: {contract.metadata.houseEdge}%</span>
                        </div>
                      </div>
                    {/if}
                  </div>

                  {#if selectedContract?.id === contract.id}
                    <Check class="w-4 h-4 text-voi-400 flex-shrink-0" />
                  {/if}
                </div>
              </button>
            {/each}

            {#if filteredContracts.length === 0}
              <div class="px-4 py-3 text-sm text-slate-400 text-center">
                No contracts available for {contractFilter}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <!-- Modal Mode - TODO: Implement modal mode -->
      <button
        on:click={() => isOpen = true}
        {disabled}
        class="contract-selector-trigger"
      >
        <span class="text-slate-400">Modal mode not yet implemented</span>
      </button>
    {/if}
  </div>
{/if}

<style>
  .contract-selector {
    @apply w-full;
  }

  .contract-selector-trigger {
    @apply w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-left transition-all duration-200;
    @apply hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-voi-400/50 focus:border-voi-400;
    min-height: 52px;
  }

  .contract-selector-trigger.disabled {
    @apply opacity-50 cursor-not-allowed;
  }

  .contract-dropdown {
    @apply absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50;
    @apply max-h-80 overflow-y-auto;
  }

  .contract-option {
    @apply w-full px-4 py-3 text-left transition-all duration-150 border-b border-slate-700 last:border-b-0;
    @apply hover:bg-slate-700 focus:outline-none focus:bg-slate-700;
  }

  .contract-option.selected {
    @apply bg-slate-700/50;
  }

  .health-indicator {
    @apply text-sm font-medium;
  }

  .status-badge {
    @apply px-2 py-1 text-xs font-medium rounded-full;
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
</style>