export const BETTING_CONSTANTS = {
  // Minimum values
  MIN_BET_PER_LINE: 1_000_000, // 1 VOI
  MIN_PAYLINES: 1,
  
  // Maximum values
  MAX_BET_PER_LINE: 10_000_000, // 10 VOI per line
  MAX_PAYLINES: 20,
  MAX_TOTAL_BET: 50_000_000, // 50 VOI
  
  // Default values
  DEFAULT_BET_PER_LINE: 1_000_000, // 1 VOI
  DEFAULT_PAYLINES: 1,
  
  // Quick bet amounts (in VOI)
  QUICK_BET_AMOUNTS: [1, 2, 5, 10],
  
  // Formatting
  VOI_DECIMALS: 6,
  DISPLAY_DECIMALS: 2
} as const;

export const BETTING_ERRORS = {
  INSUFFICIENT_BALANCE: 'Insufficient wallet balance',
  BET_TOO_LOW: 'Bet amount too low',
  BET_TOO_HIGH: 'Bet amount too high',
  INVALID_PAYLINES: 'Invalid number of paylines',
  TOTAL_BET_EXCEEDED: 'Total bet exceeds maximum limit',
  WALLET_NOT_CONNECTED: 'Wallet not connected'
} as const;

// Utility functions
export function formatVOI(microVOI: number, decimals = 2): string {
  return (microVOI / 1_000_000).toFixed(decimals);
}

export function parseVOI(voiAmount: string): number {
  const parsed = parseFloat(voiAmount);
  return Math.round(parsed * 1_000_000);
}

export function isValidBetAmount(amount: number): boolean {
  return amount >= BETTING_CONSTANTS.MIN_BET_PER_LINE && 
         amount <= BETTING_CONSTANTS.MAX_BET_PER_LINE;
}

export function isValidPaylineCount(count: number): boolean {
  return count >= BETTING_CONSTANTS.MIN_PAYLINES && 
         count <= BETTING_CONSTANTS.MAX_PAYLINES;
}