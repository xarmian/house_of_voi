/**
 * Transaction ID Utility Functions
 * Handles conversion between hex-encoded and base32 Algorand transaction IDs
 */

import { algorandService } from '$lib/services/algorand';

/**
 * Converts a hex-encoded transaction ID back to its original base32 format
 * The database stores transaction IDs as hex-encoded ASCII strings of the base32 IDs
 * 
 * @param hexTxId - Hex-encoded transaction ID from the database
 * @returns The original base32 Algorand transaction ID
 */
export function hexToBase32TxId(hexTxId: string): string {
  try {
    // Convert hex string to bytes
    const bytes = [];
    for (let i = 0; i < hexTxId.length; i += 2) {
      bytes.push(parseInt(hexTxId.substr(i, 2), 16));
    }
    
    // Convert bytes to ASCII string (which is the base32 transaction ID)
    const base32TxId = String.fromCharCode.apply(null, bytes);
    
    return base32TxId;
  } catch (error) {
    console.warn('Failed to convert hex transaction ID:', hexTxId, error);
    // If conversion fails, return the original hex string
    return hexTxId;
  }
}

/**
 * Checks if a transaction ID is in hex format (from database) or already in base32 format
 * 
 * @param txId - Transaction ID to check
 * @returns true if the ID appears to be hex-encoded, false if it's already base32
 */
export function isHexEncodedTxId(txId: string): boolean {
  // Hex-encoded transaction IDs will be much longer (64+ chars) and contain only hex digits
  // Base32 transaction IDs are typically 52 characters and contain base32 chars
  return txId.length > 60 && /^[0-9a-fA-F]+$/.test(txId);
}

/**
 * Ensures a transaction ID is in base32 format, converting from hex if necessary
 * 
 * @param txId - Transaction ID that might be hex-encoded or already base32
 * @returns The transaction ID in base32 format
 */
export function ensureBase32TxId(txId: string): string {
  if (isHexEncodedTxId(txId)) {
    return hexToBase32TxId(txId);
  }
  return txId;
}

/**
 * Formats a transaction ID for display (shortens long IDs)
 * 
 * @param txId - Transaction ID to format
 * @param length - Number of characters to show at start and end (default: 8)
 * @returns Formatted transaction ID for display
 */
export function formatTxIdForDisplay(txId: string, maxLength: number = 8): string {
  // Convert to base32 first if needed
  const base32TxId = ensureBase32TxId(txId);
  
  if (base32TxId.length <= maxLength * 2 + 3) {
    return base32TxId;
  }
  
  const start = Math.floor((maxLength - 3) / 2);
  const end = maxLength - 3 - start;
  return `${base32TxId.slice(0, start)}...${base32TxId.slice(-end)}`;
}

export interface TransactionSpinData {
  betKey: string;
  claimRound: number;
  appId: number;
  sender: string;
  betAmount?: number;
  paylines?: number;
  timestamp: number;
}

/**
 * Extract spin data from a transaction ID by fetching from the blockchain
 */
export async function extractSpinDataFromTransaction(txId: string): Promise<TransactionSpinData | null> {
  try {
    const indexer = algorandService.getIndexer();
    const base32TxId = ensureBase32TxId(txId);
    
    // Fetch transaction from indexer
    const response = await indexer.lookupTransactionByID(base32TxId).do();
    const tx = response?.transaction;
    
    if (!tx) {
      console.warn('Transaction not found:', txId);
      return null;
    }

    // Extract basic info
    const confirmedRound = tx['confirmed-round'];
    const appId = tx['application-transaction']?.['application-id'];
    const sender = tx.sender;
    const roundTime = tx['round-time'];
    
    if (!confirmedRound || !appId || !sender) {
      console.warn('Missing required transaction data:', { confirmedRound, appId, sender });
      return null;
    }
    
    // Calculate claim round
    const claimRound = confirmedRound + 1;
    
    // Extract bet key from logs
    const logs: string[] = tx.logs || [];
    let betKey: string | null = null;

    // ARC-4 return values are logged with a 4-byte prefix 0x151f7c75.
    // The contract returns the bet key (56 bytes) as the ABI return value,
    // so the corresponding log entry will be 4 (prefix) + 56 (bet key) = 60 bytes.
    // In some cases a raw 56-byte log could also appear; support both.
    const ARC4_RETURN_PREFIX = new Uint8Array([0x15, 0x1f, 0x7c, 0x75]);

    // Look for the bet key in logs
    for (const b64Log of logs) {
      try {
        // Decode base64 to bytes directly
        const bytes = typeof atob !== 'undefined'
          ? new Uint8Array([...atob(b64Log)].map((c) => c.charCodeAt(0)))
          : new Uint8Array(Buffer.from(b64Log, 'base64'));

        // Helper to convert bytes to hex
        const toHex = (arr: Uint8Array) => Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');

        // The bet key is exactly 56 bytes (112 hex chars) as defined in the contract:
        // 32 bytes address + 8 bytes amount + 8 bytes max_payline_index + 8 bytes index
        if (bytes.length === 56) {
          // This log entry is exactly the bet key
          betKey = toHex(bytes);
          break;
        }

        // ARC-4 return log: 0x151f7c75 + <56-byte bet key>
        if (bytes.length === 60) {
          const hasPrefix =
            bytes[0] === ARC4_RETURN_PREFIX[0] &&
            bytes[1] === ARC4_RETURN_PREFIX[1] &&
            bytes[2] === ARC4_RETURN_PREFIX[2] &&
            bytes[3] === ARC4_RETURN_PREFIX[3];
          if (hasPrefix) {
            betKey = toHex(bytes.slice(4));
            break;
          }
        }
      } catch (e) {
        // Continue to next log entry
        continue;
      }
    }

    if (!betKey) {
      console.warn('Bet key not found in transaction logs:', txId);
      return null;
    }
    
    // Extract bet details from the bet key structure
    // Bet key: 32 bytes sender + 8 bytes bet amount + 8 bytes max payline + 8 bytes index
    let betAmount: number | undefined;
    let paylines: number | undefined;
    
    try {
      const keyBytes = new Uint8Array(betKey.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []);
      if (keyBytes.length === 56) {
        // Extract bet amount (bytes 32-39, big endian uint64)
        const betAmountView = new DataView(keyBytes.slice(32, 40).buffer);
        betAmount = Number(betAmountView.getBigUint64(0, false));
        
        // Extract max payline index (bytes 40-47, big endian uint64)
        const maxPaylineView = new DataView(keyBytes.slice(40, 48).buffer);
        const maxPaylineIndex = Number(maxPaylineView.getBigUint64(0, false));
        paylines = maxPaylineIndex + 1; // Convert index to count
      }
    } catch (e) {
      console.warn('Failed to extract bet details from bet key:', e);
      // These are optional, so continue without them
    }
    
    return {
      betKey,
      claimRound,
      appId,
      sender,
      betAmount,
      paylines,
      timestamp: roundTime ? roundTime * 1000 : Date.now() // Convert to milliseconds
    };
    
  } catch (error) {
    console.error('Failed to extract spin data from transaction:', error);
    return null;
  }
}
