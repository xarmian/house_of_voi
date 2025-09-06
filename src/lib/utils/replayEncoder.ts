// Replay data encoder/decoder for shareable links
// Encodes spin replay data into compact URL-safe strings

interface DecodedReplayData {
  outcome: string[][];
  winnings: number;
  betAmount: number;
  paylines: number;
  timestamp: number;
  contractId?: string;
  txId?: string;
}

// Symbol mapping for compression
const SYMBOL_TO_DIGIT: Record<string, string> = {
  'A': '0',
  'B': '1', 
  'C': '2',
  'D': '3',
  '_': '4'
};

const DIGIT_TO_SYMBOL: Record<string, string> = {
  '0': 'A',
  '1': 'B',
  '2': 'C', 
  '3': 'D',
  '4': '_'
};

// Compress outcome grid to string
function compressOutcome(outcome: string[][]): string {
  let compressed = '';
  for (const reel of outcome) {
    for (const symbol of reel) {
      compressed += SYMBOL_TO_DIGIT[symbol] || '4';
    }
  }
  return compressed;
}

// Decompress string to outcome grid
function decompressOutcome(compressed: string): string[][] {
  const outcome: string[][] = [];
  for (let i = 0; i < 5; i++) {
    const reel: string[] = [];
    for (let j = 0; j < 3; j++) {
      const digit = compressed[i * 3 + j];
      reel.push(DIGIT_TO_SYMBOL[digit] || '_');
    }
    outcome.push(reel);
  }
  return outcome;
}

// Simple hash for verification (4 chars)
function generateHash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).substring(0, 4);
}

export function encodeReplayData(spin: {
  outcome?: string[][];
  winnings?: number;
  totalBet: number;
  selectedPaylines: number;
  timestamp: number;
  contractId?: string;
  txId?: string;
}): string {
  if (!spin.outcome || typeof spin.winnings !== 'number') {
    throw new Error('Invalid spin data: missing outcome or winnings');
  }

  // Compress the outcome grid (15 chars)
  const compressedOutcome = compressOutcome(spin.outcome);
  
  // Convert values to base36 for compression
  const winningsVOI = Math.floor(spin.winnings / 1000000); // Convert to VOI
  const betVOI = Math.floor(spin.totalBet / 1000000); // Convert to VOI
  const timestampHours = Math.floor(spin.timestamp / 3600000); // Convert to hours
  
  // Build compact string (using . as delimiter)
  const parts = [
    compressedOutcome,                    // 15 chars
    winningsVOI.toString(36),            // 1-3 chars typically
    betVOI.toString(36),                  // 1-2 chars typically
    spin.selectedPaylines.toString(36),   // 1 char (max 25 -> 'p')
    timestampHours.toString(36),          // 6-7 chars
    spin.contractId || ''                 // contract ID (empty if not provided)
  ];
  
  const dataString = parts.join('.');
  const hash = generateHash(dataString);
  
  // Final format: data.hash
  const encoded = `${dataString}.${hash}`;
  
  return encoded;
}

export function decodeReplayData(encodedData: string): DecodedReplayData | null {
  try {    
    // Split by delimiter
    const parts = encodedData.split('.');
    
    if (parts.length !== 7 && parts.length !== 6) {
      // Support both old format (6 parts) and new format (7 parts with contractId)
      console.warn('Invalid format: expected 6 or 7 parts, got', parts.length);
      return null;
    }
    
    // Handle both old and new formats
    const isNewFormat = parts.length === 7;
    const [compressedOutcome, winningsStr, betStr, paylinesStr, timestampStr, contractIdStr, receivedHash] = 
      isNewFormat ? parts : [...parts.slice(0, 5), '', parts[5]];
    
    // Verify hash
    const dataString = isNewFormat ? parts.slice(0, 6).join('.') : parts.slice(0, 5).join('.');
    const calculatedHash = generateHash(dataString);
    
    if (receivedHash !== calculatedHash) {
      console.warn('Hash mismatch:', receivedHash, 'vs', calculatedHash);
      return null;
    }
    
    // Decompress outcome
    const outcome = decompressOutcome(compressedOutcome);
    
    // Parse values from base36
    const winnings = parseInt(winningsStr, 36) * 1000000; // Convert back to atomic
    const betAmount = parseInt(betStr, 36) * 1000000; // Convert back to atomic
    const paylines = parseInt(paylinesStr, 36);
    const timestamp = parseInt(timestampStr, 36) * 3600000; // Convert back to ms
    const contractId = contractIdStr || undefined; // Only include if not empty
    
    return {
      outcome,
      winnings,
      betAmount,
      paylines,
      timestamp,
      contractId
    };
  } catch (error) {
    console.error('Error decoding replay data:', error);
    return null;
  }
}

// Utility to validate replay data makes sense
export function validateReplayData(data: DecodedReplayData): boolean {
  // Check outcome grid is 5x3
  if (!data.outcome || data.outcome.length !== 5) {
    return false;
  }
  
  for (const reel of data.outcome) {
    if (!Array.isArray(reel) || reel.length !== 3) {
      return false;
    }
  }

  // Check reasonable bet amounts in atomic units (0.1 to 10000 VOI)
  // 1 VOI = 1,000,000 atomic units
  const minBetAtomic = 0.1 * 1000000; // 100,000 atomic units
  const maxBetAtomic = 10000 * 1000000; // 10 billion atomic units
  if (data.betAmount < minBetAtomic || data.betAmount > maxBetAtomic) {
    return false;
  }

  // Check paylines (1-25)
  if (data.paylines < 1 || data.paylines > 25) {
    return false;
  }

  // Check winnings are not negative
  if (data.winnings < 0) {
    return false;
  }

  return true;
}