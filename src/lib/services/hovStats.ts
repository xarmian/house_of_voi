/**
 * HOV Statistics Service
 * Provides access to all Supabase database functions for game statistics
 */

import { supabaseService, type Database } from './supabase';
import { tournamentService, type TournamentPlayer } from './tournamentService';
import type {
  BalanceHistoryTick,
  PlatformStats,
  LeaderboardEntry,
  PlayerStats,
  PlayerSpin,
  PlayerRank,
  BiggestWin,
  TimeStats,
  HotColdPlayer,
  WhalePlayer,
  PaylineAnalysis,
  ScanEventResult,
  MachineAnalytics,
  GetBalanceHistoryParams,
  GetPlatformStatsParams,
  GetLeaderboardParams,
  GetLeaderboardByDateParams,
  GetPlayerStatsParams,
  GetPlayerSpinsParams,
  GetPlayerRankParams,
  GetTimeStatsParams,
  GetHotColdPlayersParams,
  GetWhalesParams,
  GetMachineAnalyticsParams,
  ScanEventsParams,
  HovStatsError,
  HovStatsServiceConfig
} from '../types/hovStats';
import { browser } from '$app/environment';
import { PUBLIC_DEBUG_MODE } from '$env/static/public';
import { MULTI_CONTRACT_CONFIG } from '$lib/constants/network';

// Get the default slot machine app ID from multi-contract config
const getDefaultSlotMachineAppId = (): bigint => {
  if (!MULTI_CONTRACT_CONFIG) {
    console.warn('No multi-contract configuration found for HOV stats service');
    return BigInt(0);
  }
  
  const defaultContract = MULTI_CONTRACT_CONFIG.contracts.find(
    c => c.id === MULTI_CONTRACT_CONFIG.defaultContractId
  );
  
  if (!defaultContract) {
    console.warn('Default contract not found in multi-contract configuration');
    return BigInt(0);
  }
  
  return BigInt(defaultContract.slotMachineAppId);
};

// Default configuration
// MEMORY LEAK FIX: Reduced cache sizes to prevent unbounded growth
const DEFAULT_CONFIG: HovStatsServiceConfig = {
  supabaseUrl: '',
  supabaseKey: '',
  defaultAppId: getDefaultSlotMachineAppId(),
  cache: {
    platformStats: { ttl: 300000, maxSize: 5 }, // 5 minute, reduced size
    leaderboard: { ttl: 300000, maxSize: 20 }, // 5 minutes, reduced size
    playerStats: { ttl: 300000, maxSize: 50 }, // 5 minutes, reduced size
    timeStats: { ttl: 600000, maxSize: 10 }, // 10 minutes, reduced size
    machineAnalytics: { ttl: 600000, maxSize: 10 } // 10 minutes, reduced size
  },
  fallbackToLocal: true,
  retryConfig: {
    maxAttempts: 3,
    backoffMs: 5000
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
    // MEMORY LEAK FIX: More aggressive cache cleanup
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entries until we're under the limit
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = Math.max(1, Math.floor(this.maxSize * 0.3)); // Remove 30% of cache
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        this.cache.delete(entries[i][0]);
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
    machineAnalytics: SimpleCache<MachineAnalytics[]>;
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
      ),
      machineAnalytics: new SimpleCache<MachineAnalytics[]>(
        this.config.cache.machineAnalytics.ttl,
        this.config.cache.machineAnalytics.maxSize
      )
    };
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    await supabaseService.initialize();
    // Note: Initialization logging is handled by the store
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
  async getLeaderboard(params?: GetLeaderboardParams & { forceRefresh?: boolean }): Promise<LeaderboardEntry[]> {
    const appId = params?.p_app_id || this.config.defaultAppId;
    const metric = params?.p_metric || 'total_won';
    const limit = params?.p_limit || 100;
    const offset = params?.p_offset || 0;
    const forceRefresh = params?.forceRefresh || false;
    const cacheKey = `leaderboard_${appId}_${metric}_${limit}_${offset}`;

    // Skip cache if forceRefresh is true
    if (!forceRefresh) {
      const cached = this.caches.leaderboard.get(cacheKey);
      if (cached) return cached;
    }

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
   * Get date-based leaderboard using tournament service
   */
  async getLeaderboardByDate(params: GetLeaderboardByDateParams): Promise<LeaderboardEntry[]> {
    const { p_app_id, p_start_date, p_end_date, p_metric = 'total_won', p_limit = 100, p_min_spins = 1, p_min_volume_micro = 1000000n, forceRefresh = false } = params;
    const cacheKey = `leaderboard_date_${p_app_id}_${p_start_date.toISOString()}_${p_end_date.toISOString()}_${p_metric}_${p_limit}`;

    // Skip cache if forceRefresh is true
    if (!forceRefresh) {
      const cached = this.caches.leaderboard.get(cacheKey);
      if (cached) return cached;
    }

    return this.withErrorHandling('getLeaderboardByDate', async () => {
      // Use tournament service to get the data
      const tournamentData = await tournamentService.getTournamentData({
        appId: Number(p_app_id),
        startDate: p_start_date,
        endDate: p_end_date,
        limit: p_limit,
        minSpins: p_min_spins,
        minVolumeMicroVOI: Number(p_min_volume_micro)
      });

      // Convert tournament player data to leaderboard entries based on selected metric
      const tournamentPlayers = this.getTournamentPlayersForMetric(tournamentData, p_metric);
      const leaderboard = tournamentPlayers.map((player: any, index): LeaderboardEntry => ({
        rank_position: BigInt(index + 1),
        who: player.who,
        total_spins: BigInt(player.total_spins),
        total_amount_bet: BigInt(player.total_volume),
        total_amount_won: BigInt(player.total_amount_won || Math.floor(player.total_volume * (player.rtp_percent || 0) / 100)),
        net_result: BigInt((player.total_amount_won || Math.floor(player.total_volume * (player.rtp_percent || 0) / 100)) - player.total_volume),
        largest_single_win: BigInt(player.largest_single_win || 0),
        win_rate: player.rtp_percent || 0,
        longest_streak: player.longest_win_streak || 0,
        avg_bet_size: player.total_volume / Math.max(player.total_spins, 1)
      }));

      this.caches.leaderboard.set(cacheKey, leaderboard);
      return leaderboard;
    });
  }

  /**
   * Helper method to get tournament players for specific metric
   */
  private getTournamentPlayersForMetric(tournamentData: any, metric: string): TournamentPlayer[] {
    if (!tournamentData?.categories) {
      return [];
    }

    switch (metric) {
      case 'total_bet':
        return tournamentData.categories.volume || [];
      case 'rtp':
        return tournamentData.categories.rtp || [];
      case 'win_streak':
        return tournamentData.categories.win_streak || [];
      case 'total_won':
        return tournamentData.categories.total_won || [];
      case 'largest_win':
        return tournamentData.categories.biggest_win || [];
      case 'total_spins':
        // For total_spins, use volume data since it has spin counts
        return tournamentData.categories.volume || [];
      default:
        // For other metrics, use volume-based ranking
        return tournamentData.categories.volume || [];
    }
  }

  /**
   * Get player statistics
   */
  async getPlayerStats(params: GetPlayerStatsParams): Promise<PlayerStats> {
    const appId = params.p_app_id !== null ? (params.p_app_id || this.config.defaultAppId) : null;

    // Include date range in cache key if provided
    const dateRange = params.p_start_ts && params.p_end_ts
      ? `_${params.p_start_ts.toISOString()}_${params.p_end_ts.toISOString()}`
      : '';
    const cacheKey = `player_${appId || 'all'}_${params.p_player_address}${dateRange}`;

    const cached = this.caches.playerStats.get(cacheKey);
    if (cached) return cached;

    // Ensure service is initialized
    if (!supabaseService.isReady()) {
      await supabaseService.initialize();
    }
    const client = supabaseService.getClient();

    // Prepare RPC parameters with optional date range
    const rpcParams: any = {
      p_app_id: appId ? appId.toString() : null,
      p_player_address: params.p_player_address
    };

    // Add date range parameters if provided
    if (params.p_start_ts) {
      rpcParams.p_start_ts = params.p_start_ts.toISOString();
    }
    if (params.p_end_ts) {
      rpcParams.p_end_ts = params.p_end_ts.toISOString();
    }

    const { data, error } = await client.rpc('get_player_stats', rpcParams);

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
      longest_streak_days: Number(row.longest_streak_days || 0),
      current_streak_days: Number(row.current_streak_days || 0),
      profit_per_spin: Number(row.profit_per_spin || 0),
      rtp: Number(Number(row.total_amount_won) / Number(row.total_amount_bet) * 100 || 0)
    };

    // Parse machines array if present (when appId is null)
    if (row.machines && Array.isArray(row.machines)) {
      stats.machines = row.machines.map((machine: any) => ({
        app_id: Number(machine.app_id),
        total_spins: Number(machine.total_spins || 0),
        total_amount_bet: BigInt(Math.floor(Number(machine.total_amount_bet || 0))),
        total_amount_won: BigInt(Math.floor(Number(machine.total_amount_won || 0))),
        net_result: BigInt(Math.floor(Number(machine.net_result || 0))),
        largest_single_win: BigInt(Math.floor(Number(machine.largest_single_win || 0))),
        average_bet_size: Number(machine.average_bet_size || 0),
        win_rate: Number(machine.win_rate || 0),
        total_paylines_played: Number(machine.total_paylines_played || 0),
        first_bet_round: Number(machine.first_bet_round || 0),
        last_bet_round: Number(machine.last_bet_round || 0),
        days_active: Number(machine.days_active || 0),
        profit_per_spin: Number(machine.profit_per_spin || 0),
        highest_multiple: Number(machine.highest_multiple || 0),
        rtp: Number(Number(machine.total_amount_won) / Number(machine.total_amount_bet) * 100 || 0)
      }));
    }

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
   * Get machine events (wins) with pagination and search
   */
  async getMachineEvents(appId: bigint, limit = 50, offset = 0, searchTerm?: string): Promise<{ events: PlayerSpin[], hasMore: boolean, total?: number }> {
    return this.withErrorHandling('getMachineEvents', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      
      // Build query for hov_events table with search support
      let query = client
        .from('hov_events')
        .select('*', { count: 'exact' })
        .eq('app_id', appId.toString())
        .gt('payout', 0);

      // Add search filters if search term provided
      if (searchTerm && searchTerm.trim()) {
        const raw = searchTerm.trim();
        const term = raw;

        // Support operator-based amount searches like ">1000", ">= 1000", "< 500", "= 250"
        const opMatch = raw.match(/^([<>]=?|=)\s*(\d+(?:\.\d+)?)$/);
        if (opMatch) {
          const op = opMatch[1];
          const value = parseFloat(opMatch[2]);
          const micro = Math.floor(value * 1_000_000);

          const mapOp = (o: string) => {
            switch (o) {
              case '>': return 'gt';
              case '>=': return 'gte';
              case '<': return 'lt';
              case '<=': return 'lte';
              case '=':
              case '==': return 'eq';
              default: return 'eq';
            }
          };

          const sop = mapOp(op);
          const operatorConditions = [
            `payout.${sop}.${micro}`,
            `amount.${sop}.${micro}`
          ];

          query = query.or(operatorConditions.join(','));
        } else {
          // Build search conditions
          const searchConditions = [
            `who.ilike.%${term}%`,
            `txid.ilike.%${term}%`
          ];
          
          // Try to convert transaction ID for database search (database stores as hex-encoded ASCII)
          try {
            // If it looks like a base32 transaction ID, convert to hex-encoded ASCII for database search
            if (/^[A-Z2-7]{52}$/.test(term.toUpperCase())) {
              // Convert base32 string to hex-encoded ASCII bytes
              const hexTxid = Array.from(term.toUpperCase())
                .map(char => char.charCodeAt(0).toString(16).padStart(2, '0'))
                .join('').toUpperCase();
              searchConditions.push(`txid.ilike.%${hexTxid}%`);
            }
            // For partial base32 searches, convert each character to hex
            else if (/^[A-Z2-7]+$/.test(term.toUpperCase()) && term.length >= 3) {
              const hexTxid = Array.from(term.toUpperCase())
                .map(char => char.charCodeAt(0).toString(16).padStart(2, '0'))
                .join('').toUpperCase();
              searchConditions.push(`txid.ilike.%${hexTxid}%`);
            }
          } catch (e) {
            // If any conversion fails, just use the original term
            console.log('Transaction ID conversion failed:', e);
          }
          
          // Search by numeric values (rounds and equality amounts)
          if (/^\d+(\.\d+)?$/.test(term)) {
            const numericValue = parseFloat(term);
            
            // Search by round (if it's a whole number)
            if (Number.isInteger(numericValue)) {
              searchConditions.push(`round.eq.${Math.floor(numericValue)}`);
            }
            
            // Search by amount in microVOI (convert VOI to microVOI)
            const amountInMicroVoi = Math.floor(numericValue * 1000000);
            searchConditions.push(`amount.eq.${amountInMicroVoi}`);
            searchConditions.push(`payout.eq.${amountInMicroVoi}`);
          }
          
          console.log('Search conditions:', searchConditions);
          query = query.or(searchConditions.join(','));
        }
      }

      // Apply ordering and pagination
      query = query
        .order('round', { ascending: false })
        .order('intra', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const events = (data || []).map(row => ({
        round: BigInt(row.round),
        intra: row.intra,
        txid: row.txid,
        bet_amount_per_line: BigInt(row.amount), // amount is the bet amount
        paylines_count: Number(row.max_payline_index) + 1, // max_payline_index is 0-based
        total_bet_amount: BigInt(row.amount * (Number(row.max_payline_index) + 1)),
        payout: BigInt(row.payout || 0),
        net_result: BigInt((row.payout || 0) - (row.amount * (Number(row.max_payline_index) + 1))),
        is_win: (row.payout || 0) > 0,
        claim_round: BigInt(row.claim_round),
        created_at: new Date(row.created_at),
        who: row.who // Add the player address
      }));

      // Determine if there are more results
      const hasMore = events.length === limit && (count === null || offset + limit < count);

      return {
        events,
        hasMore,
        total: count || undefined
      };
    });
  }

  /**
   * Search distinct player addresses by partial match on hov_events.who
   * Returns unique addresses containing the term, case-insensitive
   */
  async searchPlayersByWho(term: string, limit = 20): Promise<string[]> {
    return this.withErrorHandling('searchPlayersByWho', async () => {
      const trimmed = (term || '').trim();
      if (trimmed.length < 3) return [];

      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();

      // Prefer server-side distinct via RPC (add this SQL function in DB)
      // create or replace function public.search_distinct_who(p_term text, p_limit int)
      // returns setof text as $$
      //   select distinct who from public.hov_events
      //   where who ilike '%' || p_term || '%'
      //   order by who asc
      //   limit p_limit;
      // $$ language sql stable;
      try {
        const { data, error } = await client.rpc('search_distinct_who', {
          p_term: trimmed,
          p_limit: limit
        });
        if (error) throw error;
        // Handle either array<string> or array<{ who: string }>
        const list: string[] = Array.isArray(data)
          ? data.map((row: any) => (typeof row === 'string' ? row : row?.who)).filter(Boolean)
          : [];
        if (list.length > 0) return list.slice(0, limit);
      } catch (e) {
        // Fall through to generic query if RPC not available
      }

      // Fallback: query and dedupe minimal client-side (limited scan)
      const { data, error } = await client
        .from('hov_events')
        .select('who')
        .ilike('who', `%${trimmed}%`)
        .order('who', { ascending: true })
        .limit(Math.max(limit, 50));

      if (error) throw error;
      const seen = new Set<string>();
      const results: string[] = [];
      for (const r of data || []) {
        const who = (r as any).who as string;
        if (who && !seen.has(who)) {
          seen.add(who);
          results.push(who);
          if (results.length >= limit) break;
        }
      }
      return results;
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
   * Get player's biggest wins
   */
  async getPlayerBiggestWins(playerAddress: string, appId?: bigint): Promise<BiggestWin[]> {
    return this.withErrorHandling('getPlayerBiggestWins', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      
      const { data, error } = await client
        .from('hov_events')
        .select('payout, total_bet_amount, max_payline_index, txid, created_at')
        .eq('who', playerAddress)
        .eq('app_id', (appId || this.config.defaultAppId).toString())
        .gt('payout', 0)
        .order('payout', { ascending: false })
        .limit(3);

      if (error) throw error;

      return (data || []).map(row => ({
        payout: BigInt(row.payout || 0),
        total_bet_amount: BigInt(row.total_bet_amount || 0),
        max_payline_index: BigInt(row.max_payline_index || 0),
        txid: row.txid,
        created_at: new Date(row.created_at)
      }));
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
   * Get machine analytics
   */
  async getMachineAnalytics(params: GetMachineAnalyticsParams): Promise<MachineAnalytics[]> {
    const cacheKey = `machine_analytics_${params.p_machine_app_id}_${params.p_ybt_app_id}`;
    
    // Check cache first
    const cached = this.caches.machineAnalytics.get(cacheKey);
    if (cached) return cached;

    return this.withErrorHandling('getMachineAnalytics', async () => {
      // Ensure service is initialized
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }
      const client = supabaseService.getClient();
      const { data, error } = await client.rpc('get_machine_analytics', {
        p_machine_app_id: params.p_machine_app_id.toString(),
        p_ybt_app_id: params.p_ybt_app_id.toString()
      });

      if (error) throw error;

      // The RPC returns data as a direct array
      const analyticsData = data || [];
      
      const result = analyticsData.map((row: any) => ({
        day: row.day,
        total_bets: BigInt(row.total_bets),
        total_payouts: BigInt(row.total_payouts),
        total_house_pl: BigInt(row.total_house_pl),
        unique_users: Number(row.unique_users),
        daily_net_flow: BigInt(row.daily_net_flow),
        escrow_balance: BigInt(row.escrow_balance),
        daily_apr_percent: Number(row.daily_apr_percent),
        trailing_apr_percent: Number(row.trailing_apr_percent),
        days_available: Number(row.days_available),
        sum_total_house_pl: BigInt(row.sum_total_house_pl),
        avg_total_balance: Number(row.avg_total_balance),
        total_return_percent: Number(row.total_return_percent)
      }));

      // Cache the result
      this.caches.machineAnalytics.set(cacheKey, result);
      
      return result;
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
   * Clear only leaderboard cache
   */
  clearLeaderboardCache(): void {
    this.caches.leaderboard.clear();
  }

  /**
   * Clear only platform stats cache
   */
  clearPlatformStatsCache(): void {
    this.caches.platformStats.clear();
  }

  /**
   * Clear specific cache sections
   */
  clearSpecificCache(section: 'platformStats' | 'leaderboard' | 'playerStats' | 'timeStats' | 'machineAnalytics'): void {
    this.caches[section].clear();
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
