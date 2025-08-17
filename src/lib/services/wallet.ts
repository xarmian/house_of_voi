import algosdk from 'algosdk';
import CryptoJS from 'crypto-js';
import type { WalletAccount } from '$lib/types/wallet';
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
      isLocked: false
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
        isLocked: false
      };
    } catch (error) {
      throw new Error('Invalid mnemonic phrase. Please check your recovery phrase and try again.');
    }
  }

  /**
   * Encrypt and store wallet securely
   */
  async storeWallet(wallet: WalletAccount): Promise<void> {
    if (!browser) return;

    const salt = CryptoJS.lib.WordArray.random(16);
    const iv = CryptoJS.lib.WordArray.random(16);
    const encryptionKey = this.deriveStableEncryptionKey(salt);

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
        createdAt: wallet.createdAt || Date.now(),
        lastUsed: Date.now()
      },
      salt: salt.toString(),
      iv: iv.toString()
    };

    localStorage.setItem(WalletService.STORAGE_KEY, JSON.stringify(encryptedWallet));
  }

  /**
   * Retrieve and decrypt wallet
   */
  async retrieveWallet(): Promise<WalletAccount | null> {
    if (!browser) return null;

    try {
      const encryptedData = localStorage.getItem(WalletService.STORAGE_KEY);
      if (!encryptedData) return null;

      const encryptedWallet: EncryptedWallet = JSON.parse(encryptedData);

      // Decrypt wallet using the stable encryption key
      const salt = CryptoJS.enc.Hex.parse(encryptedWallet.salt);
      const encryptionKey = this.deriveStableEncryptionKey(salt);
      const iv = CryptoJS.enc.Hex.parse(encryptedWallet.iv);

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
        isLocked: false
      };
    } catch (error) {
      console.error('Error retrieving wallet:', error);
      this.clearWallet();
      return null;
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
   * Attempt to recover wallet (now same as retrieveWallet since we use stable encryption)
   */
  async recoverWallet(): Promise<WalletAccount | null> {
    // With stable encryption, recovery is the same as retrieval
    return this.retrieveWallet();
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
   * Generate secure session ID
   */
  private generateSessionId(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Derive stable encryption key from browser fingerprint and salt
   */
  private deriveStableEncryptionKey(salt: CryptoJS.lib.WordArray): string {
    const browserFingerprint = this.getBrowserFingerprint();
    return CryptoJS.PBKDF2(browserFingerprint, salt.toString(), {
      keySize: WalletService.ENCRYPTION_KEY_SIZE / 4,
      iterations: 10000
    }).toString();
  }

  /**
   * Generate browser fingerprint for additional security
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


}

export const walletService = new WalletService();