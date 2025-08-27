/**
 * TypeScript types for HOV Supabase database responses
 * Based on the SQL functions defined in hov.sql
 */

export interface BalanceHistoryTick {
  block_round: bigint;
  timestamp: Date;
  intra: number;
  balance_delta: bigint;
  fee: bigint;
  actual_balance: bigint;
  tick_number: bigint;
}

export interface HovEvent {
  round: bigint;
  intra: number;
  txid: string;
  app_id: bigint;
  event_type: 'BetPlaced' | 'BetClaimed';
  who: string; // Algorand address
  amount: bigint; // bet amount in microalgos
  max_payline_index: bigint;
  index_value: bigint;
  claim_round: bigint;
  payout: bigint | null; // null for BetPlaced, set when BetClaimed
  created_at: Date;
  updated_at: Date | null;
  total_bet_amount: bigint; // computed column
  net_result: bigint; // computed column
  is_win: boolean; // computed column
}

export interface PlatformStats {
  total_bets: bigint;
  total_amount_bet: bigint;
  total_amount_paid: bigint;
  total_winning_spins: bigint;
  average_bet_size: number;
  average_payout: number;
  win_percentage: number;
  house_edge: number;
  rtp: number; // Return to Player
  net_platform_result: bigint;
  unique_players: bigint;
  largest_single_win: bigint;
  largest_single_bet: bigint;
}

export interface LeaderboardEntry {
  rank_position: bigint;
  who: string; // Algorand address
  total_spins: bigint;
  total_amount_bet: bigint; // Keep as bigint in TS for consistency, we'll handle conversion
  total_amount_won: bigint; // Keep as bigint in TS for consistency, we'll handle conversion
  net_result: bigint; // Keep as bigint in TS for consistency, we'll handle conversion
  largest_single_win: bigint; // Keep as bigint in TS for consistency, we'll handle conversion
  win_rate: number;
  longest_streak: number;
  avg_bet_size: number;
}

export interface PlayerStats {
  total_spins: bigint;
  total_amount_bet: bigint;
  total_amount_won: bigint;
  net_result: bigint;
  largest_single_win: bigint;
  average_bet_size: number;
  win_rate: number;
  longest_winning_streak: number;
  longest_losing_streak: number;
  favorite_bet_amount: bigint;
  total_paylines_played: bigint;
  first_bet_round: bigint;
  last_bet_round: bigint;
  days_active: number;
  profit_per_spin: number;
}

export interface PlayerSpin {
  round: bigint;
  intra: number;
  txid: string;
  bet_amount_per_line: bigint;
  paylines_count: number;
  total_bet_amount: bigint;
  payout: bigint;
  net_result: bigint;
  is_win: boolean;
  claim_round: bigint;
  created_at: Date;
}

export interface PlayerRank {
  player_rank: bigint;
  total_players: bigint;
  percentile: number;
}

export interface TimeStats {
  time_period: Date;
  total_bets: bigint;
  total_amount_bet: bigint;
  total_amount_won: bigint;
  unique_players: bigint;
  win_rate: number;
  house_edge: number;
}

export interface HotColdPlayer {
  who: string; // Algorand address
  recent_spins: bigint;
  recent_net_result: bigint;
  recent_win_rate: number;
  temperature: 'HOT' | 'COLD' | 'NEUTRAL';
  total_spins: bigint;
  overall_net_result: bigint;
}

export interface WhalePlayer {
  who: string; // Algorand address
  total_amount_bet: bigint;
  total_amount_won: bigint;
  net_result: bigint;
  total_spins: bigint;
  average_bet_size: bigint;
  largest_single_bet: bigint;
  largest_single_win: bigint;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface PaylineAnalysis {
  paylines_count: number;
  total_bets: bigint;
  total_amount_bet: bigint;
  total_amount_won: bigint;
  avg_bet_per_line: number;
  win_rate: number;
  house_edge: number;
  rtp: number; // Return to Player
}

export interface ScanEventResult {
  processed_count: bigint;
  errors_count: bigint;
  summary: {
    app_id: bigint;
    start_round: bigint | null;
    end_round: bigint | null;
    processed_events: bigint;
    errors: bigint;
  };
}

// Function parameter types
export interface GetBalanceHistoryParams {
  algorand_address: string;
  start_round: bigint;
  end_round: bigint;
}

export interface GetPlatformStatsParams {
  p_app_id: bigint;
  p_start_round?: bigint;
  p_end_round?: bigint;
}

export interface GetLeaderboardParams {
  p_app_id: bigint;
  p_metric?: 'net_result' | 'rtp' | 'total_won' | 'largest_win' | 'total_spins' | 'win_rate' | 'total_bet';
  p_limit?: number;
  p_offset?: number;
}

export interface GetPlayerStatsParams {
  p_app_id: bigint;
  p_player_address: string;
}

export interface GetPlayerSpinsParams {
  p_app_id: bigint;
  p_player_address: string;
  p_limit?: number;
  p_offset?: number;
}

export interface GetPlayerRankParams {
  p_app_id: bigint;
  p_player_address: string;
  p_metric?: 'net_result' | 'rtp' | 'total_won' | 'largest_win' | 'total_spins' | 'total_bet';
}

export interface GetTimeStatsParams {
  p_app_id: bigint;
  p_time_unit?: 'hour' | 'day' | 'week';
  p_start_round?: bigint;
  p_end_round?: bigint;
  p_limit?: number;
}

export interface GetHotColdPlayersParams {
  p_app_id: bigint;
  p_recent_rounds?: bigint;
  p_min_spins?: number;
  p_limit?: number;
}

export interface GetWhalesParams {
  p_app_id: bigint;
  p_min_total_bet?: bigint;
  p_limit?: number;
}

export interface ScanEventsParams {
  p_app_id: bigint;
  p_start_round?: bigint;
  p_end_round?: bigint;
  p_limit?: number;
}

// Error types for better error handling
export interface SupabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface HovStatsError extends Error {
  code: 'NETWORK_ERROR' | 'PARSE_ERROR' | 'NOT_FOUND' | 'UNAUTHORIZED' | 'RATE_LIMIT' | 'UNKNOWN';
  originalError?: SupabaseError;
  functionName?: string;
}

// Cache configuration
export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of entries
}

// Service configuration
export interface HovStatsServiceConfig {
  supabaseUrl: string;
  supabaseKey: string;
  defaultAppId: bigint;
  cache: {
    platformStats: CacheConfig;
    leaderboard: CacheConfig;
    playerStats: CacheConfig;
    timeStats: CacheConfig;
  };
  fallbackToLocal: boolean;
  retryConfig: {
    maxAttempts: number;
    backoffMs: number;
  };
}