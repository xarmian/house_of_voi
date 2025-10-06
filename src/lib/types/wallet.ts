export type WalletOrigin = 'generated' | 'imported' | 'cdp' | 'legacy';

export interface WalletAccount {
  address: string;
  privateKey: string;
  mnemonic: string;
  createdAt?: number;
  isLocked: boolean;
  origin?: WalletOrigin;
  nickname?: string; // User-defined wallet name
}

export interface WalletMetadata {
  address: string;
  nickname?: string;
  origin: WalletOrigin;
  createdAt: number;
  lastUsed: number;
  isPasswordless?: boolean;
}

export interface WalletState {
  account: WalletAccount | null;
  balance: number;
  isConnected: boolean;
  isGuest: boolean;
  isLoading: boolean;
  isLocked: boolean;
  error: string | null;
  lastUpdated: number | null;
  // Multi-wallet support
  availableWallets: WalletMetadata[];
  activeWalletAddress: string | null;
}

export interface TransactionResult {
  txId: string;
  round: number;
  success: boolean;
  error?: string;
}
