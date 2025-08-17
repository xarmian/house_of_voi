import type { EasingFunction, AnimationConfig, TouchFeedback, CelebrationEffect } from '$lib/types/animations';

// Easing functions for smooth animations
export const easingFunctions: Record<string, EasingFunction> = {
  linear: (t: number) => t,
  
  // Quad
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  
  // Cubic
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => (--t) * t * t + 1,
  easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  
  // Quart
  easeInQuart: (t: number) => t * t * t * t,
  easeOutQuart: (t: number) => 1 - (--t) * t * t * t,
  easeInOutQuart: (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
  
  // Bounce (perfect for slot machine settling)
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
  },
  
  // Elastic (great for win celebrations)
  easeOutElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  
  // Back (overshoot effect)
  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
};

// Animation frame rate monitoring for performance optimization
export class FrameRateMonitor {
  private frames: number[] = [];
  private lastFrameTime = performance.now();
  
  update(): number {
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    const fps = 1000 / delta;
    this.frames.push(fps);
    
    // Keep only last 60 frames for rolling average
    if (this.frames.length > 60) {
      this.frames.shift();
    }
    
    return fps;
  }
  
  getAverageFPS(): number {
    if (this.frames.length === 0) return 60;
    return this.frames.reduce((sum, fps) => sum + fps, 0) / this.frames.length;
  }
  
  isPerformanceGood(): boolean {
    return this.getAverageFPS() >= 45; // Consider 45+ FPS as good performance
  }
}

// Cache device capabilities to avoid repeated WebGL context creation
let deviceCapabilitiesCache: ReturnType<typeof detectDeviceCapabilities> | null = null;

// Device capabilities detection
export function detectDeviceCapabilities() {
  // Return cached results if available
  if (deviceCapabilitiesCache) {
    return deviceCapabilitiesCache;
  }
  
  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // Return safe defaults for SSR
    const ssrDefaults = {
      supportsWebGL: false,
      supportsHaptics: false,
      supportsReducedMotion: false,
      isMobile: false,
      isLowPowerMode: false,
      pixelRatio: 1,
      maxTouchPoints: 0
    };
    deviceCapabilitiesCache = ssrDefaults;
    return ssrDefaults;
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }) || 
             canvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: true });
  
  const capabilities = {
    supportsWebGL: !!gl,
    supportsHaptics: 'vibrate' in navigator,
    supportsReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    isLowPowerMode: 'getBattery' in navigator, // Approximate detection
    pixelRatio: window.devicePixelRatio || 1,
    maxTouchPoints: navigator.maxTouchPoints || 0
  };
  
  // Clean up WebGL context immediately
  if (gl) {
    const loseContext = gl.getExtension('WEBGL_lose_context');
    if (loseContext) {
      loseContext.loseContext();
    }
  }
  
  // Remove canvas from memory
  canvas.width = 0;
  canvas.height = 0;
  
  // Cache the results
  deviceCapabilitiesCache = capabilities;
  return capabilities;
}

// Clear the capabilities cache (useful for testing or when device changes)
export function clearDeviceCapabilitiesCache() {
  deviceCapabilitiesCache = null;
}

// Optimized animation class with performance monitoring
export class OptimizedAnimation {
  private element: HTMLElement;
  private config: AnimationConfig;
  private startTime: number = 0;
  private animationId: number = 0;
  private onComplete?: () => void;
  private frameMonitor = new FrameRateMonitor();
  
  constructor(element: HTMLElement, config: AnimationConfig, onComplete?: () => void) {
    this.element = element;
    this.config = config;
    this.onComplete = onComplete;
  }
  
  start() {
    this.startTime = performance.now();
    this.animate();
  }
  
  private animate = () => {
    const currentTime = performance.now();
    const elapsed = currentTime - this.startTime;
    const progress = Math.min(elapsed / this.config.duration, 1);
    
    // Monitor frame rate and adjust quality if needed
    const fps = this.frameMonitor.update();
    if (fps < 30 && progress < 0.9) {
      // Reduce animation quality for performance
      this.element.style.willChange = 'auto';
    }
    
    // Apply easing
    let easedProgress = progress;
    if (this.config.easing) {
      if (typeof this.config.easing === 'string' && easingFunctions[this.config.easing]) {
        easedProgress = easingFunctions[this.config.easing](progress);
      } else if (typeof this.config.easing === 'function') {
        easedProgress = this.config.easing(progress);
      }
    }
    
    // Animation logic would be implemented by subclasses
    this.updateElement(easedProgress);
    
    if (progress < 1) {
      this.animationId = requestAnimationFrame(this.animate);
    } else {
      this.complete();
    }
  };
  
  protected updateElement(progress: number) {
    // Override in subclasses
  }
  
  private complete() {
    this.element.style.willChange = 'auto';
    if (this.onComplete) {
      this.onComplete();
    }
  }
  
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
    this.complete();
  }
}

// Reel spinning animation with physics
export class ReelSpinAnimation extends OptimizedAnimation {
  private initialOffset: number;
  private targetOffset: number;
  private spinSpeed: number;
  
  constructor(
    element: HTMLElement,
    config: AnimationConfig & { spinSpeed: number; targetOffset: number },
    onComplete?: () => void
  ) {
    super(element, config, onComplete);
    this.spinSpeed = config.spinSpeed;
    this.targetOffset = config.targetOffset;
    this.initialOffset = 0;
  }
  
  protected updateElement(progress: number) {
    // Calculate current offset with easing
    const currentOffset = this.initialOffset + (this.targetOffset - this.initialOffset) * progress;
    
    // Apply transform with GPU acceleration
    this.element.style.transform = `translateY(${currentOffset}px)`;
    
    // Add blur effect during fast spinning
    const blurAmount = Math.sin(progress * Math.PI) * 3;
    this.element.style.filter = `blur(${blurAmount}px)`;
    
    // Optimize for GPU
    this.element.style.willChange = 'transform, filter';
  }
}

// Touch feedback animations
export function triggerTouchFeedback(element: HTMLElement, feedback: TouchFeedback) {
  const capabilities = detectDeviceCapabilities();
  
  switch (feedback.type) {
    case 'scale':
      triggerScaleFeedback(element, feedback);
      break;
    case 'ripple':
      triggerRippleFeedback(element, feedback);
      break;
    case 'haptic':
      if (capabilities.supportsHaptics) {
        triggerHapticFeedback(feedback.intensity);
      }
      break;
    case 'glow':
      triggerGlowFeedback(element, feedback);
      break;
  }
}

function triggerScaleFeedback(element: HTMLElement, feedback: TouchFeedback) {
  element.style.transition = `transform ${feedback.duration}ms ${feedback.easing}`;
  element.style.transform = `scale(${0.95})`;
  
  setTimeout(() => {
    element.style.transform = 'scale(1)';
  }, feedback.duration / 2);
  
  setTimeout(() => {
    element.style.transition = '';
  }, feedback.duration);
}

function triggerRippleFeedback(element: HTMLElement, feedback: TouchFeedback) {
  const ripple = document.createElement('div');
  ripple.className = 'touch-ripple';
  ripple.style.cssText = `
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transform: scale(0);
    animation: ripple-animation ${feedback.duration}ms ease-out;
    pointer-events: none;
    top: 50%;
    left: 50%;
    width: 100px;
    height: 100px;
    margin-top: -50px;
    margin-left: -50px;
  `;
  
  element.style.position = 'relative';
  element.style.overflow = 'hidden';
  element.appendChild(ripple);
  
  setTimeout(() => {
    ripple.remove();
  }, feedback.duration);
}

function triggerHapticFeedback(intensity: number) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    const duration = Math.max(10, Math.min(100, intensity * 50));
    navigator.vibrate(duration);
  }
}

function triggerGlowFeedback(element: HTMLElement, feedback: TouchFeedback) {
  const originalBoxShadow = element.style.boxShadow;
  element.style.transition = `box-shadow ${feedback.duration}ms ${feedback.easing}`;
  element.style.boxShadow = `0 0 ${feedback.intensity * 20}px rgba(16, 185, 129, 0.5)`;
  
  setTimeout(() => {
    element.style.boxShadow = originalBoxShadow;
  }, feedback.duration);
  
  setTimeout(() => {
    element.style.transition = '';
  }, feedback.duration);
}

// Win celebration effects
export function triggerWinCelebration(effects: CelebrationEffect[], container: HTMLElement) {
  effects.forEach(effect => {
    setTimeout(() => {
      switch (effect.type) {
        case 'particles':
          createParticleEffect(container, effect);
          break;
        case 'shake':
          createShakeEffect(container, effect);
          break;
        case 'flash':
          createFlashEffect(container, effect);
          break;
        case 'bounce':
          createBounceEffect(container, effect);
          break;
        case 'cascade':
          createCascadeEffect(container, effect);
          break;
      }
    }, effect.delay || 0);
  });
}

function createParticleEffect(container: HTMLElement, effect: CelebrationEffect) {
  const particleCount = effect.intensity === 'low' ? 20 : 
                      effect.intensity === 'medium' ? 50 : 
                      effect.intensity === 'high' ? 100 : 150;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'celebration-particle';
    particle.style.cssText = `
      position: absolute;
      width: 6px;
      height: 6px;
      background: hsl(${Math.random() * 60 + 45}, 100%, 50%);
      border-radius: 50%;
      pointer-events: none;
      z-index: 1000;
    `;
    
    const startX = Math.random() * container.offsetWidth;
    const startY = Math.random() * container.offsetHeight;
    const endX = startX + (Math.random() - 0.5) * 200;
    const endY = startY - Math.random() * 300;
    
    particle.style.left = `${startX}px`;
    particle.style.top = `${startY}px`;
    
    container.appendChild(particle);
    
    particle.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0)`, opacity: 0 }
    ], {
      duration: effect.duration,
      easing: 'ease-out'
    }).onfinish = () => particle.remove();
  }
}

function createShakeEffect(container: HTMLElement, effect: CelebrationEffect) {
  const intensity = effect.intensity === 'low' ? 2 : 
                   effect.intensity === 'medium' ? 5 : 
                   effect.intensity === 'high' ? 10 : 15;
  
  container.animate([
    { transform: 'translateX(0)' },
    { transform: `translateX(${intensity}px)` },
    { transform: `translateX(-${intensity}px)` },
    { transform: 'translateX(0)' }
  ], {
    duration: 100,
    iterations: effect.duration / 100
  });
}

function createFlashEffect(container: HTMLElement, effect: CelebrationEffect) {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: absolute;
    inset: 0;
    background: radial-gradient(circle, rgba(255, 215, 0, 0.8) 0%, transparent 70%);
    pointer-events: none;
    z-index: 999;
  `;
  
  container.appendChild(flash);
  
  flash.animate([
    { opacity: 0 },
    { opacity: 1 },
    { opacity: 0 }
  ], {
    duration: effect.duration / 3,
    iterations: 3
  }).onfinish = () => flash.remove();
}

function createBounceEffect(container: HTMLElement, effect: CelebrationEffect) {
  const scale = effect.intensity === 'low' ? 1.05 : 
               effect.intensity === 'medium' ? 1.1 : 
               effect.intensity === 'high' ? 1.2 : 1.3;
  
  container.animate([
    { transform: 'scale(1)' },
    { transform: `scale(${scale})` },
    { transform: 'scale(1)' }
  ], {
    duration: effect.duration,
    easing: 'ease-in-out'
  });
}

function createCascadeEffect(container: HTMLElement, effect: CelebrationEffect) {
  const children = Array.from(container.children) as HTMLElement[];
  const delay = effect.duration / children.length;
  
  children.forEach((child, index) => {
    setTimeout(() => {
      child.animate([
        { transform: 'translateY(0) scale(1)', opacity: 1 },
        { transform: 'translateY(-20px) scale(1.1)', opacity: 0.8 },
        { transform: 'translateY(0) scale(1)', opacity: 1 }
      ], {
        duration: delay * 2,
        easing: 'ease-out'
      });
    }, delay * index);
  });
}

// CSS animation keyframes for common effects
export const animationKeyframes = `
  @keyframes ripple-animation {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
  
  @keyframes reel-spin-fast {
    0% { transform: translateY(0px); }
    100% { transform: translateY(-100px); }
  }
  
  @keyframes symbol-reveal {
    0% { transform: scale(0.8) rotateY(90deg); opacity: 0; }
    50% { transform: scale(1.1) rotateY(45deg); opacity: 0.7; }
    100% { transform: scale(1) rotateY(0deg); opacity: 1; }
  }
  
  @keyframes win-highlight {
    0%, 100% { box-shadow: 0 0 0 rgba(16, 185, 129, 0); }
    50% { box-shadow: 0 0 30px rgba(16, 185, 129, 0.8); }
  }
  
  @keyframes coin-drop {
    0% { transform: translateY(-100px) rotate(0deg); opacity: 0; }
    20% { opacity: 1; }
    80% { transform: translateY(50px) rotate(720deg); opacity: 1; }
    100% { transform: translateY(60px) rotate(720deg); opacity: 0; }
  }
`;

// Performance optimization utilities
export function optimizeForMobile() {
  // Check if we're in a browser environment
  if (typeof document === 'undefined') return;
  
  // Reduce animation complexity on mobile devices
  const capabilities = detectDeviceCapabilities();
  
  if (capabilities.isMobile || !capabilities.supportsWebGL) {
    // Disable complex particle effects
    document.documentElement.style.setProperty('--particle-count', '10');
    document.documentElement.style.setProperty('--animation-duration-multiplier', '0.8');
  }
  
  if (capabilities.supportsReducedMotion) {
    // Respect user's motion preferences
    document.documentElement.style.setProperty('--reduce-motion', '1');
  }
}

// Initialize animations system
export function initializeAnimations() {
  // Check if we're in a browser environment
  if (typeof document === 'undefined') return;
  
  // Add CSS keyframes to document
  const style = document.createElement('style');
  style.textContent = animationKeyframes;
  document.head.appendChild(style);
  
  // Optimize for current device
  optimizeForMobile();
  
  // Add global CSS variables for animation control
  document.documentElement.style.setProperty('--animation-speed', '1');
  document.documentElement.style.setProperty('--particle-count', '50');
  document.documentElement.style.setProperty('--reduce-motion', '0');
}