/**
 * HOV Statistics Store
 * Reactive store for managing HOV game statistics from Supabase
 */

import { writable, derived, readable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import { page } from '$app/stores';
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
  MachineAnalytics,
  HovStatsError
} from '$lib/types/hovStats';
import { PUBLIC_DEBUG_MODE } from '$env/static/public';
import { MULTI_CONTRACT_CONFIG } from '$lib/constants/network';

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
  machineAnalytics: StoreState<MachineAnalytics[]>;
  isInitialized: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'error';
  fallbackActive: boolean;
  currentLeaderboardMetric: string;
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
  machineAnalytics: { data: null, loading: false, error: null, lastUpdated: null, fromCache: false },
  isInitialized: false,
  connectionStatus: 'disconnected',
  fallbackActive: false,
  currentLeaderboardMetric: 'total_won'
};

// Configuration
// MEMORY OPTIMIZATION: Longer intervals to reduce network requests and memory pressure
const REFRESH_INTERVALS = {
  platformStats: 120000, // 2 minutes (increased from 1 minute)
  leaderboard: 600000, // 10 minutes (increased from 5 minutes)
  timeStats: 900000, // 15 minutes (increased from 10 minutes)
  hotColdPlayers: 600000, // 10 minutes (kept same)
  whales: 1200000, // 20 minutes (increased from 10 minutes)
  paylineAnalysis: 3600000, // 60 minutes (increased from 30 minutes)
  machineAnalytics: 900000 // 15 minutes (same as timeStats)
};

// Get the current contract app ID (dynamic based on selected contract)
const getCurrentSlotMachineAppId = async (): Promise<bigint> => {
  try {
    // Import selectedContract dynamically to avoid circular deps
    const { selectedContract } = await import('$lib/stores/multiContract');
    const { get } = await import('svelte/store');
    const currentContract = get(selectedContract);
    
    if (currentContract) {
      return BigInt(currentContract.slotMachineAppId);
    }
  } catch (error) {
    console.warn('Failed to get selected contract, falling back to default:', error);
  }
  
  // Fallback to default contract
  if (!MULTI_CONTRACT_CONFIG) {
    console.warn('No multi-contract configuration found for HOV stats');
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

// Get the current YBT app ID (dynamic based on selected contract)
const getCurrentYbtAppId = async (): Promise<bigint> => {
  try {
    // Import selectedContract dynamically to avoid circular deps
    const { selectedContract } = await import('$lib/stores/multiContract');
    const { get } = await import('svelte/store');
    const currentContract = get(selectedContract);
    
    if (currentContract) {
      return BigInt(currentContract.ybtAppId);
    }
  } catch (error) {
    console.warn('Failed to get selected contract YBT app ID, falling back to default:', error);
  }
  
  // Fallback to default contract
  if (!MULTI_CONTRACT_CONFIG) {
    console.warn('No multi-contract configuration found for YBT app ID');
    return BigInt(0);
  }
  
  const defaultContract = MULTI_CONTRACT_CONFIG.contracts.find(
    c => c.id === MULTI_CONTRACT_CONFIG.defaultContractId
  );
  
  if (!defaultContract) {
    console.warn('Default contract not found in multi-contract configuration');
    return BigInt(0);
  }
  
  return BigInt(defaultContract.ybtAppId);
};

// Create main store
function createHovStatsStore() {
  const { subscribe, set, update } = writable<HovStatsState>(initialState);

  // Track intervals for cleanup
  let intervals: { [key: string]: NodeJS.Timeout } = {};
  let initialized = false;
  let refreshPromises: { [key: string]: Promise<void> } = {};
  let loadingStates: { [key: string]: boolean } = {};

  /**
   * Initialize the store
   */
  async function initialize(options?: { includePlatformStats?: boolean }): Promise<void> {
    if (!browser) return;

    // Always re-initialize with new options
    if (initialized) {
      stopPeriodicRefresh();
      initialized = false;
    }

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

      // Start periodic refreshes with options
      startPeriodicRefresh(options);
      
      // Load initial data based on options
      const initialPromises: Promise<void>[] = [
        refreshLeaderboard() // Always load leaderboard
      ];
      
      if (options?.includePlatformStats !== false) {
        initialPromises.push(
          refreshPlatformStats(),
          refreshTimeStats(),
          refreshMachineAnalytics()
        );
      }
      
      await Promise.all(initialPromises);

      initialized = true;

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log(`✅ HOV Stats Store initialized${options?.includePlatformStats === false ? ' (app mode - no platform stats)' : ' (full mode)'}`);
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
    // Deduplicate concurrent requests
    const promiseKey = 'platformStats';
    if (refreshPromises[promiseKey]) {
      return refreshPromises[promiseKey];
    }
    
    const refreshPromise = (async () => {
      try {
        // Only clear platform stats cache to avoid affecting leaderboard
        hovStatsService.clearPlatformStatsCache();
        
        return await updateStoreSection('platformStats', async () => {
          const appId = await getCurrentSlotMachineAppId();
          return await hovStatsService.getPlatformStats({ p_app_id: appId });
        });
      } catch (error) {
        // MEMORY OPTIMIZATION: Always clean up promise on error
        delete refreshPromises[promiseKey];
        throw error;
      } finally {
        delete refreshPromises[promiseKey];
      }
    })();
    
    refreshPromises[promiseKey] = refreshPromise;
    
    // MEMORY LEAK PREVENTION: Set timeout to clean up hanging promises
    setTimeout(() => {
      if (refreshPromises[promiseKey] === refreshPromise) {
        delete refreshPromises[promiseKey];
      }
    }, 30000); // 30 second timeout
    
    return refreshPromise;
  }

  /**
   * Set the current leaderboard metric
   */
  function setLeaderboardMetric(metric: string): void {
    update(state => ({
      ...state,
      currentLeaderboardMetric: metric,
      // Clear existing leaderboard data when switching metrics to avoid showing stale data
      leaderboard: {
        ...state.leaderboard,
        data: null,
        error: null
      }
    }));
  }

  /**
   * Refresh leaderboard
   */
  async function refreshLeaderboard(metric: string = 'total_won', limit: number = 100): Promise<void> {
    const promiseKey = `leaderboard_${metric}_${limit}`;
    
    // Return existing promise if already refreshing this exact request
    if (refreshPromises[promiseKey]) {
      return refreshPromises[promiseKey];
    }

    const refreshPromise = (async () => {
      try {
        // Only clear leaderboard cache, not all caches to avoid race conditions
        hovStatsService.clearLeaderboardCache();
        
        return await updateStoreSection('leaderboard', async () => {
          const appId = await getCurrentSlotMachineAppId();
          return await hovStatsService.getLeaderboard({
            p_app_id: appId,
            p_metric: metric as any,
            p_limit: limit,
            forceRefresh: true
          });
        });
      } catch (error) {
        // MEMORY OPTIMIZATION: Always clean up promise on error
        delete refreshPromises[promiseKey];
        throw error;
      } finally {
        delete refreshPromises[promiseKey];
      }
    })();

    refreshPromises[promiseKey] = refreshPromise;
    
    // MEMORY LEAK PREVENTION: Set timeout to clean up hanging promises
    setTimeout(() => {
      if (refreshPromises[promiseKey] === refreshPromise) {
        delete refreshPromises[promiseKey];
      }
    }, 30000); // 30 second timeout
    
    return refreshPromise;
  }

  /**
   * Refresh time statistics
   */
  async function refreshTimeStats(timeUnit: 'hour' | 'day' | 'week' = 'day', limit: number = 30): Promise<void> {
    return updateStoreSection('timeStats', async () => {
      const appId = await getCurrentSlotMachineAppId();
      return await hovStatsService.getTimeStats({
        p_app_id: appId,
        p_time_unit: timeUnit,
        p_limit: limit
      });
    });
  }

  /**
   * Refresh machine analytics
   */
  async function refreshMachineAnalytics(): Promise<void> {
    return updateStoreSection('machineAnalytics', async () => {
      const machineAppId = await getCurrentSlotMachineAppId();
      const ybtAppId = await getCurrentYbtAppId();
      return await hovStatsService.getMachineAnalytics({
        p_machine_app_id: machineAppId,
        p_ybt_app_id: ybtAppId
      });
    });
  }

  /**
   * Refresh hot/cold players
   */
  async function refreshHotColdPlayers(): Promise<void> {
    return updateStoreSection('hotColdPlayers', async () => {
      const appId = await getCurrentSlotMachineAppId();
      return await hovStatsService.getHotColdPlayers({ p_app_id: appId });
    });
  }

  /**
   * Refresh whales
   */
  async function refreshWhales(): Promise<void> {
    return updateStoreSection('whales', async () => {
      const appId = await getCurrentSlotMachineAppId();
      return await hovStatsService.getWhales({ p_app_id: appId });
    });
  }

  /**
   * Refresh payline analysis
   */
  async function refreshPaylineAnalysis(): Promise<void> {
    return updateStoreSection('paylineAnalysis', async () => {
      const appId = await getCurrentSlotMachineAppId();
      return await hovStatsService.getPaylineAnalysis(appId);
    });
  }

  /**
   * Get player statistics
   */
  async function getPlayerStats(playerAddress: string): Promise<PlayerStats | null> {
    try {
      const appId = await getCurrentSlotMachineAppId();
      return await hovStatsService.getPlayerStats({
        p_app_id: appId,
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
      
      const appId = await getCurrentSlotMachineAppId();
      return await hovStatsService.getPlayerStats({
        p_app_id: appId,
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
      const appId = await getCurrentSlotMachineAppId();
      return await hovStatsService.getLeaderboard({
        p_app_id: appId,
        p_metric: (params?.metric as any) || 'total_won',
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
      const appId = await getCurrentSlotMachineAppId();
      const playerStats = await hovStatsService.getPlayerStats({
        p_app_id: appId,
        p_player_address: playerAddress
      });

      if (!playerStats) {
        throw new Error('Failed to load player statistics');
      }

      // Get the spins for this page
      const spins = await hovStatsService.getPlayerSpins({
        p_app_id: appId,
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
    // Prevent concurrent updates for the same section
    const sectionKey = String(section);
    if (loadingStates[sectionKey]) {
      return; // Already loading, skip this update
    }
    
    loadingStates[sectionKey] = true;
    
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
      
      update(state => {
        // Only update connection status if it actually needs to change
        const needsConnectionUpdate = state.connectionStatus !== 'connected' || state.fallbackActive;
        
        return {
          ...state,
          [section]: {
            data,
            loading: false,
            error: null,
            lastUpdated: new Date(),
            fromCache: false
          },
          // Only update connection status if needed to prevent unnecessary reactivity
          ...(needsConnectionUpdate && {
            connectionStatus: 'connected' as const,
            fallbackActive: false
          })
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isNetworkError = (error as HovStatsError)?.code === 'NETWORK_ERROR';

      update(state => {
        const newConnectionStatus = isNetworkError ? 'disconnected' : 'error';
        const needsConnectionUpdate = state.connectionStatus !== newConnectionStatus || !state.fallbackActive;
        
        return {
          ...state,
          [section]: {
            ...state[section],
            loading: false,
            error: errorMessage
          },
          // Only update connection status if needed
          ...(needsConnectionUpdate && {
            connectionStatus: newConnectionStatus as const,
            fallbackActive: true
          })
        };
      });

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.warn(`Failed to refresh ${section}:`, errorMessage);
      }
    } finally {
      loadingStates[sectionKey] = false;
    }
  }

  /**
   * Start periodic refresh intervals
   */
  function startPeriodicRefresh(options?: { includePlatformStats?: boolean }): void {
    if (!browser) return;

    // IMPORTANT: Always clear existing intervals first to prevent memory leaks
    stopPeriodicRefresh();

    // Platform stats - only on house page
    if (options?.includePlatformStats !== false) {
      intervals.platformStats = setInterval(() => {
        refreshPlatformStats();
      }, REFRESH_INTERVALS.platformStats);
    }

    // Leaderboard - use current metric (needed on both app and house pages)
    intervals.leaderboard = setInterval(() => {
      const currentState = get({ subscribe });
      refreshLeaderboard(currentState.currentLeaderboardMetric);
    }, REFRESH_INTERVALS.leaderboard);

    // Time stats - only on house page
    if (options?.includePlatformStats !== false) {
      intervals.timeStats = setInterval(() => {
        refreshTimeStats();
      }, REFRESH_INTERVALS.timeStats);
    }

    // Machine analytics - only on house page
    if (options?.includePlatformStats !== false) {
      intervals.machineAnalytics = setInterval(() => {
        refreshMachineAnalytics();
      }, REFRESH_INTERVALS.machineAnalytics);
    }

    // Hot/cold players - DISABLED (not used in UI)
    // intervals.hotColdPlayers = setInterval(() => {
    //   refreshHotColdPlayers();
    // }, REFRESH_INTERVALS.hotColdPlayers);

    // Whales - DISABLED (not used in UI)
    // intervals.whales = setInterval(() => {
    //   refreshWhales();
    // }, REFRESH_INTERVALS.whales);

    // Payline analysis - only on house page
    if (options?.includePlatformStats !== false) {
      intervals.paylineAnalysis = setInterval(() => {
        refreshPaylineAnalysis();
      }, REFRESH_INTERVALS.paylineAnalysis);
    }
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
      refreshMachineAnalytics(),
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
    // Clear all pending promises to prevent memory leaks
    refreshPromises = {};
    loadingStates = {};
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
    setLeaderboardMetric,
    refreshTimeStats,
    refreshMachineAnalytics,
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
    healthCheck,
    stopPeriodicRefresh,
    
    // MEMORY OPTIMIZATION: Manual initialization for app routes
    initializeForAppRoute: () => initialize({ includePlatformStats: false })
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

// Helper function for deep comparison with BigInt support
function deepEqualStore(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqualStore(item, b[index]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => deepEqualStore(a[key], b[key]));
  }
  return false;
}

// Create memoization for derived stores - simplified to prevent loops
let lastLeaderboardState: any = null;
let lastLeaderboardResult: any = null;

export const leaderboard = derived(
  hovStatsStore,
  $hovStats => {
    const currentState = {
      data: $hovStats.leaderboard.data,
      loading: $hovStats.leaderboard.loading,
      error: $hovStats.leaderboard.error,
      lastUpdated: $hovStats.leaderboard.lastUpdated,
      available: !$hovStats.fallbackActive,
      currentMetric: $hovStats.currentLeaderboardMetric
    };
    
    // Use deep comparison to check if leaderboard section actually changed
    // IMPORTANT: Include currentMetric in comparison to prevent wrong sorting cache
    if (lastLeaderboardState && 
        lastLeaderboardState.loading === currentState.loading &&
        lastLeaderboardState.error === currentState.error &&
        lastLeaderboardState.available === currentState.available &&
        lastLeaderboardState.currentMetric === currentState.currentMetric &&
        deepEqualStore(lastLeaderboardState.data, currentState.data)) {
      return lastLeaderboardResult;
    }
    
    lastLeaderboardState = currentState;
    lastLeaderboardResult = { ...currentState };
    return lastLeaderboardResult;
  }
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

export const machineAnalytics = derived(
  hovStatsStore,
  $hovStats => ({
    data: $hovStats.machineAnalytics.data,
    loading: $hovStats.machineAnalytics.loading,
    error: $hovStats.machineAnalytics.error,
    lastUpdated: $hovStats.machineAnalytics.lastUpdated,
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

// Route-aware initialization - different features for different pages
if (browser) {
  let currentRoute: string | null = null;
  let currentContract: string | null = null;
  let appRouteInitialized = false; // Track if app route was manually initialized
  
  // Subscribe to route changes to initialize/deinitialize based on current route
  page.subscribe(($page) => {
    const routeId = $page.route?.id;
    
    // Prevent unnecessary re-initialization
    if (currentRoute === routeId) return;
    currentRoute = routeId;
    
    if (routeId?.startsWith('/house')) {
      // House page: Initialize everything including platform stats
      hovStatsStore.initialize({ includePlatformStats: true });
    } else if (routeId?.startsWith('/app')) {
      // MEMORY OPTIMIZATION: Don't auto-initialize on app pages to reduce initial load
      // App components will initialize manually when needed (e.g., when Leaderboard tab is clicked)
      console.log('🎯 App route detected - deferring HOV stats initialization until needed');
      appRouteInitialized = false;
      hovStatsStore.stopPeriodicRefresh();
    } else if (routeId?.startsWith('/profile')) {
      // Profile page: Initialize without platform stats (similar to app pages)
      console.log('👤 Profile route detected - initializing HOV stats for player profile');
      hovStatsStore.initialize({ includePlatformStats: false });
    } else {
      // Other pages: Stop all periodic refreshes
      hovStatsStore.stopPeriodicRefresh();
    }
  });

  // Subscribe to contract changes to refresh stats immediately
  import('$lib/stores/multiContract').then(({ selectedContract }) => {
    selectedContract.subscribe(async (contract) => {
      const contractId = contract?.id || null;
      
      // Only refresh if contract actually changed and we're initialized
      if (contractId !== currentContract && currentRoute && (currentRoute.startsWith('/house') || currentRoute.startsWith('/app') || currentRoute.startsWith('/profile'))) {
        currentContract = contractId;
        
        if (contractId) {
          console.log(`🔄 Refreshing stats for contract switch: ${contractId}`);
          
          // Refresh relevant data immediately when contract changes
          if (currentRoute.startsWith('/house')) {
            // House page: refresh platform stats, time stats, and machine analytics (leaderboard handles contract changes via reactive statements)
            await Promise.allSettled([
              hovStatsStore.refreshPlatformStats(),
              hovStatsStore.refreshTimeStats(),
              hovStatsStore.refreshMachineAnalytics()
            ]);
          } else if (currentRoute.startsWith('/app')) {
            // App page: only refresh leaderboard
            await hovStatsStore.refreshLeaderboard();
          } else if (currentRoute.startsWith('/profile')) {
            // Profile page: refresh leaderboard (for player ranking context)
            await hovStatsStore.refreshLeaderboard();
          }
        }
      }
    });
  }).catch(error => {
    console.warn('Failed to subscribe to contract changes:', error);
  });
}