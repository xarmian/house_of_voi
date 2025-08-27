/**
 * HOV Statistics Store
 * Reactive store for managing HOV game statistics from Supabase
 */

import { writable, derived, readable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import { hovStatsService } from '$lib/services/hovStats';
import { queueStats } from './queue'; // Fallback to local stats
import type {
  PlatformStats,
  LeaderboardEntry,
  PlayerStats,
  PlayerSpin,
  TimeStats,
  HotColdPlayer,
  WhalePlayer,
  PaylineAnalysis,
  HovStatsError
} from '$lib/types/hovStats';
import { PUBLIC_SLOT_MACHINE_APP_ID, PUBLIC_DEBUG_MODE } from '$env/static/public';

// Store state interfaces
interface StoreState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  fromCache: boolean;
}

interface PlayerSpinsData {
  spins: PlayerSpin[];
  currentPage: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  // Aggregate stats from PlayerStats
  totalAmountBet: bigint;
  totalAmountWon: bigint;
  winRate: number;
}

interface HovStatsState {
  platformStats: StoreState<PlatformStats>;
  leaderboard: StoreState<LeaderboardEntry[]>;
  timeStats: StoreState<TimeStats[]>;
  hotColdPlayers: StoreState<HotColdPlayer[]>;
  whales: StoreState<WhalePlayer[]>;
  paylineAnalysis: StoreState<PaylineAnalysis[]>;
  playerSpins: StoreState<PlayerSpinsData> & { playerAddress: string | null };
  isInitialized: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'error';
  fallbackActive: boolean;
}

// Initial state
const initialState: HovStatsState = {
  platformStats: { data: null, loading: false, error: null, lastUpdated: null, fromCache: false },
  leaderboard: { data: null, loading: false, error: null, lastUpdated: null, fromCache: false },
  timeStats: { data: null, loading: false, error: null, lastUpdated: null, fromCache: false },
  hotColdPlayers: { data: null, loading: false, error: null, lastUpdated: null, fromCache: false },
  whales: { data: null, loading: false, error: null, lastUpdated: null, fromCache: false },
  paylineAnalysis: { data: null, loading: false, error: null, lastUpdated: null, fromCache: false },
  playerSpins: { 
    data: null, 
    loading: false, 
    error: null, 
    lastUpdated: null, 
    fromCache: false,
    playerAddress: null
  },
  isInitialized: false,
  connectionStatus: 'disconnected',
  fallbackActive: false
};

// Configuration
const REFRESH_INTERVALS = {
  platformStats: 60000, // 1 minute
  leaderboard: 300000, // 5 minutes
  timeStats: 600000, // 10 minutes
  hotColdPlayers: 300000, // 5 minutes
  whales: 600000, // 10 minutes
  paylineAnalysis: 1800000 // 30 minutes
};

const DEFAULT_APP_ID = BigInt(PUBLIC_SLOT_MACHINE_APP_ID || '0');

// Create main store
function createHovStatsStore() {
  const { subscribe, set, update } = writable<HovStatsState>(initialState);

  // Track intervals for cleanup
  let intervals: { [key: string]: NodeJS.Timeout } = {};
  let initialized = false;

  /**
   * Initialize the store
   */
  async function initialize(): Promise<void> {
    if (!browser || initialized) return;

    update(state => ({
      ...state,
      connectionStatus: 'connecting'
    }));

    try {
      await hovStatsService.initialize();
      
      update(state => ({
        ...state,
        isInitialized: true,
        connectionStatus: 'connected',
        fallbackActive: false
      }));

      // Start periodic refreshes
      startPeriodicRefresh();
      
      // Load initial data
      await Promise.all([
        refreshPlatformStats(),
        refreshLeaderboard(),
        refreshTimeStats()
      ]);

      initialized = true;

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log('✅ HOV Stats Store initialized');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      update(state => ({
        ...state,
        isInitialized: false,
        connectionStatus: 'error',
        fallbackActive: true
      }));

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.warn('⚠️ HOV Stats Store initialization failed, using fallback:', errorMessage);
      }
    }
  }

  /**
   * Refresh platform statistics
   */
  async function refreshPlatformStats(): Promise<void> {
    return updateStoreSection('platformStats', async () => {
      return await hovStatsService.getPlatformStats({ p_app_id: DEFAULT_APP_ID });
    });
  }

  /**
   * Refresh leaderboard
   */
  async function refreshLeaderboard(metric: string = 'net_result', limit: number = 100): Promise<void> {
    // Clear cache first to force fresh data
    hovStatsService.clearCache();
    
    return updateStoreSection('leaderboard', async () => {
      return await hovStatsService.getLeaderboard({
        p_app_id: DEFAULT_APP_ID,
        p_metric: metric as any,
        p_limit: limit
      });
    });
  }

  /**
   * Refresh time statistics
   */
  async function refreshTimeStats(timeUnit: 'hour' | 'day' | 'week' = 'day', limit: number = 30): Promise<void> {
    return updateStoreSection('timeStats', async () => {
      return await hovStatsService.getTimeStats({
        p_app_id: DEFAULT_APP_ID,
        p_time_unit: timeUnit,
        p_limit: limit
      });
    });
  }

  /**
   * Refresh hot/cold players
   */
  async function refreshHotColdPlayers(): Promise<void> {
    return updateStoreSection('hotColdPlayers', async () => {
      return await hovStatsService.getHotColdPlayers({ p_app_id: DEFAULT_APP_ID });
    });
  }

  /**
   * Refresh whales
   */
  async function refreshWhales(): Promise<void> {
    return updateStoreSection('whales', async () => {
      return await hovStatsService.getWhales({ p_app_id: DEFAULT_APP_ID });
    });
  }

  /**
   * Refresh payline analysis
   */
  async function refreshPaylineAnalysis(): Promise<void> {
    return updateStoreSection('paylineAnalysis', async () => {
      return await hovStatsService.getPaylineAnalysis(DEFAULT_APP_ID);
    });
  }

  /**
   * Get player statistics
   */
  async function getPlayerStats(playerAddress: string): Promise<PlayerStats | null> {
    try {
      return await hovStatsService.getPlayerStats({
        p_app_id: DEFAULT_APP_ID,
        p_player_address: playerAddress
      });
    } catch (error) {
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.warn('Failed to get player stats:', error);
      }
      return null;
    }
  }

  /**
   * Refresh player statistics (clears cache first)
   */
  async function refreshPlayerStats(playerAddress: string): Promise<PlayerStats | null> {
    try {
      // Clear cache first to force fresh data
      hovStatsService.clearCache();
      
      return await hovStatsService.getPlayerStats({
        p_app_id: DEFAULT_APP_ID,
        p_player_address: playerAddress
      });
    } catch (error) {
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.warn('Failed to refresh player stats:', error);
      }
      return null;
    }
  }

  /**
   * Get leaderboard data (uses cache)
   */
  async function getLeaderboard(params?: { metric?: string; limit?: number; offset?: number }): Promise<LeaderboardEntry[]> {
    try {
      return await hovStatsService.getLeaderboard({
        p_app_id: DEFAULT_APP_ID,
        p_metric: (params?.metric as any) || 'net_result',
        p_limit: params?.limit || 100,
        p_offset: params?.offset || 0
      });
    } catch (error) {
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.warn('Failed to get leaderboard:', error);
      }
      return [];
    }
  }

  /**
   * Load player spins with pagination
   */
  async function loadPlayerSpins(
    playerAddress: string, 
    page: number = 0, 
    pageSize: number = 50
  ): Promise<void> {
    // Check if already loading for this player
    const currentState = get({ subscribe });
    if (currentState.playerSpins.loading && currentState.playerSpins.playerAddress === playerAddress) {
      return;
    }

    // Set loading state
    update(state => ({
      ...state,
      playerSpins: {
        ...state.playerSpins,
        loading: true,
        error: null,
        playerAddress
      }
    }));

    try {
      // First get player stats to know total count and aggregates
      const playerStats = await hovStatsService.getPlayerStats({
        p_app_id: DEFAULT_APP_ID,
        p_player_address: playerAddress
      });

      if (!playerStats) {
        throw new Error('Failed to load player statistics');
      }

      // Get the spins for this page
      const spins = await hovStatsService.getPlayerSpins({
        p_app_id: DEFAULT_APP_ID,
        p_player_address: playerAddress,
        p_limit: pageSize,
        p_offset: page * pageSize
      });

      // Calculate pagination info using real total count
      const totalCount = Number(playerStats.total_spins);
      const hasNextPage = (page + 1) * pageSize < totalCount;
      const hasPreviousPage = page > 0;

      const playerSpinsData: PlayerSpinsData = {
        spins: spins,
        currentPage: page,
        pageSize,
        totalCount: totalCount,
        hasNextPage,
        hasPreviousPage,
        // Include aggregate stats from PlayerStats
        totalAmountBet: playerStats.total_amount_bet,
        totalAmountWon: playerStats.total_amount_won,
        winRate: playerStats.win_rate
      };

      update(state => ({
        ...state,
        playerSpins: {
          data: playerSpinsData,
          loading: false,
          error: null,
          lastUpdated: new Date(),
          fromCache: false,
          playerAddress
        }
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load player spins';
      
      update(state => ({
        ...state,
        playerSpins: {
          ...state.playerSpins,
          loading: false,
          error: errorMessage
        }
      }));

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.warn('Failed to load player spins:', errorMessage);
      }
    }
  }

  /**
   * Load next page of player spins
   */
  async function loadNextPlayerSpinsPage(): Promise<void> {
    const currentState = get({ subscribe });
    const { playerSpins } = currentState;
    
    if (!playerSpins.data || !playerSpins.playerAddress || !playerSpins.data.hasNextPage) {
      return;
    }

    await loadPlayerSpins(
      playerSpins.playerAddress,
      playerSpins.data.currentPage + 1,
      playerSpins.data.pageSize
    );
  }

  /**
   * Load previous page of player spins
   */
  async function loadPreviousPlayerSpinsPage(): Promise<void> {
    const currentState = get({ subscribe });
    const { playerSpins } = currentState;
    
    if (!playerSpins.data || !playerSpins.playerAddress || !playerSpins.data.hasPreviousPage) {
      return;
    }

    await loadPlayerSpins(
      playerSpins.playerAddress,
      playerSpins.data.currentPage - 1,
      playerSpins.data.pageSize
    );
  }

  /**
   * Refresh current player spins page
   */
  async function refreshPlayerSpins(): Promise<void> {
    const currentState = get({ subscribe });
    const { playerSpins } = currentState;
    
    if (!playerSpins.playerAddress) {
      return;
    }

    // Clear cache first
    hovStatsService.clearCache();
    
    await loadPlayerSpins(
      playerSpins.playerAddress,
      playerSpins.data?.currentPage ?? 0,
      playerSpins.data?.pageSize ?? 50
    );
  }

  // Helper function to get current state
  function get<T>(store: { subscribe: (fn: (value: T) => void) => () => void }): T {
    let value: T;
    store.subscribe((v) => value = v)();
    return value!;
  }

  /**
   * Generic store section update helper
   */
  async function updateStoreSection<T>(
    section: keyof Omit<HovStatsState, 'isInitialized' | 'connectionStatus' | 'fallbackActive'>,
    fetcher: () => Promise<T>
  ): Promise<void> {
    // Set loading state
    update(state => ({
      ...state,
      [section]: {
        ...state[section],
        loading: true,
        error: null
      }
    }));

    try {
      const data = await fetcher();
      
      update(state => ({
        ...state,
        [section]: {
          data,
          loading: false,
          error: null,
          lastUpdated: new Date(),
          fromCache: false
        },
        connectionStatus: 'connected',
        fallbackActive: false
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isNetworkError = (error as HovStatsError)?.code === 'NETWORK_ERROR';

      update(state => ({
        ...state,
        [section]: {
          ...state[section],
          loading: false,
          error: errorMessage
        },
        connectionStatus: isNetworkError ? 'disconnected' : 'error',
        fallbackActive: true
      }));

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.warn(`Failed to refresh ${section}:`, errorMessage);
      }
    }
  }

  /**
   * Start periodic refresh intervals
   */
  function startPeriodicRefresh(): void {
    if (!browser) return;

    // Clear existing intervals
    Object.values(intervals).forEach(clearInterval);
    intervals = {};

    // Platform stats
    intervals.platformStats = setInterval(() => {
      refreshPlatformStats();
    }, REFRESH_INTERVALS.platformStats);

    // Leaderboard
    intervals.leaderboard = setInterval(() => {
      refreshLeaderboard();
    }, REFRESH_INTERVALS.leaderboard);

    // Time stats
    intervals.timeStats = setInterval(() => {
      refreshTimeStats();
    }, REFRESH_INTERVALS.timeStats);

    // Hot/cold players - DISABLED (not used in UI)
    // intervals.hotColdPlayers = setInterval(() => {
    //   refreshHotColdPlayers();
    // }, REFRESH_INTERVALS.hotColdPlayers);

    // Whales - DISABLED (not used in UI)
    // intervals.whales = setInterval(() => {
    //   refreshWhales();
    // }, REFRESH_INTERVALS.whales);

    // Payline analysis
    intervals.paylineAnalysis = setInterval(() => {
      refreshPaylineAnalysis();
    }, REFRESH_INTERVALS.paylineAnalysis);
  }

  /**
   * Stop periodic refresh intervals
   */
  function stopPeriodicRefresh(): void {
    Object.values(intervals).forEach(clearInterval);
    intervals = {};
  }

  /**
   * Force refresh all data
   */
  async function refreshAll(): Promise<void> {
    await Promise.allSettled([
      refreshPlatformStats(),
      refreshLeaderboard(),
      refreshTimeStats(),
      // refreshHotColdPlayers(), // DISABLED - not used in UI
      // refreshWhales(), // DISABLED - not used in UI
      refreshPaylineAnalysis()
    ]);
  }

  /**
   * Reset store to initial state
   */
  function reset(): void {
    stopPeriodicRefresh();
    hovStatsService.clearCache();
    set(initialState);
    initialized = false;
  }

  /**
   * Health check
   */
  async function healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; error?: string }> {
    return await hovStatsService.healthCheck();
  }

  return {
    subscribe,
    // Actions
    initialize,
    refreshPlatformStats,
    refreshLeaderboard,
    refreshTimeStats,
    refreshHotColdPlayers,
    refreshWhales,
    refreshPaylineAnalysis,
    getPlayerStats,
    refreshPlayerStats,
    getLeaderboard,
    // Player spins actions
    loadPlayerSpins,
    loadNextPlayerSpinsPage,
    loadPreviousPlayerSpinsPage,
    refreshPlayerSpins,
    refreshAll,
    reset,
    healthCheck
  };
}

// Create store instance
export const hovStatsStore = createHovStatsStore();

// Derived stores for easy access to specific data
export const platformStats = derived(
  [hovStatsStore, queueStats],
  ([$hovStats, $localStats]) => {
    // If HOV stats available and not in fallback mode, use them
    if ($hovStats.platformStats.data && !$hovStats.fallbackActive) {
      return {
        data: $hovStats.platformStats.data,
        loading: $hovStats.platformStats.loading,
        error: $hovStats.platformStats.error,
        source: 'supabase' as const,
        lastUpdated: $hovStats.platformStats.lastUpdated
      };
    }
    
    // Fallback to local queue stats
    return {
      data: {
        total_bets: BigInt($localStats.totalSpins),
        total_amount_bet: BigInt($localStats.totalWagered),
        total_amount_paid: BigInt($localStats.totalWinnings),
        total_winning_spins: BigInt($localStats.completedSpins),
        net_platform_result: BigInt($localStats.netProfit * -1), // Negative for house perspective
        // Approximate other fields from local data
        average_bet_size: $localStats.totalSpins > 0 ? $localStats.totalWagered / $localStats.totalSpins : 0,
        average_payout: $localStats.completedSpins > 0 ? $localStats.totalWinnings / $localStats.completedSpins : 0,
        win_percentage: $localStats.totalSpins > 0 ? ($localStats.completedSpins / $localStats.totalSpins) * 100 : 0,
        house_edge: $localStats.totalWagered > 0 ? (($localStats.totalWagered - $localStats.totalWinnings) / $localStats.totalWagered) * 100 : 0,
        rtp: $localStats.totalWagered > 0 ? ($localStats.totalWinnings / $localStats.totalWagered) * 100 : 0,
        unique_players: BigInt(1), // Local data only knows about current player
        largest_single_win: BigInt(0), // Not available in local stats
        largest_single_bet: BigInt(0)  // Not available in local stats
      } as PlatformStats,
      loading: false,
      error: null,
      source: 'local' as const,
      lastUpdated: new Date()
    };
  }
);

export const leaderboard = derived(
  hovStatsStore,
  $hovStats => ({
    data: $hovStats.leaderboard.data,
    loading: $hovStats.leaderboard.loading,
    error: $hovStats.leaderboard.error,
    lastUpdated: $hovStats.leaderboard.lastUpdated,
    available: !$hovStats.fallbackActive
  })
);

export const timeStats = derived(
  hovStatsStore,
  $hovStats => ({
    data: $hovStats.timeStats.data,
    loading: $hovStats.timeStats.loading,
    error: $hovStats.timeStats.error,
    lastUpdated: $hovStats.timeStats.lastUpdated,
    available: !$hovStats.fallbackActive
  })
);

export const playerSpins = derived(
  hovStatsStore,
  $hovStats => ({
    data: $hovStats.playerSpins.data,
    loading: $hovStats.playerSpins.loading,
    error: $hovStats.playerSpins.error,
    lastUpdated: $hovStats.playerSpins.lastUpdated,
    playerAddress: $hovStats.playerSpins.playerAddress,
    available: !$hovStats.fallbackActive
  })
);

export const connectionStatus = derived(
  hovStatsStore,
  $hovStats => ({
    status: $hovStats.connectionStatus,
    isConnected: $hovStats.connectionStatus === 'connected',
    fallbackActive: $hovStats.fallbackActive,
    initialized: $hovStats.isInitialized
  })
);

// Auto-initialize in browser
if (browser) {
  hovStatsStore.initialize();
}