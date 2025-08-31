import { writable, derived, get } from 'svelte/store';
import type { 
  AnimationPreferences, 
  LoadingState, 
  ReelAnimationState, 
  SpinSequence,
  WinAnimation,
  CelebrationEffect 
} from '$lib/types/animations';
import { detectDeviceCapabilities, FrameRateMonitor } from '$lib/utils/animations';
import { preferencesStore, animationPreferences as unifiedAnimationPreferences } from './preferences';

// Global animation preferences - now using unified preferences
function createAnimationPreferences() {
  const { subscribe } = unifiedAnimationPreferences;

  return {
    subscribe,
    update: (prefs: Partial<AnimationPreferences>) => {
      preferencesStore.updateAnimationPreferences(prefs);
    },
    toggleReducedMotion: () => {
      const current = get(unifiedAnimationPreferences);
      preferencesStore.updateAnimationPreferences({ reducedMotion: !current.reducedMotion });
    },
    toggleHaptic: () => {
      const current = get(unifiedAnimationPreferences);
      preferencesStore.updateAnimationPreferences({ hapticEnabled: !current.hapticEnabled });
    },
    optimizeForBattery: () => {
      preferencesStore.updateAnimationPreferences({
        batteryOptimized: true,
        highPerformance: false,
        particlesEnabled: false
      });
    },
    optimizeForPerformance: () => {
      preferencesStore.updateAnimationPreferences({
        batteryOptimized: false,
        highPerformance: true,
        particlesEnabled: true
      });
    }
  };
}

// Reel animation states for each of the 5 reels
function createReelAnimationStore() {
  const initialState: ReelAnimationState[] = Array(5).fill(null).map((_, index) => ({
    isSpinning: false,
    spinSpeed: 0,
    spinDirection: index % 2 === 0 ? 'down' : 'up', // Alternating directions
    blur: 0,
    offset: 0,
    easingPhase: 'constant' as const,
    // Physics properties
    velocity: 0,
    acceleration: 0,
    targetPosition: 0,
    currentPosition: 0,
    maxVelocity: 3000,
    friction: 0.95
  }));

  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,
    
    // Start spinning a specific reel
    startReelSpin: (reelIndex: number, config: Partial<ReelAnimationState> = {}) => {
      update(reels => {
        const newReels = [...reels];
        newReels[reelIndex] = {
          ...newReels[reelIndex],
          isSpinning: true,
          spinSpeed: 100,
          blur: 3,
          easingPhase: 'acceleration',
          acceleration: 2500, // Default acceleration
          ...config
        };
        return newReels;
      });
    },

    // Update reel animation state
    updateReel: (reelIndex: number, state: Partial<ReelAnimationState>) => {
      update(reels => {
        const newReels = [...reels];
        newReels[reelIndex] = { ...newReels[reelIndex], ...state };
        return newReels;
      });
    },

    // Update all reels at once (for physics engine)
    updateAllReels: (newStates: ReelAnimationState[]) => {
      set(newStates);
    },

    // Stop spinning a specific reel
    stopReelSpin: (reelIndex: number) => {
      update(reels => {
        const newReels = [...reels];
        newReels[reelIndex] = {
          ...newReels[reelIndex],
          isSpinning: false,
          spinSpeed: 0,
          blur: 0,
          offset: 0,
          velocity: 0,
          acceleration: 0,
          easingPhase: 'constant'
        };
        return newReels;
      });
    },

    // Stop all reels
    stopAllReels: () => {
      update(reels => reels.map((reel, index) => ({
        ...initialState[index],
        currentPosition: reel.currentPosition, // Preserve position
        targetPosition: reel.targetPosition
      })));
    },

    // Start sequence with staggered timing
    startSpinSequence: (sequences: SpinSequence[]) => {
      sequences.forEach(sequence => {
        setTimeout(() => {
          update(reels => {
            const newReels = [...reels];
            newReels[sequence.reelIndex] = {
              ...newReels[sequence.reelIndex],
              isSpinning: true,
              spinSpeed: sequence.physics.maxSpeed,
              maxVelocity: sequence.physics.maxSpeed,
              acceleration: sequence.physics.acceleration,
              blur: 3,
              easingPhase: 'acceleration'
            };
            return newReels;
          });
        }, sequence.startDelay);
      });
    },

    // Get current state snapshot
    getSnapshot: () => {
      let currentState: ReelAnimationState[] = [];
      const unsubscribe = subscribe(state => {
        currentState = [...state];
      });
      unsubscribe();
      return currentState;
    }
  };
}

// Loading states for different operations
function createLoadingStore() {
  const { subscribe, set, update } = writable<LoadingState[]>([]);

  return {
    subscribe,
    
    // Add a new loading state
    addLoading: (loading: LoadingState) => {
      update(states => [...states, loading]);
    },

    // Update loading progress
    updateProgress: (type: LoadingState['type'], progress: number, message?: string) => {
      update(states => states.map(state => 
        state.type === type 
          ? { ...state, progress, message: message || state.message }
          : state
      ));
    },

    // Remove loading state
    removeLoading: (type: LoadingState['type']) => {
      update(states => states.filter(state => state.type !== type));
    },

    // Clear all loading states
    clearAll: () => {
      set([]);
    }
  };
}

// Win animation queue
function createWinAnimationStore() {
  const { subscribe, set, update } = writable<WinAnimation[]>([]);

  return {
    subscribe,
    
    // Queue a win animation
    queueWinAnimation: (animation: WinAnimation) => {
      update(queue => [...queue, animation]);
    },

    // Process next animation in queue
    processNext: () => {
      update(queue => queue.slice(1));
    },

    // Clear all queued animations
    clearQueue: () => {
      set([]);
    }
  };
}

// Performance monitoring
function createPerformanceStore() {
  const frameMonitor = new FrameRateMonitor();
  
  const { subscribe, set, update } = writable({
    fps: 60,
    isGoodPerformance: true,
    frameDrops: 0,
    lastFrameTime: performance.now()
  });

  let rafId: number | null = null;
  let running = false;

  const updatePerformance = () => {
    const fps = frameMonitor.update();
    const isGood = frameMonitor.isPerformanceGood();
    
    update(state => ({
      ...state,
      fps: Math.round(fps),
      isGoodPerformance: isGood,
      frameDrops: fps < 30 ? state.frameDrops + 1 : 0,
      lastFrameTime: performance.now()
    }));

    // Schedule next frame only if still running
    if (running) {
      rafId = requestAnimationFrame(updatePerformance);
    }
  };

  return {
    subscribe,
    
    // Start monitoring
    startMonitoring: () => {
      if (running) return; // idempotent
      running = true;
      rafId = requestAnimationFrame(updatePerformance);
    },

    // Stop monitoring
    stopMonitoring: () => {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },

    // Get current FPS
    getCurrentFPS: () => frameMonitor.getAverageFPS()
  };
}

// Create store instances
export const animationPreferences = createAnimationPreferences();
export const reelAnimations = createReelAnimationStore();
export const loadingStates = createLoadingStore();
export const winAnimations = createWinAnimationStore();
export const performanceMonitor = createPerformanceStore();

// Derived stores for easy access
export const isAnyReelSpinning = derived(
  reelAnimations,
  $reels => $reels.some(reel => reel.isSpinning)
);

export const isLoading = derived(
  loadingStates,
  $states => $states.length > 0
);

export const hasQueuedWinAnimations = derived(
  winAnimations,
  $queue => $queue.length > 0
);

export const shouldReduceAnimations = derived(
  [animationPreferences, performanceMonitor],
  ([$prefs, $perf]) => $prefs.reducedMotion || !$perf.isGoodPerformance
);

// Global animation control functions
export function pauseAllAnimations() {
  reelAnimations.stopAllReels();
  winAnimations.clearQueue();
  loadingStates.clearAll();
}

export function resumeAnimations() {
  // Resume any paused animations based on game state
  // This would be called when coming back from background or when performance improves
}

// Auto-adjust animations based on performance
export function startPerformanceOptimization() {
  performanceMonitor.startMonitoring();
  
  // Subscribe to performance changes
  performanceMonitor.subscribe(performance => {
    const currentPrefs = get(unifiedAnimationPreferences);
    
    if (performance.frameDrops > 10) {
      // Performance is degrading, reduce animation complexity
      preferencesStore.updateAnimationPreferences({
        batteryOptimized: true,
        particlesEnabled: false,
        highPerformance: false
      });
    } else if (performance.isGoodPerformance && performance.frameDrops === 0) {
      // Performance is good, we can increase animation quality
      const capabilities = detectDeviceCapabilities();
      if (!currentPrefs.reducedMotion && !capabilities.supportsReducedMotion) {
        preferencesStore.updateAnimationPreferences({
          batteryOptimized: false,
          particlesEnabled: true,
          highPerformance: capabilities.supportsWebGL
        });
      }
    }
  });
}

// Cleanup function for when component unmounts
export function cleanupAnimations() {
  performanceMonitor.stopMonitoring();
  pauseAllAnimations();
}
