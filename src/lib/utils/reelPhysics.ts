import type { ReelAnimationState, ReelPhysicsConfig } from '$lib/types/animations';

// Default physics configuration for realistic slot machine feel
export const DEFAULT_REEL_PHYSICS: ReelPhysicsConfig = {
  acceleration: 1250,        // px/s² (reduced by half)
  maxVelocity: [1250, 1500, 1750, 1400, 1600], // px/s - varied speeds for each reel (reduced by half)
  deceleration: 900,        // px/s² (reduced by half)
  friction: 0.95,           // velocity dampening per frame
  bounceAmplitude: 8,       // px
  bounceFrequency: 4,       // Hz
  bounceDamping: 0.7,       // exponential decay
  spinPattern: 'alternating' // odd reels up, even reels down
};

// Symbol height in pixels (used for position calculations)
const SYMBOL_HEIGHT = 100;
const VISIBLE_SYMBOLS = 3;
const TOTAL_SYMBOLS = 100; // Match contract reel length - this was the issue!

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
    
    // CRITICAL FIX: Reset spin direction for each new spin to prevent direction/velocity mismatches
    state.spinDirection = this.getSpinDirection(reelIndex);
    
    // Reset current position to create continuous spin
    state.currentPosition = state.currentPosition % (SYMBOL_HEIGHT * TOTAL_SYMBOLS);
  }

  // Quick deceleration to specific target positions (outcome)
  startQuickDeceleration(targetPositions: number[]) {
    console.log('🎯 Physics: Starting deceleration to targets:', targetPositions);
    
    // Don't shutdown - keep animation running but start decelerating to targets
    this.reelStates.forEach((state, index) => {
      if (state.isSpinning && index < targetPositions.length) {
        const targetPos = targetPositions[index];
        console.log(`🎯 Reel ${index}: Current=${state.currentPosition.toFixed(0)}px → Target=${targetPos}px (distance=${Math.abs(targetPos - state.currentPosition).toFixed(0)}px)`);
        
        state.easingPhase = 'outcome_deceleration';
        state.targetPosition = targetPos;
        
        // Calculate initial deceleration based on distance to target
        const distanceToTarget = Math.abs(state.targetPosition - state.currentPosition);
        const direction = state.spinDirection === 'up' ? -1 : 1;
        
        // Start with aggressive deceleration, will be adjusted dynamically
        state.acceleration = -this.config.deceleration * 2 * direction;
      }
    });
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
        // Maintain constant velocity for continuous spinning
        state.velocity = state.maxVelocity * direction;
        
        // NOTE: No automatic deceleration - reels spin continuously until stopAllReels() is called
        // This prevents premature stopping and allows for indefinite spinning while waiting for outcomes
        break;

      case 'deceleration':
        // CRITICAL FIX: Prevent natural deceleration during continuous spinning
        // Reset back to constant velocity if we accidentally entered deceleration
        state.easingPhase = 'constant';
        state.velocity = state.maxVelocity * direction;
        state.acceleration = 0;
        break;

      case 'quick_deceleration':
        // Quick deceleration before outcome display
        state.velocity += state.acceleration * deltaTime;
        
        // Apply friction for smoother slowdown
        state.velocity *= 0.98;
        
        // Stop decelerating when we reach a slow speed (don't fully stop)
        const targetSlowSpeed = state.maxVelocity * 0.15; // 15% of max speed
        if (Math.abs(state.velocity) <= targetSlowSpeed) {
          state.velocity = targetSlowSpeed * direction;
          state.acceleration = 0;
          state.easingPhase = 'slow_spin'; // New phase for slow spinning
        }
        break;

      case 'outcome_deceleration':
        // SYMBOL-BASED APPROACH: Work with absolute symbol positions (0-99)
        const currentSymbolPos = Math.floor(state.currentPosition / SYMBOL_HEIGHT) % TOTAL_SYMBOLS;
        const targetSymbolPos = Math.floor(state.targetPosition / SYMBOL_HEIGHT) % TOTAL_SYMBOLS;
        
        // Calculate shortest symbol distance (wrapping around the 100-symbol reel)
        let symbolDistance = targetSymbolPos - currentSymbolPos;
        if (symbolDistance > TOTAL_SYMBOLS / 2) {
          symbolDistance -= TOTAL_SYMBOLS; // Wrap backward
        } else if (symbolDistance < -TOTAL_SYMBOLS / 2) {
          symbolDistance += TOTAL_SYMBOLS; // Wrap forward  
        }
        
        console.log(`🎯 Reel ${this.reelStates.indexOf(state)}: currentSymbol=${currentSymbolPos}, targetSymbol=${targetSymbolPos}, symbolDistance=${symbolDistance}`);
        
        // If at the right symbol position, snap to exact pixel target
        if (symbolDistance === 0) {
          console.log(`📍 Reel ${this.reelStates.indexOf(state)}: REACHED target symbol, snapping to exact position`);
          state.currentPosition = state.targetPosition;
          state.velocity = 0;
          state.easingPhase = 'settling';
          break;
        }
        
        // Move toward target symbol at appropriate speed
        const symbolDirection = symbolDistance > 0 ? 1 : -1;
        const symbolsAway = Math.abs(symbolDistance);
        
        // Speed: faster when many symbols away, slower when close
        let targetVelocity;
        if (symbolsAway > 10) {
          targetVelocity = 300 * symbolDirection; // Fast when far
        } else if (symbolsAway > 3) {
          targetVelocity = 150 * symbolDirection; // Medium when close
        } else {
          targetVelocity = 75 * symbolDirection;  // Slow when very close
        }
        
        // Smoothly adjust to target velocity
        state.velocity = state.velocity * 0.7 + targetVelocity * 0.3;
        
        console.log(`⚡ Reel ${this.reelStates.indexOf(state)}: symbolsAway=${symbolsAway}, velocity=${state.velocity.toFixed(0)} (target=${targetVelocity})`);
        break;

      case 'slow_spin':
        // Maintain slow spinning until outcome is displayed
        const maintainSlowSpeed = state.maxVelocity * 0.15;
        state.velocity = maintainSlowSpeed * direction;
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
          const reelIndex = this.reelStates.indexOf(state);
          console.log(`✅ Reel ${reelIndex} settled at final position: ${state.targetPosition}px`);
          console.log(`📺 Reel ${reelIndex} viewport positions: [${state.targetPosition/100}, ${state.targetPosition/100 + 1}, ${state.targetPosition/100 + 2}]`);
        }
        break;
    }

    // Update position based on velocity
    if (state.easingPhase !== 'settling') {
      state.currentPosition += state.velocity * deltaTime;
      
      // AGGRESSIVE WRAPPING: Wrap early and often to prevent any visible gaps
      const bufferSymbols = 5; // Match ReelGrid buffer  
      const visibleHeight = VISIBLE_SYMBOLS * SYMBOL_HEIGHT; // 300px viewport
      
      // Wrap much more aggressively - start wrapping while still well within buffer zone
      const wrapLowerBound = SYMBOL_HEIGHT * bufferSymbols; // 500px - wrap when we're still in buffer
      const wrapUpperBound = SYMBOL_HEIGHT * (TOTAL_SYMBOLS - bufferSymbols); // 2500px - wrap before hitting end buffer
      
      // Immediate wrapping with smaller jump to maintain continuity
      if (state.currentPosition <= wrapLowerBound) {
        state.currentPosition += SYMBOL_HEIGHT * (TOTAL_SYMBOLS - bufferSymbols * 2); // +2000px jump
      } else if (state.currentPosition >= wrapUpperBound) {
        state.currentPosition -= SYMBOL_HEIGHT * (TOTAL_SYMBOLS - bufferSymbols * 2); // -2000px jump
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