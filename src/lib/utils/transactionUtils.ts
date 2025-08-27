/**
 * Transaction ID Utility Functions
 * Handles conversion between hex-encoded and base32 Algorand transaction IDs
 */

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
export function formatTxIdForDisplay(txId: string, length: number = 8): string {
  // Convert to base32 first if needed
  const base32TxId = ensureBase32TxId(txId);
  
  if (base32TxId.length <= length * 2 + 3) {
    return base32TxId;
  }
  
  return `${base32TxId.slice(0, length)}...${base32TxId.slice(-length)}`;
}