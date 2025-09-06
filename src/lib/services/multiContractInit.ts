/**
 * Multi-Contract Initialization Service
 * 
 * Handles the initialization of the multi-contract architecture,
 * ensuring all services and stores are properly set up.
 */

import { browser } from '$app/environment';
import { MULTI_CONTRACT_CONFIG } from '$lib/constants/network';
import { contractRegistry } from './contractRegistry';
import { initializeMultiContractStores } from '$lib/stores/multiContract';

class MultiContractInitializer {
  private initialized = false;
  private initializing = false;
  
  /**
   * Initialize the multi-contract system
   */
  async initialize(): Promise<void> {
    if (this.initialized || this.initializing) {
      return;
    }

    if (!browser) {
      return;
    }

    this.initializing = true;

    try {
      console.log('Initializing multi-contract architecture...');

      // Check if we have valid configuration
      if (!MULTI_CONTRACT_CONFIG) {
        throw new Error('No multi-contract configuration found. Please check your contracts configuration.');
      }

      // Initialize the contract registry
      await contractRegistry.initialize(MULTI_CONTRACT_CONFIG);
      console.log('✅ Contract registry initialized');

      // Initialize multi-contract stores
      await initializeMultiContractStores();
      console.log('✅ Multi-contract stores initialized');

      this.initialized = true;
      console.log('✅ Multi-contract architecture fully initialized');

    } catch (error) {
      console.error('❌ Failed to initialize multi-contract architecture:', error);
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Check if the multi-contract system is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if the multi-contract system is currently initializing
   */
  isInitializing(): boolean {
    return this.initializing;
  }

  /**
   * Get initialization status
   */
  getStatus(): {
    initialized: boolean;
    initializing: boolean;
    hasConfig: boolean;
    contractCount: number;
    defaultContract: string | null;
  } {
    return {
      initialized: this.initialized,
      initializing: this.initializing,
      hasConfig: !!MULTI_CONTRACT_CONFIG,
      contractCount: MULTI_CONTRACT_CONFIG?.contracts?.length || 0,
      defaultContract: MULTI_CONTRACT_CONFIG?.defaultContractId || null
    };
  }
}

// Create singleton instance
export const multiContractInitializer = new MultiContractInitializer();

// Auto-initialize if in browser
if (browser) {
  multiContractInitializer.initialize().catch(error => {
    console.error('Auto-initialization failed:', error);
  });
}