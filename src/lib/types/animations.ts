export interface ReelAnimationState {
  isSpinning: boolean;
  spinSpeed: number;
  spinDirection: 'up' | 'down';
  blur: number;
  offset: number;
  easingPhase: 'acceleration' | 'constant' | 'deceleration' | 'settling' | 'quick_deceleration' | 'slow_spin' | 'outcome_deceleration';
  // Physics properties for realistic spinning
  velocity: number;
  acceleration: number;
  targetPosition: number;
  currentPosition: number;
  maxVelocity: number;
  friction: number;
}

export interface SpinSequence {
  reelIndex: number;
  startDelay: number;
  spinDuration: number;
  settleDuration: number;
  finalSymbols: string[];
  physics: {
    acceleration: number;
    maxSpeed: number;
    deceleration: number;
    settleBounciness: number;
    settleStiffness: number;
    settleDamping: number;
  };
}

export interface ReelPhysicsConfig {
  acceleration: number;
  maxVelocity: number | number[]; // Single value or array for individual reel speeds
  deceleration: number;
  friction: number;
  bounceAmplitude: number;
  bounceFrequency: number;
  bounceDamping: number;
  spinPattern: 'alternating' | 'same' | 'random';
}

export interface CelebrationEffect {
  type: 'particles' | 'shake' | 'flash' | 'bounce' | 'cascade';
  intensity: 'low' | 'medium' | 'high' | 'extreme';
  duration: number;
  delay?: number;
  target?: string; // CSS selector or element reference
}

export interface WinAnimation {
  winAmount: number;
  paylinePositions: Array<{ reel: number; row: number }>;
  celebrationEffects: CelebrationEffect[];
  soundTriggers?: string[];
}

export interface TouchFeedback {
  type: 'scale' | 'ripple' | 'haptic' | 'glow';
  duration: number;
  intensity: number;
  easing: string;
}

export interface LoadingState {
  isLoading: boolean;
  progress?: number;
  message?: string;
  type: 'spin' | 'transaction' | 'connection' | 'general';
}

export interface AnimationPreferences {
  reducedMotion: boolean;
  batteryOptimized: boolean;
  highPerformance: boolean;
  hapticEnabled: boolean;
  particlesEnabled: boolean;
}

export interface AnimationFrame {
  timestamp: number;
  deltaTime: number;
  fps: number;
}

export interface EasingFunction {
  (t: number): number;
}

export interface AnimationConfig {
  duration: number;
  delay?: number;
  easing: EasingFunction | string;
  fill?: 'forwards' | 'backwards' | 'both' | 'none';
  iterations?: number | 'infinite';
}