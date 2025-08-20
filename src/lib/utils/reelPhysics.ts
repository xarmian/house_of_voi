import type { ReelAnimationState, ReelPhysicsConfig } from '$lib/types/animations';

// Default physics configuration for realistic slot machine feel
export const DEFAULT_REEL_PHYSICS: ReelPhysicsConfig = {
  acceleration: 2500,        // px/s²
  maxVelocity: [2500, 3000, 3500, 2800, 3200], // px/s - varied speeds for each reel
  deceleration: 1800,       // px/s²
  friction: 0.95,           // velocity dampening per frame
  bounceAmplitude: 8,       // px
  bounceFrequency: 4,       // Hz
  bounceDamping: 0.7,       // exponential decay
  spinPattern: 'alternating' // odd reels up, even reels down
};

// Symbol height in pixels (used for position calculations)
const SYMBOL_HEIGHT = 100;
const VISIBLE_SYMBOLS = 3;
const TOTAL_SYMBOLS = 30; // Extended reel for seamless scrolling (increased buffer)

export class ReelPhysicsEngine {
  private config: ReelPhysicsConfig;
  private animationFrameId: number | null = null;
  private lastFrameTime = 0;
  private onUpdate: (states: ReelAnimationState[]) => void;
  private reelStates: ReelAnimationState[] = [];
  private isShutdown = false; // Flag to prevent execution after shutdown
  
  constructor(
    config: ReelPhysicsConfig = DEFAULT_REEL_PHYSICS,
    onUpdate: (states: ReelAnimationState[]) => void
  ) {
    this.config = config;
    this.onUpdate = onUpdate;
  }

  // Initialize reel states for 5 reels
  initializeReels(): ReelAnimationState[] {
    this.reelStates = Array(5).fill(null).map((_, index) => ({
      isSpinning: false,
      spinSpeed: 0,
      spinDirection: this.getSpinDirection(index),
      blur: 0,
      offset: 0,
      easingPhase: 'constant' as const,
      velocity: 0,
      acceleration: 0,
      targetPosition: 0,
      currentPosition: 0,
      maxVelocity: Array.isArray(this.config.maxVelocity) ? this.config.maxVelocity[index] : this.config.maxVelocity,
      friction: this.config.friction
    }));
    return this.reelStates;
  }

  // Get spin direction based on reel index and pattern
  private getSpinDirection(reelIndex: number): 'up' | 'down' {
    switch (this.config.spinPattern) {
      case 'alternating':
        return reelIndex % 2 === 0 ? 'down' : 'up';
      case 'random':
        return Math.random() > 0.5 ? 'down' : 'up';
      case 'same':
      default:
        return 'down';
    }
  }

  // Start spinning animation for all reels with staggered timing
  startSpin(targetPositions: number[], delays?: number[]) {
    // Prevent multiple starts if already running
    if (this.animationFrameId) {
      this.stopAllReels();
    }
    
    // Reset shutdown flag to allow new animation
    this.isShutdown = false;
    
    const defaultDelays = [0, 100, 200, 300, 400]; // Cascade effect
    const reelDelays = delays || defaultDelays;

    // Start all reels immediately for smooth animation
    this.reelStates.forEach((state, index) => {
      this.startReelSpin(index, targetPositions[index]);
    });

    // Start animation loop
    this.lastFrameTime = performance.now();
    this.animate();
  }

  // Start individual reel spin
  private startReelSpin(reelIndex: number, targetPosition: number) {
    const state = this.reelStates[reelIndex];
    state.isSpinning = true;
    state.easingPhase = 'acceleration';
    state.acceleration = this.config.acceleration;
    state.targetPosition = targetPosition;
    state.velocity = 0; // Start from rest
    // Reset current position to create continuous spin
    state.currentPosition = state.currentPosition % (SYMBOL_HEIGHT * TOTAL_SYMBOLS);
  }

  // Stop all reels completely
  stopAllReels() {
    // Set shutdown flag to prevent any pending callbacks
    this.isShutdown = true;
    
    this.reelStates.forEach(state => {
      state.isSpinning = false;
      state.velocity = 0;
      state.acceleration = 0;
      state.blur = 0;
      state.easingPhase = 'constant';
    });
    
    // Cancel animation frame and prevent any further callbacks
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // Main animation loop
  private animate = () => {
    // SHUTDOWN GUARD: Prevent execution after shutdown
    if (this.isShutdown) {
      this.animationFrameId = null;
      return;
    }
    
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 1000; // Convert to seconds
    
    // Skip frame if deltaTime is too small or too large (prevents issues)
    if (deltaTime < 0.00001 || deltaTime > 0.1) {
      this.lastFrameTime = currentTime;
      // Check shutdown again before scheduling next frame
      if (!this.isShutdown) {
        this.animationFrameId = requestAnimationFrame(this.animate);
      }
      return;
    }
    
    this.lastFrameTime = currentTime;

    let anyReelSpinning = false;
    let statesChanged = false;

    this.reelStates.forEach((state, index) => {
      if (state.isSpinning) {
        anyReelSpinning = true;
        const prevPosition = state.currentPosition;
        this.updateReelPhysics(state, deltaTime);
        // Only mark as changed if position actually changed (increased threshold to reduce updates)
        if (Math.abs(state.currentPosition - prevPosition) > 0.5) {
          statesChanged = true;
        }
      }
    });
    
    // Update callback when states change (but not if shutdown)
    if (statesChanged && !this.isShutdown) {
      this.onUpdate([...this.reelStates]);
    }

    // Continue animation if any reel is still spinning and not shutdown
    if (anyReelSpinning && !this.isShutdown) {
      this.animationFrameId = requestAnimationFrame(this.animate);
    } else {
      this.animationFrameId = null;
    }
  };

  // Update physics for a single reel
  private updateReelPhysics(state: ReelAnimationState, deltaTime: number) {
    const direction = state.spinDirection === 'up' ? -1 : 1;

    switch (state.easingPhase) {
      case 'acceleration':
        // Accelerate to max velocity
        state.velocity += state.acceleration * deltaTime * direction;
        
        // Check if reached max velocity
        if (Math.abs(state.velocity) >= state.maxVelocity) {
          state.velocity = state.maxVelocity * direction;
          state.easingPhase = 'constant';
          state.acceleration = 0;
        }
        break;

      case 'constant':
        // Maintain constant velocity
        state.velocity = state.maxVelocity * direction;
        
        // Calculate distance to target
        const distanceToTarget = Math.abs(state.targetPosition - state.currentPosition);
        const stoppingDistance = (state.velocity * state.velocity) / (2 * this.config.deceleration);
        
        // Start deceleration when close to target
        if (distanceToTarget <= stoppingDistance + SYMBOL_HEIGHT * 2) {
          state.easingPhase = 'deceleration';
          state.acceleration = -this.config.deceleration * direction;
        }
        break;

      case 'deceleration':
        // Decelerate towards target
        state.velocity += state.acceleration * deltaTime * direction;
        
        // Apply friction for more realistic slowdown
        state.velocity *= state.friction;
        
        // Check if close enough to target to start settling
        const nearTarget = Math.abs(state.targetPosition - state.currentPosition) < SYMBOL_HEIGHT / 2;
        const slowEnough = Math.abs(state.velocity) < 50;
        
        if (nearTarget && slowEnough) {
          state.easingPhase = 'settling';
          state.velocity = 0;
        }
        break;

      case 'settling':
        // Bounce/settle animation at final position
        const settleTime = performance.now() / 1000;
        const bounce = this.calculateBounce(settleTime);
        
        // Snap to final position with bounce
        state.currentPosition = state.targetPosition + bounce;
        
        // End animation when bounce is minimal
        if (Math.abs(bounce) < 0.1) {
          state.currentPosition = state.targetPosition;
          state.isSpinning = false;
          state.blur = 0;
          state.offset = 0;
        }
        break;
    }

    // Update position based on velocity
    if (state.easingPhase !== 'settling') {
      state.currentPosition += state.velocity * deltaTime;
      
      // Wrap position for infinite scrolling with buffer consideration
      const bufferSymbols = 5; // Match buffer size from ReelGrid.svelte
      const wrapLowerBound = SYMBOL_HEIGHT * bufferSymbols;
      const wrapUpperBound = SYMBOL_HEIGHT * (TOTAL_SYMBOLS - bufferSymbols);
      
      if (state.currentPosition < wrapLowerBound) {
        state.currentPosition += SYMBOL_HEIGHT * (TOTAL_SYMBOLS - bufferSymbols * 2);
      } else if (state.currentPosition >= wrapUpperBound) {
        state.currentPosition -= SYMBOL_HEIGHT * (TOTAL_SYMBOLS - bufferSymbols * 2);
      }
    }

    // Update visual properties
    state.offset = state.currentPosition % SYMBOL_HEIGHT;
    state.spinSpeed = Math.abs(state.velocity);
    
    // Dynamic blur based on velocity
    const blurIntensity = Math.min(Math.abs(state.velocity) / 500, 1);
    state.blur = blurIntensity * 4; // Max 4px blur
  }

  // Calculate bounce effect for settling phase
  private calculateBounce(time: number): number {
    const amplitude = this.config.bounceAmplitude;
    const frequency = this.config.bounceFrequency;
    const damping = this.config.bounceDamping;
    
    // Damped harmonic oscillation
    return amplitude * Math.exp(-damping * time) * Math.sin(2 * Math.PI * frequency * time);
  }

  // Get current reel states
  getStates(): ReelAnimationState[] {
    return [...this.reelStates];
  }

  // Update configuration
  updateConfig(config: Partial<ReelPhysicsConfig>) {
    this.config = { ...this.config, ...config };
    
    // Update max velocity for all reels
    if (config.maxVelocity !== undefined) {
      this.reelStates.forEach((state, index) => {
        state.maxVelocity = Array.isArray(config.maxVelocity) ? config.maxVelocity[index] : config.maxVelocity!;
      });
    }
  }
}

// Utility function to calculate symbol positions for a reel
export function calculateSymbolPositions(
  currentPosition: number,
  symbolCount: number = VISIBLE_SYMBOLS
): number[] {
  const positions: number[] = [];
  const basePosition = Math.floor(currentPosition / SYMBOL_HEIGHT) * SYMBOL_HEIGHT;
  
  for (let i = 0; i < symbolCount; i++) {
    positions.push((basePosition + i * SYMBOL_HEIGHT) % (SYMBOL_HEIGHT * TOTAL_SYMBOLS));
  }
  
  return positions;
}

// Easing functions for smooth animations
export const reelEasing = {
  // Smooth acceleration
  easeInQuad: (t: number) => t * t,
  
  // Smooth deceleration  
  easeOutQuad: (t: number) => t * (2 - t),
  
  // Smooth acceleration and deceleration
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  
  // Bounce effect for settling
  easeOutBounce: (t: number) => {
    if (t < 1 / 2.75) {
      return 7.5625 * t * t;
    } else if (t < 2 / 2.75) {
      return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    } else if (t < 2.5 / 2.75) {
      return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    } else {
      return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
    }
  }
};