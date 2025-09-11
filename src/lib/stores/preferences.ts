import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import type { SoundPreferences } from './sound';
import type { ThemePreferences } from './theme';
import type { AnimationPreferences } from '$lib/types/animations';

export interface QuickBet {
  amount: number; // VOI amount
  lines: number;  // Number of paylines (1-20)
}

export interface BettingPreferences {
  quickBets: QuickBet[]; // Quick bet configurations (amount + lines)
  defaultMaxPaylines: boolean; // Whether to start with max paylines
  defaultPaylines: number; // Custom default paylines if not max
  defaultQuickBet: QuickBet | null; // Optional default quick bet to use on initialization
}

export interface FeedPreferences {
  enabled: boolean; // Whether to listen to win feed
  minPayout: number; // Minimum payout amount to show (in VOI)
  maxToastsPerMinute: number; // Rate limiting for toasts
  showOwnWins: boolean; // Whether to show user's own wins
  animationStyle: 'slide' | 'fade' | 'bounce'; // Toast animation style
  displayDuration: number; // How long toasts stay visible (ms)
}

export interface UnifiedPreferences {
  sound: SoundPreferences;
  theme: ThemePreferences;
  betting: BettingPreferences;
  animations: AnimationPreferences;
  feed: FeedPreferences;
  version: number; // For future migrations
}

// Default preferences
const defaultSoundPreferences: SoundPreferences = {
  masterEnabled: false,
  masterVolume: 0.7,
  spinSoundsEnabled: true,
  spinVolume: 0.8,
  winSoundsEnabled: true,
  winVolume: 0.9,
  uiSoundsEnabled: true,
  uiVolume: 0.5,
  backgroundEnabled: false,
  backgroundVolume: 0.3,
  voiRadioEnabled: true
};

const defaultThemePreferences: ThemePreferences = {
  currentTheme: 'purple'
};

const defaultBettingPreferences: BettingPreferences = {
  quickBets: [
    { amount: 1, lines: 1 },
    { amount: 2, lines: 5 },
    { amount: 5, lines: 10 },
    { amount: 10, lines: 20 }
  ],
  defaultMaxPaylines: false,
  defaultPaylines: 1,
  defaultQuickBet: null
};

const defaultAnimationPreferences: AnimationPreferences = {
  reducedMotion: false,
  batteryOptimized: false,
  highPerformance: true,
  hapticEnabled: true,
  particlesEnabled: true
};

const defaultFeedPreferences: FeedPreferences = {
  enabled: true,
  minPayout: 5, // 5 VOI minimum
  maxToastsPerMinute: 8,
  showOwnWins: false, // Don't show user's own wins by default
  animationStyle: 'slide',
  displayDuration: 6000 // 6 seconds
};

const defaultPreferences: UnifiedPreferences = {
  sound: defaultSoundPreferences,
  theme: defaultThemePreferences,
  betting: defaultBettingPreferences,
  animations: defaultAnimationPreferences,
  feed: defaultFeedPreferences,
  version: 1
};

// Migration functions
function migrateOldPreferences(): UnifiedPreferences | null {
  if (!browser) return null;

  let migrated = false;
  let preferences = { ...defaultPreferences };

  try {
    // Migrate sound preferences
    const oldSound = localStorage.getItem('hov-sound-preferences');
    if (oldSound) {
      try {
        const soundPrefs = JSON.parse(oldSound);
        preferences.sound = { ...defaultSoundPreferences, ...soundPrefs };
        localStorage.removeItem('hov-sound-preferences');
        migrated = true;
        console.log('Migrated sound preferences');
      } catch (error) {
        console.warn('Failed to migrate sound preferences:', error);
      }
    }

    // Migrate theme preferences
    const oldTheme = localStorage.getItem('hov-theme-preferences');
    if (oldTheme) {
      try {
        const themePrefs = JSON.parse(oldTheme);
        preferences.theme = { ...defaultThemePreferences, ...themePrefs };
        localStorage.removeItem('hov-theme-preferences');
        migrated = true;
        console.log('Migrated theme preferences');
      } catch (error) {
        console.warn('Failed to migrate theme preferences:', error);
      }
    }

    if (migrated) {
      console.log('Migration completed, saving unified preferences');
      return preferences;
    }
  } catch (error) {
    console.error('Migration failed:', error);
  }

  return null;
}

// Migrate old quickBetAmounts to new quickBets format
function migrateBettingPreferences(betting: any): BettingPreferences {
  // If already using new format, return as-is
  if (betting.quickBets && Array.isArray(betting.quickBets)) {
    return { ...defaultBettingPreferences, ...betting };
  }

  // Migrate from old quickBetAmounts format
  let quickBets = defaultBettingPreferences.quickBets;
  if (betting.quickBetAmounts && Array.isArray(betting.quickBetAmounts)) {
    quickBets = betting.quickBetAmounts.slice(0, 4).map((amount: number, index: number) => ({
      amount,
      lines: [1, 5, 10, 20][index] || 1 // Default line patterns
    }));
  }

  return {
    ...defaultBettingPreferences,
    ...betting,
    quickBets
  };
}

// Load preferences from localStorage
function loadPreferences(): UnifiedPreferences {
  if (!browser) return defaultPreferences;

  try {
    // Check for existing unified preferences
    const stored = localStorage.getItem('hov-preferences');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Migrate betting preferences if needed and merge with defaults
      const bettingPrefs = migrateBettingPreferences(parsed.betting || {});
      
      return {
        sound: { ...defaultSoundPreferences, ...parsed.sound },
        theme: { ...defaultThemePreferences, ...parsed.theme },
        betting: bettingPrefs,
        animations: { ...defaultAnimationPreferences, ...parsed.animations },
        feed: { ...defaultFeedPreferences, ...parsed.feed },
        version: parsed.version || 1
      };
    }

    // If no unified preferences exist, try to migrate old ones
    const migrated = migrateOldPreferences();
    if (migrated) {
      savePreferences(migrated);
      return migrated;
    }
  } catch (error) {
    console.warn('Failed to load preferences:', error);
  }

  return defaultPreferences;
}

// Save preferences to localStorage
function savePreferences(preferences: UnifiedPreferences): void {
  if (!browser) return;

  try {
    localStorage.setItem('hov-preferences', JSON.stringify(preferences));
  } catch (error) {
    console.warn('Failed to save preferences:', error);
  }
}

// Create the unified preferences store
function createPreferencesStore() {
  const initialState = loadPreferences();
  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,

    // Update any section of preferences
    updatePreferences(updates: Partial<UnifiedPreferences>): void {
      update(state => {
        const newState = {
          ...state,
          ...updates,
          // Merge nested objects properly
          sound: updates.sound ? { ...state.sound, ...updates.sound } : state.sound,
          theme: updates.theme ? { ...state.theme, ...updates.theme } : state.theme,
          betting: updates.betting ? { ...state.betting, ...updates.betting } : state.betting,
          animations: updates.animations ? { ...state.animations, ...updates.animations } : state.animations,
          feed: updates.feed ? { ...state.feed, ...updates.feed } : state.feed
        };
        savePreferences(newState);
        return newState;
      });
    },

    // Sound preference updates
    updateSoundPreferences(soundUpdates: Partial<SoundPreferences>): void {
      this.updatePreferences({ sound: soundUpdates });
    },

    // Theme preference updates
    updateThemePreferences(themeUpdates: Partial<ThemePreferences>): void {
      this.updatePreferences({ theme: themeUpdates });
    },

    // Betting preference updates
    updateBettingPreferences(bettingUpdates: Partial<BettingPreferences>): void {
      this.updatePreferences({ betting: bettingUpdates });
    },

    // Animation preference updates
    updateAnimationPreferences(animationUpdates: Partial<AnimationPreferences>): void {
      this.updatePreferences({ animations: animationUpdates });
    },

    // Feed preference updates
    updateFeedPreferences(feedUpdates: Partial<FeedPreferences>): void {
      this.updatePreferences({ feed: feedUpdates });
    },

    // Reset all preferences to defaults
    resetToDefaults(): void {
      set(defaultPreferences);
      savePreferences(defaultPreferences);
    },

    // Reset specific section to defaults
    resetSection(section: keyof UnifiedPreferences): void {
      if (section === 'version') return; // Don't reset version

      const sectionDefaults = {
        sound: defaultSoundPreferences,
        theme: defaultThemePreferences,
        betting: defaultBettingPreferences,
        animations: defaultAnimationPreferences,
        feed: defaultFeedPreferences
      };

      this.updatePreferences({ [section]: sectionDefaults[section] });
    },

    // Get current state snapshot
    getSnapshot(): UnifiedPreferences {
      let currentState: UnifiedPreferences = defaultPreferences;
      const unsubscribe = subscribe(state => {
        currentState = state;
      });
      unsubscribe();
      return currentState;
    }
  };
}

export const preferencesStore = createPreferencesStore();

// Derived stores for easy access to specific preference sections
export const soundPreferences = derived(preferencesStore, $prefs => $prefs.sound);
export const themePreferences = derived(preferencesStore, $prefs => $prefs.theme);
export const bettingPreferences = derived(preferencesStore, $prefs => $prefs.betting);
export const animationPreferences = derived(preferencesStore, $prefs => $prefs.animations);
export const feedPreferences = derived(preferencesStore, $prefs => $prefs.feed);

// Legacy compatibility - these can be removed once all components are updated
export const legacySoundPreferences = soundPreferences;
export const legacyThemePreferences = themePreferences;
