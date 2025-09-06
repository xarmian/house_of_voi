/**
 * Lazy Blockchain Service
 * 
 * MEMORY OPTIMIZATION: Provides lazy loading wrappers for heavy blockchain operations
 * to reduce initial bundle size and memory usage.
 */

import type algosdk from 'algosdk';

interface LazyAlgodClient {
  client: algosdk.Algodv2 | null;
  initialized: boolean;
}

class LazyBlockchainService {
  private static instance: LazyBlockchainService;
  private algodClient: LazyAlgodClient = {
    client: null,
    initialized: false
  };

  private constructor() {}

  static getInstance(): LazyBlockchainService {
    if (!LazyBlockchainService.instance) {
      LazyBlockchainService.instance = new LazyBlockchainService();
    }
    return LazyBlockchainService.instance;
  }

  /**
   * Lazy load algosdk and create client
   */
  async getAlgodClient(): Promise<algosdk.Algodv2> {
    if (this.algodClient.client && this.algodClient.initialized) {
      return this.algodClient.client;
    }

    console.log('🔄 Lazy loading algosdk...');
    
    // Dynamic import to avoid including algosdk in initial bundle
    const [algosdk, { NETWORK_CONFIG }] = await Promise.all([
      import('algosdk'),
      import('$lib/constants/network')
    ]);

    this.algodClient.client = new algosdk.default.Algodv2(
      NETWORK_CONFIG.token,
      NETWORK_CONFIG.nodeUrl,
      NETWORK_CONFIG.port
    );

    this.algodClient.initialized = true;
    console.log('✅ Algosdk loaded and client initialized');
    
    return this.algodClient.client;
  }

  /**
   * Lazy load algokit utils
   */
  async getAlgokitUtils() {
    console.log('🔄 Lazy loading @algorandfoundation/algokit-utils...');
    const algokit = await import('@algorandfoundation/algokit-utils');
    console.log('✅ Algokit utils loaded');
    return algokit;
  }

  /**
   * Lazy load wallet adapters
   */
  async getWalletAdapters() {
    console.log('🔄 Lazy loading wallet adapters...');
    const walletModule = await import('avm-wallet-svelte');
    console.log('✅ Wallet adapters loaded');
    return walletModule;
  }

  /**
   * Lazy load contract clients
   */
  async getYBTClient() {
    console.log('🔄 Lazy loading YBT contract client...');
    const clientModule = await import('../../clients/YieldBearingTokenClient.js');
    console.log('✅ YBT contract client loaded');
    return clientModule;
  }

  /**
   * Lazy load ulujs
   */
  async getUlujs() {
    console.log('🔄 Lazy loading ulujs...');
    const uluModule = await import('ulujs');
    console.log('✅ Ulujs loaded');
    return uluModule;
  }

  /**
   * Check if blockchain operations are ready without initializing
   */
  isReady(): boolean {
    return this.algodClient.initialized && this.algodClient.client !== null;
  }

  /**
   * Reset the service (useful for testing)
   */
  reset(): void {
    this.algodClient = {
      client: null,
      initialized: false
    };
  }
}

// Export singleton instance
export const lazyBlockchainService = LazyBlockchainService.getInstance();
export { LazyBlockchainService };