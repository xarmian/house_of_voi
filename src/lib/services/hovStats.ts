/**
 * HOV Statistics Service
 * Provides access to all Supabase database functions for game statistics
 */

import { supabaseService, type Database } from './supabase';
import type {
  BalanceHistoryTick,
  PlatformStats,
  LeaderboardEntry,
  PlayerStats,
  PlayerSpin,
  PlayerRank,
  TimeStats,
  HotColdPlayer,
  WhalePlayer,
  PaylineAnalysis,
  ScanEventResult,
  GetBalanceHistoryParams,
  GetPlatformStatsParams,
  GetLeaderboardParams,
  GetPlayerStatsParams,
  GetPlayerSpinsParams,
  GetPlayerRankParams,
  GetTimeStatsParams,
  GetHotColdPlayersParams,
  GetWhalesParams,
  ScanEventsParams,
  HovStatsError,
  HovStatsServiceConfig
} from '../types/hovStats';
import { browser } from '$app/environment';
import { PUBLIC_SLOT_MACHINE_APP_ID, PUBLIC_DEBUG_MODE } from '$env/static/public';

// Default configuration
const DEFAULT_CONFIG: HovStatsServiceConfig = {
  supabaseUrl: '',
  supabaseKey: '',
  defaultAppId: BigInt(PUBLIC_SLOT_MACHINE_APP_ID || '0'),
  cache: {
    platformStats: { ttl: 60000, maxSize: 10 }, // 1 minute
    leaderboard: { ttl: 300000, maxSize: 50 }, // 5 minutes
    playerStats: { ttl: 120000, maxSize: 100 }, // 2 minutes
    timeStats: { ttl: 600000, maxSize: 20 } // 10 minutes
  },
  fallbackToLocal: true,
  retryConfig: {
    maxAttempts: 3,
    backoffMs: 1000
  }
};

// Simple cache implementation
class SimpleCache<T> {
  private cache = new Map<string, { data: T; timestamp: number }>();
  private ttl: number;
  private maxSize: number;

  constructor(ttl: number, maxSize: number) {
    this.ttl = ttl;
    this.maxSize = maxSize;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

class HovStatsService {
  private config: HovStatsServiceConfig;
  private caches: {
    platformStats: SimpleCache<PlatformStats>;
    leaderboard: SimpleCache<LeaderboardEntry[]>;
    playerStats: SimpleCache<PlayerStats>;
    timeStats: SimpleCache<TimeStats[]>;
  };

  constructor(config: Partial<HovStatsServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.caches = {
      platformStats: new SimpleCache<PlatformStats>(
        this.config.cache.platformStats.ttl,
        this.config.cache.platformStats.maxSize
      ),
      leaderboard: new SimpleCache<LeaderboardEntry[]>(
        this.config.cache.leaderboard.ttl,
        this.config.cache.leaderboard.maxSize
      ),
      playerStats: new SimpleCache<PlayerStats>(
        this.config.cache.playerStats.ttl,
        this.config.cache.playerStats.maxSize
      ),
      timeStats: new SimpleCache<TimeStats[]>(
        this.config.cache.timeStats.ttl,
        this.config.cache.timeStats.maxSize
      )
    };
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    await supabaseService.initialize();
    if (PUBLIC_DEBUG_MODE === 'true') {
      console.log('✅ HOV Stats Service initialized');
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return supabaseService.isReady();
  }

  /**
   * Get balance history for an address
   */
  async getBalanceHistory(params: GetBalanceHistoryParams): Promise<BalanceHistoryTick[]> {
    return this.withErrorHandling('getBalanceHistory', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      const { data, error } = await client.rpc('get_balance_history', {
        algorand_address: params.algorand_address,
        start_round: params.start_round.toString(),
        end_round: params.end_round.toString()
      });

      if (error) throw error;

      return (data || []).map(row => ({
        block_round: BigInt(Math.floor(Number(row.block_round))),
        timestamp: new Date(row.timestamp),
        intra: row.intra,
        balance_delta: BigInt(Math.floor(Number(row.balance_delta))),
        fee: BigInt(Math.floor(Number(row.fee))),
        actual_balance: BigInt(Math.floor(Number(row.actual_balance))),
        tick_number: BigInt(Math.floor(Number(row.tick_number)))
      }));
    });
  }

  /**
   * Get platform statistics
   */
  async getPlatformStats(params?: GetPlatformStatsParams): Promise<PlatformStats> {
    const appId = params?.p_app_id || this.config.defaultAppId;
    const cacheKey = `platform_${appId}_${params?.p_start_round}_${params?.p_end_round}`;
    
    const cached = this.caches.platformStats.get(cacheKey);
    if (cached) return cached;

    return this.withErrorHandling('getPlatformStats', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      const { data, error } = await client.rpc('get_hov_platform_stats', {
        p_app_id: appId.toString(),
        p_start_round: params?.p_start_round?.toString() || null,
        p_end_round: params?.p_end_round?.toString() || null
      });

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('No platform statistics found');
      }

      const stats: PlatformStats = {
        total_bets: BigInt(Math.floor(Number(data[0].total_bets))),
        total_amount_bet: BigInt(Math.floor(Number(data[0].total_amount_bet))),
        total_amount_paid: BigInt(Math.floor(Number(data[0].total_amount_paid))),
        total_winning_spins: BigInt(Math.floor(Number(data[0].total_winning_spins))),
        average_bet_size: Number(data[0].average_bet_size),
        average_payout: Number(data[0].average_payout),
        win_percentage: Number(data[0].win_percentage),
        house_edge: Number(data[0].house_edge),
        rtp: Number(data[0].rtp),
        net_platform_result: BigInt(Math.floor(Number(data[0].net_platform_result))),
        unique_players: BigInt(Math.floor(Number(data[0].unique_players))),
        largest_single_win: BigInt(Math.floor(Number(data[0].largest_single_win))),
        largest_single_bet: BigInt(Math.floor(Number(data[0].largest_single_bet)))
      };

      this.caches.platformStats.set(cacheKey, stats);
      return stats;
    });
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(params?: GetLeaderboardParams): Promise<LeaderboardEntry[]> {
    const appId = params?.p_app_id || this.config.defaultAppId;
    const metric = params?.p_metric || 'net_result';
    const limit = params?.p_limit || 100;
    const offset = params?.p_offset || 0;
    const cacheKey = `leaderboard_${appId}_${metric}_${limit}_${offset}`;

    const cached = this.caches.leaderboard.get(cacheKey);
    if (cached) return cached;

    return this.withErrorHandling('getLeaderboard', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      const { data, error } = await client.rpc('get_hov_leaderboard', {
        p_app_id: appId.toString(),
        p_metric: metric,
        p_limit: limit,
        p_offset: offset
      });

      if (error) throw error;

      const leaderboard = (data || []).map(row => ({
        rank_position: BigInt(Math.floor(Number(row.rank_position))),
        who: row.who,
        total_spins: BigInt(Math.floor(Number(row.total_spins))),
        total_amount_bet: BigInt(Math.floor(Number(row.total_amount_bet))),
        total_amount_won: BigInt(Math.floor(Number(row.total_amount_won))),
        net_result: BigInt(Math.floor(Number(row.net_result))),
        largest_single_win: BigInt(Math.floor(Number(row.largest_single_win))),
        win_rate: Number(row.win_rate),
        longest_streak: Number(row.longest_streak),
        avg_bet_size: Number(row.avg_bet_size)
      }));

      this.caches.leaderboard.set(cacheKey, leaderboard);
      return leaderboard;
    });
  }

  /**
   * Get player statistics
   */
  async getPlayerStats(params: GetPlayerStatsParams): Promise<PlayerStats> {
    const appId = params.p_app_id || this.config.defaultAppId;
    const cacheKey = `player_${appId}_${params.p_player_address}`;

    const cached = this.caches.playerStats.get(cacheKey);
    if (cached) return cached;

    // Ensure service is initialized
    if (!supabaseService.isReady()) {
      await supabaseService.initialize();
    }
    const client = supabaseService.getClient();
    const { data, error } = await client.rpc('get_player_stats', {
      p_app_id: appId.toString(),
      p_player_address: params.p_player_address
    });

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Player statistics not found');
    }

    const row = data[0];
    const stats: PlayerStats = {
      total_spins: BigInt(Math.floor(Number(row.total_spins || 0))),
      total_amount_bet: BigInt(Math.floor(Number(row.total_amount_bet || 0))),
      total_amount_won: BigInt(Math.floor(Number(row.total_amount_won || 0))),
      net_result: BigInt(Math.floor(Number(row.net_result || 0))),
      largest_single_win: BigInt(Math.floor(Number(row.largest_single_win || 0))),
      average_bet_size: Number(row.average_bet_size || 0),
      win_rate: Number(row.win_rate || 0),
      longest_winning_streak: Number(row.longest_winning_streak || 0),
      longest_losing_streak: Number(row.longest_losing_streak || 0),
      favorite_bet_amount: BigInt(Math.floor(Number(row.favorite_bet_amount || 0))),
      total_paylines_played: BigInt(Math.floor(Number(row.total_paylines_played || 0))),
      first_bet_round: BigInt(Math.floor(Number(row.first_bet_round || 0))),
      last_bet_round: BigInt(Math.floor(Number(row.last_bet_round || 0))),
      days_active: Number(row.days_active || 0),
      profit_per_spin: Number(row.profit_per_spin || 0)
    };

    this.caches.playerStats.set(cacheKey, stats);
    return stats;
  }

  /**
   * Get player spins with pagination
   */
  async getPlayerSpins(params: GetPlayerSpinsParams): Promise<PlayerSpin[]> {
    return this.withErrorHandling('getPlayerSpins', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      const { data, error } = await client.rpc('get_player_spins', {
        p_app_id: (params.p_app_id || this.config.defaultAppId).toString(),
        p_player_address: params.p_player_address,
        p_limit: params.p_limit || 50,
        p_offset: params.p_offset || 0
      });

      if (error) throw error;

      return (data || []).map(row => ({
        round: BigInt(row.round),
        intra: row.intra,
        txid: row.txid,
        bet_amount_per_line: BigInt(row.bet_amount_per_line),
        paylines_count: row.paylines_count,
        total_bet_amount: BigInt(row.total_bet_amount),
        payout: BigInt(row.payout),
        net_result: BigInt(row.net_result),
        is_win: row.is_win,
        claim_round: BigInt(row.claim_round),
        created_at: new Date(row.created_at)
      }));
    });
  }

  /**
   * Get player rank
   */
  async getPlayerRank(params: GetPlayerRankParams): Promise<PlayerRank> {
    return this.withErrorHandling('getPlayerRank', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      const { data, error } = await client.rpc('get_player_rank', {
        p_app_id: (params.p_app_id || this.config.defaultAppId).toString(),
        p_player_address: params.p_player_address,
        p_metric: params.p_metric || 'net_result'
      });

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Player rank not found');
      }

      return {
        player_rank: BigInt(data[0].player_rank),
        total_players: BigInt(data[0].total_players),
        percentile: Number(data[0].percentile)
      };
    });
  }

  /**
   * Get time-based statistics
   */
  async getTimeStats(params?: GetTimeStatsParams): Promise<TimeStats[]> {
    const appId = params?.p_app_id || this.config.defaultAppId;
    const timeUnit = params?.p_time_unit || 'day';
    const limit = params?.p_limit || 30;
    const cacheKey = `time_${appId}_${timeUnit}_${params?.p_start_round}_${params?.p_end_round}_${limit}`;

    const cached = this.caches.timeStats.get(cacheKey);
    if (cached) return cached;

    return this.withErrorHandling('getTimeStats', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      const { data, error } = await client.rpc('get_hov_time_stats', {
        p_app_id: appId.toString(),
        p_time_unit: timeUnit,
        p_start_round: params?.p_start_round?.toString() || null,
        p_end_round: params?.p_end_round?.toString() || null,
        p_limit: limit
      });

      if (error) throw error;

      const stats = (data || []).map(row => ({
        time_period: new Date(row.time_period),
        total_bets: BigInt(row.total_bets),
        total_amount_bet: BigInt(row.total_amount_bet),
        total_amount_won: BigInt(row.total_amount_won),
        unique_players: BigInt(row.unique_players),
        win_rate: Number(row.win_rate),
        house_edge: Number(row.house_edge)
      }));

      this.caches.timeStats.set(cacheKey, stats);
      return stats;
    });
  }

  /**
   * Get hot and cold players
   */
  async getHotColdPlayers(params?: GetHotColdPlayersParams): Promise<HotColdPlayer[]> {
    return this.withErrorHandling('getHotColdPlayers', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      const { data, error } = await client.rpc('get_hot_cold_players', {
        p_app_id: (params?.p_app_id || this.config.defaultAppId).toString(),
        p_recent_rounds: params?.p_recent_rounds ? params.p_recent_rounds.toString() : '100000',
        p_min_spins: params?.p_min_spins || 10,
        p_limit: params?.p_limit || 20
      });

      if (error) throw error;

      return (data || []).map(row => ({
        who: row.who,
        recent_spins: BigInt(row.recent_spins),
        recent_net_result: BigInt(row.recent_net_result),
        recent_win_rate: Number(row.recent_win_rate),
        temperature: row.temperature as 'HOT' | 'COLD' | 'NEUTRAL',
        total_spins: BigInt(row.total_spins),
        overall_net_result: BigInt(row.overall_net_result)
      }));
    });
  }

  /**
   * Get whale players
   */
  async getWhales(params?: GetWhalesParams): Promise<WhalePlayer[]> {
    return this.withErrorHandling('getWhales', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      const { data, error } = await client.rpc('get_whales', {
        p_app_id: (params?.p_app_id || this.config.defaultAppId).toString(),
        p_min_total_bet: params?.p_min_total_bet ? params.p_min_total_bet.toString() : '1000000000', // 1000 VOI
        p_limit: params?.p_limit || 50
      });

      if (error) throw error;

      return (data || []).map(row => ({
        who: row.who,
        total_amount_bet: BigInt(row.total_amount_bet),
        total_amount_won: BigInt(row.total_amount_won),
        net_result: BigInt(row.net_result),
        total_spins: BigInt(row.total_spins),
        average_bet_size: BigInt(row.average_bet_size),
        largest_single_bet: BigInt(row.largest_single_bet),
        largest_single_win: BigInt(row.largest_single_win),
        risk_level: row.risk_level as 'HIGH' | 'MEDIUM' | 'LOW'
      }));
    });
  }

  /**
   * Get payline analysis
   */
  async getPaylineAnalysis(appId?: bigint): Promise<PaylineAnalysis[]> {
    return this.withErrorHandling('getPaylineAnalysis', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      const { data, error } = await client.rpc('get_payline_analysis', {
        p_app_id: (appId || this.config.defaultAppId).toString()
      });

      if (error) throw error;

      return (data || []).map(row => ({
        paylines_count: Number(row.paylines_count),
        total_bets: BigInt(row.total_bets),
        total_amount_bet: BigInt(row.total_amount_bet),
        total_amount_won: BigInt(row.total_amount_won),
        avg_bet_per_line: Number(row.avg_bet_per_line),
        win_rate: Number(row.win_rate),
        house_edge: Number(row.house_edge),
        rtp: Number(row.rtp)
      }));
    });
  }

  /**
   * Scan and process HOV events
   */
  async scanEvents(params: ScanEventsParams): Promise<ScanEventResult> {
    return this.withErrorHandling('scanEvents', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      const { data, error } = await client.rpc('scan_hov_events', {
        p_app_id: params.p_app_id.toString(),
        p_start_round: params.p_start_round?.toString() || null,
        p_end_round: params.p_end_round?.toString() || null,
        p_limit: params.p_limit || 1000
      });

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('No scan results returned');
      }

      return {
        processed_count: BigInt(data[0].processed_count),
        errors_count: BigInt(data[0].errors_count),
        summary: {
          app_id: BigInt(data[0].summary.app_id),
          start_round: data[0].summary.start_round ? BigInt(data[0].summary.start_round) : null,
          end_round: data[0].summary.end_round ? BigInt(data[0].summary.end_round) : null,
          processed_events: BigInt(data[0].summary.processed_events),
          errors: BigInt(data[0].summary.errors)
        }
      };
    });
  }

  /**
   * Refresh materialized views (leaderboard cache)
   */
  async refreshLeaderboard(): Promise<void> {
    return this.withErrorHandling('refreshLeaderboard', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      const { error } = await client.rpc('refresh_hov_leaderboard');

      if (error) throw error;

      // Clear leaderboard cache after refresh
      this.caches.leaderboard.clear();
    });
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    Object.values(this.caches).forEach(cache => cache.clear());
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; error?: string }> {
    try {
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      
      const health = await supabaseService.healthCheck();
      return {
        status: health.status,
        error: health.error
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Error handling wrapper with retry logic
   */
  private async withErrorHandling<T>(
    functionName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (PUBLIC_DEBUG_MODE === 'true') {
          console.warn(`HOV Stats ${functionName} attempt ${attempt} failed:`, error);
        }

        // Don't retry on the last attempt
        if (attempt === this.config.retryConfig.maxAttempts) {
          break;
        }

        // Wait before retrying with exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, this.config.retryConfig.backoffMs * Math.pow(2, attempt - 1))
        );
      }
    }

    // Create enhanced error
    const enhancedError = new Error(`${functionName} failed after ${this.config.retryConfig.maxAttempts} attempts`) as HovStatsError;
    enhancedError.code = this.getErrorCode(lastError);
    enhancedError.originalError = lastError as any;
    enhancedError.functionName = functionName;

    throw enhancedError;
  }

  /**
   * Get error code from error
   */
  private getErrorCode(error: Error | null): HovStatsError['code'] {
    if (!error) return 'UNKNOWN';
    
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('connection')) return 'NETWORK_ERROR';
    if (message.includes('unauthorized') || message.includes('permission')) return 'UNAUTHORIZED';
    if (message.includes('not found')) return 'NOT_FOUND';
    if (message.includes('rate limit')) return 'RATE_LIMIT';
    if (message.includes('parse') || message.includes('json')) return 'PARSE_ERROR';
    
    return 'UNKNOWN';
  }
}

// Export singleton instance
export const hovStatsService = new HovStatsService();

// Export for testing with different configs
export { HovStatsService };