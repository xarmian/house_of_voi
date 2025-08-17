import { env } from '$env/dynamic/public';

export const NETWORK_CONFIG = {
  nodeUrl: env.PUBLIC_VOI_NODE_URL || '',
  indexerUrl: env.PUBLIC_VOI_INDEXER_URL || '',
  genesisId: env.PUBLIC_NETWORK_GENESIS_ID || '',
  genesisHash: env.PUBLIC_NETWORK_GENESIS_HASH || '',
  port: parseInt(env.PUBLIC_VOI_PORT || '443'),
  token: env.PUBLIC_VOI_TOKEN || ''
} as const;

// Phase 7: Enable configuration validation for blockchain integration
if (typeof window !== 'undefined') {
  // Only validate in browser environment
  if (!NETWORK_CONFIG.nodeUrl || !NETWORK_CONFIG.indexerUrl) {
    console.warn('Missing required network configuration. Some blockchain features may not work.');
  }
  
  if (!NETWORK_CONFIG.genesisId) {
    console.warn('Missing network genesis ID. Check PUBLIC_NETWORK_GENESIS_ID environment variable.');
  }
}

export const CONTRACT_CONFIG = {
  slotMachineAppId: parseInt(env.PUBLIC_SLOT_MACHINE_APP_ID || '0'),
} as const;

// Phase 7: Enable contract validation for blockchain integration  
if (typeof window !== 'undefined') {
  // Only validate in browser environment
  if (!CONTRACT_CONFIG.slotMachineAppId || CONTRACT_CONFIG.slotMachineAppId === 0) {
    console.warn('Missing or invalid slot machine app ID. Check PUBLIC_SLOT_MACHINE_APP_ID environment variable.');
  }
}

export const GAME_CONFIG = {
  minBet: 1000000, // 1 VOI in microVOI
  maxBet: 20000000, // 20 VOI in microVOI
  maxPaylines: 20,
  symbols: ['A', 'B', 'C', 'D', '_'] as const
} as const;

// Phase 7: Additional network configuration for blockchain integration
export const BLOCKCHAIN_CONFIG = {
  // Transaction settings
  transactionTimeout: parseInt(env.PUBLIC_TRANSACTION_TIMEOUT || '10'), // rounds to wait for confirmation
  maxRetries: 3,
  retryDelay: 5000, // ms
  
  // Network monitoring
  statusCheckInterval: 10000, // ms
  roundCacheTimeout: 30000, // ms
  
  // VOI Network specific
  blockTime: 3000, // ~3 seconds per round
  explorerUrl: 'https://voi.observer/explorer',
  
  // Contract interaction
  maxExtraPayment: 1_000_000, // 1 VOI for transaction fees
  
  // Queue processing
  queueProcessInterval: parseInt(env.PUBLIC_QUEUE_PROCESS_INTERVAL || '3000'), // ms
  maxConcurrentSpins: 10,
  
  // Performance settings
  balanceRefreshInterval: parseInt(env.PUBLIC_BALANCE_REFRESH_INTERVAL || '30000'), // ms
  
  // Debug settings
  debugMode: env.PUBLIC_DEBUG_MODE === 'true',
  enableLogging: env.PUBLIC_ENABLE_LOGGING === 'true'
} as const;