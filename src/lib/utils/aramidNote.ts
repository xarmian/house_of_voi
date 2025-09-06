import { ARAMID_CONFIG } from '$lib/constants/aramid';

export interface AramidNoteData {
  destinationNetwork: number;
  destinationAddress: string;
  destinationToken: string;
  feeAmount: number;
  sourceAmount: number;
  destinationAmount: number;
  note: string;
}

export interface BridgeQRResult {
  uri: string;
  qrData: string;
  fee: number;
  netAmount: number;
  displayAmounts: {
    sendAmount: number;
    feeAmount: number;
    receiveAmount: number;
  };
}

/**
 * Calculate fee for Aramid Bridge transfer
 * Fee is 0.1% of the payment amount, rounded UP
 */
export function calculateBridgeFee(amountMicroAlgos: number): number {
  return Math.ceil(amountMicroAlgos * ARAMID_CONFIG.feePercentage);
}

/**
 * Generate Aramid transfer note data
 */
export function generateAramidNoteData(
  voiAddress: string,
  amountMicroAlgos: number
): AramidNoteData {
  const fee = calculateBridgeFee(amountMicroAlgos);
  const netAmount = amountMicroAlgos - fee;

  return {
    destinationNetwork: ARAMID_CONFIG.destinationNetwork,
    destinationAddress: voiAddress,
    destinationToken: ARAMID_CONFIG.destinationToken,
    feeAmount: fee,
    sourceAmount: netAmount,      // Payment minus fee
    destinationAmount: netAmount,  // Same as sourceAmount
    note: ARAMID_CONFIG.notePrefix
  };
}

/**
 * Generate Aramid transfer note string
 */
export function generateAramidNoteString(noteData: AramidNoteData): string {
  return `aramid-transfer/v1:j${JSON.stringify(noteData)}`;
}

/**
 * Generate Pera Wallet URI for Aramid Bridge transfer
 */
export function generatePeraWalletURI(
  voiAddress: string,
  amountMicroAlgos: number
): string {
  const noteData = generateAramidNoteData(voiAddress, amountMicroAlgos);
  const aramidNote = generateAramidNoteString(noteData);

  return `perawallet://${ARAMID_CONFIG.bridgeAddress}?amount=${amountMicroAlgos}&asset=${ARAMID_CONFIG.aVoiAssetId}&xnote=${aramidNote}`;
}

/**
 * Generate complete bridge QR code data
 */
export function generateBridgeQR(
  voiAddress: string,
  amountMicroAlgos: number = 1000000 // Default 1 aVOI
): BridgeQRResult {
  const fee = calculateBridgeFee(amountMicroAlgos);
  const netAmount = amountMicroAlgos - fee;
  const uri = generatePeraWalletURI(voiAddress, amountMicroAlgos);

  return {
    uri,
    qrData: uri, // QR code will encode the full URI
    fee,
    netAmount,
    displayAmounts: {
      sendAmount: amountMicroAlgos,
      feeAmount: fee,
      receiveAmount: netAmount
    }
  };
}

/**
 * Parse Aramid note from transaction note field
 */
export function parseAramidNote(noteBase64: string): AramidNoteData | null {
  try {
    const noteStr = Buffer.from(noteBase64, 'base64').toString('utf-8');
    
    if (!noteStr.startsWith('aramid-transfer/v1:j')) {
      return null;
    }
    
    const jsonStr = noteStr.substring('aramid-transfer/v1:j'.length);
    const noteData = JSON.parse(jsonStr) as AramidNoteData;
    
    // Validate required fields
    if (!noteData.destinationAddress || !noteData.note) {
      return null;
    }
    
    return noteData;
  } catch (error) {
    console.warn('Failed to parse Aramid note:', error);
    return null;
  }
}

/**
 * Validate if a transaction note contains a specific Voi address
 */
export function isNoteForAddress(noteBase64: string, voiAddress: string): boolean {
  const noteData = parseAramidNote(noteBase64);
  return noteData?.destinationAddress === voiAddress && noteData?.note === ARAMID_CONFIG.notePrefix;
}

/**
 * Format amounts for display (convert from micro units to regular units)
 */
export function formatAmount(microAmount: number): string {
  return (microAmount / 1000000).toFixed(6);
}

/**
 * Get suggested transfer amounts (in microAlgos)
 */
export function getSuggestedAmounts(): Array<{ label: string; amount: number }> {
  return [
    { label: '1 aVOI', amount: 1000000 },
    { label: '5 aVOI', amount: 5000000 },
    { label: '10 aVOI', amount: 10000000 },
    { label: '25 aVOI', amount: 25000000 },
    { label: '50 aVOI', amount: 50000000 }
  ];
}