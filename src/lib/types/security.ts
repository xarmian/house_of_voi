export interface EncryptedWallet {
  encryptedPrivateKey: string;
  encryptedMnemonic: string;
  publicData: {
    address: string;
    createdAt: number;
    lastUsed: number;
  };
  salt: string;
  iv: string;
  version?: number; // 1 = fingerprint-encrypted (legacy), 2 = password-encrypted
  isPasswordless?: boolean; // true if wallet uses empty password (weak encryption)
}

export interface WalletSession {
  sessionId: string;
  expiresAt: number;
  lastActivity: number;
}

export interface SecurityConfig {
  encryptionKey: string;
  sessionTimeout: number;
  autoLockTimeout: number;
  maxInactiveTime: number;
}