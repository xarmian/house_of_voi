# Slot Machine Display Architecture

This directory contains the new modular display architecture for the slot machine, providing clean separation between game logic and visual rendering.

## Overview

The architecture separates concerns into three main layers:

1. **Core Game Logic** (`../core/`) - Pure TypeScript game engine
2. **Display Interface** (`./ISlotDisplay.ts`) - Abstract interface for all displays
3. **Display Implementations** (`./webgl/`, `./canvas/`, etc.) - Specific rendering technologies

## Key Benefits

- **Complete Separation**: Game logic is independent of display technology
- **Multiple Implementations**: Support for WebGL, Canvas2D, DOM, or hybrid approaches
- **Designer-Friendly**: WebGL designers can work with familiar tools and APIs
- **Performance**: GPU-accelerated rendering with optimized texture atlases
- **Flexibility**: Easy to swap displays or run A/B tests
- **Testability**: Game logic can be unit tested without display dependencies

## Architecture Components

### Core Game Engine (`../core/`)

#### `GameState.ts`
- Pure TypeScript state management
- No dependencies on Svelte stores or DOM
- Handles betting, balance, reel data, and spin state
- Event-driven updates

#### `SlotMachineEngine.ts`
- Main game controller that orchestrates everything
- Manages spin lifecycle and queue processing
- Communicates with blockchain via existing services
- Emits events for display updates

### Display Interface (`./ISlotDisplay.ts`)

#### `ISlotDisplay` Interface
Defines the contract that all display implementations must follow:

```typescript
interface ISlotDisplay {
  // Lifecycle
  initialize(container: HTMLElement, config: DisplayConfig): Promise<void>;
  destroy(): void;
  
  // Reel Operations
  setReelData(reels: string[][]): void;
  startSpin(spinId: string): void;
  showOutcome(grid: string[][]): void;
  
  // Visual Effects
  showWinCelebration(winData: WinData): void;
  highlightPaylines(paylines: PaylineData[]): void;
  showParticles(config: ParticleConfig): void;
  
  // Events
  on(event: DisplayEvent, callback: Function): void;
  emit(event: DisplayEvent, data?: any): void;
}
```

#### `BaseSlotDisplay` Class
- Common functionality for all display implementations
- Event management system
- Configuration validation
- Abstract methods for rendering-specific logic

### WebGL Implementation (`./webgl/`)

#### `WebGLSlotDisplay.ts`
Main WebGL display implementation:
- Manages WebGL context and scene
- Coordinates all WebGL components
- Handles performance monitoring
- Emits events back to game engine

#### `WebGLRenderer.ts`
Core WebGL rendering engine:
- Shader compilation and management
- Texture and buffer management
- Render loop with performance stats
- WebGL context setup and extensions

#### `SymbolAtlas.ts`
Efficient texture management:
- Combines all symbols into single texture atlas
- Provides UV coordinates for shader rendering
- Optimizes GPU memory usage
- Supports hot-reloading of symbols

#### `ReelRenderer.ts`
Reel spinning animations:
- GPU-accelerated physics simulation
- Motion blur effects during spinning
- Smooth transitions to final outcomes
- Payline highlighting with shaders

#### `ParticleSystem.ts`
Visual effects engine:
- GPU-accelerated particle rendering
- Multiple effect types (explosions, coin rain, sparkles)
- Performance-aware particle limits
- Configurable intensity levels

## Usage

### Basic Integration

```typescript
import { SlotMachineEngine } from '$lib/core/SlotMachineEngine';
import { WebGLSlotDisplay } from '$lib/display/webgl/WebGLSlotDisplay';

// Create display
const display = new WebGLSlotDisplay();
await display.initialize(containerElement, {
  width: 600,
  height: 400,
  theme: 'default',
  reelCount: 5,
  visibleSymbols: 3,
  enableParticles: true,
  enableMotionBlur: true
});

// Create and connect engine
const engine = new SlotMachineEngine();
await engine.initialize(display);

// Request a spin
engine.requestSpin({
  betPerLine: 1000000,
  selectedPaylines: 5,
  totalBet: 5000000
});
```

### Using the DisplayAdapter Component

```svelte
<script>
  import DisplayAdapter from '$lib/components/game/DisplayAdapter.svelte';
  
  let displayAdapter;
  
  function handleSpin() {
    displayAdapter.requestSpin();
  }
</script>

<DisplayAdapter
  bind:this={displayAdapter}
  width={600}
  height={400}
  displayType="webgl"
  theme="neon"
/>

<button on:click={handleSpin}>Spin!</button>
```

## Performance Considerations

### WebGL Optimizations

1. **Texture Atlas**: All symbols in single texture reduces draw calls
2. **Instanced Rendering**: Multiple symbols rendered in single draw call
3. **Shader Efficiency**: Minimal vertex/fragment operations
4. **Buffer Management**: Reuse vertex buffers where possible
5. **Performance Monitoring**: Real-time FPS and memory tracking

### Performance Metrics

The display provides real-time metrics:
- FPS (frames per second)
- Frame time (milliseconds per frame)  
- Memory usage (texture memory in MB)
- Draw calls per frame
- Active particle count
- Performance warnings

### Warning System

Automatic performance warnings for:
- Low FPS (< 30 fps)
- High memory usage (> 100MB)
- Too many particles (> 500)
- GPU timeouts (> 33ms per frame)

## Extending the Architecture

### Creating a New Display Implementation

1. Extend `BaseSlotDisplay` class
2. Implement all abstract methods
3. Handle lifecycle (initialize/destroy)
4. Emit appropriate events
5. Register with display factory

```typescript
export class CustomSlotDisplay extends BaseSlotDisplay {
  async initialize(container: HTMLElement, config: DisplayConfig) {
    // Initialize your rendering system
    this.initialized = true;
    this.emit('ready');
  }
  
  startSpin(spinId: string) {
    // Implement spin animation
  }
  
  showOutcome(grid: string[][]) {
    // Show final result
    this.emit('spin-complete', { spinId });
  }
  
  // ... other methods
}
```

### Adding New Effects

WebGL effects are modular and easy to extend:

```typescript
// Add new particle effect type
export type ParticleType = 'explosion' | 'coin-rain' | 'fireworks' | 'lightning';

// Implement in ParticleSystem
private createFireworksParticles(config: ParticleConfig): Particle[] {
  // Create fireworks effect particles
}
```

### Custom Shaders

Add new visual effects with custom shaders:

```typescript
// Add to WebGLRenderer
const customShader = renderer.createProgram('custom-effect', {
  vertex: `
    attribute vec2 a_position;
    uniform float u_time;
    void main() {
      // Custom vertex shader
    }
  `,
  fragment: `
    precision mediump float;
    uniform float u_time;
    void main() {
      // Custom fragment shader with effects
    }
  `
});
```

## Development Tools

### Debug Mode

Enable debug mode for development:

```typescript
const engine = new SlotMachineEngine({
  debugMode: true
});
```

This provides:
- Detailed console logging
- Performance metrics overlay
- WebGL context information
- Error details and stack traces

### Hot Reloading

The architecture supports hot reloading of:
- Shaders (fragment/vertex)
- Symbol textures
- Configuration changes
- Effect parameters

## Future Enhancements

### Planned Features

1. **3D Symbols**: Support for GLTF models and 3D rendering
2. **Advanced Lighting**: Dynamic lighting and shadows
3. **Post-Processing**: Bloom, depth of field, color grading
4. **VR Support**: WebXR integration for VR experiences
5. **Analytics**: Built-in performance and usage analytics

### Additional Display Types

- **Canvas2D**: Fallback for devices without WebGL
- **DOM**: Pure CSS/HTML for maximum compatibility  
- **Hybrid**: WebGL reels with DOM UI elements
- **React Native**: Cross-platform mobile support

## Migration Guide

To migrate from the old SlotMachine.svelte component:

1. Replace `<SlotMachine>` with `<DisplayAdapter displayType="webgl">`
2. Update event handlers to use the new event system
3. Move game logic to use the SlotMachineEngine API
4. Test performance and adjust settings as needed

The old component remains available as a fallback during the transition period.