import type { MultiContractConfig } from '$lib/types/multiContract';

export const CONTRACTS_CONFIG: MultiContractConfig = {
  contracts: [
    {
      id: 'alpha-1',
      name: 'Original Alpha Slots',
      description: 'The original alpha slot machine',
      slotMachineAppId: 40879920,
      ybtAppId: 40879921,
      status: 'active',
      theme: 'default',
      displayOrder: 0,
      metadata: {
        version: '1.0.0',
        deployedAt: 1704067200000, // 2025-08-28
        owner: '',
        minBet: 1000000, // 1 VOI
        maxBet: 100000000, // 100 VOI
        maxPaylines: 20,
        houseEdge: 5.0,
        symbols: ['A', 'B', 'C', 'D', '_'],
        settings: {
          transactionTimeout: 10,
          maxRetries: 3,
          refreshInterval: 30000,
          showTransactionHistory: true
        }
      },
      features: {
        depositsEnabled: true,
        withdrawalsEnabled: true,
        gameplayEnabled: true,
        houseDashboardEnabled: true,
        playerSelectionEnabled: true,
        stakingEnabled: true,
        leaderboardEnabled: true,
        betaMode: false
      }
    },
    {
      id: 'alpha-2',
      name: 'New Alpha Slots',
      description: 'A new alpha slot machine for testing',
      slotMachineAppId: 41501763,
      ybtAppId: 41501764,
      status: 'active',
      theme: 'default',
      displayOrder: 0,
      metadata: {
        version: '1.0.0',
        deployedAt: 1704067200000, // 2025-08-28
        owner: '',
        minBet: 1000000, // 1 VOI
        maxBet: 100000000, // 100 VOI
        maxPaylines: 20,
        houseEdge: 5.0,
        symbols: ['A', 'B', 'C', 'D', '_'],
        settings: {
          transactionTimeout: 10,
          maxRetries: 3,
          refreshInterval: 30000,
          showTransactionHistory: true
        }
      },
      features: {
        depositsEnabled: true,
        withdrawalsEnabled: true,
        gameplayEnabled: true,
        houseDashboardEnabled: true,
        playerSelectionEnabled: true,
        stakingEnabled: true,
        leaderboardEnabled: true,
        betaMode: false
      }
    }
  ],
  defaultContractId: 'alpha-1',
  globalSettings: {
    showAggregatedPortfolio: true,
    enableContractSwitching: false,
    showCrossContractStats: false,
    healthCheckInterval: 300000, // 5 minutes
    enablePersistentCache: true,
    preloadContractData: true
  },
  multiContractFeatures: {
    portfolioAggregation: true,
    contractComparison: false,
    crossContractLeaderboards: false,
    contractMigration: false,
    performanceAnalytics: true,
    riskDistributionAnalysis: false
  }
};