/**
 * Machine Statistics Service
 * 
 * Loads real platform statistics for slot machines from the HOV Stats API
 */

import { hovStatsService } from './hovStats';
import type { PlatformStats } from '../types/hovStats';
import type { ContractPair } from '../types/multiContract';

export interface MachineStats {
  contractId: string;
  totalBets: bigint;
  totalAmountBet: bigint;
  totalAmountPaid: bigint;
  totalWinningSpins: bigint;
  averageBetSize: number;
  averagePayout: number;
  winPercentage: number;
  houseEdge: number;
  rtp: number;
  netPlatformResult: bigint;
  uniquePlayers: bigint;
  largestSingleWin: bigint;
  largestSingleBet: bigint;
  isLoading?: boolean;
  error?: string;
  lastUpdated: number;
}

class MachineStatsService {
  private statsCache: Map<string, MachineStats> = new Map();
  private loadingStates: Map<string, Promise<MachineStats>> = new Map();
  private cacheTimeout = 60000; // 1 minute cache

  /**
   * Get statistics for a specific machine
   */
  async getMachineStats(contract: ContractPair): Promise<MachineStats> {
    const cacheKey = contract.id;
    
    // Check if we have a fresh cached result
    const cached = this.statsCache.get(cacheKey);
    if (cached && Date.now() - cached.lastUpdated < this.cacheTimeout) {
      return cached;
    }

    // Check if we're already loading this contract's stats
    const loadingPromise = this.loadingStates.get(cacheKey);
    if (loadingPromise) {
      return loadingPromise;
    }

    // Start loading stats
    const promise = this.loadMachineStats(contract);
    this.loadingStates.set(cacheKey, promise);

    try {
      const stats = await promise;
      this.statsCache.set(cacheKey, stats);
      return stats;
    } finally {
      this.loadingStates.delete(cacheKey);
    }
  }

  /**
   * Get statistics for multiple machines
   */
  async getMultipleMachineStats(contracts: ContractPair[]): Promise<Map<string, MachineStats>> {
    const results = new Map<string, MachineStats>();
    
    // Load all stats in parallel
    const promises = contracts.map(async (contract) => {
      try {
        const stats = await this.getMachineStats(contract);
        results.set(contract.id, stats);
      } catch (error) {
        // Create error state for failed loads
        const errorStats: MachineStats = {
          contractId: contract.id,
          totalBets: BigInt(0),
          totalAmountBet: BigInt(0),
          totalAmountPaid: BigInt(0),
          totalWinningSpins: BigInt(0),
          averageBetSize: 0,
          averagePayout: 0,
          winPercentage: 0,
          houseEdge: contract.metadata.houseEdge || 5.0,
          rtp: 0,
          netPlatformResult: BigInt(0),
          uniquePlayers: BigInt(0),
          largestSingleWin: BigInt(0),
          largestSingleBet: BigInt(0),
          error: error instanceof Error ? error.message : 'Failed to load stats',
          lastUpdated: Date.now()
        };
        results.set(contract.id, errorStats);
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Load statistics from the API for a specific machine
   */
  private async loadMachineStats(contract: ContractPair): Promise<MachineStats> {
    try {
      // Set loading state in cache
      const loadingStats: MachineStats = {
        contractId: contract.id,
        totalBets: BigInt(0),
        totalAmountBet: BigInt(0),
        totalAmountPaid: BigInt(0),
        totalWinningSpins: BigInt(0),
        averageBetSize: 0,
        averagePayout: 0,
        winPercentage: 0,
        houseEdge: contract.metadata.houseEdge || 5.0,
        rtp: 0,
        netPlatformResult: BigInt(0),
        uniquePlayers: BigInt(0),
        largestSingleWin: BigInt(0),
        largestSingleBet: BigInt(0),
        isLoading: true,
        lastUpdated: Date.now()
      };

      const platformStats = await hovStatsService.getPlatformStats({
        p_app_id: BigInt(contract.slotMachineAppId)
      });

      // Convert to our format
      const machineStats: MachineStats = {
        contractId: contract.id,
        totalBets: platformStats.total_bets,
        totalAmountBet: platformStats.total_amount_bet,
        totalAmountPaid: platformStats.total_amount_paid,
        totalWinningSpins: platformStats.total_winning_spins,
        averageBetSize: platformStats.average_bet_size,
        averagePayout: platformStats.average_payout,
        winPercentage: platformStats.win_percentage,
        houseEdge: platformStats.house_edge,
        rtp: platformStats.rtp,
        netPlatformResult: platformStats.net_platform_result,
        uniquePlayers: platformStats.unique_players,
        largestSingleWin: platformStats.largest_single_win,
        largestSingleBet: platformStats.largest_single_bet,
        lastUpdated: Date.now()
      };

      return machineStats;
    } catch (error) {
      console.error(`Failed to load stats for machine ${contract.name}:`, error);
      throw error;
    }
  }

  /**
   * Get cached statistics without loading
   */
  getCachedStats(contractId: string): MachineStats | null {
    return this.statsCache.get(contractId) || null;
  }

  /**
   * Clear cache for a specific contract
   */
  clearContractCache(contractId: string): void {
    this.statsCache.delete(contractId);
    this.loadingStates.delete(contractId);
  }

  /**
   * Clear all cached statistics
   */
  clearCache(): void {
    this.statsCache.clear();
    this.loadingStates.clear();
  }

  /**
   * Force refresh statistics for a contract
   */
  async refreshMachineStats(contract: ContractPair): Promise<MachineStats> {
    this.clearContractCache(contract.id);
    return this.getMachineStats(contract);
  }

  /**
   * Format large numbers for display
   */
  static formatNumber(value: number | bigint): string {
    const num = typeof value === 'bigint' ? Number(value) : value;
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  /**
   * Format VOI amounts for display
   */
  static formatVOI(microVOI: number | bigint): string {
    const num = typeof microVOI === 'bigint' ? Number(microVOI) : microVOI;
    const voi = num / 1_000_000; // Convert from microVOI to VOI
    if (voi >= 1000000) {
      return (voi / 1000000).toFixed(1) + 'M';
    } else if (voi >= 1000) {
      return (voi / 1000).toFixed(1) + 'K';
    } else if (voi >= 1) {
      return voi.toFixed(1);
    } else {
      return voi.toFixed(3);
    }
  }
}

export const machineStatsService = new MachineStatsService();
export { MachineStatsService };