// Replay data encoder/decoder for shareable links
// NOTE: Most encoding functions are LEGACY and kept only for backward compatibility
// New links should use transaction IDs directly (?tx=) for shortest, most reliable URLs

interface DecodedReplayData {
  outcome: string[][];
  winnings: number;
  betAmount: number;
  paylines: number;
  timestamp: number;
  contractId?: string;
  txId?: string;
}

// Compact bet-key replay encoding (single param 'r=')
export interface BetKeyReplayData {
  betKeyHex: string; // 112-char hex (Bytes56)
  claimRound: number; // block round used for outcome
  betAmount?: number; // atomic units
  paylines?: number; // number of lines
  timestamp?: number; // ms epoch
  contractId?: string; // multi-contract id
  slotAppId?: number; // optional direct app id (preferred for shorter URLs)
  txId?: string; // optional reference only (not encoded currently)
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

// LEGACY: Use transaction ID (?tx=) for new links instead
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

// LEGACY: Kept for backward compatibility with ?d= URLs
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

// LEGACY: Validate legacy replay data format
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

// --- BetKey replay encoder (legacy medium-length URLs) ---
// NOTE: Still used for backward compatibility with ?r= URLs
// New links should prefer transaction ID (?tx=) instead

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) out[i / 2] = parseInt(clean.substr(i, 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function b64urlEncode(bytes: Uint8Array): string {
  // Cross-environment base64url encode (Node or Browser)
  let base64: string;
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(bytes).toString('base64');
  } else {
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    // @ts-ignore
    base64 = btoa(binary);
  }
  return base64.replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function b64urlDecode(s: string): Uint8Array {
  const base64 = s.replace(/-/g,'+').replace(/_/g,'/');
  const padded = base64 + (base64.length % 4 === 2 ? '==' : base64.length % 4 === 3 ? '=' : '');
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }
  // @ts-ignore
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Similar short hash guard
function hashShort(data: string): string {
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = ((h << 5) - h) + data.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36).substring(0, 4);
}

// Format: r = [kB64url].[cr36].[bet36].[lines36].[ts36].[cidOrAid].[hash]
export function encodeBetKeyReplay(data: BetKeyReplayData): string {
  if (!data.betKeyHex || data.betKeyHex.length !== 112 || !/^[0-9a-fA-F]+$/.test(data.betKeyHex)) {
    throw new Error('Invalid bet key hex');
  }
  if (!data.claimRound || data.claimRound <= 0) throw new Error('Invalid claim round');

  const kB64 = b64urlEncode(hexToBytes(data.betKeyHex));
  const cr36 = data.claimRound.toString(36);
  const bet36 = data.betAmount ? Math.max(0, data.betAmount).toString(36) : '';
  const lines36 = data.paylines ? Math.max(0, data.paylines).toString(36) : '';
  const ts36 = data.timestamp ? Math.max(0, Math.floor(data.timestamp / 3600000)).toString(36) : '';
  // Prefer numeric app id (base36) over string contract id for shorter URLs
  const cidOrAid = (typeof data.slotAppId === 'number' && data.slotAppId > 0)
    ? data.slotAppId.toString(36)
    : (data.contractId || '');

  const parts = [kB64, cr36, bet36, lines36, ts36, cidOrAid];
  const dataString = parts.join('.');
  const hash = hashShort(dataString);
  return `${dataString}.${hash}`;
}

export function decodeBetKeyReplay(encoded: string): BetKeyReplayData | null {
  try {
    const parts = encoded.split('.');
    if (parts.length < 3 || parts.length > 7) return null;
    const receivedHash = parts[parts.length - 1];
    const dataParts = parts.slice(0, parts.length - 1);
    const dataString = dataParts.join('.');
    if (hashShort(dataString) !== receivedHash) return null;

    const [kB64, cr36, bet36 = '', lines36 = '', ts36 = '', cidOrAid = ''] = dataParts;
    const betKeyHex = bytesToHex(b64urlDecode(kB64));
    const claimRound = parseInt(cr36, 36);
    const betAmount = bet36 ? parseInt(bet36, 36) : undefined;
    const paylines = lines36 ? parseInt(lines36, 36) : undefined;
    const timestamp = ts36 ? parseInt(ts36, 36) * 3600000 : undefined;
    // If the identifier is strictly base36 digits, treat it as app id; otherwise as string contract id
    const isBase36 = /^[0-9a-z]+$/.test(cidOrAid);
    const slotAppId = isBase36 && cidOrAid ? parseInt(cidOrAid, 36) : undefined;
    const contractId = !isBase36 && cidOrAid ? cidOrAid : undefined;
    
    if (!betKeyHex || betKeyHex.length !== 112 || Number.isNaN(claimRound)) return null;
    return { betKeyHex, claimRound, betAmount, paylines, timestamp, contractId, slotAppId };
  } catch (e) {
    console.warn('Failed to decode bet key replay:', e);
    return null;
  }
}
