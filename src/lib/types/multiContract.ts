/**
 * Multi-Contract Architecture Types
 * 
 * This module defines the core types and interfaces for supporting multiple
 * slot machine + YBT contract pairs in the House of VOI application.
 */

// Core contract pair structure
export interface ContractPair {
  /** Unique identifier for this contract pair */
  id: string;
  
  /** Display name for the contract pair (e.g., "High Roller Slots") */
  name: string;
  
  /** Detailed description of the contract pair */
  description: string;
  
  /** Slot machine contract application ID */
  slotMachineAppId: number;
  
  /** Yield bearing token contract application ID */
  ybtAppId: number;
  
  /** Current operational status */
  status: ContractStatus;
  
  /** Theme identifier for UI customization */
  theme?: string;
  
  /** Additional metadata and configuration */
  metadata: ContractMetadata;
  
  /** Order for display purposes */
  displayOrder: number;
  
  /** Feature flags for this contract */
  features: ContractFeatures;
  
  /** Network configuration override (optional) */
  networkConfig?: ContractNetworkConfig;
}

// Contract operational status
export type ContractStatus = 
  | 'active'      // Fully operational
  | 'inactive'    // Temporarily disabled
  | 'maintenance' // Under maintenance
  | 'deprecated'  // Being phased out
  | 'testing';    // Testing/beta phase

// Contract metadata
export interface ContractMetadata {
  /** Contract version */
  version: string;
  
  /** Contract deployment date */
  deployedAt: number;
  
  /** Contract creator/owner */
  owner: string;
  
  /** Minimum bet amount in microVOI */
  minBet: number;
  
  /** Maximum bet amount in microVOI */
  maxBet: number;
  
  /** Maximum paylines available */
  maxPaylines: number;
  
  /** House edge percentage (e.g., 5.0 for 5%) */
  houseEdge: number;
  
  /** Contract-specific symbols */
  symbols: string[];
  
  /** Custom payouts table */
  payouts?: Record<string, Record<number, number>>;
  
  /** Machine icon identifier (for UI display) */
  icon?: string;
  
  /** Machine thumbnail/preview image URL */
  thumbnail?: string;
  
  /** Contract-specific settings */
  settings: ContractSettings;
}

// Contract feature flags
export interface ContractFeatures {
  /** Whether this contract supports deposits */
  depositsEnabled: boolean;
  
  /** Whether this contract supports withdrawals */
  withdrawalsEnabled: boolean;
  
  /** Whether this contract supports gameplay */
  gameplayEnabled: boolean;
  
  /** Whether this contract shows in house dashboard */
  houseDashboardEnabled: boolean;
  
  /** Whether this contract shows in player selection */
  playerSelectionEnabled: boolean;
  
  /** Whether this contract supports staking */
  stakingEnabled: boolean;
  
  /** Whether this contract supports leaderboards */
  leaderboardEnabled: boolean;
  
  /** Whether this contract is in beta/testing mode */
  betaMode: boolean;
}

// Contract-specific settings
export interface ContractSettings {
  /** Transaction timeout in seconds */
  transactionTimeout: number;
  
  /** Maximum retry attempts for failed transactions */
  maxRetries: number;
  
  /** Auto-refresh interval for balances in ms */
  refreshInterval: number;
  
  /** Whether to show detailed transaction history */
  showTransactionHistory: boolean;
  
  /** Custom UI theme overrides */
  themeOverrides?: Record<string, any>;
  
  /** Contract-specific API endpoints */
  apiEndpoints?: Record<string, string>;
}

// Network configuration override for specific contracts
export interface ContractNetworkConfig {
  /** Custom node URL for this contract */
  nodeUrl?: string;
  
  /** Custom indexer URL for this contract */
  indexerUrl?: string;
  
  /** Custom network token */
  token?: string;
  
  /** Custom port */
  port?: number;
}

// Multi-contract configuration
export interface MultiContractConfig {
  /** All available contract pairs */
  contracts: ContractPair[];
  
  /** Default contract ID to use when none is selected */
  defaultContractId: string;
  
  /** Global settings applying to all contracts */
  globalSettings: GlobalContractSettings;
  
  /** Feature flags for multi-contract functionality */
  multiContractFeatures: MultiContractFeatures;
}

// Global settings for multi-contract environment
export interface GlobalContractSettings {
  /** Whether to show aggregated portfolio view */
  showAggregatedPortfolio: boolean;
  
  /** Whether to enable contract switching */
  enableContractSwitching: boolean;
  
  /** Whether to show cross-contract statistics */
  showCrossContractStats: boolean;
  
  /** How often to refresh contract health status */
  healthCheckInterval: number;
  
  /** Whether to cache contract data across sessions */
  enablePersistentCache: boolean;
  
  /** Whether to preload contract data for faster switching */
  preloadContractData: boolean;
}

// Multi-contract feature flags
export interface MultiContractFeatures {
  /** Enable portfolio aggregation across contracts */
  portfolioAggregation: boolean;
  
  /** Enable contract comparison tools */
  contractComparison: boolean;
  
  /** Enable cross-contract leaderboards */
  crossContractLeaderboards: boolean;
  
  /** Enable contract migration tools */
  contractMigration: boolean;
  
  /** Enable performance analytics across contracts */
  performanceAnalytics: boolean;
  
  /** Enable risk distribution analysis */
  riskDistributionAnalysis: boolean;
}


// Contract health status
export interface ContractHealthStatus {
  /** Contract pair ID */
  contractId: string;
  
  /** Overall health status */
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  
  /** Specific health checks */
  checks: {
    slotMachineContract: HealthCheck;
    ybtContract: HealthCheck;
    networkConnection: HealthCheck;
    balanceConsistency: HealthCheck;
  };
  
  /** Last health check timestamp */
  lastChecked: number;
  
  /** Health check duration in ms */
  checkDuration: number;
}

// Individual health check result
export interface HealthCheck {
  /** Check status */
  status: 'pass' | 'warn' | 'fail';
  
  /** Check message */
  message: string;
  
  /** Additional check data */
  data?: any;
  
  /** Check timestamp */
  timestamp: number;
}

// Contract selection context
export interface ContractContext {
  /** Currently selected contract */
  selectedContract: ContractPair | null;
  
  /** All available contracts */
  availableContracts: ContractPair[];
  
  /** Contract health statuses */
  healthStatuses: Record<string, ContractHealthStatus>;
  
  /** Whether contract data is loading */
  isLoading: boolean;
  
  /** Any error in contract loading */
  error: string | null;
}

// Contract performance metrics
export interface ContractPerformanceMetrics {
  /** Contract ID */
  contractId: string;
  
  /** Total value locked in contract */
  totalValueLocked: bigint;
  
  /** Total volume processed */
  totalVolume: bigint;
  
  /** Number of active users */
  activeUsers: number;
  
  /** Average daily volume */
  averageDailyVolume: bigint;
  
  /** House edge performance */
  actualHouseEdge: number;
  
  /** Transaction success rate */
  transactionSuccessRate: number;
  
  /** Average transaction time */
  averageTransactionTime: number;
  
  /** Last 24h statistics */
  last24h: {
    volume: bigint;
    transactions: number;
    uniqueUsers: number;
    totalPayout: bigint;
  };
  
  /** Historical performance data */
  historical: HistoricalPerformance[];
}

// Historical performance data point
export interface HistoricalPerformance {
  /** Timestamp */
  timestamp: number;
  
  /** Daily volume */
  volume: bigint;
  
  /** Daily transactions */
  transactions: number;
  
  /** Daily unique users */
  uniqueUsers: number;
  
  /** Daily payout */
  payout: bigint;
}

// Aggregated portfolio data across contracts
export interface AggregatedPortfolio {
  /** Total value across all contracts */
  totalValue: bigint;
  
  /** Total shares across all contracts */
  totalShares: bigint;
  
  /** Individual contract positions */
  positions: ContractPosition[];
  
  /** Portfolio performance metrics */
  performance: PortfolioPerformance;
  
  /** Risk distribution */
  riskDistribution: RiskDistribution;
}

// Individual contract position in portfolio
export interface ContractPosition {
  /** Contract ID */
  contractId: string;
  
  /** User shares in this contract */
  shares: bigint;
  
  /** Value of shares in this contract */
  value: bigint;
  
  /** Percentage of total portfolio */
  portfolioPercentage: number;
  
  /** Performance metrics for this position */
  performance: {
    totalReturn: bigint;
    totalReturnPercentage: number;
    dailyReturn: bigint;
    dailyReturnPercentage: number;
  };
}

// Portfolio performance metrics
export interface PortfolioPerformance {
  /** Total return across all contracts */
  totalReturn: bigint;
  
  /** Total return percentage */
  totalReturnPercentage: number;
  
  /** Best performing contract */
  bestPerformer: string;
  
  /** Worst performing contract */
  worstPerformer: string;
  
  /** Portfolio diversification score (0-100) */
  diversificationScore: number;
  
  /** Risk-adjusted return */
  sharpeRatio: number;
}

// Risk distribution analysis
export interface RiskDistribution {
  /** Risk level distribution */
  riskLevels: {
    low: number;      // Percentage in low-risk contracts
    medium: number;   // Percentage in medium-risk contracts
    high: number;     // Percentage in high-risk contracts
  };
  
  /** Concentration risk (percentage in single contract) */
  concentrationRisk: number;
  
  /** Recommended rebalancing actions */
  rebalancingRecommendations: RebalancingRecommendation[];
}

// Rebalancing recommendation
export interface RebalancingRecommendation {
  /** Recommendation type */
  type: 'increase' | 'decrease' | 'maintain';
  
  /** Target contract ID */
  contractId: string;
  
  /** Recommended amount to move */
  recommendedAmount: bigint;
  
  /** Reason for recommendation */
  reason: string;
  
  /** Expected impact on risk/return */
  expectedImpact: {
    riskChange: number;
    expectedReturnChange: number;
  };
}



// Utility types for contract operations
export type ContractOperationType = 
  | 'deposit'
  | 'withdraw' 
  | 'spin'
  | 'claim'
  | 'stake'
  | 'unstake';

export interface ContractOperation {
  /** Operation ID */
  id: string;
  
  /** Contract ID */
  contractId: string;
  
  /** Operation type */
  type: ContractOperationType;
  
  /** Operation amount */
  amount: bigint;
  
  /** Transaction ID */
  txId?: string;
  
  /** Operation status */
  status: 'pending' | 'confirmed' | 'failed';
  
  /** Operation timestamp */
  timestamp: number;
  
  /** User address */
  userAddress: string;
  
  /** Additional operation data */
  metadata?: Record<string, any>;
}

// Export utility functions type definitions
export type ContractValidator = (contract: ContractPair) => boolean;
export type ContractFilter = (contract: ContractPair) => boolean;
export type ContractSorter = (a: ContractPair, b: ContractPair) => number;