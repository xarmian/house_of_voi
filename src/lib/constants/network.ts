import { env } from '$env/dynamic/public';
import { CONTRACTS_CONFIG } from '$lib/config/contracts.config';

export const NETWORK_CONFIG = {
  nodeUrl: env.PUBLIC_VOI_NODE_URL || 'https://mainnet-api.voi.nodely.dev',
  indexerUrl: env.PUBLIC_VOI_INDEXER_URL || 'https://mainnet-idx.voi.nodely.dev',
  port: parseInt(env.PUBLIC_VOI_PORT || '443'),
  token: env.PUBLIC_VOI_TOKEN || ''
} as const;

// Phase 7: Enable configuration validation for blockchain integration
if (typeof window !== 'undefined') {
  // Only validate in browser environment
  if (!NETWORK_CONFIG.nodeUrl || !NETWORK_CONFIG.indexerUrl) {
    console.warn('Missing required network configuration. Some blockchain features may not work.');
  }
}





// Export multi-contract configuration
export const MULTI_CONTRACT_CONFIG = CONTRACTS_CONFIG;

// Helper function to get contract configuration mode
export function getContractMode(): 'single' | 'multi' {
  return MULTI_CONTRACT_CONFIG.contracts.length === 1 ? 'single' : 'multi';
}

// Helper function to get all contract app IDs (for validation)
export function getAllContractAppIds(): { slotMachineAppIds: number[]; ybtAppIds: number[] } {
  return {
    slotMachineAppIds: MULTI_CONTRACT_CONFIG.contracts.map(c => c.slotMachineAppId),
    ybtAppIds: MULTI_CONTRACT_CONFIG.contracts.map(c => c.ybtAppId)
  };
}

// Validation for contract configuration
if (typeof window !== 'undefined') {
  // Only validate in browser environment
  const mode = getContractMode();
  console.log(`✅ Contract registry initialized in ${mode} mode with ${MULTI_CONTRACT_CONFIG.contracts.length} contract(s)`);
  
  // Debug log the configuration
  console.log('📋 Multi-contract configuration:', {
    defaultContractId: MULTI_CONTRACT_CONFIG.defaultContractId,
    contracts: MULTI_CONTRACT_CONFIG.contracts.map(c => ({
      id: c.id,
      name: c.name,
      slotMachineAppId: c.slotMachineAppId,
      ybtAppId: c.ybtAppId,
      status: c.status
    }))
  });

  // Validate app IDs
  const { slotMachineAppIds, ybtAppIds } = getAllContractAppIds();
  
  const invalidSlotIds = slotMachineAppIds.filter(id => !id || id === 0);
  const invalidYbtIds = ybtAppIds.filter(id => !id || id === 0);
  
  if (invalidSlotIds.length > 0) {
    console.warn(`Invalid slot machine app IDs found: ${invalidSlotIds.join(', ')}`);
  }
  
  if (invalidYbtIds.length > 0) {
    console.warn(`Invalid YBT app IDs found: ${invalidYbtIds.join(', ')}`);
  }

  // Check for duplicate app IDs
  const duplicateSlotIds = slotMachineAppIds.filter((id, index, arr) => arr.indexOf(id) !== index);
  const duplicateYbtIds = ybtAppIds.filter((id, index, arr) => arr.indexOf(id) !== index);
  
  if (duplicateSlotIds.length > 0) {
    console.warn(`Duplicate slot machine app IDs found: ${duplicateSlotIds.join(', ')}`);
  }
  
  if (duplicateYbtIds.length > 0) {
    console.warn(`Duplicate YBT app IDs found: ${duplicateYbtIds.join(', ')}`);
  }
}

export const GAME_CONFIG = {
  minBet: 1000000, // 1 VOI in microVOI
  maxBet: 20000000, // 20 VOI in microVOI
  maxPaylines: 20,
  symbols: ['A', 'B', 'C', 'D', 'boat', 'clock', 'bird', 'star', 'anchor', 'crown'] as const
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
  explorerUrl: 'https://block.voi.network/explorer',
  
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