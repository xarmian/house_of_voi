import { MULTI_CONTRACT_CONFIG, NETWORK_CONFIG } from '$lib/constants/network';
import { CONTRACT_CONSTANTS } from '$lib/types/blockchain';
import { algorandService } from './algorand';
import algosdk from 'algosdk';

export interface HouseBalanceData {
  available: number;
  total: number;
  locked: number;
  isOperational: boolean;
  lastUpdated: number;
}

class HouseBalanceService {
  private client: algosdk.Algodv2;
  private cache: Map<string, HouseBalanceData> = new Map(); // Contract-specific cache
  private cacheExpiry = 30000; // 30 seconds
  private isChecking = new Set<string>(); // Track checking per contract

  constructor() {
    this.client = new algosdk.Algodv2(
      NETWORK_CONFIG.token,
      NETWORK_CONFIG.nodeUrl,
      NETWORK_CONFIG.port
    );
  }

  /**
   * Get the default contract ID from multi-contract config
   */
  private getDefaultContractId(): string {
    if (!MULTI_CONTRACT_CONFIG) {
      console.warn('No multi-contract configuration found for HouseBalanceService');
      return '';
    }
    
    return MULTI_CONTRACT_CONFIG.defaultContractId;
  }

  /**
   * Get the slot machine app ID for the currently selected contract
   */
  private async getSlotMachineAppId(): Promise<number> {
    // Import selectedContract dynamically to avoid circular deps
    const { selectedContract, contractSelectionStore } = await import('$lib/stores/multiContract');
    const { get } = await import('svelte/store');
    
    const selectionState = get(contractSelectionStore);
    const currentContract = get(selectedContract);
    
    console.log('🔍 houseBalance getSlotMachineAppId - selectionState:', selectionState);
    console.log('🔍 houseBalance getSlotMachineAppId - currentContract:', currentContract);
    
    if (!currentContract) {
      throw new Error('❌ No contract selected! Cannot get house balance without a selected contract');
    }
    
    if (!currentContract.slotMachineAppId) {
      throw new Error(`❌ Selected contract has no slotMachineAppId! Contract: ${JSON.stringify(currentContract)}`);
    }
    
    return currentContract.slotMachineAppId;
  }

  /**
   * Get the current house balance with caching
   * @param contractId Optional contract ID. If not provided, uses default contract
   */
  async getHouseBalance(contractId?: string): Promise<HouseBalanceData> {
    const targetContractId = contractId || this.getDefaultContractId();
    const cached = this.cache.get(targetContractId);
    
    // Return cached data if still valid
    if (cached && Date.now() - cached.lastUpdated < this.cacheExpiry) {
      return cached;
    }

    // Prevent multiple concurrent requests for the same contract
    if (this.isChecking.has(targetContractId)) {
      return cached || this.getDefaultBalance();
    }

    this.isChecking.add(targetContractId);

    try {
      const balance = await this.fetchHouseBalanceFromContract();
      this.cache.set(targetContractId, balance);
      return balance;
    } catch (error) {
      console.error(`Failed to fetch house balance for contract ${targetContractId}:`, error);
      // Return cached data if available, otherwise default
      return cached || this.getDefaultBalance();
    } finally {
      this.isChecking.delete(targetContractId);
    }
  }

  /**
   * Force refresh the house balance from the contract
   * @param contractId Optional contract ID. If not provided, uses default contract
   */
  async refreshHouseBalance(contractId?: string): Promise<HouseBalanceData> {
    const targetContractId = contractId || this.getDefaultContractId();
    this.cache.delete(targetContractId);
    return this.getHouseBalance(contractId);
  }

  /**
   * Check if the slot machine is operational based on house balance
   * @param contractId Optional contract ID. If not provided, uses default contract
   */
  async isOperational(contractId?: string): Promise<boolean> {
    const balance = await this.getHouseBalance(contractId);
    return balance.isOperational;
  }

  /**
   * Get minimum required balance for operations
   */
  getMinimumOperationalBalance(): number {
    return CONTRACT_CONSTANTS.MIN_BANK_AMOUNT;
  }

  private async fetchHouseBalanceFromContract(): Promise<HouseBalanceData> {
    let slotMachineAppId: number;
    
    try {
      // Get actual contract balances using the contract's get_balances method
      slotMachineAppId = await this.getSlotMachineAppId();
      
      if (!slotMachineAppId || slotMachineAppId === 0) {
        throw new Error(`No slot machine app ID available`);
      }
      
      const balances = await algorandService.getBalances({
        appId: slotMachineAppId,
        debug: false
      });

      // Convert from VOI to microVOI for consistency with existing interface
      const available = balances.balanceAvailable * 1e6;
      const total = balances.balanceTotal * 1e6;
      const locked = balances.balanceLocked * 1e6;

      // Check if operational based on minimum balance requirement
      const isOperational = available >= CONTRACT_CONSTANTS.MIN_BANK_AMOUNT;

      console.log(`📊 Contract balances (${slotMachineAppId}):`, {
        available: `${balances.balanceAvailable.toFixed(6)} VOI`,
        total: `${balances.balanceTotal.toFixed(6)} VOI`, 
        locked: `${balances.balanceLocked.toFixed(6)} VOI`,
        isOperational
      });

      return {
        available,
        total,
        locked,
        isOperational,
        lastUpdated: Date.now()
      };

    } catch (error) {
      console.warn(`⚠️ Contract ${slotMachineAppId || 'unknown'} balance unavailable:`, error.message);
      
      // Return a safe default state when balance check fails
      // This happens when the contract doesn't have enough balance to execute get_balances
      return {
        available: 0,
        total: 0,
        locked: 0,
        isOperational: false,
        lastUpdated: Date.now()
      };
    }
  }

  private getDefaultBalance(): HouseBalanceData {
    return {
      available: 0,
      total: 0,
      locked: 0,
      isOperational: false,
      lastUpdated: Date.now()
    };
  }

  /**
   * Clear the cache (useful for testing or manual refresh)
   * @param contractId Optional contract ID. If not provided, clears all caches
   */
  clearCache(contractId?: string): void {
    if (contractId) {
      this.cache.delete(contractId);
    } else {
      this.cache.clear();
    }
  }
}

// Export singleton instance
export const houseBalanceService = new HouseBalanceService();