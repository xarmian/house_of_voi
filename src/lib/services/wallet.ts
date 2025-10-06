import algosdk from 'algosdk';
import CryptoJS from 'crypto-js';
import type { WalletAccount, WalletOrigin, WalletMetadata } from '$lib/types/wallet';
import type { EncryptedWallet, WalletCollection } from '$lib/types/security';
import { browser } from '$app/environment';

export class WalletService {
  private static readonly STORAGE_KEY = 'hov_wallet'; // Legacy single wallet key
  private static readonly COLLECTION_KEY = 'hov_wallets'; // New multi-wallet collection key
  private static readonly ACTIVE_WALLET_KEY = 'hov_active_wallet';
  private static readonly ENCRYPTION_KEY_SIZE = 32;
  private static readonly COLLECTION_VERSION = 1;

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

  // ============================================================================
  // MULTI-WALLET SUPPORT METHODS
  // ============================================================================

  /**
   * Migrate legacy single wallet to multi-wallet collection
   */
  private migrateLegacyWallet(): void {
    if (!browser) return;

    const legacyData = localStorage.getItem(WalletService.STORAGE_KEY);
    if (!legacyData) return;

    // Check if already migrated
    const collectionData = localStorage.getItem(WalletService.COLLECTION_KEY);
    if (collectionData) return; // Already migrated

    try {
      const legacyWallet: EncryptedWallet = JSON.parse(legacyData);

      // Create new collection with legacy wallet
      const collection: WalletCollection = {
        wallets: [legacyWallet],
        activeAddress: legacyWallet.publicData.address,
        version: WalletService.COLLECTION_VERSION
      };

      // Store collection
      localStorage.setItem(WalletService.COLLECTION_KEY, JSON.stringify(collection));

      // Keep legacy wallet for backwards compatibility (for now)
      console.log('✅ Migrated legacy wallet to multi-wallet collection');
    } catch (error) {
      console.error('Failed to migrate legacy wallet:', error);
    }
  }

  /**
   * Get wallet collection from storage
   */
  private getWalletCollection(): WalletCollection {
    if (!browser) {
      return { wallets: [], activeAddress: null, version: WalletService.COLLECTION_VERSION };
    }

    // Attempt migration if needed
    this.migrateLegacyWallet();

    try {
      const data = localStorage.getItem(WalletService.COLLECTION_KEY);
      if (!data) {
        return { wallets: [], activeAddress: null, version: WalletService.COLLECTION_VERSION };
      }

      const collection: WalletCollection = JSON.parse(data);
      return collection;
    } catch (error) {
      console.error('Failed to load wallet collection:', error);
      return { wallets: [], activeAddress: null, version: WalletService.COLLECTION_VERSION };
    }
  }

  /**
   * Save wallet collection to storage
   */
  private saveWalletCollection(collection: WalletCollection): void {
    if (!browser) return;

    localStorage.setItem(WalletService.COLLECTION_KEY, JSON.stringify(collection));

    // Also update active wallet address
    if (collection.activeAddress) {
      localStorage.setItem(WalletService.ACTIVE_WALLET_KEY, collection.activeAddress);
    }
  }

  /**
   * Get all available wallets (public metadata only)
   */
  getAllWallets(): WalletMetadata[] {
    const collection = this.getWalletCollection();

    return collection.wallets.map(wallet => ({
      address: wallet.publicData.address,
      nickname: wallet.publicData.nickname,
      origin: wallet.publicData.origin || 'legacy',
      createdAt: wallet.publicData.createdAt,
      lastUsed: wallet.publicData.lastUsed,
      isPasswordless: wallet.isPasswordless
    }));
  }

  /**
   * Get active wallet address
   */
  getActiveWalletAddress(): string | null {
    if (!browser) return null;

    const collection = this.getWalletCollection();
    return collection.activeAddress;
  }

  /**
   * Set active wallet
   */
  setActiveWallet(address: string): boolean {
    if (!browser) return false;

    const collection = this.getWalletCollection();
    const walletExists = collection.wallets.some(w => w.publicData.address === address);

    if (!walletExists) {
      console.error('Wallet not found:', address);
      return false;
    }

    collection.activeAddress = address;

    // Update lastUsed timestamp
    const walletIndex = collection.wallets.findIndex(w => w.publicData.address === address);
    if (walletIndex !== -1) {
      collection.wallets[walletIndex].publicData.lastUsed = Date.now();
    }

    this.saveWalletCollection(collection);
    return true;
  }

  /**
   * Add wallet to collection
   */
  async addWalletToCollection(
    wallet: WalletAccount,
    password: string,
    options: { origin?: WalletOrigin; nickname?: string } = {}
  ): Promise<void> {
    if (!browser) return;

    const collection = this.getWalletCollection();

    // Check if wallet already exists
    const exists = collection.wallets.some(w => w.publicData.address === wallet.address);
    if (exists) {
      throw new Error('Wallet already exists in collection');
    }

    // Encrypt and create wallet entry
    const salt = CryptoJS.lib.WordArray.random(16);
    const iv = CryptoJS.lib.WordArray.random(16);

    const walletOrigin: WalletOrigin = options.origin ?? wallet.origin ?? 'generated';
    const createdAt = wallet.createdAt || Date.now();
    const lastUsed = Date.now();

    wallet.origin = walletOrigin;
    wallet.createdAt = createdAt;
    wallet.nickname = options.nickname || wallet.nickname;

    const encryptionKey = password.trim() === '' ?
      this.deriveEmptyPasswordKey(salt) :
      this.derivePasswordBasedKey(password, salt);

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
        origin: walletOrigin,
        nickname: wallet.nickname
      },
      salt: salt.toString(),
      iv: iv.toString(),
      version: 2,
      isPasswordless: password.trim() === ''
    };

    // Add to collection
    collection.wallets.push(encryptedWallet);

    // Set as active if first wallet or no active wallet
    if (!collection.activeAddress) {
      collection.activeAddress = wallet.address;
    }

    this.saveWalletCollection(collection);

    // Also update legacy storage for backwards compatibility
    if (collection.wallets.length === 1) {
      localStorage.setItem(WalletService.STORAGE_KEY, JSON.stringify(encryptedWallet));
    }
  }

  /**
   * Retrieve specific wallet from collection
   */
  async retrieveWalletFromCollection(address: string, password: string): Promise<WalletAccount | null> {
    if (!browser) return null;

    const collection = this.getWalletCollection();
    const encryptedWallet = collection.wallets.find(w => w.publicData.address === address);

    if (!encryptedWallet) {
      throw new Error('Wallet not found in collection');
    }

    try {
      if (!encryptedWallet.salt || !encryptedWallet.iv) {
        throw new Error('Wallet data is missing salt or IV');
      }

      const salt = CryptoJS.enc.Hex.parse(encryptedWallet.salt);
      const iv = CryptoJS.enc.Hex.parse(encryptedWallet.iv);

      if (!salt || !iv) {
        throw new Error('Failed to parse wallet encryption data');
      }

      let encryptionKey: string;

      if (encryptedWallet.version === 2) {
        if (encryptedWallet.isPasswordless) {
          encryptionKey = this.deriveEmptyPasswordKey(salt);
        } else {
          encryptionKey = this.derivePasswordBasedKey(password, salt);
        }
      } else {
        // Legacy wallet
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

      // Update lastUsed
      const walletIndex = collection.wallets.findIndex(w => w.publicData.address === address);
      if (walletIndex !== -1) {
        collection.wallets[walletIndex].publicData.lastUsed = Date.now();
        this.saveWalletCollection(collection);
      }

      return {
        address: encryptedWallet.publicData.address,
        privateKey: decryptedPrivateKey,
        mnemonic: decryptedMnemonic,
        createdAt: encryptedWallet.publicData.createdAt,
        isLocked: false,
        origin,
        nickname: encryptedWallet.publicData.nickname
      };
    } catch (error) {
      console.error('Error retrieving wallet from collection:', error);
      throw new Error('Invalid password or corrupted wallet data');
    }
  }

  /**
   * Remove wallet from collection
   */
  removeWalletFromCollection(address: string): boolean {
    if (!browser) return false;

    const collection = this.getWalletCollection();
    const initialLength = collection.wallets.length;

    collection.wallets = collection.wallets.filter(w => w.publicData.address !== address);

    if (collection.wallets.length === initialLength) {
      return false; // Wallet not found
    }

    // If removed wallet was active, set a new active wallet
    if (collection.activeAddress === address) {
      collection.activeAddress = collection.wallets.length > 0
        ? collection.wallets[0].publicData.address
        : null;
    }

    this.saveWalletCollection(collection);

    // Update legacy storage if needed
    if (collection.wallets.length === 1) {
      localStorage.setItem(WalletService.STORAGE_KEY, JSON.stringify(collection.wallets[0]));
    } else if (collection.wallets.length === 0) {
      localStorage.removeItem(WalletService.STORAGE_KEY);
    }

    return true;
  }

  /**
   * Update wallet nickname
   */
  updateWalletNickname(address: string, nickname: string): boolean {
    if (!browser) return false;

    const collection = this.getWalletCollection();
    const walletIndex = collection.wallets.findIndex(w => w.publicData.address === address);

    if (walletIndex === -1) {
      return false;
    }

    collection.wallets[walletIndex].publicData.nickname = nickname;
    this.saveWalletCollection(collection);

    return true;
  }

  /**
   * Check if wallet exists in collection
   */
  hasWalletInCollection(address: string): boolean {
    const collection = this.getWalletCollection();
    return collection.wallets.some(w => w.publicData.address === address);
  }

  /**
   * Get wallet count
   */
  getWalletCount(): number {
    const collection = this.getWalletCollection();
    return collection.wallets.length;
  }

  /**
   * Clear all wallets
   */
  clearAllWallets(): void {
    if (!browser) return;

    localStorage.removeItem(WalletService.COLLECTION_KEY);
    localStorage.removeItem(WalletService.ACTIVE_WALLET_KEY);
    localStorage.removeItem(WalletService.STORAGE_KEY); // Clear legacy too
  }

}

export const walletService = new WalletService();
