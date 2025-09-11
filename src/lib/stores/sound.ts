import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { preferencesStore, soundPreferences as unifiedSoundPreferences } from './preferences';

export interface SoundPreferences {
  masterEnabled: boolean;
  masterVolume: number; // 0-1
  spinSoundsEnabled: boolean;
  spinVolume: number; // 0-1
  winSoundsEnabled: boolean;
  winVolume: number; // 0-1
  uiSoundsEnabled: boolean;
  uiVolume: number; // 0-1
  backgroundEnabled: boolean;
  backgroundVolume: number; // 0-1
  // Controls whether the floating VOI Radio iframe loads at all
  voiRadioEnabled: boolean;
}

export interface SoundState {
  preferences: SoundPreferences;
  isLoading: boolean;
  loadedSounds: Set<string>;
  audioContext: AudioContext | null;
  isSupported: boolean;
  currentlyPlaying: Map<string, AudioBufferSourceNode[]>;
}

// Default sound preferences
const defaultPreferences: SoundPreferences = {
  masterEnabled: false, // Disabled by default
  masterVolume: 0.7,
  spinSoundsEnabled: true,
  spinVolume: 0.8,
  winSoundsEnabled: true,
  winVolume: 0.9,
  uiSoundsEnabled: true,
  uiVolume: 0.5,
  backgroundEnabled: false, // Disabled by default to not be intrusive
  backgroundVolume: 0.3,
  voiRadioEnabled: true
};

// Sound categories for easy management
export type SoundCategory = 'spin' | 'win' | 'ui' | 'background';
export type SoundType = 'spin-start' | 'spin-loop' | 'reel-stop' | 'win-small' | 'win-medium' | 'win-large' | 'win-jackpot' | 'loss' | 'button-click' | 'background-ambience' | 'deposit' | 'balance-increase';

// Load preferences from localStorage
function loadPreferences(): SoundPreferences {
  if (!browser) return defaultPreferences;
  
  try {
    const stored = localStorage.getItem('hov-sound-preferences');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new preferences added over time
      return { ...defaultPreferences, ...parsed };
    }
  } catch (error) {
    console.warn('Failed to load sound preferences:', error);
  }
  
  return defaultPreferences;
}

// Save preferences to localStorage
function savePreferences(preferences: SoundPreferences): void {
  if (!browser) return;
  
  try {
    localStorage.setItem('hov-sound-preferences', JSON.stringify(preferences));
  } catch (error) {
    console.warn('Failed to save sound preferences:', error);
  }
}

// Check if Web Audio API is supported
function checkAudioSupport(): boolean {
  if (!browser) return false;
  
  return !!(window.AudioContext || (window as any).webkitAudioContext);
}

// Cleanup callback for external sound services
let externalCleanupCallback: (() => void) | null = null;

// Create the sound store
function createSoundStore() {
  const initialState: SoundState = {
    preferences: get(unifiedSoundPreferences),
    isLoading: false,
    loadedSounds: new Set(),
    audioContext: null,
    isSupported: checkAudioSupport(),
    currentlyPlaying: new Map()
  };

  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,
    
    // Initialize audio context
    async initAudioContext(): Promise<boolean> {
      if (!browser || !checkAudioSupport()) {
        console.warn('Web Audio API not supported');
        return false;
      }

      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContext();
        
        // Resume context if suspended (required by some browsers)
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        update(state => ({
          ...state,
          audioContext,
          isSupported: true
        }));

        console.log('Audio context initialized successfully');
        return true;
      } catch (error) {
        console.error('Failed to initialize audio context:', error);
        update(state => ({
          ...state,
          isSupported: false
        }));
        return false;
      }
    },

    // Update preferences - now delegates to unified preferences
    updatePreferences(newPreferences: Partial<SoundPreferences>): void {
      preferencesStore.updateSoundPreferences(newPreferences);
      
      // Update local state for non-preference properties
      update(state => ({
        ...state,
        preferences: get(unifiedSoundPreferences)
      }));
    },

    // Toggle master sound
    toggleMasterSound(): void {
      const currentPrefs = get(unifiedSoundPreferences);
      const newEnabled = !currentPrefs.masterEnabled;
      
      preferencesStore.updateSoundPreferences({ masterEnabled: newEnabled });
      
      update(state => {
        // Stop all currently playing sounds if disabling
        if (!newEnabled) {
          // Call external cleanup first (for complex looping sounds)
          if (externalCleanupCallback) {
            try {
              externalCleanupCallback();
            } catch (e) {
              console.warn('External cleanup callback failed:', e);
            }
          }
          
          // Then stop basic sounds tracked in store
          state.currentlyPlaying.forEach((sources, soundType) => {
            sources.forEach(source => {
              try {
                source.stop();
              } catch (e) {
                // Ignore errors when stopping already stopped sources
              }
            });
          });
          state.currentlyPlaying.clear();
        }
        
        return {
          ...state,
          preferences: get(unifiedSoundPreferences),
          currentlyPlaying: newEnabled ? state.currentlyPlaying : new Map()
        };
      });
    },

    // Register external cleanup callback
    registerCleanupCallback(callback: () => void): void {
      externalCleanupCallback = callback;
    },

    // Set master volume
    setMasterVolume(volume: number): void {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      preferencesStore.updateSoundPreferences({ masterVolume: clampedVolume });
    },

    // Toggle category sound
    toggleCategorySound(category: SoundCategory): void {
      const enabledKey = `${category}SoundsEnabled` as keyof SoundPreferences;
      const currentPrefs = get(unifiedSoundPreferences);
      preferencesStore.updateSoundPreferences({
        [enabledKey]: !currentPrefs[enabledKey]
      });
    },

    // Set category volume
    setCategoryVolume(category: SoundCategory, volume: number): void {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      const volumeKey = `${category}Volume` as keyof SoundPreferences;
      preferencesStore.updateSoundPreferences({ [volumeKey]: clampedVolume });
    },

    // Mark sound as loaded
    markSoundLoaded(soundType: SoundType): void {
      update(state => ({
        ...state,
        loadedSounds: new Set([...state.loadedSounds, soundType])
      }));
    },

    // Track currently playing sounds
    trackPlayingSound(soundType: SoundType, source: AudioBufferSourceNode): void {
      update(state => {
        const currentSources = state.currentlyPlaying.get(soundType) || [];
        currentSources.push(source);
        state.currentlyPlaying.set(soundType, currentSources);
        
        // Clean up when sound ends
        source.addEventListener('ended', () => {
          const sources = state.currentlyPlaying.get(soundType) || [];
          const index = sources.indexOf(source);
          if (index > -1) {
            sources.splice(index, 1);
            if (sources.length === 0) {
              state.currentlyPlaying.delete(soundType);
            } else {
              state.currentlyPlaying.set(soundType, sources);
            }
          }
        });
        
        return { ...state };
      });
    },

    // Stop all sounds of a specific type
    stopSounds(soundType: SoundType): void {
      update(state => {
        const sources = state.currentlyPlaying.get(soundType);
        if (sources) {
          sources.forEach(source => {
            try {
              source.stop();
            } catch (e) {
              // Ignore errors
            }
          });
          state.currentlyPlaying.delete(soundType);
        }
        
        return { ...state };
      });
    },

    // Stop all currently playing sounds
    stopAllSounds(): void {
      update(state => {
        state.currentlyPlaying.forEach((sources) => {
          sources.forEach(source => {
            try {
              source.stop();
            } catch (e) {
              // Ignore errors
            }
          });
        });
        state.currentlyPlaying.clear();
        
        return { ...state };
      });
    },

    // Set loading state
    setLoading(isLoading: boolean): void {
      update(state => ({
        ...state,
        isLoading
      }));
    },

    // Get current state snapshot
    getSnapshot(): SoundState {
      let currentState: SoundState = initialState;
      const unsubscribe = subscribe(state => {
        currentState = state;
      });
      unsubscribe();
      return currentState;
    }
  };
}

export const soundStore = createSoundStore();

// Derived stores for easy access - now using unified preferences
export const soundPreferences = unifiedSoundPreferences;
export const isSoundSupported = derived(soundStore, $sound => $sound.isSupported);
export const isSoundLoading = derived(soundStore, $sound => $sound.isLoading);
export const isMasterSoundEnabled = derived(unifiedSoundPreferences, $prefs => $prefs.masterEnabled);

// Helper function to get effective volume for a sound category
export function getEffectiveVolume(category: SoundCategory): number {
  const prefs = get(unifiedSoundPreferences);
  
  if (!prefs.masterEnabled) return 0;
  
  const categoryEnabled = {
    spin: prefs.spinSoundsEnabled,
    win: prefs.winSoundsEnabled,
    ui: prefs.uiSoundsEnabled,
    background: prefs.backgroundEnabled
  }[category];
  
  if (!categoryEnabled) return 0;
  
  const categoryVolume = {
    spin: prefs.spinVolume,
    win: prefs.winVolume,
    ui: prefs.uiVolume,
    background: prefs.backgroundVolume
  }[category];
  
  return prefs.masterVolume * categoryVolume;
}

// Helper function to map sound types to categories
export function getSoundCategory(soundType: SoundType): SoundCategory {
  const categoryMap: Record<SoundType, SoundCategory> = {
    'spin-start': 'spin',
    'spin-loop': 'spin',
    'reel-stop': 'spin',
    'win-small': 'win',
    'win-medium': 'win',
    'win-large': 'win',
    'win-jackpot': 'win',
    'loss': 'win', // Loss is in win category as it's outcome-related
    'button-click': 'ui',
    'background-ambience': 'background',
    'deposit': 'ui',
    'balance-increase': 'ui'
  };
  
  return categoryMap[soundType];
}
