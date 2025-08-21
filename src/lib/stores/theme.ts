import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export interface ThemeColors {
  primary: string;
  secondary: string;
  lights: string;
  name: string;
  displayName: string;
}

export interface ThemePreferences {
  currentTheme: string;
}

export interface ThemeState {
  preferences: ThemePreferences;
  availableThemes: Record<string, ThemeColors>;
  currentThemeColors: ThemeColors;
}

// Define available theme color schemes
const availableThemes: Record<string, ThemeColors> = {
  purple: {
    primary: '#7c3aed',
    secondary: '#a855f7',
    lights: 'rgba(168, 85, 247, 0.3)',
    name: 'purple',
    displayName: 'Purple Casino'
  },
  black: {
    primary: '#000000',
    secondary: '#1f1f1f',
    lights: 'rgba(255, 255, 255, 0.1)',
    name: 'black',
    displayName: 'Stealth Black'
  },
  transparent: {
    primary: 'rgba(255, 255, 255, 0.1)',
    secondary: 'rgba(255, 255, 255, 0.2)',
    lights: 'rgba(255, 255, 255, 0.05)',
    name: 'transparent',
    displayName: 'Ghost Mode'
  },
  voi: {
    primary: '#10b981',
    secondary: '#4ade80',
    lights: 'rgba(74, 222, 128, 0.3)',
    name: 'voi',
    displayName: 'VOI Green'
  },
  redgold: {
    primary: '#dc2626',
    secondary: '#fbbf24',
    lights: 'rgba(251, 191, 36, 0.3)',
    name: 'redgold',
    displayName: 'Vegas Gold'
  }
};

// Default theme preferences
const defaultPreferences: ThemePreferences = {
  currentTheme: 'purple'
};

// Load preferences from localStorage
function loadPreferences(): ThemePreferences {
  if (!browser) return defaultPreferences;
  
  try {
    const stored = localStorage.getItem('hov-theme-preferences');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate that the theme exists
      if (parsed.currentTheme && availableThemes[parsed.currentTheme]) {
        return { ...defaultPreferences, ...parsed };
      }
    }
  } catch (error) {
    console.warn('Failed to load theme preferences:', error);
  }
  
  return defaultPreferences;
}

// Save preferences to localStorage
function savePreferences(preferences: ThemePreferences): void {
  if (!browser) return;
  
  try {
    localStorage.setItem('hov-theme-preferences', JSON.stringify(preferences));
  } catch (error) {
    console.warn('Failed to save theme preferences:', error);
  }
}

// Create the theme store
function createThemeStore() {
  const initialPreferences = loadPreferences();
  const initialState: ThemeState = {
    preferences: initialPreferences,
    availableThemes,
    currentThemeColors: availableThemes[initialPreferences.currentTheme]
  };

  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,
    
    // Set a specific theme
    setTheme(themeName: string): void {
      if (!availableThemes[themeName]) {
        console.warn(`Theme "${themeName}" not found`);
        return;
      }

      update(state => {
        const updatedPreferences = { ...state.preferences, currentTheme: themeName };
        savePreferences(updatedPreferences);
        
        return {
          ...state,
          preferences: updatedPreferences,
          currentThemeColors: availableThemes[themeName]
        };
      });
    },

    // Cycle to the next theme
    nextTheme(): void {
      const themeNames = Object.keys(availableThemes);
      
      update(state => {
        const currentIndex = themeNames.indexOf(state.preferences.currentTheme);
        const nextIndex = (currentIndex + 1) % themeNames.length;
        const nextThemeName = themeNames[nextIndex];
        
        const updatedPreferences = { ...state.preferences, currentTheme: nextThemeName };
        savePreferences(updatedPreferences);
        
        return {
          ...state,
          preferences: updatedPreferences,
          currentThemeColors: availableThemes[nextThemeName]
        };
      });
    },

    // Get current theme info
    getCurrentTheme(): ThemeColors {
      let currentTheme = availableThemes[defaultPreferences.currentTheme];
      const unsubscribe = subscribe(state => {
        currentTheme = state.currentThemeColors;
      });
      unsubscribe();
      return currentTheme;
    },

    // Get all available themes
    getAvailableThemes(): Record<string, ThemeColors> {
      return availableThemes;
    }
  };
}

export const themeStore = createThemeStore();

// Derived stores for easy access
export const currentTheme = derived(themeStore, $theme => $theme.currentThemeColors);
export const currentThemeName = derived(themeStore, $theme => $theme.preferences.currentTheme);
export const availableThemesList = derived(themeStore, $theme => Object.values($theme.availableThemes));