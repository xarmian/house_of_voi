import { CONTRACT_CONFIG, NETWORK_CONFIG } from '$lib/constants/network';
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
  private cache: HouseBalanceData | null = null;
  private cacheExpiry = 30000; // 30 seconds
  private isChecking = false;

  constructor() {
    this.client = new algosdk.Algodv2(
      NETWORK_CONFIG.token,
      NETWORK_CONFIG.nodeUrl,
      NETWORK_CONFIG.port
    );
  }

  /**
   * Get the current house balance with caching
   */
  async getHouseBalance(): Promise<HouseBalanceData> {
    // Return cached data if still valid
    if (this.cache && Date.now() - this.cache.lastUpdated < this.cacheExpiry) {
      return this.cache;
    }

    // Prevent multiple concurrent requests
    if (this.isChecking) {
      return this.cache || this.getDefaultBalance();
    }

    this.isChecking = true;

    try {
      const balance = await this.fetchHouseBalanceFromContract();
      this.cache = balance;
      return balance;
    } catch (error) {
      console.error('Failed to fetch house balance:', error);
      // Return cached data if available, otherwise default
      return this.cache || this.getDefaultBalance();
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Force refresh the house balance from the contract
   */
  async refreshHouseBalance(): Promise<HouseBalanceData> {
    this.cache = null;
    return this.getHouseBalance();
  }

  /**
   * Check if the slot machine is operational based on house balance
   */
  async isOperational(): Promise<boolean> {
    const balance = await this.getHouseBalance();
    return balance.isOperational;
  }

  /**
   * Get minimum required balance for operations
   */
  getMinimumOperationalBalance(): number {
    return CONTRACT_CONSTANTS.MIN_BANK_AMOUNT;
  }

  private async fetchHouseBalanceFromContract(): Promise<HouseBalanceData> {
    try {
      // Get actual contract balances using the contract's get_balances method
      const balances = await algorandService.getBalances({
        appId: CONTRACT_CONFIG.slotMachineAppId,
        debug: false
      });

      // Convert from VOI to microVOI for consistency with existing interface
      const available = balances.balanceAvailable * 1e6;
      const total = balances.balanceTotal * 1e6;
      const locked = balances.balanceLocked * 1e6;

      // Check if operational based on minimum balance requirement
      const isOperational = available >= CONTRACT_CONSTANTS.MIN_BANK_AMOUNT;

      console.log('📊 Contract balances:', {
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
      console.error('Error fetching house balance from contract:', error);
      throw error;
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
   */
  clearCache(): void {
    this.cache = null;
  }
}

// Export singleton instance
export const houseBalanceService = new HouseBalanceService();