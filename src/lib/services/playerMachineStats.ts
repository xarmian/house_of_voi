/**
 * Player Machine Stats Service
 * 
 * Provides player-specific statistics for individual slot machines.
 * Fetches stats for all machines and caches them per player address.
 */

import { hovStatsService } from './hovStats';
import type { PlayerStats, PlayerMachineStats } from '../types/hovStats';

class PlayerMachineStatsService {
  private statsCache: Map<string, PlayerStats> = new Map();
  private loadingStates: Map<string, Promise<PlayerStats>> = new Map();
  private cacheTimeout = 120000; // 2 minutes cache

  /**
   * Get all machine stats for a player
   */
  async getPlayerMachineStats(playerAddress: string): Promise<PlayerStats> {
    const cacheKey = `player_all_${playerAddress}`;
    
    // Check if we have a fresh cached result
    const cached = this.statsCache.get(cacheKey);
    if (cached && Date.now() - (cached.lastUpdated || 0) < this.cacheTimeout) {
      return cached;
    }

    // Check if we're already loading this player's stats
    const loadingPromise = this.loadingStates.get(cacheKey);
    if (loadingPromise) {
      return loadingPromise;
    }

    // Start loading stats
    const promise = this.loadPlayerMachineStats(playerAddress);
    this.loadingStates.set(cacheKey, promise);

    try {
      const stats = await promise;
      this.statsCache.set(cacheKey, { ...stats, lastUpdated: Date.now() });
      return stats;
    } finally {
      this.loadingStates.delete(cacheKey);
    }
  }

  /**
   * Get stats for a specific machine for a player
   */
  async getPlayerStatsForMachine(playerAddress: string, appId: number): Promise<PlayerMachineStats | null> {
    try {
      const allStats = await this.getPlayerMachineStats(playerAddress);
      
      if (!allStats.machines) {
        return null;
      }

      return allStats.machines.find(machine => machine.app_id === appId) || null;
    } catch (error) {
      console.error(`Failed to get player stats for machine ${appId}:`, error);
      return null;
    }
  }

  /**
   * Load player stats for all machines from the API
   */
  private async loadPlayerMachineStats(playerAddress: string): Promise<PlayerStats> {
    try {
      const stats = await hovStatsService.getPlayerStats({
        p_app_id: null, // Fetch stats for all machines
        p_player_address: playerAddress
      });

      return stats;
    } catch (error) {
      console.error(`Failed to load player machine stats for ${playerAddress}:`, error);
      
      // Return empty stats on error
      return {
        total_spins: BigInt(0),
        total_amount_bet: BigInt(0),
        total_amount_won: BigInt(0),
        net_result: BigInt(0),
        largest_single_win: BigInt(0),
        average_bet_size: 0,
        win_rate: 0,
        longest_winning_streak: 0,
        longest_losing_streak: 0,
        favorite_bet_amount: BigInt(0),
        total_paylines_played: BigInt(0),
        first_bet_round: BigInt(0),
        last_bet_round: BigInt(0),
        days_active: 0,
        profit_per_spin: 0,
        machines: []
      };
    }
  }

  /**
   * Get cached stats without loading
   */
  getCachedPlayerStats(playerAddress: string): PlayerStats | null {
    const cacheKey = `player_all_${playerAddress}`;
    return this.statsCache.get(cacheKey) || null;
  }

  /**
   * Get cached stats for a specific machine
   */
  getCachedMachineStats(playerAddress: string, appId: number): PlayerMachineStats | null {
    const allStats = this.getCachedPlayerStats(playerAddress);
    if (!allStats?.machines) {
      return null;
    }

    return allStats.machines.find(machine => machine.app_id === appId) || null;
  }

  /**
   * Clear cache for a specific player
   */
  clearPlayerCache(playerAddress: string): void {
    const cacheKey = `player_all_${playerAddress}`;
    this.statsCache.delete(cacheKey);
    this.loadingStates.delete(cacheKey);
  }

  /**
   * Clear all cached statistics
   */
  clearCache(): void {
    this.statsCache.clear();
    this.loadingStates.clear();
  }

  /**
   * Force refresh statistics for a player
   */
  async refreshPlayerStats(playerAddress: string): Promise<PlayerStats> {
    this.clearPlayerCache(playerAddress);
    return this.getPlayerMachineStats(playerAddress);
  }

  /**
   * Format VOI amounts for display (same as MachineStatsService)
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
    } else if (voi > 0) {
      return voi.toFixed(3);
    } else if (voi < 0) {
      const absVoi = Math.abs(voi);
      if (absVoi >= 1000000) {
        return '-' + (absVoi / 1000000).toFixed(1) + 'M';
      } else if (absVoi >= 1000) {
        return '-' + (absVoi / 1000).toFixed(1) + 'K';
      } else if (absVoi >= 1) {
        return '-' + absVoi.toFixed(1);
      } else {
        return '-' + absVoi.toFixed(3);
      }
    } else {
      return '0';
    }
  }

  /**
   * Format numbers for display
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
}

export const playerMachineStatsService = new PlayerMachineStatsService();
export { PlayerMachineStatsService };