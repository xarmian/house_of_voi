import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export interface ThemeColors {
  primary: string;
  secondary: string;
  lights: string;
  name: string;
  displayName: string;
  background: {
    from: string;
    via?: string;
    to: string;
    direction: string;
  };
  textColor?: string; // For contrast adjustments
  surface?: {
    primary: string;
    secondary: string;
    tertiary: string;
    border: string;
    hover: string;
  };
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
    displayName: 'Purple Casino',
    background: {
      from: '#0f172a',
      via: '#1e293b',
      to: '#0f172a',
      direction: 'to bottom right'
    },
    surface: {
      primary: '#1e293b',
      secondary: '#334155',
      tertiary: '#475569',
      border: '#64748b',
      hover: '#475569'
    }
  },
  black: {
    primary: '#000000',
    secondary: '#1f1f1f',
    lights: 'rgba(255, 255, 255, 0.1)',
    name: 'black',
    displayName: 'Stealth Black',
    background: {
      from: '#000000',
      via: '#111827',
      to: '#1f2937',
      direction: 'to bottom right'
    },
    surface: {
      primary: '#111827',
      secondary: '#1f2937',
      tertiary: '#374151',
      border: '#4b5563',
      hover: '#374151'
    }
  },
  transparent: {
    primary: 'rgba(255, 255, 255, 0.1)',
    secondary: 'rgba(255, 255, 255, 0.2)',
    lights: 'rgba(255, 255, 255, 0.05)',
    name: 'transparent',
    displayName: 'Ghost Mode',
    background: {
      from: '#f8fafc',
      via: '#e2e8f0',
      to: '#cbd5e1',
      direction: 'to bottom right'
    },
    textColor: '#1f2937',
    surface: {
      primary: 'rgba(255, 255, 255, 0.8)',
      secondary: 'rgba(255, 255, 255, 0.6)',
      tertiary: 'rgba(255, 255, 255, 0.4)',
      border: 'rgba(203, 213, 225, 0.8)',
      hover: 'rgba(255, 255, 255, 0.9)'
    }
  },
  voi: {
    primary: '#10b981',
    secondary: '#4ade80',
    lights: 'rgba(74, 222, 128, 0.3)',
    name: 'voi',
    displayName: 'VOI Green',
    background: {
      from: '#78350f',
      via: '#92400e',
      to: '#451a03',
      direction: 'to bottom right'
    },
    surface: {
      primary: '#92400e',
      secondary: '#a3460f',
      tertiary: '#b45309',
      border: '#d97706',
      hover: '#b45309'
    }
  },
  redgold: {
    primary: '#dc2626',
    secondary: '#fbbf24',
    lights: 'rgba(251, 191, 36, 0.3)',
    name: 'redgold',
    displayName: 'Vegas Gold',
    background: {
      from: '#1e3a8a',
      via: '#1e40af',
      to: '#1d4ed8',
      direction: 'to bottom right'
    },
    surface: {
      primary: '#1e40af',
      secondary: '#1d4ed8',
      tertiary: '#2563eb',
      border: '#3b82f6',
      hover: '#2563eb'
    }
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

// Apply theme CSS custom properties to document root
function applyThemeToDOM(theme: ThemeColors): void {
  if (!browser) return;
  
  const root = document.documentElement;
  
  // Apply theme colors as CSS custom properties
  root.style.setProperty('--theme-primary', theme.primary);
  root.style.setProperty('--theme-secondary', theme.secondary);
  root.style.setProperty('--theme-lights', theme.lights);
  root.style.setProperty('--theme-bg-from', theme.background.from);
  root.style.setProperty('--theme-bg-via', theme.background.via || theme.background.from);
  root.style.setProperty('--theme-bg-to', theme.background.to);
  root.style.setProperty('--theme-text', theme.textColor || '#ffffff');
  
  // Apply surface colors if defined
  if (theme.surface) {
    root.style.setProperty('--theme-surface-primary', theme.surface.primary);
    root.style.setProperty('--theme-surface-secondary', theme.surface.secondary);
    root.style.setProperty('--theme-surface-tertiary', theme.surface.tertiary);
    root.style.setProperty('--theme-surface-border', theme.surface.border);
    root.style.setProperty('--theme-surface-hover', theme.surface.hover);
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

  // Apply initial theme to DOM
  applyThemeToDOM(initialState.currentThemeColors);

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
        const newThemeColors = availableThemes[themeName];
        savePreferences(updatedPreferences);
        applyThemeToDOM(newThemeColors);
        
        return {
          ...state,
          preferences: updatedPreferences,
          currentThemeColors: newThemeColors
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
        const newThemeColors = availableThemes[nextThemeName];
        
        const updatedPreferences = { ...state.preferences, currentTheme: nextThemeName };
        savePreferences(updatedPreferences);
        applyThemeToDOM(newThemeColors);
        
        return {
          ...state,
          preferences: updatedPreferences,
          currentThemeColors: newThemeColors
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