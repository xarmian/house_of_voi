/**
 * Multi-Contract Store
 * 
 * Manages multiple contract pairs, contract selection, and provides
 * aggregated state management for the multi-contract architecture.
 */

import { writable, derived, readable, get } from 'svelte/store';
import { browser } from '$app/environment';
import type {
  ContractPair,
  MultiContractConfig,
  ContractContext,
  ContractHealthStatus,
  ContractPerformanceMetrics,
  AggregatedPortfolio,
  ContractPosition
} from '$lib/types/multiContract';
import { contractRegistry } from '$lib/services/contractRegistry';
import { MULTI_CONTRACT_CONFIG } from '$lib/constants/network';

// Store state interfaces
interface MultiContractState {
  config: MultiContractConfig | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
}

interface ContractSelectionState {
  selectedContractId: string | null;
  previousContractId: string | null;
  isChanging: boolean;
  changeError: string | null;
}

interface ContractHealthState {
  healthStatuses: Record<string, ContractHealthStatus>;
  lastHealthCheck: number;
  isRefreshingHealth: boolean;
  healthError: string | null;
}

interface ContractPerformanceState {
  performanceMetrics: Record<string, ContractPerformanceMetrics>;
  lastPerformanceUpdate: number;
  isRefreshingPerformance: boolean;
  performanceError: string | null;
}

interface AggregatedPortfolioState {
  portfolio: AggregatedPortfolio | null;
  isCalculating: boolean;
  calculationError: string | null;
  lastCalculated: number;
}


// Create store instances
const createMultiContractStore = () => {
  const state = writable<MultiContractState>({
    config: null,
    isInitialized: false,
    isLoading: false,
    error: null
  });

  const { subscribe, set, update } = state;

  return {
    subscribe,
    
    /**
     * Initialize the multi-contract store
     */
    async initialize(): Promise<void> {
      if (!browser) return;

      update(s => ({ ...s, isLoading: true, error: null }));

      try {
        // Get configuration from network constants
        if (!MULTI_CONTRACT_CONFIG) {
          throw new Error('No multi-contract configuration available');
        }

        // Note: Contract registry is already initialized in multiContractInit.ts
        // No need to initialize it again here

        update(s => ({
          ...s,
          config: MULTI_CONTRACT_CONFIG,
          isInitialized: true,
          isLoading: false
        }));

        console.log('Multi-contract store initialized');
      } catch (error) {
        console.error('Failed to initialize multi-contract store:', error);
        update(s => ({
          ...s,
          error: error instanceof Error ? error.message : 'Initialization failed',
          isLoading: false
        }));
      }
    },

    /**
     * Get all contracts
     */
    getAllContracts(): ContractPair[] {
      const currentState = get(state);
      return currentState.config?.contracts || [];
    },

    /**
     * Get contract by ID
     */
    getContract(contractId: string): ContractPair | null {
      const contracts = this.getAllContracts();
      return contracts.find(c => c.id === contractId) || null;
    },

    /**
     * Get default contract
     */
    getDefaultContract(): ContractPair | null {
      const currentState = get(state);
      if (!currentState.config) return null;
      return this.getContract(currentState.config.defaultContractId);
    },

    /**
     * Check if multi-contract mode is enabled
     */
    isMultiContractMode(): boolean {
      const contracts = this.getAllContracts();
      return contracts.length > 1;
    },

    /**
     * Reset store state
     */
    reset(): void {
      set({
        config: null,
        isInitialized: false,
        isLoading: false,
        error: null
      });
    }
  };
};

const createContractSelectionStore = () => {
  const state = writable<ContractSelectionState>({
    selectedContractId: null,
    previousContractId: null,
    isChanging: false,
    changeError: null
  });

  const { subscribe, set, update } = state;

  return {
    subscribe,

    /**
     * Select a contract by ID
     */
    async selectContract(contractId: string): Promise<void> {
      const currentState = get(state);
      
      // Don't change if already selected
      if (currentState.selectedContractId === contractId) {
        return;
      }

      // Validate contract exists
      const contract = multiContractStore.getContract(contractId);
      if (!contract) {
        update(s => ({ ...s, changeError: `Contract ${contractId} not found` }));
        return;
      }

      update(s => ({
        ...s,
        isChanging: true,
        changeError: null,
        previousContractId: s.selectedContractId
      }));

      try {
        update(s => ({
          ...s,
          selectedContractId: contractId,
          isChanging: false
        }));

        console.log(`Contract switched to: ${contractId}`);
        
        // Clear contract data cache for the new contract to force fresh data
        const { contractDataCache } = await import('$lib/services/contractDataCache');
        const newContract = multiContractStore.getContract(contractId);
        if (newContract) {
          contractDataCache.clearContractCache(newContract.slotMachineAppId);
        }
      } catch (error) {
        console.error('Failed to switch contract:', error);
        update(s => ({
          ...s,
          changeError: error instanceof Error ? error.message : 'Failed to switch contract',
          isChanging: false
        }));
      }
    },

    /**
     * Initialize selection store - select default contract
     */
    async initializeSelection(): Promise<void> {
      const currentState = get(state);
      
      // If no contract is selected, select the default one
      if (!currentState.selectedContractId) {
        const defaultContract = multiContractStore.getDefaultContract();
        if (defaultContract) {
          await this.selectContract(defaultContract.id);
        }
      }
    },

    /**
     * Get currently selected contract
     */
    getSelectedContract(): ContractPair | null {
      const currentState = get(state);
      return currentState.selectedContractId 
        ? contractRegistry.getContract(currentState.selectedContractId)
        : null;
    },

    /**
     * Clear selection
     */
    clearSelection(): void {
      update(s => ({
        ...s,
        selectedContractId: null,
        previousContractId: s.selectedContractId,
        changeError: null
      }));
    },

    /**
     * Reset store state
     */
    reset(): void {
      set({
        selectedContractId: null,
        previousContractId: null,
        isChanging: false,
        changeError: null
      });
    }
  };
};

const createContractHealthStore = () => {
  const state = writable<ContractHealthState>({
    healthStatuses: {},
    lastHealthCheck: 0,
    isRefreshingHealth: false,
    healthError: null
  });

  const { subscribe, set, update } = state;

  let healthCheckInterval: NodeJS.Timeout | null = null;

  return {
    subscribe,

    /**
     * Start periodic health checks
     */
    startHealthChecks(): void {
      // Health checks are now handled by contractRegistry to avoid duplication
      console.log('Health checks handled by contractRegistry, skipping duplicate initialization');
    },

    /**
     * Stop periodic health checks
     */
    stopHealthChecks(): void {
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
      }
    },

    /**
     * Refresh health status for all contracts
     */
    async refreshHealth(): Promise<void> {
      update(s => ({ ...s, isRefreshingHealth: true, healthError: null }));

      try {
        // Don't call refreshAllContractHealth - it's already being called by registry
        const healthStatuses = contractRegistry.getAllHealthStatuses();

        update(s => ({
          ...s,
          healthStatuses,
          lastHealthCheck: Date.now(),
          isRefreshingHealth: false
        }));
      } catch (error) {
        console.error('Failed to refresh contract health:', error);
        update(s => ({
          ...s,
          healthError: error instanceof Error ? error.message : 'Health check failed',
          isRefreshingHealth: false
        }));
      }
    },

    /**
     * Get health status for specific contract
     */
    getContractHealth(contractId: string): ContractHealthStatus | null {
      const currentState = get(state);
      return currentState.healthStatuses[contractId] || null;
    },

    /**
     * Check if all contracts are healthy
     */
    areAllContractsHealthy(): boolean {
      const currentState = get(state);
      const healthStatuses = Object.values(currentState.healthStatuses);
      return healthStatuses.every(status => status.status === 'healthy');
    },

    /**
     * Reset store state
     */
    reset(): void {
      this.stopHealthChecks();
      set({
        healthStatuses: {},
        lastHealthCheck: 0,
        isRefreshingHealth: false,
        healthError: null
      });
    }
  };
};

const createContractPerformanceStore = () => {
  const state = writable<ContractPerformanceState>({
    performanceMetrics: {},
    lastPerformanceUpdate: 0,
    isRefreshingPerformance: false,
    performanceError: null
  });

  const { subscribe, set, update } = state;

  return {
    subscribe,

    /**
     * Load performance metrics for all contracts
     */
    async loadPerformanceMetrics(): Promise<void> {
      update(s => ({ ...s, isRefreshingPerformance: true, performanceError: null }));

      try {
        // Get performance metrics from registry
        const performanceMetrics = contractRegistry.getAllPerformanceMetrics();

        update(s => ({
          ...s,
          performanceMetrics,
          lastPerformanceUpdate: Date.now(),
          isRefreshingPerformance: false
        }));
      } catch (error) {
        console.error('Failed to load performance metrics:', error);
        update(s => ({
          ...s,
          performanceError: error instanceof Error ? error.message : 'Performance load failed',
          isRefreshingPerformance: false
        }));
      }
    },

    /**
     * Get performance metrics for specific contract
     */
    getContractPerformance(contractId: string): ContractPerformanceMetrics | null {
      const currentState = get(state);
      return currentState.performanceMetrics[contractId] || null;
    },

    /**
     * Get total value locked across all contracts
     */
    getTotalValueLocked(): bigint {
      const currentState = get(state);
      return Object.values(currentState.performanceMetrics).reduce(
        (total, metrics) => total + metrics.totalValueLocked,
        BigInt(0)
      );
    },

    /**
     * Reset store state
     */
    reset(): void {
      set({
        performanceMetrics: {},
        lastPerformanceUpdate: 0,
        isRefreshingPerformance: false,
        performanceError: null
      });
    }
  };
};

const createAggregatedPortfolioStore = () => {
  const state = writable<AggregatedPortfolioState>({
    portfolio: null,
    isCalculating: false,
    calculationError: null,
    lastCalculated: 0
  });

  const { subscribe, set, update } = state;

  return {
    subscribe,

    /**
     * Calculate aggregated portfolio across all contracts
     */
    async calculatePortfolio(userAddress?: string): Promise<void> {
      if (!userAddress) {
        update(s => ({ 
          ...s, 
          portfolio: null, 
          calculationError: 'No user address provided' 
        }));
        return;
      }

      update(s => ({ ...s, isCalculating: true, calculationError: null }));

      try {
        // This would typically fetch user positions from each contract
        // For now, create a placeholder calculation
        const contracts = multiContractStore.getAllContracts();
        const positions: ContractPosition[] = [];

        // Calculate positions for each contract (placeholder)
        for (const contract of contracts) {
          // In real implementation, this would query YBT balance for each contract
          const shares = BigInt(0); // Placeholder
          const value = BigInt(0);   // Placeholder
          
          if (shares > 0) {
            positions.push({
              contractId: contract.id,
              shares,
              value,
              portfolioPercentage: 0, // Will be calculated below
              performance: {
                totalReturn: BigInt(0),
                totalReturnPercentage: 0,
                dailyReturn: BigInt(0),
                dailyReturnPercentage: 0
              }
            });
          }
        }

        // Calculate portfolio percentages
        const totalValue = positions.reduce((sum, pos) => sum + pos.value, BigInt(0));
        positions.forEach(pos => {
          pos.portfolioPercentage = totalValue > 0 
            ? Number((pos.value * BigInt(100)) / totalValue) 
            : 0;
        });

        const portfolio: AggregatedPortfolio = {
          totalValue,
          totalShares: positions.reduce((sum, pos) => sum + pos.shares, BigInt(0)),
          positions,
          performance: {
            totalReturn: BigInt(0),
            totalReturnPercentage: 0,
            bestPerformer: positions.length > 0 ? positions[0].contractId : '',
            worstPerformer: positions.length > 0 ? positions[0].contractId : '',
            diversificationScore: positions.length > 1 ? 80 : 0, // Placeholder
            sharpeRatio: 1.2 // Placeholder
          },
          riskDistribution: {
            riskLevels: {
              low: 30,
              medium: 50,
              high: 20
            },
            concentrationRisk: positions.length > 0 ? Math.max(...positions.map(p => p.portfolioPercentage)) : 0,
            rebalancingRecommendations: []
          }
        };

        update(s => ({
          ...s,
          portfolio,
          isCalculating: false,
          lastCalculated: Date.now()
        }));

      } catch (error) {
        console.error('Failed to calculate aggregated portfolio:', error);
        update(s => ({
          ...s,
          calculationError: error instanceof Error ? error.message : 'Portfolio calculation failed',
          isCalculating: false
        }));
      }
    },

    /**
     * Get current portfolio
     */
    getPortfolio(): AggregatedPortfolio | null {
      const currentState = get(state);
      return currentState.portfolio;
    },

    /**
     * Reset store state
     */
    reset(): void {
      set({
        portfolio: null,
        isCalculating: false,
        calculationError: null,
        lastCalculated: 0
      });
    }
  };
};

// Create store instances
export const multiContractStore = createMultiContractStore();
export const contractSelectionStore = createContractSelectionStore();
export const contractHealthStore = createContractHealthStore();
export const contractPerformanceStore = createContractPerformanceStore();
export const aggregatedPortfolioStore = createAggregatedPortfolioStore();

// Derived stores  
export const selectedContract = derived(
  [contractSelectionStore], 
  ([$selection]) => {
    if (!$selection.selectedContractId) return null;
    return multiContractStore.getContract($selection.selectedContractId);
  }
);

export const availableContracts = derived(multiContractStore, ($store) => {
  return $store.config?.contracts || [];
});

export const activeContracts = derived(multiContractStore, ($store) => {
  const contracts = $store.config?.contracts || [];
  return contracts.filter(c => c.status === 'active');
});

export const gameplayContracts = derived(multiContractStore, ($store) => {
  const contracts = $store.config?.contracts || [];
  return contracts.filter(c => 
    c.status === 'active' && c.features.gameplayEnabled
  );
});

export const houseDashboardContracts = derived(multiContractStore, ($store) => {
  const contracts = $store.config?.contracts || [];
  return contracts.filter(c => c.features.houseDashboardEnabled);
});

export const isMultiContractMode = derived(multiContractStore, ($store) => {
  const contracts = $store.config?.contracts || [];
  return contracts.length > 1;
});

export const contractContext = derived(
  [multiContractStore, contractSelectionStore, contractHealthStore],
  ([$multi, $selection, $health]): ContractContext => ({
    selectedContract: $selection.selectedContractId 
      ? multiContractStore.getContract($selection.selectedContractId)
      : null,
    availableContracts: $multi.config?.contracts || [],
    healthStatuses: $health.healthStatuses,
    isLoading: $multi.isLoading || $selection.isChanging,
    error: $multi.error || $selection.changeError || $health.healthError
  })
);

// Initialization guard
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Store initialization and cleanup
export const initializeMultiContractStores = async () => {
  if (!browser) return;
  
  // Return existing initialization if already in progress
  if (initializationPromise) {
    return initializationPromise;
  }
  
  // Skip if already initialized
  if (isInitialized) {
    console.log('Multi-contract stores already initialized, skipping');
    return;
  }
  
  initializationPromise = (async () => {
    try {
      await multiContractStore.initialize();
      await contractSelectionStore.initializeSelection();
      contractHealthStore.startHealthChecks();
      await contractPerformanceStore.loadPerformanceMetrics();
      
      isInitialized = true;
      console.log('Multi-contract stores initialized');
    } catch (error) {
      console.error('Failed to initialize multi-contract stores:', error);
      throw error;
    } finally {
      initializationPromise = null;
    }
  })();
  
  return initializationPromise;
};

export const resetMultiContractStores = () => {
  multiContractStore.reset();
  contractSelectionStore.reset();
  contractHealthStore.reset();
  contractPerformanceStore.reset();
  aggregatedPortfolioStore.reset();
};

// Auto-initialization removed to prevent duplicate API calls
// Pages should explicitly call initializeMultiContractStores() in their onMount