import { browser } from '$app/environment';
import algosdk from 'algosdk';
import type { WalletAccount } from '$lib/types/wallet';
import { PUBLIC_CDP_PROJECT_ID } from '$env/static/public';

import type {
  SignInWithEmailResult,
  VerifyEmailOTPResult,
  User
} from '@coinbase/cdp-core';

type CDPCoreModule = typeof import('@coinbase/cdp-core');

let cdpCoreModulePromise: Promise<CDPCoreModule> | null = null;

async function loadCDPCore(): Promise<CDPCoreModule> {
  if (!browser) {
    throw new Error('CDP wallet can only be used in browser environment');
  }

  if (!cdpCoreModulePromise) {
    cdpCoreModulePromise = import('@coinbase/cdp-core');
  }

  return cdpCoreModulePromise;
}

/**
 * CDP Embedded Wallet Service
 * Handles authentication via Coinbase CDP (email/OTP) and derives Voi wallet from Base wallet
 */
export class CDPWalletService {
  private isInitialized = false;
  private currentFlowId: string | null = null;
  private projectId: string;

  constructor() {
    this.projectId = PUBLIC_CDP_PROJECT_ID || '';
  }

  /**
   * Initialize CDP SDK
   */
  async initializeCDP(): Promise<boolean> {
    if (!this.projectId) {
      throw new Error('CDP Project ID not configured. Please set PUBLIC_CDP_PROJECT_ID in .env');
    }

    if (this.isInitialized) {
      return true;
    }

    try {
      console.log('🔄 Initializing CDP with project ID:', this.projectId);

      const { initialize } = await loadCDPCore();

      await initialize({
        projectId: this.projectId
      });

      this.isInitialized = true;
      console.log('✅ CDP initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize CDP SDK:', error);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Check if user is currently signed in
   */
  async isSignedIn(): Promise<boolean> {
    if (!this.isInitialized) {
      return false;
    }

    try {
      const { isSignedIn } = await loadCDPCore();
      return await isSignedIn();
    } catch (error) {
      console.error('Failed to check sign-in status:', error);
      return false;
    }
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<User | null> {
    if (!this.isInitialized) {
      return null;
    }

    try {
      const { getCurrentUser } = await loadCDPCore();
      return await getCurrentUser();
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<{ success: boolean; error?: string }> {
    if (!this.isInitialized) {
      return { success: true }; // Already signed out
    }

    try {
      const { signOut } = await loadCDPCore();
      await signOut();
      this.currentFlowId = null;
      console.log('✅ Signed out successfully');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign out';
      console.error('❌ Failed to sign out:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Initiate email authentication - sends OTP to user's email
   */
  async signInWithEmail(email: string): Promise<{ success: boolean; flowId?: string; error?: string }> {
    if (!this.isInitialized) {
      const initialized = await this.initializeCDP();
      if (!initialized) {
        return { success: false, error: 'CDP not initialized' };
      }
    }

    // Check if user is already signed in and sign out first
    const alreadySignedIn = await this.isSignedIn();
    if (alreadySignedIn) {
      console.log('⚠️ User already signed in, signing out first...');
      const signOutResult = await this.signOut();
      if (!signOutResult.success) {
        return { success: false, error: `Failed to sign out existing session: ${signOutResult.error}` };
      }
    }

    try {
      console.log('📧 Sending authentication email to:', email);

      const { signInWithEmail } = await loadCDPCore();

      const result: SignInWithEmailResult = await signInWithEmail({ email });
      console.log('✅ Email sent successfully:', result);

      this.currentFlowId = result.flowId;
      return {
        success: true,
        flowId: result.flowId
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send authentication email';
      console.error('❌ Failed to send email:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Verify OTP code and complete authentication
   * Returns the Base wallet address from CDP
   */
  async verifyEmailOTP(
    otpCode: string,
    flowId?: string
  ): Promise<{ success: boolean; baseAddress?: string; error?: string }> {
    const activeFlowId = flowId || this.currentFlowId;

    if (!activeFlowId) {
      return { success: false, error: 'No active authentication flow' };
    }

    if (!this.isInitialized) {
      return { success: false, error: 'CDP not initialized' };
    }

    try {
      console.log('🔑 Verifying OTP code:', otpCode);

      const { verifyEmailOTP } = await loadCDPCore();

      const result: VerifyEmailOTPResult = await verifyEmailOTP({
        flowId: activeFlowId,
        otp: otpCode
      });

      console.log('✅ OTP verification successful:', result);

      this.currentFlowId = null; // Clear flow ID after successful verification

      const baseAddress = result.user?.evmAccounts?.[0] || null;
      if (!baseAddress) {
        return { success: false, error: 'No wallet address found in user account' };
      }

      return {
        success: true,
        baseAddress
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid verification code';
      console.error('❌ OTP verification failed:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Derive Voi (Algorand) wallet from Base (Ethereum) wallet address
   *
   * NOTE: Since CDP doesn't expose the private key directly for embedded wallets,
   * we'll generate a deterministic Voi wallet based on the Base address.
   * This creates a consistent mapping between Base and Voi addresses.
   */
  deriveVoiWalletFromBaseAddress(baseAddress: string): WalletAccount {
    if (!browser) {
      throw new Error('Wallet derivation can only be done in browser');
    }

    try {
      console.log('🔑 Deriving Voi wallet from Base address:', baseAddress);

      // Create a deterministic seed from the Base address
      // Use the Base address as a seed to derive a consistent Algorand wallet
      const seed = new TextEncoder().encode(`HOV-CDP-${baseAddress.toLowerCase()}`);

      // Hash the seed to get a 32-byte value suitable for Algorand
      const hashBuffer = new Uint8Array(32);
      for (let i = 0; i < seed.length && i < 32; i++) {
        hashBuffer[i] = seed[i];
      }

      // Pad remaining bytes with deterministic values
      for (let i = seed.length; i < 32; i++) {
        hashBuffer[i] = (i * 7 + baseAddress.charCodeAt(i % baseAddress.length)) % 256;
      }

      // Generate Algorand account from the deterministic seed
      // Note: This creates a wallet that can be recreated from the same Base address
      const { sk: secretKey, addr: address } = algosdk.generateAccount();

      // Actually, let's use a better approach: use the base address bytes as entropy
      // Convert base address (without 0x) to bytes
      const baseAddressBytes = new Uint8Array(
        baseAddress.slice(2).match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
      );

      // Create a 32-byte seed by repeating and hashing the base address
      const extendedSeed = new Uint8Array(64);
      for (let i = 0; i < 64; i++) {
        extendedSeed[i] = baseAddressBytes[i % baseAddressBytes.length] ^ (i * 13);
      }

      // Use algosdk to generate the key pair from our deterministic seed
      // We'll create a mnemonic from the seed and then generate the key pair
      const mnemonicWords = algosdk.secretKeyToMnemonic(extendedSeed.slice(0, 32));
      const { sk, addr } = algosdk.mnemonicToSecretKey(mnemonicWords);

      // Create WalletAccount object
      const voiWallet: WalletAccount = {
        address: addr,
        privateKey: Array.from(sk, (byte: number) =>
          byte.toString(16).padStart(2, '0')
        ).join(''),
        mnemonic: mnemonicWords,
        createdAt: Date.now(),
        isLocked: false,
        origin: 'cdp'
      };

      console.log('✅ Derived Voi wallet:', voiWallet.address);
      return voiWallet;
    } catch (error) {
      console.error('Failed to derive Voi wallet:', error);
      throw new Error('Failed to create Voi wallet from CDP account');
    }
  }

  /**
   * Complete CDP authentication flow and return Voi wallet
   */
  async authenticateAndDeriveWallet(email: string, otpCode: string): Promise<WalletAccount> {
    // Verify OTP and get Base address
    const verifyResult = await this.verifyEmailOTP(otpCode);

    if (!verifyResult.success || !verifyResult.baseAddress) {
      throw new Error(verifyResult.error || 'Failed to verify OTP');
    }

    // Derive Voi wallet from Base address
    const voiWallet = this.deriveVoiWalletFromBaseAddress(verifyResult.baseAddress);

    return voiWallet;
  }
}

// Export singleton instance
export const cdpWalletService = new CDPWalletService();
