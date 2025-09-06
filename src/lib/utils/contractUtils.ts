/**
 * Contract Utilities
 * 
 * Utility functions for working with multi-contract data types,
 * validation, filtering, and manipulation.
 */

import type {
  ContractPair,
  ContractStatus,
  ContractHealthStatus,
  ContractValidator,
  ContractFilter,
  ContractSorter,
  MultiContractConfig,
  ContractPerformanceMetrics,
  AggregatedPortfolio,
  ContractPosition,
  ContractComparison
} from '$lib/types/multiContract';

// Contract validation functions
export const contractValidators = {
  /**
   * Validates that a contract pair has all required fields (minimal validation)
   */
  isValidContractPair: ((contract: ContractPair): boolean => {
    return !!(
      contract.id &&
      contract.slotMachineAppId > 0 &&
      contract.ybtAppId > 0 &&
      Number.isInteger(contract.slotMachineAppId) &&
      Number.isInteger(contract.ybtAppId)
    );
  }) as ContractValidator,

  /**
   * Validates that contract app IDs are positive integers
   */
  hasValidAppIds: ((contract: ContractPair): boolean => {
    return contract.slotMachineAppId > 0 && 
           contract.ybtAppId > 0 &&
           Number.isInteger(contract.slotMachineAppId) &&
           Number.isInteger(contract.ybtAppId);
  }) as ContractValidator,

  /**
   * Validates that contract has valid metadata (very lenient)
   */
  hasValidMetadata: ((contract: ContractPair): boolean => {
    // Just check if metadata exists - everything else is optional
    return !!contract.metadata;
  }) as ContractValidator
};

// Contract filtering functions
export const contractFilters = {
  /**
   * Filter contracts by status
   */
  byStatus: (status: ContractStatus): ContractFilter => {
    return (contract: ContractPair): boolean => contract.status === status;
  },

  /**
   * Filter active contracts only
   */
  activeOnly: ((contract: ContractPair): boolean => {
    return contract.status === 'active';
  }) as ContractFilter,

  /**
   * Filter contracts available for gameplay
   */
  gameplayEnabled: ((contract: ContractPair): boolean => {
    return contract.status === 'active' && contract.features.gameplayEnabled;
  }) as ContractFilter,

  /**
   * Filter contracts available for deposits
   */
  depositsEnabled: ((contract: ContractPair): boolean => {
    return contract.status === 'active' && contract.features.depositsEnabled;
  }) as ContractFilter,

  /**
   * Filter contracts available for withdrawals
   */
  withdrawalsEnabled: ((contract: ContractPair): boolean => {
    return contract.status === 'active' && contract.features.withdrawalsEnabled;
  }) as ContractFilter,

  /**
   * Filter contracts visible in house dashboard
   */
  houseDashboardVisible: ((contract: ContractPair): boolean => {
    return contract.features.houseDashboardEnabled;
  }) as ContractFilter,

  /**
   * Filter contracts visible in player selection
   */
  playerSelectionVisible: ((contract: ContractPair): boolean => {
    return contract.features.playerSelectionEnabled && contract.status === 'active';
  }) as ContractFilter,

  /**
   * Filter contracts by minimum bet amount
   */
  byMinBet: (maxMinBet: number): ContractFilter => {
    return (contract: ContractPair): boolean => contract.metadata.minBet <= maxMinBet;
  },

  /**
   * Filter contracts by maximum bet amount
   */
  byMaxBet: (minMaxBet: number): ContractFilter => {
    return (contract: ContractPair): boolean => contract.metadata.maxBet >= minMaxBet;
  },

  /**
   * Filter non-beta contracts
   */
  nonBeta: ((contract: ContractPair): boolean => {
    return !contract.features.betaMode;
  }) as ContractFilter
};

// Contract sorting functions
export const contractSorters = {
  /**
   * Sort by display order
   */
  byDisplayOrder: ((a: ContractPair, b: ContractPair): number => {
    return a.displayOrder - b.displayOrder;
  }) as ContractSorter,

  /**
   * Sort by name alphabetically
   */
  byName: ((a: ContractPair, b: ContractPair): number => {
    return a.name.localeCompare(b.name);
  }) as ContractSorter,

  /**
   * Sort by status (active first)
   */
  byStatus: ((a: ContractPair, b: ContractPair): number => {
    const statusOrder = { 'active': 0, 'testing': 1, 'inactive': 2, 'maintenance': 3, 'deprecated': 4 };
    return statusOrder[a.status] - statusOrder[b.status];
  }) as ContractSorter,

  /**
   * Sort by deployment date (newest first)
   */
  byDeployDate: ((a: ContractPair, b: ContractPair): number => {
    return b.metadata.deployedAt - a.metadata.deployedAt;
  }) as ContractSorter,

  /**
   * Sort by minimum bet (lowest first)
   */
  byMinBet: ((a: ContractPair, b: ContractPair): number => {
    return a.metadata.minBet - b.metadata.minBet;
  }) as ContractSorter,

  /**
   * Sort by house edge (lowest first)
   */
  byHouseEdge: ((a: ContractPair, b: ContractPair): number => {
    return a.metadata.houseEdge - b.metadata.houseEdge;
  }) as ContractSorter
};

// Contract manipulation functions
export const contractUtils = {
  /**
   * Find contract by ID
   */
  findById: (contracts: ContractPair[], id: string): ContractPair | undefined => {
    return contracts.find(contract => contract.id === id);
  },

  /**
   * Get contracts matching multiple filters
   */
  filterContracts: (contracts: ContractPair[], filters: ContractFilter[]): ContractPair[] => {
    return contracts.filter(contract => 
      filters.every(filter => filter(contract))
    );
  },

  /**
   * Sort and filter contracts
   */
  processContracts: (
    contracts: ContractPair[], 
    filters: ContractFilter[] = [], 
    sorter?: ContractSorter
  ): ContractPair[] => {
    let result = contractUtils.filterContracts(contracts, filters);
    
    if (sorter) {
      result = result.sort(sorter);
    }
    
    return result;
  },

  /**
   * Validate contract configuration
   */
  validateConfig: (config: MultiContractConfig): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    // Check if contracts array exists and is not empty
    if (!config.contracts || !Array.isArray(config.contracts) || config.contracts.length === 0) {
      errors.push('Configuration must contain at least one contract');
      return { valid: false, errors };
    }

    // Check default contract ID exists
    if (!config.defaultContractId) {
      errors.push('Configuration must specify a default contract ID');
    } else {
      const defaultExists = config.contracts.some(c => c.id === config.defaultContractId);
      if (!defaultExists) {
        errors.push(`Default contract ID '${config.defaultContractId}' not found in contracts`);
      }
    }

    // Validate each contract
    config.contracts.forEach((contract, index) => {
      const contractErrors = contractUtils.validateContract(contract);
      if (contractErrors.length > 0) {
        errors.push(`Contract ${index + 1} (${contract.id || 'unnamed'}): ${contractErrors.join(', ')}`);
      }
    });

    // Check for duplicate contract IDs
    const ids = config.contracts.map(c => c.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate contract IDs found: ${duplicates.join(', ')}`);
    }

    // Check for duplicate app IDs
    const slotAppIds = config.contracts.map(c => c.slotMachineAppId);
    const ybtAppIds = config.contracts.map(c => c.ybtAppId);
    const duplicateSlotIds = slotAppIds.filter((id, index) => slotAppIds.indexOf(id) !== index);
    const duplicateYbtIds = ybtAppIds.filter((id, index) => ybtAppIds.indexOf(id) !== index);
    
    if (duplicateSlotIds.length > 0) {
      errors.push(`Duplicate slot machine app IDs found: ${duplicateSlotIds.join(', ')}`);
    }
    if (duplicateYbtIds.length > 0) {
      errors.push(`Duplicate YBT app IDs found: ${duplicateYbtIds.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Validate individual contract
   */
  validateContract: (contract: ContractPair): string[] => {
    const errors: string[] = [];

    // Run all validators
    const validators = Object.values(contractValidators);
    validators.forEach(validator => {
      try {
        if (!validator(contract)) {
          errors.push(`Contract validation failed: ${validator.name}`);
        }
      } catch (error) {
        errors.push(`Contract validation error: ${error}`);
      }
    });

    return errors;
  },

  /**
   * Get contract display name with fallback
   */
  getDisplayName: (contract: ContractPair): string => {
    return contract.name || `Contract ${contract.id}`;
  },

  /**
   * Get contract status display information
   */
  getStatusInfo: (status: ContractStatus): { label: string; color: string; description: string } => {
    const statusMap = {
      'active': {
        label: 'Active',
        color: 'green',
        description: 'Fully operational and available for use'
      },
      'inactive': {
        label: 'Inactive',
        color: 'gray',
        description: 'Temporarily disabled'
      },
      'maintenance': {
        label: 'Maintenance',
        color: 'yellow',
        description: 'Under maintenance, limited functionality'
      },
      'deprecated': {
        label: 'Deprecated',
        color: 'orange',
        description: 'Being phased out, use discouraged'
      },
      'testing': {
        label: 'Testing',
        color: 'blue',
        description: 'In testing phase, may have limited features'
      }
    };

    return statusMap[status] || {
      label: 'Unknown',
      color: 'gray',
      description: 'Status unknown'
    };
  },

  /**
   * Check if contract is healthy based on health status
   */
  isHealthy: (healthStatus: ContractHealthStatus): boolean => {
    return healthStatus.status === 'healthy';
  },

  /**
   * Get aggregated health score for contract
   */
  getHealthScore: (healthStatus: ContractHealthStatus): number => {
    const checks = Object.values(healthStatus.checks);
    const passCount = checks.filter(check => check.status === 'pass').length;
    return (passCount / checks.length) * 100;
  },

  /**
   * Format contract amounts using proper decimals
   */
  formatAmount: (amount: bigint, decimals: number = 6): string => {
    const divisor = BigInt(10 ** decimals);
    const wholePart = amount / divisor;
    const fractionalPart = amount % divisor;
    
    if (fractionalPart === BigInt(0)) {
      return wholePart.toString();
    }
    
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmedFractional = fractionalStr.replace(/0+$/, '');
    
    return `${wholePart}.${trimmedFractional}`;
  },

  /**
   * Calculate portfolio metrics across contracts
   */
  calculatePortfolioMetrics: (positions: ContractPosition[]): {
    totalValue: bigint;
    diversificationScore: number;
    concentrationRisk: number;
  } => {
    if (positions.length === 0) {
      return { totalValue: BigInt(0), diversificationScore: 0, concentrationRisk: 100 };
    }

    const totalValue = positions.reduce((sum, pos) => sum + pos.value, BigInt(0));
    
    // Calculate concentration risk (percentage in largest position)
    const largestPosition = positions.reduce((max, pos) => pos.value > max ? pos.value : max, BigInt(0));
    const concentrationRisk = totalValue > 0 ? Number((largestPosition * BigInt(100)) / totalValue) : 100;
    
    // Calculate diversification score (inverse of concentration, with position count factor)
    const positionCountFactor = Math.min(positions.length / 5, 1); // Max benefit at 5+ positions
    const diversificationScore = (100 - concentrationRisk) * positionCountFactor;
    
    return {
      totalValue,
      diversificationScore: Math.round(diversificationScore),
      concentrationRisk: Math.round(concentrationRisk)
    };
  },

  /**
   * Compare contract performance metrics
   */
  compareContracts: (
    contracts: ContractPair[], 
    metrics: Record<string, ContractPerformanceMetrics>
  ): ContractComparison => {
    const contractIds = contracts.map(c => c.id);
    
    const comparison: ContractComparison = {
      contracts: contractIds,
      metrics: {
        totalValueLocked: {},
        houseEdge: {},
        averageReturn: {},
        riskScore: {},
        liquidityScore: {},
        userSatisfaction: {}
      },
      recommendation: {
        bestOverall: contractIds[0] || '',
        bestForRisk: contractIds[0] || '',
        bestForReturn: contractIds[0] || '',
        bestForLiquidity: contractIds[0] || ''
      }
    };

    // Populate metrics
    contractIds.forEach(id => {
      const contract = contracts.find(c => c.id === id);
      const metric = metrics[id];
      
      if (contract && metric) {
        comparison.metrics.totalValueLocked[id] = metric.totalValueLocked;
        comparison.metrics.houseEdge[id] = contract.metadata.houseEdge;
        comparison.metrics.averageReturn[id] = 100 - contract.metadata.houseEdge; // Simplified
        comparison.metrics.riskScore[id] = contract.metadata.houseEdge; // Simplified risk score
        comparison.metrics.liquidityScore[id] = Number(metric.totalValueLocked) / 1000000; // Simplified
        comparison.metrics.userSatisfaction[id] = metric.transactionSuccessRate; // Using success rate as proxy
      }
    });

    // Determine recommendations (simplified algorithm)
    let bestTVL = BigInt(0);
    let lowestRisk = 100;
    let highestReturn = 0;
    let bestLiquidity = 0;

    contractIds.forEach(id => {
      const tvl = comparison.metrics.totalValueLocked[id] || BigInt(0);
      const risk = comparison.metrics.riskScore[id] || 100;
      const returns = comparison.metrics.averageReturn[id] || 0;
      const liquidity = comparison.metrics.liquidityScore[id] || 0;

      if (tvl > bestTVL) {
        comparison.recommendation.bestOverall = id;
        bestTVL = tvl;
      }
      if (risk < lowestRisk) {
        comparison.recommendation.bestForRisk = id;
        lowestRisk = risk;
      }
      if (returns > highestReturn) {
        comparison.recommendation.bestForReturn = id;
        highestReturn = returns;
      }
      if (liquidity > bestLiquidity) {
        comparison.recommendation.bestForLiquidity = id;
        bestLiquidity = liquidity;
      }
    });

    return comparison;
  }
};

// Export convenience functions for common operations
export const getActiveContracts = (contracts: ContractPair[]): ContractPair[] => 
  contractUtils.processContracts(contracts, [contractFilters.activeOnly], contractSorters.byDisplayOrder);

export const getGameplayContracts = (contracts: ContractPair[]): ContractPair[] =>
  contractUtils.processContracts(contracts, [contractFilters.gameplayEnabled], contractSorters.byDisplayOrder);

export const getHouseDashboardContracts = (contracts: ContractPair[]): ContractPair[] =>
  contractUtils.processContracts(contracts, [contractFilters.houseDashboardVisible], contractSorters.byDisplayOrder);

export const getPlayerSelectionContracts = (contracts: ContractPair[]): ContractPair[] =>
  contractUtils.processContracts(contracts, [contractFilters.playerSelectionVisible], contractSorters.byDisplayOrder);

// Default export
export default contractUtils;