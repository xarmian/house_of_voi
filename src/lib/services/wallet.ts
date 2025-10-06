import algosdk from 'algosdk';
import CryptoJS from 'crypto-js';
import type { WalletAccount, WalletOrigin } from '$lib/types/wallet';
import type { EncryptedWallet } from '$lib/types/security';
import { browser } from '$app/environment';

export class WalletService {
  private static readonly STORAGE_KEY = 'hov_wallet';
  private static readonly ENCRYPTION_KEY_SIZE = 32;

  /**
   * Generate a new secure wallet
   */
  async generateWallet(): Promise<WalletAccount> {
    const account = algosdk.generateAccount();
    const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
    
    return {
      address: account.addr,
      privateKey: Array.from(account.sk, (byte: number) => byte.toString(16).padStart(2, '0')).join(''),
      mnemonic,
      createdAt: Date.now(),
      isLocked: false,
      origin: 'generated'
    };
  }

  /**
   * Import wallet from mnemonic phrase
   */
  async importWallet(mnemonic: string): Promise<WalletAccount> {
    try {
      // Validate and convert mnemonic to account
      const account = algosdk.mnemonicToSecretKey(mnemonic.trim());
      
      return {
        address: account.addr,
        privateKey: Array.from(account.sk, (byte: number) => byte.toString(16).padStart(2, '0')).join(''),
        mnemonic: mnemonic.trim(),
        createdAt: Date.now(),
        isLocked: false,
        origin: 'imported'
      };
    } catch (error) {
      throw new Error('Invalid mnemonic phrase. Please check your recovery phrase and try again.');
    }
  }

  /**
   * Encrypt and store wallet securely with password
   */
  async storeWallet(
    wallet: WalletAccount,
    password: string,
    options: { origin?: WalletOrigin } = {}
  ): Promise<void> {
    if (!browser) return;

    const salt = CryptoJS.lib.WordArray.random(16);
    const iv = CryptoJS.lib.WordArray.random(16);

    const walletOrigin: WalletOrigin = options.origin ?? wallet.origin ?? 'generated';
    const createdAt = wallet.createdAt || Date.now();
    const lastUsed = Date.now();

    wallet.origin = walletOrigin;
    wallet.createdAt = createdAt;
    
    // For empty passwords, use a consistent but weak key
    const encryptionKey = password.trim() === '' ? 
      this.deriveEmptyPasswordKey(salt) : 
      this.derivePasswordBasedKey(password, salt);

    // Encrypt sensitive data
    const encryptedPrivateKey = CryptoJS.AES.encrypt(
      wallet.privateKey, 
      encryptionKey, 
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    ).toString();

    const encryptedMnemonic = CryptoJS.AES.encrypt(
      wallet.mnemonic, 
      encryptionKey, 
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    ).toString();

    const encryptedWallet: EncryptedWallet = {
      encryptedPrivateKey,
      encryptedMnemonic,
      publicData: {
        address: wallet.address,
        createdAt,
        lastUsed,
        origin: walletOrigin
      },
      salt: salt.toString(),
      iv: iv.toString(),
      version: 2, // Mark as password-encrypted
      isPasswordless: password.trim() === '' // Mark if using empty password
    };

    localStorage.setItem(WalletService.STORAGE_KEY, JSON.stringify(encryptedWallet));
  }

  /**
   * Retrieve and decrypt wallet with password
   */
  async retrieveWallet(password: string): Promise<WalletAccount | null> {
    if (!browser) return null;

    try {
      const encryptedData = localStorage.getItem(WalletService.STORAGE_KEY);
      if (!encryptedData) return null;

      const encryptedWallet: EncryptedWallet = JSON.parse(encryptedData);
      
      if (!encryptedWallet.salt) {
        throw new Error('Wallet data is missing salt - wallet may be corrupted');
      }
      if (!encryptedWallet.iv) {
        throw new Error('Wallet data is missing IV - wallet may be corrupted');
      }
      
      const salt = CryptoJS.enc.Hex.parse(encryptedWallet.salt);
      const iv = CryptoJS.enc.Hex.parse(encryptedWallet.iv);
      
      if (!salt) {
        throw new Error('Failed to parse wallet salt - wallet may be corrupted');
      }
      if (!iv) {
        throw new Error('Failed to parse wallet IV - wallet may be corrupted');
      }

      let encryptionKey: string;
      
      // Handle different wallet versions
      if (encryptedWallet.version === 2) {
        // New password-based encryption
        if (encryptedWallet.isPasswordless) {
          // For passwordless wallets, use empty password key derivation
          encryptionKey = this.deriveEmptyPasswordKey(salt);
        } else {
          // Regular password-based encryption
          encryptionKey = this.derivePasswordBasedKey(password, salt);
        }
      } else {
        // Legacy fingerprint-based encryption (version 1 or undefined)
        // For migration purposes - this should eventually be phased out
        encryptionKey = this.deriveStableEncryptionKey(salt);
      }

      const decryptedPrivateKey = CryptoJS.AES.decrypt(
        encryptedWallet.encryptedPrivateKey,
        encryptionKey,
        { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
      ).toString(CryptoJS.enc.Utf8);

      const decryptedMnemonic = CryptoJS.AES.decrypt(
        encryptedWallet.encryptedMnemonic,
        encryptionKey,
        { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
      ).toString(CryptoJS.enc.Utf8);

      if (!decryptedPrivateKey || !decryptedMnemonic) {
        throw new Error('Failed to decrypt wallet data');
      }

      const origin: WalletOrigin | undefined =
        encryptedWallet.publicData.origin ?? (encryptedWallet.isPasswordless ? 'cdp' : undefined);

      return {
        address: encryptedWallet.publicData.address,
        privateKey: decryptedPrivateKey,
        mnemonic: decryptedMnemonic,
        createdAt: encryptedWallet.publicData.createdAt,
        isLocked: false,
        origin
      };
    } catch (error) {
      console.error('Error retrieving wallet:', error);
      throw new Error('Invalid password or corrupted wallet data');
    }
  }

  /**
   * Lock wallet (clear decrypted data from memory)
   */
  lockWallet(): void {
    // In a real implementation, you'd clear sensitive data from memory
    // For browser environment, we rely on session storage expiration
  }

  /**
   * Attempt to recover legacy wallet without password (for existing wallets)
   */
  async recoverWallet(): Promise<WalletAccount | null> {
    if (!browser) return null;

    try {
      const encryptedData = localStorage.getItem(WalletService.STORAGE_KEY);
      if (!encryptedData) return null;

      const encryptedWallet: EncryptedWallet = JSON.parse(encryptedData);
      
      // Only attempt recovery for legacy wallets (version 1 or undefined)
      if (encryptedWallet.version === 2) {
        throw new Error('Password-encrypted wallet requires password');
      }

      if (!encryptedWallet.salt || !encryptedWallet.iv) {
        throw new Error('Legacy wallet data is corrupted - missing salt or IV');
      }

      const salt = CryptoJS.enc.Hex.parse(encryptedWallet.salt);
      const iv = CryptoJS.enc.Hex.parse(encryptedWallet.iv);
      
      if (!salt || !iv) {
        throw new Error('Failed to parse legacy wallet encryption data');
      }
      const encryptionKey = this.deriveStableEncryptionKey(salt);

      const decryptedPrivateKey = CryptoJS.AES.decrypt(
        encryptedWallet.encryptedPrivateKey,
        encryptionKey,
        { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
      ).toString(CryptoJS.enc.Utf8);

      const decryptedMnemonic = CryptoJS.AES.decrypt(
        encryptedWallet.encryptedMnemonic,
        encryptionKey,
        { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
      ).toString(CryptoJS.enc.Utf8);

      if (!decryptedPrivateKey || !decryptedMnemonic) {
        throw new Error('Failed to decrypt wallet data');
      }

      return {
        address: encryptedWallet.publicData.address,
        privateKey: decryptedPrivateKey,
        mnemonic: decryptedMnemonic,
        createdAt: encryptedWallet.publicData.createdAt,
        isLocked: false,
        origin: 'legacy'
      };
    } catch (error) {
      console.error('Error recovering legacy wallet:', error);
      return null;
    }
  }

  /**
   * Check if stored wallet is legacy (fingerprint-based) 
   */
  isLegacyWallet(): boolean {
    if (!browser) return false;
    
    try {
      const encryptedData = localStorage.getItem(WalletService.STORAGE_KEY);
      if (!encryptedData) return false;

      const encryptedWallet: EncryptedWallet = JSON.parse(encryptedData);
      return !encryptedWallet.version || encryptedWallet.version === 1;
    } catch {
      return false;
    }
  }

  /**
   * Clear wallet data
   */
  clearWallet(): void {
    if (!browser) return;
    localStorage.removeItem(WalletService.STORAGE_KEY);
  }

  /**
   * Check if wallet exists
   */
  hasStoredWallet(): boolean {
    if (!browser) return false;
    return localStorage.getItem(WalletService.STORAGE_KEY) !== null;
  }

  /**
   * Get stored wallet address without decryption (for display purposes)
   */
  getStoredWalletAddress(): string | null {
    if (!browser) return null;
    
    try {
      const encryptedData = localStorage.getItem(WalletService.STORAGE_KEY);
      if (!encryptedData) return null;
      
      const encryptedWallet: EncryptedWallet = JSON.parse(encryptedData);
      return encryptedWallet.publicData?.address || null;
    } catch (error) {
      console.error('Error reading stored wallet address:', error);
      return null;
    }
  }

  /**
   * Generate secure session ID
   */
  private generateSessionId(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Derive encryption key from user password and salt
   */
  private derivePasswordBasedKey(password: string, salt: CryptoJS.lib.WordArray): string {
    if (!salt || typeof salt.toString !== 'function') {
      throw new Error('Invalid salt provided for password-based key derivation');
    }
    
    return CryptoJS.PBKDF2(password, salt.toString(), {
      keySize: WalletService.ENCRYPTION_KEY_SIZE / 4,
      iterations: 10000
    }).toString();
  }

  /**
   * Derive weak encryption key for passwordless wallets
   * This provides minimal obfuscation but is NOT secure
   */
  private deriveEmptyPasswordKey(salt: CryptoJS.lib.WordArray): string {
    // Use a consistent but weak key based on salt only
    // This is intentionally weak - just obfuscation, not security
    return CryptoJS.PBKDF2('hov-passwordless-wallet', salt.toString(), {
      keySize: WalletService.ENCRYPTION_KEY_SIZE / 4,
      iterations: 1000 // Lower iterations for empty password
    }).toString();
  }

  /**
   * Legacy: Derive stable encryption key from browser fingerprint and salt
   * Used only for migrating existing wallets
   */
  private deriveStableEncryptionKey(salt: CryptoJS.lib.WordArray): string {
    const browserFingerprint = this.getBrowserFingerprint();
    return CryptoJS.PBKDF2(browserFingerprint, salt.toString(), {
      keySize: WalletService.ENCRYPTION_KEY_SIZE / 4,
      iterations: 10000
    }).toString();
  }

  /**
   * Legacy: Generate browser fingerprint for additional security
   * Used only for migrating existing wallets
   */
  private getBrowserFingerprint(): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx!.textBaseline = 'top';
    ctx!.font = '14px Arial';
    ctx!.fillText('House of Voi', 2, 2);
    
    return CryptoJS.SHA256(
      canvas.toDataURL() +
      navigator.userAgent +
      navigator.language +
      screen.width +
      screen.height
    ).toString();
  }

  /**
   * Get public wallet data without requiring password
   */
  getPublicWalletData(): {
    address: string;
    createdAt: number;
    lastUsed: number;
    origin?: WalletOrigin;
    isPasswordless?: boolean;
  } | null {
    if (!browser) return null;
    
    try {
      const encryptedData = localStorage.getItem(WalletService.STORAGE_KEY);
      if (!encryptedData) return null;
      
      const encryptedWallet: EncryptedWallet = JSON.parse(encryptedData);
      const origin: WalletOrigin | undefined =
        encryptedWallet.publicData.origin ?? (encryptedWallet.isPasswordless ? 'cdp' : undefined);

      return {
        address: encryptedWallet.publicData.address,
        createdAt: encryptedWallet.publicData.createdAt,
        lastUsed: encryptedWallet.publicData.lastUsed,
        origin,
        isPasswordless: encryptedWallet.isPasswordless
      };
    } catch (error) {
      console.error('Error reading wallet public data:', error);
      return null;
    }
  }

  /**
   * Check if stored wallet is passwordless
   */
  isPasswordlessWallet(): boolean {
    if (!browser) return false;
    
    try {
      const encryptedData = localStorage.getItem(WalletService.STORAGE_KEY);
      if (!encryptedData) return false;
      
      const encryptedWallet: EncryptedWallet = JSON.parse(encryptedData);
      return encryptedWallet.isPasswordless === true;
    } catch (error) {
      console.error('Error checking if wallet is passwordless:', error);
      return false;
    }
  }

  /**
   * Change wallet password by re-encrypting with new password
   */
  async changeWalletPassword(account: WalletAccount, newPassword: string): Promise<void> {
    if (!browser) return;
    
    // Simply re-store the wallet with the new password
    await this.storeWallet(account, newPassword, { origin: account.origin });
  }

}

export const walletService = new WalletService();
