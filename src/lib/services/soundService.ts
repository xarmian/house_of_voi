import { browser } from '$app/environment';
import { soundStore, getEffectiveVolume, getSoundCategory, type SoundType } from '$lib/stores/sound';

// Sound file paths
const SOUND_PATHS: Record<SoundType, string> = {
  'spin-start': '/sounds/spin-start.mp3',
  'spin-loop': '/sounds/spin-loop.mp3',
  'reel-stop': '/sounds/reel-stop.mp3',
  'win-small': '/sounds/win-small.mp3',
  'win-medium': '/sounds/win-medium.mp3',
  'win-large': '/sounds/win-large.mp3',
  'win-jackpot': '/sounds/win-jackpot.mp3',
  'loss': '/sounds/loss.mp3',
  'button-click': '/sounds/button-click.mp3',
  'background-ambience': '/sounds/background-ambience.mp3'
};

// Audio buffer cache
const audioBuffers = new Map<SoundType, AudioBuffer>();
const loadingPromises = new Map<SoundType, Promise<AudioBuffer>>();

// Global tracking of all active looping sounds
const activeLoopingSounds = new Map<SoundType, any>();

class SoundService {
  private audioContext: AudioContext | null = null;
  private backgroundSource: AudioBufferSourceNode | null = null;
  private backgroundGainNode: GainNode | null = null;

  constructor() {
    if (browser) {
      this.init();
      // Register cleanup callback with sound store to handle master sound toggle
      soundStore.registerCleanupCallback(() => this.cleanup());
    }
  }

  async init(): Promise<void> {
    // Don't initialize AudioContext immediately - wait for user interaction
    console.log('Sound service initialized - AudioContext will be created on first user interaction');
  }

  // Initialize AudioContext on first user interaction
  private async ensureAudioContext(): Promise<boolean> {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      // Resume if suspended
      if (this.audioContext.state === 'suspended') {
        try {
          await this.audioContext.resume();
          console.log('AudioContext resumed after user interaction');
        } catch (error) {
          console.error('Failed to resume AudioContext:', error);
          return false;
        }
      }
      return true;
    }

    // Initialize for the first time
    const initialized = await soundStore.initAudioContext();
    if (initialized) {
      const state = soundStore.getSnapshot();
      this.audioContext = state.audioContext;
      console.log('AudioContext created after user interaction');
      return true;
    }
    
    return false;
  }

  // Load an audio file and return the buffer
  async loadSound(soundType: SoundType): Promise<AudioBuffer | null> {
    if (!browser) return null;
    
    // Ensure AudioContext is ready
    const contextReady = await this.ensureAudioContext();
    if (!contextReady || !this.audioContext) return null;

    // Return cached buffer if available
    if (audioBuffers.has(soundType)) {
      return audioBuffers.get(soundType)!;
    }

    // Return existing loading promise if in progress
    if (loadingPromises.has(soundType)) {
      try {
        return await loadingPromises.get(soundType)!;
      } catch (error) {
        loadingPromises.delete(soundType);
        throw error;
      }
    }

    const soundPath = SOUND_PATHS[soundType];
    
    const loadingPromise = (async (): Promise<AudioBuffer> => {
      try {
        console.log(`Loading sound: ${soundType} from ${soundPath}`);
        
        const response = await fetch(soundPath);
        if (!response.ok) {
          throw new Error(`Failed to load sound ${soundType}: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        
        // Check if the file has content
        if (arrayBuffer.byteLength === 0) {
          console.warn(`Sound file is empty: ${soundType} from ${soundPath}`);
          return null;
        }
        
        const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
        
        // Cache the buffer
        audioBuffers.set(soundType, audioBuffer);
        soundStore.markSoundLoaded(soundType);
        
        console.log(`Sound loaded successfully: ${soundType}`);
        return audioBuffer;
      } catch (error) {
        console.error(`Failed to load sound ${soundType}:`, error);
        throw error;
      } finally {
        loadingPromises.delete(soundType);
      }
    })();

    loadingPromises.set(soundType, loadingPromise);
    return loadingPromise;
  }

  // Play a sound with optional parameters
  async playSound(
    soundType: SoundType, 
    options: {
      loop?: boolean;
      volume?: number; // Override volume (0-1)
      fadeIn?: number; // Fade in duration in seconds
      delay?: number; // Delay before playing in seconds
    } = {}
  ): Promise<AudioBufferSourceNode | null> {
    if (!browser) return null;
    
    // Ensure AudioContext is ready (this will create it on first user interaction)
    const contextReady = await this.ensureAudioContext();
    if (!contextReady || !this.audioContext) return null;

    const category = getSoundCategory(soundType);
    const effectiveVolume = options.volume !== undefined 
      ? options.volume 
      : getEffectiveVolume(category);

    // Don't play if volume is 0
    if (effectiveVolume <= 0) {
      return null;
    }

    try {
      // Load the sound if not already loaded
      const audioBuffer = await this.loadSound(soundType);
      if (!audioBuffer) {
        console.warn(`Sound ${soundType} could not be loaded or is empty - skipping playback`);
        return null;
      }

      // Create audio nodes
      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();

      source.buffer = audioBuffer;
      source.loop = options.loop || false;

      // Connect nodes
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Set initial volume
      const startTime = this.audioContext.currentTime + (options.delay || 0);
      
      // Check current volume again just before playing (in case settings changed)
      const currentEffectiveVolume = options.volume !== undefined 
        ? options.volume 
        : getEffectiveVolume(category);
      
      if (currentEffectiveVolume <= 0) {
        // Volume was disabled after we started - stop immediately
        source.stop(startTime);
        return null;
      }
      
      if (options.fadeIn && options.fadeIn > 0) {
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(currentEffectiveVolume, startTime + options.fadeIn);
      } else {
        gainNode.gain.setValueAtTime(currentEffectiveVolume, startTime);
      }

      // Start playing
      source.start(startTime);

      // Track the playing sound
      soundStore.trackPlayingSound(soundType, source);

      console.log(`Playing sound: ${soundType} at volume ${effectiveVolume}`);
      return source;
    } catch (error) {
      console.error(`Failed to play sound ${soundType}:`, error);
      return null;
    }
  }

  // Play a looping sound with gapless looping
  async playLoopingSound(
    soundType: SoundType,
    options: {
      volume?: number;
      fadeIn?: number;
      fadeOut?: number; // Fade out duration when stopped
    } = {}
  ): Promise<AudioBufferSourceNode | null> {
    // Stop any existing instances of this sound using thorough cleanup
    await this.stopLoopingSound(soundType);
    
    if (!browser) return null;
    
    // Ensure AudioContext is ready
    const contextReady = await this.ensureAudioContext();
    if (!contextReady || !this.audioContext) return null;

    const category = getSoundCategory(soundType);
    const effectiveVolume = options.volume !== undefined 
      ? options.volume 
      : getEffectiveVolume(category);

    // Don't play if volume is 0
    if (effectiveVolume <= 0) {
      return null;
    }

    try {
      // Load the sound if not already loaded
      const audioBuffer = await this.loadSound(soundType);
      if (!audioBuffer) {
        console.warn(`Sound ${soundType} could not be loaded or is empty - skipping playback`);
        return null;
      }

      // Store references for proper cleanup
      const loopingData = {
        isActive: true,
        sources: [] as AudioBufferSourceNode[],
        gainNodes: [] as GainNode[],
        timeoutHandles: [] as NodeJS.Timeout[]
      };

      const duration = audioBuffer.duration;
      const loopOverlap = 0.1; // 100ms overlap to eliminate gap completely
      const startTime = this.audioContext.currentTime + (options.fadeIn || 0);
      
      // Create the initial source
      const createAndScheduleSource = (when: number, fadeIn: boolean = false) => {
        if (!loopingData.isActive || !this.audioContext) return null;
        
        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        
        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Check current volume again just before playing (in case settings changed)
        const currentEffectiveVolume = getEffectiveVolume(category);
        if (currentEffectiveVolume <= 0) {
          // Volume was disabled after we started - stop this source
          source.stop(when);
          loopingData.isActive = false;
          return null;
        }
        
        // Set volume with optional fade in
        if (fadeIn && options.fadeIn && options.fadeIn > 0) {
          gainNode.gain.setValueAtTime(0, when);
          gainNode.gain.linearRampToValueAtTime(currentEffectiveVolume, when + options.fadeIn);
        } else {
          gainNode.gain.setValueAtTime(currentEffectiveVolume, when);
        }
        
        // Store references for cleanup
        loopingData.sources.push(source);
        loopingData.gainNodes.push(gainNode);
        
        // Track ALL sources in the sound store for proper stopping
        soundStore.trackPlayingSound(soundType, source);
        
        // Start the source
        source.start(when);
        
        // Schedule the next loop before this one ends
        const nextLoopTime = when + duration - loopOverlap;
        const scheduleNextDelay = (duration - loopOverlap) * 1000 - 50; // Schedule 50ms early
        
        const timeoutHandle = setTimeout(() => {
          // Remove this timeout from tracking since it's executing
          const timeoutIndex = loopingData.timeoutHandles.indexOf(timeoutHandle);
          if (timeoutIndex > -1) {
            loopingData.timeoutHandles.splice(timeoutIndex, 1);
          }
          
          // CRITICAL: Check if still active before scheduling next source
          if (!loopingData.isActive) {
            return; // Don't schedule new source if stopped
          }
          
          // Check if sound is still enabled before continuing loop (use direct store access)
          const state = soundStore.getSnapshot();
          if (!state.preferences.masterEnabled) {
            console.log(`Stopping ${soundType} loop - master sound disabled`);
            loopingData.isActive = false;
            return; // Don't schedule new source if master sound is disabled
          }
          
          const category = getSoundCategory(soundType);
          const categoryEnabled = {
            spin: state.preferences.spinSoundsEnabled,
            win: state.preferences.winSoundsEnabled,
            ui: state.preferences.uiSoundsEnabled,
            background: state.preferences.backgroundEnabled
          }[category];
          
          if (!categoryEnabled) {
            console.log(`Stopping ${soundType} loop - category sound disabled`);
            loopingData.isActive = false;
            return; // Don't schedule new source if category is disabled
          }
          
          createAndScheduleSource(nextLoopTime);
        }, scheduleNextDelay);
        
        // Track the timeout handle for cleanup
        loopingData.timeoutHandles.push(timeoutHandle);
        
        // Clean up old sources to prevent memory leaks (keep only the last 3)
        if (loopingData.sources.length > 3) {
          const oldSource = loopingData.sources.shift();
          const oldGainNode = loopingData.gainNodes.shift();
          
          // Don't stop the source abruptly, let it finish naturally
          // The overlap ensures seamless continuation
        }
        
        return source;
      };

      // Start the first source
      const firstSource = createAndScheduleSource(startTime, true);
      
      if (!firstSource) return null;

      // Store cleanup function on the first source for external stopping
      (firstSource as any).__loopingData = loopingData;
      
      // Store in global tracking for cleanup
      activeLoopingSounds.set(soundType, loopingData);

      console.log(`Playing looping sound: ${soundType} at volume ${effectiveVolume} with gapless looping (${loopOverlap * 1000}ms overlap)`);
      return firstSource;
      
    } catch (error) {
      console.error(`Failed to play looping sound ${soundType}:`, error);
      return null;
    }
  }

  // Stop a looping sound with optional fade out
  async stopLoopingSound(
    soundType: SoundType,
    options: { fadeOut?: number } = {}
  ): Promise<void> {
    console.log(`Stopping looping sound: ${soundType}`);
    
    // First check global tracking
    const globalLoopingData = activeLoopingSounds.get(soundType);
    if (globalLoopingData) {
      console.log(`Found global looping data for ${soundType}, stopping ${globalLoopingData.sources.length} sources and ${globalLoopingData.timeoutHandles.length} pending timeouts`);
      
      // Mark as inactive to stop scheduling new sources
      globalLoopingData.isActive = false;
      
      // CRITICAL: Clear all pending timeouts to prevent new sources from being scheduled
      globalLoopingData.timeoutHandles.forEach((timeoutHandle: NodeJS.Timeout) => {
        clearTimeout(timeoutHandle);
      });
      globalLoopingData.timeoutHandles.length = 0;
      
      const fadeOutTime = options.fadeOut || 0;
      const currentTime = this.audioContext?.currentTime || 0;
      
      // Stop all active sources in the loop
      globalLoopingData.sources.forEach((source: AudioBufferSourceNode, index: number) => {
        try {
          if (fadeOutTime > 0 && globalLoopingData.gainNodes[index]) {
            const gainNode = globalLoopingData.gainNodes[index];
            gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
            gainNode.gain.linearRampToValueAtTime(0, currentTime + fadeOutTime);
            source.stop(currentTime + fadeOutTime);
          } else {
            source.stop();
          }
        } catch (e) {
          // Ignore errors from already stopped sources
        }
      });
      
      // Clear the arrays and remove from global tracking
      globalLoopingData.sources.length = 0;
      globalLoopingData.gainNodes.length = 0;
      activeLoopingSounds.delete(soundType);
    }
    
    // Also check sound store tracking (fallback)
    if (!this.audioContext) return;

    const state = soundStore.getSnapshot();
    const sources = state.currentlyPlaying.get(soundType);
    
    if (sources && sources.length > 0) {
      console.log(`Found ${sources.length} sources in sound store for ${soundType}`);
      
      const fadeOutTime = options.fadeOut || 0;
      const currentTime = this.audioContext.currentTime;
      
      sources.forEach(source => {
        try {
          if (fadeOutTime > 0) {
            source.stop(currentTime + fadeOutTime);
          } else {
            source.stop();
          }
        } catch (e) {
          // Ignore errors from already stopped sources
        }
      });
      
      soundStore.stopSounds(soundType);
    }
    
    console.log(`Finished stopping looping sound: ${soundType}`);
  }
  
  // Verify that a sound type is completely stopped
  verifySoundStopped(soundType: SoundType): boolean {
    // Check global tracking
    const globalLoopingData = activeLoopingSounds.get(soundType);
    if (globalLoopingData && (globalLoopingData.sources.length > 0 || globalLoopingData.timeoutHandles.length > 0)) {
      console.warn(`Sound ${soundType} still has active sources or timeouts`);
      return false;
    }
    
    // Check sound store
    const state = soundStore.getSnapshot();
    const sources = state.currentlyPlaying.get(soundType);
    if (sources && sources.length > 0) {
      console.warn(`Sound ${soundType} still has sources in sound store`);
      return false;
    }
    
    console.log(`Sound ${soundType} is fully stopped`);
    return true;
  }
  
  // Force stop with verification - for critical situations like replays
  async forceStopWithVerification(soundType: SoundType, maxAttempts: number = 3): Promise<boolean> {
    console.log(`Force stopping ${soundType} with verification (max ${maxAttempts} attempts)`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`Attempt ${attempt} to stop ${soundType}`);
      
      // Try to stop
      await this.stopLoopingSound(soundType);
      
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify it's stopped
      if (this.verifySoundStopped(soundType)) {
        console.log(`${soundType} successfully stopped on attempt ${attempt}`);
        return true;
      }
      
      // If not stopped, try more aggressive cleanup
      console.warn(`${soundType} not stopped on attempt ${attempt}, trying aggressive cleanup`);
      this.cleanup();
      
      // Wait longer before next attempt
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.error(`Failed to stop ${soundType} after ${maxAttempts} attempts`);
    return false;
  }

  // Play background ambience
  async playBackgroundAmbience(): Promise<void> {
    if (this.backgroundSource) {
      // Already playing
      return;
    }

    const source = await this.playLoopingSound('background-ambience', {
      fadeIn: 2.0 // 2 second fade in
    });

    if (source) {
      this.backgroundSource = source;
      this.backgroundGainNode = source.context.createGain();
      
      // Set up cleanup when it ends
      source.addEventListener('ended', () => {
        this.backgroundSource = null;
        this.backgroundGainNode = null;
      });
    }
  }

  // Stop background ambience
  async stopBackgroundAmbience(): Promise<void> {
    if (this.backgroundSource) {
      await this.stopLoopingSound('background-ambience', { fadeOut: 1.0 });
      this.backgroundSource = null;
      this.backgroundGainNode = null;
    }
  }

  // Play win sound based on win level
  async playWinSound(winLevel: 'small' | 'medium' | 'large' | 'jackpot'): Promise<void> {
    const soundType: SoundType = `win-${winLevel}` as SoundType;
    await this.playSound(soundType);
  }

  // Play multiple sounds in sequence with timing
  async playSequence(
    sounds: Array<{
      soundType: SoundType;
      delay: number; // Delay from start of sequence
      options?: Parameters<typeof this.playSound>[1];
    }>
  ): Promise<void> {
    const promises = sounds.map(({ soundType, delay, options }) => 
      this.playSound(soundType, { ...options, delay })
    );
    
    await Promise.all(promises);
  }

  // Preload commonly used sounds
  async preloadEssentialSounds(): Promise<void> {
    soundStore.setLoading(true);
    
    const essentialSounds: SoundType[] = [
      'spin-start',
      'reel-stop',
      'win-small',
      'win-medium',
      'button-click'
    ];

    const loadPromises = essentialSounds.map(async sound => {
      try {
        const result = await this.loadSound(sound);
        return result;
      } catch (error) {
        console.warn(`Failed to preload ${sound}:`, error);
        return null;
      }
    });

    const results = await Promise.all(loadPromises);
    const successCount = results.filter(result => result !== null).length;
    
    soundStore.setLoading(false);
    
    console.log(`Essential sounds preloaded: ${successCount}/${essentialSounds.length} successful`);
  }

  // Preload all sounds (for better UX)
  async preloadAllSounds(): Promise<void> {
    soundStore.setLoading(true);
    
    const allSounds = Object.keys(SOUND_PATHS) as SoundType[];
    const loadPromises = allSounds.map(async sound => {
      try {
        const result = await this.loadSound(sound);
        return result;
      } catch (error) {
        console.warn(`Failed to preload ${sound}:`, error);
        return null;
      }
    });

    const results = await Promise.all(loadPromises);
    const successCount = results.filter(result => result !== null).length;
    
    soundStore.setLoading(false);
    
    console.log(`All sounds preloaded: ${successCount}/${allSounds.length} successful`);
  }

  // Get loading progress
  getLoadingProgress(): { loaded: number; total: number; percentage: number } {
    const state = soundStore.getSnapshot();
    const totalSounds = Object.keys(SOUND_PATHS).length;
    const loadedSounds = state.loadedSounds.size;
    
    return {
      loaded: loadedSounds,
      total: totalSounds,
      percentage: totalSounds > 0 ? (loadedSounds / totalSounds) * 100 : 0
    };
  }

  // Clean up resources
  cleanup(): void {
    console.log('Starting sound service cleanup...');
    
    // Stop all sounds tracked by the store
    soundStore.stopAllSounds();
    
    // Force stop all active looping sounds using global tracking
    activeLoopingSounds.forEach((loopingData, soundType) => {
      console.log(`Force stopping looping sound: ${soundType} with ${loopingData.sources.length} sources and ${loopingData.timeoutHandles?.length || 0} timeouts`);
      
      loopingData.isActive = false;
      
      // Clear all pending timeouts
      if (loopingData.timeoutHandles) {
        loopingData.timeoutHandles.forEach((timeoutHandle: NodeJS.Timeout) => {
          clearTimeout(timeoutHandle);
        });
        loopingData.timeoutHandles.length = 0;
      }
      
      // Stop all sources
      loopingData.sources.forEach((source: AudioBufferSourceNode) => {
        try {
          source.stop();
        } catch (e) {
          // Ignore errors
        }
      });
      
      loopingData.sources.length = 0;
      loopingData.gainNodes.length = 0;
    });
    
    // Clear global tracking
    activeLoopingSounds.clear();
    
    // Stop background specifically
    if (this.backgroundSource) {
      try {
        this.backgroundSource.stop();
      } catch (e) {
        // Ignore errors
      }
      this.backgroundSource = null;
      this.backgroundGainNode = null;
    }
    
    // Clear caches
    audioBuffers.clear();
    loadingPromises.clear();
    
    console.log('Sound service cleanup completed');
  }
}

// Export singleton instance
export const soundService = new SoundService();

// Export convenience functions
export async function playSound(soundType: SoundType, options?: Parameters<typeof soundService.playSound>[1]) {
  return soundService.playSound(soundType, options);
}

export async function playWinSound(winLevel: 'small' | 'medium' | 'large' | 'jackpot') {
  return soundService.playWinSound(winLevel);
}

export async function playButtonClick() {
  return soundService.playSound('button-click');
}

export async function playSpinStart() {
  return soundService.playSound('spin-start');
}

export async function playReelStop() {
  return soundService.playSound('reel-stop');
}

export async function playLoss() {
  return soundService.playSound('loss');
}

// Enhanced debugging and cleanup functions
export async function forceStopLoopingSound(soundType: SoundType) {
  return soundService.forceStopWithVerification(soundType);
}

export function verifySoundStopped(soundType: SoundType) {
  return soundService.verifySoundStopped(soundType);
}

export function debugAudioState() {
  console.log('=== AUDIO DEBUG STATE ===');
  console.log('Active looping sounds:', Array.from(activeLoopingSounds.keys()));
  
  activeLoopingSounds.forEach((data, soundType) => {
    console.log(`${soundType}:`, {
      isActive: data.isActive,
      sources: data.sources.length,
      timeouts: data.timeoutHandles?.length || 0
    });
  });
  
  const storeState = soundStore.getSnapshot();
  console.log('Sound store playing:', Array.from(storeState.currentlyPlaying.keys()));
  storeState.currentlyPlaying.forEach((sources, soundType) => {
    console.log(`Store ${soundType}: ${sources.length} sources`);
  });
  console.log('=== END AUDIO DEBUG ===');
}