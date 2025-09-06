export const ARAMID_CONFIG = {
  bridgeAddress: 'ARAMIDFJYV2TOFB5MRNZJIXBSAVZCVAUDAPFGKR5PNX4MTILGAZABBTXQQ',
  destinationNetwork: 416101,  // Voi network ID
  destinationToken: '0',        // Native VOI
  aVoiAssetId: 2320775407,     // aVOI on Algorand
  feePercentage: 0.001,         // 0.1% fee
  notePrefix: 'house-of-voi',
  algorandNode: 'https://mainnet-api.algonode.cloud',
  algorandIndexer: 'https://mainnet-idx.algonode.cloud'
} as const;

export type AramidConfig = typeof ARAMID_CONFIG;