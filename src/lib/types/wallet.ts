export interface WalletAccount {
  address: string;
  privateKey: string;
  mnemonic: string;
  createdAt?: number;
  isLocked: boolean;
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
}

export interface TransactionResult {
  txId: string;
  round: number;
  success: boolean;
  error?: string;
}