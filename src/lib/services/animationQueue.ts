// Animation Queue Service - Sequential spin animation management
// Ensures each spin gets its full animation time without interruption

import { writable, get } from 'svelte/store';
import type { QueuedSpin } from '$lib/types/queue';

export interface AnimationQueueItem {
  spin: QueuedSpin;
  outcome: string[][];
  winnings: number;
  betAmount: number;
  addedAt: number;
  status: 'queued' | 'animating' | 'completed';
}

interface AnimationQueueState {
  currentAnimation: AnimationQueueItem | null;
  queuedAnimations: AnimationQueueItem[];
  isProcessing: boolean;
}

function createAnimationQueue() {
  const { subscribe, update } = writable<AnimationQueueState>({
    currentAnimation: null,
    queuedAnimations: [],
    isProcessing: false
  });

  let animationTimeout: NodeJS.Timeout | null = null;

  const service = {
    subscribe,

    // Add a completed spin to the animation queue
    addSpinAnimation(spin: QueuedSpin, outcome: string[][], winnings: number, betAmount: number) {
      const queueItem: AnimationQueueItem = {
        spin,
        outcome,
        winnings,
        betAmount,
        addedAt: Date.now(),
        status: 'queued'
      };

      console.log(`📺 AnimationQueue: Adding spin ${spin.id.slice(-8)} to animation queue`);

      update(state => {
        // Check if this spin is already in the queue or currently animating
        const existingInQueue = state.queuedAnimations.find(item => item.spin.id === spin.id);
        const isCurrentlyAnimating = state.currentAnimation?.spin.id === spin.id;

        if (existingInQueue || isCurrentlyAnimating) {
          console.log(`⚠️ AnimationQueue: Spin ${spin.id.slice(-8)} already in queue, skipping`);
          return state;
        }

        const newState = {
          ...state,
          queuedAnimations: [...state.queuedAnimations, queueItem]
        };

        // Start processing if not already running
        if (!newState.isProcessing && !newState.currentAnimation) {
          setTimeout(() => service.processNext(), 0);
        }

        return newState;
      });
    },

    // Process the next animation in the queue
    async processNext() {
      const state = get({ subscribe });
      
      // If already animating or no queued items, return
      if (state.currentAnimation || state.queuedAnimations.length === 0) {
        return;
      }

      const nextItem = state.queuedAnimations[0];
      console.log(`🎬 AnimationQueue: Starting animation for spin ${nextItem.spin.id.slice(-8)}`);

      // Move item from queue to current animation
      update(currentState => ({
        ...currentState,
        currentAnimation: { ...nextItem, status: 'animating' },
        queuedAnimations: currentState.queuedAnimations.slice(1),
        isProcessing: true
      }));

      // Dispatch animation start event
      service.dispatchAnimationEvent('start', nextItem);

      // Schedule animation completion after 2.4 seconds (1.6s reel + 0.8s outcome)
      animationTimeout = setTimeout(() => {
        service.completeCurrentAnimation();
      }, 2400);
    },

    // Complete the current animation and process the next
    completeCurrentAnimation() {
      const state = get({ subscribe });
      
      if (!state.currentAnimation) {
        return;
      }

      console.log(`✅ AnimationQueue: Completed animation for spin ${state.currentAnimation.spin.id.slice(-8)}`);
      
      // Dispatch animation complete event
      service.dispatchAnimationEvent('complete', state.currentAnimation);

      // Clear current animation and process next
      update(currentState => ({
        ...currentState,
        currentAnimation: null,
        isProcessing: currentState.queuedAnimations.length > 0
      }));

      // Process next animation if queue is not empty
      if (state.queuedAnimations.length > 0) {
        setTimeout(() => service.processNext(), 100); // Small delay between animations
      } else {
        update(currentState => ({
          ...currentState,
          isProcessing: false
        }));
      }
    },

    // Get the currently animating spin ID (for UI state management)
    getCurrentAnimationSpinId(): string | null {
      const state = get({ subscribe });
      return state.currentAnimation?.spin.id || null;
    },

    // Check if a specific spin is in the animation queue
    isSpinInQueue(spinId: string): boolean {
      const state = get({ subscribe });
      const inQueue = state.queuedAnimations.some(item => item.spin.id === spinId);
      const isCurrent = state.currentAnimation?.spin.id === spinId;
      return inQueue || isCurrent;
    },

    // Clear all animations (for cleanup)
    clearAll() {
      if (animationTimeout) {
        clearTimeout(animationTimeout);
        animationTimeout = null;
      }

      update(() => ({
        currentAnimation: null,
        queuedAnimations: [],
        isProcessing: false
      }));

      console.log('🧹 AnimationQueue: Cleared all animations');
    },

    // Dispatch custom events for animation lifecycle
    dispatchAnimationEvent(type: 'start' | 'complete', item: AnimationQueueItem) {
      const event = new CustomEvent(`animation-queue-${type}`, {
        detail: {
          spin: item.spin,
          outcome: item.outcome,
          winnings: item.winnings,
          betAmount: item.betAmount
        }
      });
      document.dispatchEvent(event);
    },

    // Get queue status for debugging
    getQueueStatus() {
      const state = get({ subscribe });
      return {
        currentAnimation: state.currentAnimation?.spin.id || null,
        queueLength: state.queuedAnimations.length,
        isProcessing: state.isProcessing,
        nextSpinId: state.queuedAnimations[0]?.spin.id || null
      };
    }
  };

  return service;
}

// Singleton instance
export const animationQueue = createAnimationQueue();