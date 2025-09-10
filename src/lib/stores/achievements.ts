import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { achievementsService } from '$lib/services/achievements';
import { getNextAchievementProgress } from '$lib/utils/achievementProgress';
import type { 
  Achievement, 
  PlayerAchievement, 
  AchievementState, 
  AchievementFilter,
  ClaimResult,
  NextAchievementProgress
} from '$lib/types/achievements';

interface AchievementsStoreState extends AchievementState {
  playerAddress: string | null;
  isInitialized: boolean;
  claiming: boolean;
  claimError: string | null;
}

const initialState: AchievementsStoreState = {
  allAchievements: [],
  playerAchievements: [],
  availableAchievements: [],
  isLoading: false,
  error: null,
  lastUpdated: null,
  playerAddress: null,
  isInitialized: false,
  claiming: false,
  claimError: null,
};

function createAchievementsStore() {
  const { subscribe, set, update } = writable<AchievementsStoreState>(initialState);

  let refreshInterval: NodeJS.Timeout | null = null;
  const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

  const startAutoRefresh = () => {
    if (!browser) return;
    
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    
    refreshInterval = setInterval(() => {
      const state = get({ subscribe });
      if (state.playerAddress) {
        refreshData(state.playerAddress);
      }
    }, REFRESH_INTERVAL);
  };

  const stopAutoRefresh = () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  };

  const setError = (error: string | null) => {
    update(state => ({
      ...state,
      error,
      isLoading: false
    }));
  };

  const setLoading = (isLoading: boolean) => {
    update(state => ({
      ...state,
      isLoading,
      error: isLoading ? null : state.error
    }));
  };

  const refreshData = async (playerAddress?: string) => {
    if (!browser) return;
    
    const currentState = get({ subscribe });
    const address = playerAddress || currentState.playerAddress;
    
    if (!address) {
      setError('No player address provided');
      return;
    }

    try {
      setLoading(true);

      // Fetch all achievements and player-specific achievements in parallel
      const [allAchievements ] = await Promise.all([
        // achievementsService.getAllAchievements({seriesKey: 'original_degens'}),
        achievementsService.getPlayerAchievements(address)
      ]);

      // Separate owned and available achievements
      // const owned = playerAchievements.filter(a => a.owned) as PlayerAchievement[];
      const owned = allAchievements.filter(a => a.owned) as PlayerAchievement[];
      const ownedIds = new Set(owned.map(a => a.id));
      const available = allAchievements.filter(a => !ownedIds.has(a.id));

      update(state => ({
        ...state,
        allAchievements,
        playerAchievements: owned,
        availableAchievements: available,
        playerAddress: address,
        lastUpdated: new Date(),
        isLoading: false,
        error: null,
        isInitialized: true
      }));

    } catch (error) {
      console.error('Failed to refresh achievements:', error);
      setError(error instanceof Error ? error.message : 'Failed to load achievements');
    }
  };

  const initialize = async (playerAddress?: string) => {
    if (!browser) return;

    const currentState = get({ subscribe });
    if (currentState.isInitialized && currentState.playerAddress === playerAddress) {
      return;
    }

    if (playerAddress) {
      await refreshData(playerAddress);
      startAutoRefresh();
    } else {
      update(state => ({
        ...state,
        ...initialState,
        isInitialized: true
      }));
    }
  };

  const setPlayerAddress = async (address: string | null) => {
    const currentState = get({ subscribe });
    
    if (currentState.playerAddress === address) {
      return;
    }

    if (address) {
      await initialize(address);
    } else {
      stopAutoRefresh();
      update(state => ({
        ...state,
        ...initialState,
        isInitialized: true
      }));
    }
  };

  const claimAchievements = async (achievementId?: string): Promise<ClaimResult | null> => {
    if (!browser) return null;
    
    const currentState = get({ subscribe });
    if (!currentState.playerAddress) {
      setError('No player address available for claiming');
      return null;
    }

    try {
      update(state => ({
        ...state,
        claiming: true,
        claimError: null
      }));

      const result = await achievementsService.claimAchievements({
        account: currentState.playerAddress,
        id: achievementId
      });

      // Refresh data after successful claim
      if (result.minted.length > 0) {
        await refreshData(currentState.playerAddress);
      }

      update(state => ({
        ...state,
        claiming: false,
        claimError: result.errors.length > 0 
          ? `Failed to claim some achievements: ${result.errors.map(e => e.reason).join(', ')}`
          : null
      }));

      return result;

    } catch (error) {
      console.error('Failed to claim achievements:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to claim achievements';
      
      update(state => ({
        ...state,
        claiming: false,
        claimError: errorMessage
      }));
      
      return null;
    }
  };

  const validateClaim = async (achievementId?: string): Promise<ClaimResult | null> => {
    const currentState = get({ subscribe });
    if (!currentState.playerAddress) return null;

    try {
      return await achievementsService.validateClaim(currentState.playerAddress, achievementId);
    } catch (error) {
      console.error('Failed to validate claim:', error);
      return null;
    }
  };

  const filterAchievements = (filter: AchievementFilter) => {
    const currentState = get({ subscribe });
    let achievements = [...currentState.allAchievements];

    if (filter.category) {
      achievements = achievements.filter(a => a.category === filter.category);
    }

    if (filter.owned !== undefined) {
      const ownedIds = new Set(currentState.playerAchievements.map(a => a.id));
      achievements = achievements.filter(a => 
        filter.owned ? ownedIds.has(a.id) : !ownedIds.has(a.id)
      );
    }

    if (filter.game) {
      achievements = achievements.filter(a => a.game === filter.game);
    }

    if (filter.seriesKey) {
      achievements = achievements.filter(a => a.seriesKey === filter.seriesKey);
    }

    return achievements;
  };

  const reset = () => {
    stopAutoRefresh();
    achievementsService.clearCache();
    set(initialState);
  };

  const clearError = () => {
    update(state => ({
      ...state,
      error: null,
      claimError: null
    }));
  };

  return {
    subscribe,
    initialize,
    setPlayerAddress,
    refreshData,
    claimAchievements,
    validateClaim,
    filterAchievements,
    reset,
    clearError,
    // Utility methods
    startAutoRefresh,
    stopAutoRefresh
  };
}

export const achievementsStore = createAchievementsStore();

// Derived stores for convenient access
export const playerAchievements = derived(
  achievementsStore,
  $store => $store.playerAchievements
);

export const availableAchievements = derived(
  achievementsStore,
  $store => $store.availableAchievements
);

export const achievementsLoading = derived(
  achievementsStore,
  $store => $store.isLoading
);

export const achievementsError = derived(
  achievementsStore,
  $store => $store.error
);

export const claimingInProgress = derived(
  achievementsStore,
  $store => $store.claiming
);

// Achievement categories derived store
export const achievementsByCategory = derived(
  achievementsStore,
  $store => {
    const categories: Record<string, Achievement[]> = {};
    
    $store.allAchievements.forEach(achievement => {
      const category = achievement.category || 'general';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(achievement);
    });
    
    return categories;
  }
);

// Next achievement progress derived store
export const nextAchievementProgress = derived(
  achievementsStore,
  $store => {
    return getNextAchievementProgress($store.allAchievements);
  }
);