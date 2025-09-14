/**
 * Tournament Service
 * 
 * Handles tournament-specific data fetching using the get_hov_tournament
 * Supabase function for time-windowed leaderboards.
 */

import { supabaseService } from './supabase';

// Tournament data types based on the Mimir function structure
export interface TournamentPlayer {
  rank: number;
  who: string;
  total_spins: number;
  total_volume: number;
  rtp_percent?: number;
  longest_win_streak?: number;
  longest_losing_streak?: number;
  combined_rank?: number;
  volume_rank?: number;
  rtp_rank?: number;
  streak_rank?: number;
  losing_streak_rank?: number;
  displayRank?: number; // For frontend tie handling
}

export interface TournamentCategories {
  volume: TournamentPlayer[];
  rtp: TournamentPlayer[];
  win_streak: TournamentPlayer[];
  losing_streak: TournamentPlayer[];
  overall: TournamentPlayer[];
}

export interface TournamentParams {
  app_id: number;
  start_ts: string;
  end_ts: string;
  limit: number;
  min_spins: number;
  min_volume_micro: number;
}

export interface TournamentData {
  params: TournamentParams;
  categories: TournamentCategories;
}

export interface TournamentServiceOptions {
  appId: number;
  startDate: Date;
  endDate: Date;
  limit?: number;
  minSpins?: number;
  minVolumeMicroVOI?: number;
}

class TournamentService {
  private cache: Map<string, { data: TournamentData; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute cache

  /**
   * Get tournament leaderboard data for the specified time window
   */
  async getTournamentData(options: TournamentServiceOptions): Promise<TournamentData> {
    const {
      appId,
      startDate,
      endDate,
      limit = 100,
      minSpins = 500,
      minVolumeMicroVOI = 25000000000 // 25,000 VOI in micro units
    } = options;

    // Create cache key
    const cacheKey = `${appId}_${startDate.toISOString()}_${endDate.toISOString()}_${limit}_${minSpins}_${minVolumeMicroVOI}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('🎯 Using cached tournament data');
      return cached.data;
    }

    console.log('🏆 Fetching tournament data from database...');

    try {
      // Convert dates to ISO strings for the database function
      const startTs = startDate.toISOString();
      const endTs = endDate.toISOString();

      // Ensure Supabase client is initialized
      await supabaseService.initialize();
      const client = supabaseService.getClient();

      // Call the Supabase function
      const { data, error } = await client.rpc('get_hov_tournament', {
        p_app_id: appId.toString(),
        p_start_ts: startTs,
        p_end_ts: endTs,
        p_limit: limit,
        p_min_spins: minSpins,
        p_min_volume_micro: minVolumeMicroVOI.toString()
      });

      if (error) {
        console.error('❌ Tournament data fetch error:', error);
        throw new Error(`Failed to fetch tournament data: ${error.message}`);
      }

      if (!data) {
        throw new Error('No tournament data returned from database');
      }

      // Parse the JSONB response
      const tournamentData = typeof data === 'string' ? JSON.parse(data) : data;
      
      console.log('✅ Tournament data fetched successfully:', {
        volumePlayers: tournamentData.categories.volume.length,
        rtpPlayers: tournamentData.categories.rtp.length,
        streakPlayers: tournamentData.categories.win_streak.length,
        losingStreakPlayers: tournamentData.categories.losing_streak?.length || 0,
        overallPlayers: tournamentData.categories.overall.length
      });

      // Cache the result
      this.cache.set(cacheKey, {
        data: tournamentData,
        timestamp: Date.now()
      });

      return tournamentData;

    } catch (error) {
      console.error('❌ Tournament service error:', error);
      throw error;
    }
  }

  /**
   * Get player's position in all categories
   */
  getPlayerPositions(data: TournamentData, playerAddress: string): {
    volume: TournamentPlayer | null;
    rtp: TournamentPlayer | null;
    win_streak: TournamentPlayer | null;
    losing_streak: TournamentPlayer | null;
    overall: TournamentPlayer | null;
  } {
    return {
      volume: data.categories.volume.find(p => p.who === playerAddress) || null,
      rtp: data.categories.rtp.find(p => p.who === playerAddress) || null,
      win_streak: data.categories.win_streak.find(p => p.who === playerAddress) || null,
      losing_streak: data.categories.losing_streak.find(p => p.who === playerAddress) || null,
      overall: data.categories.overall.find(p => p.who === playerAddress) || null
    };
  }

  /**
   * Format VOI amount from micro-VOI
   */
  formatVOI(microVOI: number, decimals = 2): string {
    const voi = microVOI / 1000000;
    return voi.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  /**
   * Format address for display
   */
  formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Clear cache (useful for force refresh)
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🗑️ Tournament cache cleared');
  }
}

// Export singleton instance
export const tournamentService = new TournamentService();