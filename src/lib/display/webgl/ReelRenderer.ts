/**
 * Reel Renderer - Handles WebGL-based reel spinning animations
 * Renders symbols using the symbol atlas with smooth physics-based animations
 */

import type { WebGLRenderer, ShaderSource } from './WebGLRenderer';
import type { SymbolAtlas } from './SymbolAtlas';
import type { DisplayConfig, PaylineData, SpinAnimationConfig } from '../ISlotDisplay';

interface ReelState {
  position: number; // Current scroll position in pixels
  velocity: number; // Current velocity
  targetPosition: number; // Target position for stopping
  isSpinning: boolean;
  finalOutcome: string[];
  reelIndex: number;
}

export class ReelRenderer {
  private renderer: WebGLRenderer;
  private symbolAtlas: SymbolAtlas;
  private config: DisplayConfig;
  
  private reelStates: ReelState[] = [];
  private reelData: string[][] = [];
  
  // WebGL resources
  private program: WebGLProgram | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  
  // Payline rendering resources
  private lineProgram: WebGLProgram | null = null;
  private lineVertexBuffer: WebGLBuffer | null = null;
  
  // Shader uniforms
  private uniforms: {
    resolution?: WebGLUniformLocation;
    time?: WebGLUniformLocation;
    atlas?: WebGLUniformLocation;
    blur?: WebGLUniformLocation;
  } = {};
  
  // Animation parameters
  private readonly SYMBOL_HEIGHT = 100; // Height of each symbol in pixels
  private readonly SPIN_SPEED = 600; // Initial spin speed in pixels/second - faster animation
  private readonly DECELERATION = 800; // Deceleration rate
  
  // Reel configuration - similar to original ReelGrid
  private readonly VISIBLE_SYMBOLS = 3; // Symbols visible on screen
  private readonly REEL_SYMBOLS = 100; // Total symbols per reel (from contract)
  private readonly BUFFER_SYMBOLS = 10; // Extra symbols above/below for smooth scrolling
  
  // Payline highlighting and display
  private highlightedPaylines: PaylineData[] = [];
  private highlightEndTime = 0;
  
  // Payline selection display
  private selectedPaylines: number[][] = []; // From contract
  private selectedPaylineCount = 1;
  private paylineShowEndTime = 0;
  private readonly PAYLINE_SHOW_DURATION = 3000; // Show for 3 seconds
  
  constructor(renderer: WebGLRenderer, symbolAtlas: SymbolAtlas, config: DisplayConfig) {
    this.renderer = renderer;
    this.symbolAtlas = symbolAtlas;
    this.config = config;
    
    this.initializeReels();
    this.initializeShaders();
    this.initializeLineShaders();
    this.createGeometry();
  }
  
  private initializeReels(): void {
    this.reelStates = Array(this.config.reelCount).fill(null).map((_, index) => ({
      position: 0,
      velocity: 0,
      targetPosition: 0,
      isSpinning: false,
      finalOutcome: [],
      reelIndex: index
    }));
  }
  
  private initializeShaders(): void {
    const vertexShader = `
      attribute vec2 a_position;
      attribute vec2 a_uv;
      attribute float a_reelIndex;
      attribute float a_symbolIndex;
      
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform float u_reelPositions[5]; // Positions for each reel
      uniform float u_blur;
      
      varying vec2 v_uv;
      varying float v_alpha;
      varying float v_blur;
      
      void main() {
        // Keep symbols at fixed positions - no position offset during spinning
        vec2 position = a_position;
        
        // Convert to clip space
        vec2 clipSpace = ((position / u_resolution) * 2.0) - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        
        v_uv = a_uv;
        
        // Calculate fade out for symbols near viewport edges
        float viewportTop = 0.0;
        float viewportBottom = u_resolution.y;
        float fade = 1.0;
        
        if (position.y < viewportTop - 50.0) {
          fade = 0.0;
        } else if (position.y < viewportTop) {
          fade = max(0.0, 1.0 + (position.y - viewportTop) / 50.0);
        } else if (position.y > viewportBottom) {
          fade = max(0.0, 1.0 - (position.y - viewportBottom) / 50.0);
        } else if (position.y > viewportBottom + 50.0) {
          fade = 0.0;
        }
        
        v_alpha = fade;
        v_blur = u_blur;
      }
    `;
    
    const fragmentShader = `
      precision mediump float;
      
      uniform sampler2D u_atlas;
      uniform float u_highlightTime;
      uniform vec3 u_highlightColor;
      
      varying vec2 v_uv;
      varying float v_alpha;
      varying float v_blur;
      
      void main() {
        // Sample from atlas texture
        vec4 color = texture2D(u_atlas, v_uv);
        
        // Apply subtle blur effect during spinning
        if (v_blur > 0.0) {
          vec4 blurred = vec4(0.0);
          float blurAmount = v_blur * 0.003; // Reduced blur intensity
          
          for (float i = -2.0; i <= 2.0; i++) {
            vec2 offset = vec2(0.0, i * blurAmount);
            blurred += texture2D(u_atlas, v_uv + offset);
          }
          
          color = blurred / 5.0; // (2*2 + 1)
        }
        
        // Apply highlight effect
        if (u_highlightTime > 0.0) {
          float glow = 0.5 + 0.5 * sin(u_highlightTime * 6.0);
          color.rgb = mix(color.rgb, u_highlightColor, glow * 0.3);
        }
        
        color.a *= v_alpha;
        gl_FragColor = color;
      }
    `;
    
    const shaderSource: ShaderSource = {
      vertex: vertexShader,
      fragment: fragmentShader
    };
    
    this.program = this.renderer.createProgram('reel-shader', shaderSource);
    
    // Get uniform locations
    const gl = this.renderer['gl']; // Access private GL context
    if (this.program) {
      this.uniforms.resolution = gl.getUniformLocation(this.program, 'u_resolution');
      this.uniforms.time = gl.getUniformLocation(this.program, 'u_time');
      this.uniforms.atlas = gl.getUniformLocation(this.program, 'u_atlas');
      this.uniforms.blur = gl.getUniformLocation(this.program, 'u_blur');
    }
  }
  
  private initializeLineShaders(): void {
    const vertexShader = `
      attribute vec2 a_position;
      uniform vec2 u_resolution;
      
      void main() {
        vec2 clipSpace = ((a_position / u_resolution) * 2.0) - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
      }
    `;
    
    const fragmentShader = `
      precision mediump float;
      uniform vec3 u_color;
      uniform float u_alpha;
      
      void main() {
        gl_FragColor = vec4(u_color, u_alpha);
      }
    `;
    
    const shaderSource: ShaderSource = {
      vertex: vertexShader,
      fragment: fragmentShader
    };
    
    this.lineProgram = this.renderer.createProgram('line-shader', shaderSource);
    console.log('🔍 DEBUG: Line shader program created:', this.lineProgram ? 'SUCCESS' : 'FAILED');
    
    // Create line vertex buffer
    const gl = this.renderer['gl'];
    this.lineVertexBuffer = gl.createBuffer();
    console.log('🔍 DEBUG: Line vertex buffer created:', this.lineVertexBuffer ? 'SUCCESS' : 'FAILED');
  }

  private createGeometry(): void {
    // Create vertex buffer for infinite scrolling reels
    // Each reel needs enough symbols to scroll seamlessly: visible + buffer symbols above and below
    const symbolsPerReel = this.VISIBLE_SYMBOLS + (this.BUFFER_SYMBOLS * 2);
    const totalSymbols = this.config.reelCount * symbolsPerReel;
    const verticesPerSymbol = 6; // 2 triangles
    const attributesPerVertex = 5; // x, y, u, v, reelIndex
    
    // Initialize with placeholder geometry - UV coordinates will be updated dynamically
    const vertices = new Float32Array(totalSymbols * verticesPerSymbol * attributesPerVertex);
    const indices = new Uint16Array(totalSymbols * verticesPerSymbol);
    
    let vertexIndex = 0;
    let indexIndex = 0;
    
    for (let reel = 0; reel < this.config.reelCount; reel++) {
      const reelX = reel * (this.config.width / this.config.reelCount);
      const reelWidth = this.config.width / this.config.reelCount;
      
      // Create symbols from -BUFFER_SYMBOLS to VISIBLE_SYMBOLS + BUFFER_SYMBOLS
      // This gives us a continuous strip that can scroll smoothly
      for (let symbol = -this.BUFFER_SYMBOLS; symbol < this.VISIBLE_SYMBOLS + this.BUFFER_SYMBOLS; symbol++) {
        // Position symbols so some are initially visible in viewport (0 to config.height)
        // Start with symbol 0 at the top of the viewport instead of symbol -BUFFER_SYMBOLS
        const symbolY = (symbol + this.BUFFER_SYMBOLS) * this.SYMBOL_HEIGHT;
        
        // Create quad with position data - UV coordinates will be set dynamically
        // Using placeholder symbol 'A' UVs for initial geometry
        const defaultUV = this.symbolAtlas.getSymbolUV('A') || { u1: 0, v1: 0, u2: 1, v2: 1 };
        
        const quad = [
          // Triangle 1
          reelX, symbolY, defaultUV.u1, defaultUV.v1, reel, // Top-left
          reelX, symbolY + this.SYMBOL_HEIGHT, defaultUV.u1, defaultUV.v2, reel, // Bottom-left
          reelX + reelWidth, symbolY, defaultUV.u2, defaultUV.v1, reel, // Top-right
          
          // Triangle 2
          reelX + reelWidth, symbolY, defaultUV.u2, defaultUV.v1, reel, // Top-right
          reelX, symbolY + this.SYMBOL_HEIGHT, defaultUV.u1, defaultUV.v2, reel, // Bottom-left
          reelX + reelWidth, symbolY + this.SYMBOL_HEIGHT, defaultUV.u2, defaultUV.v2, reel, // Bottom-right
        ];
        
        vertices.set(quad, vertexIndex);
        vertexIndex += quad.length;
        
        // Create indices for this quad
        const symbolIndex = symbol + this.BUFFER_SYMBOLS; // Convert negative indices to positive
        const baseIndex = (reel * symbolsPerReel + symbolIndex) * verticesPerSymbol;
        const quadIndices = [0, 1, 2, 3, 4, 5].map(i => baseIndex + i);
        
        indices.set(quadIndices, indexIndex);
        indexIndex += quadIndices.length;
      }
    }
    
    // Create dynamic vertex buffer since we'll update UVs frequently
    const gl = this.renderer['gl'];
    this.vertexBuffer = gl.createBuffer();
    if (this.vertexBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    
    this.indexBuffer = this.renderer.createBuffer('reel-indices', indices, 'index');
  }
  
  setReelData(reels: string[][]): void {
    this.reelData = reels;
    console.log('🎰 Reel data set:', reels.length, 'reels');
    
    // Update vertex buffer with correct UV coordinates for initial display
    this.updateVertexBufferUVs();
  }
  
  
  /**
   * Updates the vertex buffer with correct UV coordinates based on current reel positions
   * Creates infinite scrolling reel effect using the full contract reel data
   */
  private updateVertexBufferUVs(): void {
    if (!this.vertexBuffer || !this.reelData.length) return;
    
    const gl = this.renderer['gl'];
    const symbolsPerReel = this.VISIBLE_SYMBOLS + (this.BUFFER_SYMBOLS * 2);
    const totalSymbols = this.config.reelCount * symbolsPerReel;
    const verticesPerSymbol = 6;
    const attributesPerVertex = 5; // x, y, u, v, reelIndex
    
    // Create new vertex data with updated UVs
    const vertices = new Float32Array(totalSymbols * verticesPerSymbol * attributesPerVertex);
    let vertexIndex = 0;
    
    for (let reel = 0; reel < this.config.reelCount; reel++) {
      const reelX = reel * (this.config.width / this.config.reelCount);
      const reelWidth = this.config.width / this.config.reelCount;
      const reelState = this.reelStates[reel];
      
      // Calculate the base scroll position in symbol units
      const scrollPosition = reelState.position / this.SYMBOL_HEIGHT;
      
      for (let symbol = -this.BUFFER_SYMBOLS; symbol < this.VISIBLE_SYMBOLS + this.BUFFER_SYMBOLS; symbol++) {
        // Use same positioning as geometry creation
        const symbolY = (symbol + this.BUFFER_SYMBOLS) * this.SYMBOL_HEIGHT;
        
        // Calculate which symbol should be displayed at this position
        let symbolId = 'A'; // Default fallback
        
        if (reelState.finalOutcome.length > 0) {
          // Use final outcome symbols if available (for final display)
          // With our new positioning, visible symbols start at index -BUFFER_SYMBOLS
          const visibleSymbolIndex = symbol + this.BUFFER_SYMBOLS; // Convert to 0-based index
          if (visibleSymbolIndex >= 0 && visibleSymbolIndex < this.VISIBLE_SYMBOLS && visibleSymbolIndex < reelState.finalOutcome.length) {
            symbolId = reelState.finalOutcome[visibleSymbolIndex] || 'A';
          } else {
            // For buffer areas, use cycling from the reel data
            if (this.reelData[reel] && this.reelData[reel].length > 0) {
              const wrappedIndex = ((Math.floor(scrollPosition) + symbol) % this.reelData[reel].length + this.reelData[reel].length) % this.reelData[reel].length;
              symbolId = this.reelData[reel][wrappedIndex] || 'A';
            }
          }
        } else if (this.reelData[reel] && this.reelData[reel].length > 0) {
          // Use full contract reel data for continuous scrolling
          // Calculate which symbol from the reel data should appear at this screen position
          const symbolScreenIndex = symbol + this.BUFFER_SYMBOLS; // 0-based screen position
          const scrollOffset = Math.floor(scrollPosition); // How far we've scrolled in symbols
          const reelDataIndex = (symbolScreenIndex + scrollOffset) % this.reelData[reel].length;
          const wrappedIndex = ((reelDataIndex % this.reelData[reel].length) + this.reelData[reel].length) % this.reelData[reel].length;
          symbolId = this.reelData[reel][wrappedIndex] || 'A';
        }
        
        // Get UV coordinates from atlas
        const symbolUV = this.symbolAtlas.getSymbolUV(symbolId) || { u1: 0, v1: 0, u2: 1, v2: 1 };
        
        // Create quad with correct UV coordinates
        const quad = [
          // Triangle 1
          reelX, symbolY, symbolUV.u1, symbolUV.v1, reel, // Top-left
          reelX, symbolY + this.SYMBOL_HEIGHT, symbolUV.u1, symbolUV.v2, reel, // Bottom-left
          reelX + reelWidth, symbolY, symbolUV.u2, symbolUV.v1, reel, // Top-right
          
          // Triangle 2
          reelX + reelWidth, symbolY, symbolUV.u2, symbolUV.v1, reel, // Top-right
          reelX, symbolY + this.SYMBOL_HEIGHT, symbolUV.u1, symbolUV.v2, reel, // Bottom-left
          reelX + reelWidth, symbolY + this.SYMBOL_HEIGHT, symbolUV.u2, symbolUV.v2, reel, // Bottom-right
        ];
        
        vertices.set(quad, vertexIndex);
        vertexIndex += quad.length;
      }
    }
    
    // Update the vertex buffer with new data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  
  startSpin(config: SpinAnimationConfig): void {
    for (let i = 0; i < this.reelStates.length; i++) {
      const state = this.reelStates[i];
      state.isSpinning = true;
      
      // Give each reel a slightly different speed for visual variety
      const speedVariation = 0.8 + (i * 0.1); // Reels get progressively faster: 0.8x, 0.9x, 1.0x, 1.1x, 1.2x
      state.velocity = this.SPIN_SPEED * speedVariation;
      
      state.finalOutcome = [];
    }
    
    console.log('🎰 WebGL reel spin started with varied speeds');
  }
  
  stopReel(reelIndex: number, outcome: string[]): void {
    if (reelIndex < 0 || reelIndex >= this.reelStates.length) return;
    
    const state = this.reelStates[reelIndex];
    state.finalOutcome = outcome;
    
    // Calculate target position to show the outcome
    // This is a simplified calculation - in practice, you'd need to find
    // the exact position in the reel data that matches the outcome
    state.targetPosition = state.position + (outcome.length * this.SYMBOL_HEIGHT);
    
    console.log(`🎰 Reel ${reelIndex} stopping with outcome:`, outcome);
  }
  
  showFinalOutcome(grid: string[][]): void {
    for (let i = 0; i < this.reelStates.length; i++) {
      const state = this.reelStates[i];
      state.isSpinning = false;
      state.velocity = 0;
      state.finalOutcome = grid[i] || [];
      
      // Set position to show the final outcome in the visible area
      // We want the first 3 symbols (finalOutcome) to be visible in positions 0, 100, 200
      // Since our geometry starts symbols at positions 0, 100, 200... this should work with position = 0
      state.position = 0;
    }
    
    // Update vertex buffer to show the final outcome symbols
    this.updateVertexBufferUVs();
    
    console.log('🎯 Final WebGL outcome displayed:', grid.map(reel => reel.join('')));
  }
  
  highlightPaylines(paylines: PaylineData[], duration: number): void {
    this.highlightedPaylines = paylines;
    this.highlightEndTime = performance.now() + duration;
    
    console.log(`✨ Highlighting ${paylines.length} paylines`);
  }
  
  clearHighlights(): void {
    this.highlightedPaylines = [];
    this.highlightEndTime = 0;
  }
  
  /**
   * Set the payline definitions from contract
   */
  setPaylines(paylines: number[][]): void {
    this.selectedPaylines = paylines;
    console.log(`📏 Paylines loaded: ${paylines.length} total`, paylines.slice(0, 3));
  }
  
  /**
   * Show selected paylines when user changes line count
   */
  showSelectedPaylines(lineCount: number): void {
    this.selectedPaylineCount = lineCount;
    this.paylineShowEndTime = performance.now() + this.PAYLINE_SHOW_DURATION;
    console.log(`📏 Showing ${lineCount} selected paylines`);
  }
  
  update(deltaTime: number): void {
    const deltaSeconds = deltaTime / 1000;
    
    for (const state of this.reelStates) {
      if (state.isSpinning) {
        // Update spinning physics
        if (state.finalOutcome.length === 0) {
          // Continuous spinning - use reel data for infinite scroll
          state.position += state.velocity * deltaSeconds;
          
          // Simple wrapping - let the shader handle the infinite scroll
          // Just keep position incrementing, shader will handle wrapping
          // No wrapping here to avoid visual jumps
        } else {
          // Decelerating to target
          const distanceToTarget = state.targetPosition - state.position;
          
          if (Math.abs(distanceToTarget) > 5 && state.velocity > 10) {
            // Still decelerating
            state.velocity = Math.max(state.velocity - this.DECELERATION * deltaSeconds, 0);
            state.position += state.velocity * deltaSeconds;
          } else {
            // Close enough to target
            state.position = state.targetPosition;
            state.velocity = 0;
            state.isSpinning = false;
          }
        }
      }
    }
    
    // Clear expired highlights
    if (this.highlightEndTime > 0 && performance.now() > this.highlightEndTime) {
      this.clearHighlights();
    }
    
    // Clear expired payline display
    if (this.paylineShowEndTime > 0 && performance.now() > this.paylineShowEndTime) {
      this.paylineShowEndTime = 0;
    }
    
    // Update vertex buffer UVs to show correct symbols based on current positions
    this.updateVertexBufferUVs();
  }
  
  render(): void {
    if (!this.program || !this.vertexBuffer) return;
    
    const gl = this.renderer['gl'];
    
    // Use shader program
    this.renderer.useProgram(this.program);
    
    // Set uniforms
    if (this.uniforms.resolution) {
      gl.uniform2f(this.uniforms.resolution, this.config.width, this.config.height);
    }
    
    if (this.uniforms.time) {
      gl.uniform1f(this.uniforms.time, performance.now() / 1000);
    }
    
    // Bind atlas texture
    const atlasTexture = this.symbolAtlas.getAtlasTexture();
    if (atlasTexture && this.uniforms.atlas) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.uniform1i(this.uniforms.atlas, 0);
    }
    
    // Set reel positions
    const reelPositions = this.reelStates.map(state => state.position);
    const positionsLocation = gl.getUniformLocation(this.program, 'u_reelPositions');
    if (positionsLocation) {
      gl.uniform1fv(positionsLocation, reelPositions);
    }
    
    // Set blur amount (based on if any reel is spinning)
    const anySpinning = this.reelStates.some(state => state.isSpinning);
    if (this.uniforms.blur) {
      gl.uniform1f(this.uniforms.blur, anySpinning ? 1.0 : 0.0);
    }
    
    // Set up vertex attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    
    const positionLocation = gl.getAttribLocation(this.program, 'a_position');
    const uvLocation = gl.getAttribLocation(this.program, 'a_uv');
    const reelIndexLocation = gl.getAttribLocation(this.program, 'a_reelIndex');
    
    const stride = 5 * 4; // 5 floats * 4 bytes
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);
    
    gl.enableVertexAttribArray(uvLocation);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, stride, 2 * 4);
    
    gl.enableVertexAttribArray(reelIndexLocation);
    gl.vertexAttribPointer(reelIndexLocation, 1, gl.FLOAT, false, stride, 4 * 4);
    
    // Draw all symbols using the infinite reel geometry
    if (this.indexBuffer) {
      const symbolsPerReel = this.VISIBLE_SYMBOLS + (this.BUFFER_SYMBOLS * 2);
      const indexCount = this.config.reelCount * symbolsPerReel * 6;
      this.renderer.drawElements(this.indexBuffer, indexCount);
    }
    
    // Clean up symbol rendering
    gl.disableVertexAttribArray(positionLocation);
    gl.disableVertexAttribArray(uvLocation);
    gl.disableVertexAttribArray(reelIndexLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    
    // Render paylines if they should be shown
    this.renderPaylines();
  }
  
  private renderPaylines(): void {
    console.log('🔍 DEBUG: renderPaylines called. EndTime:', this.paylineShowEndTime, 'Paylines count:', this.selectedPaylines.length);
    
    if (this.paylineShowEndTime === 0) {
      console.log('🔍 DEBUG: Not rendering - paylineShowEndTime is 0');
      return;
    }
    
    if (this.selectedPaylines.length === 0) {
      console.log('🔍 DEBUG: Not rendering - no paylines loaded');
      return;
    }
    
    const gl = this.renderer['gl'];
    const now = performance.now();
    
    // Calculate fade based on remaining time
    let alpha = 1.0;
    if (this.paylineShowEndTime > 0) {
      const timeLeft = this.paylineShowEndTime - now;
      const fadeTime = 1000; // Fade out over 1 second
      if (timeLeft < fadeTime) {
        alpha = Math.max(0, timeLeft / fadeTime);
      }
    }
    
    if (alpha <= 0) {
      console.log('🔍 DEBUG: Not rendering - alpha is 0');
      return;
    }
    
    console.log(`🔍 DEBUG: Actually rendering ${this.selectedPaylineCount} paylines, alpha: ${alpha.toFixed(2)}`);
    
    // Render lines using basic line drawing
    gl.lineWidth(2.0);
    
    for (let i = 0; i < Math.min(this.selectedPaylineCount, this.selectedPaylines.length); i++) {
      const payline = this.selectedPaylines[i];
      const color = this.getPaylineColor(i);
      
      console.log(`🔍 DEBUG: Rendering payline ${i}:`, payline, 'color:', color);
      this.renderPaylinePath(payline, color, alpha);
    }
  }
  
  private getPaylineColor(index: number): [number, number, number] {
    const colors = [
      [0.063, 0.725, 0.506], // #10b981
      [0.231, 0.510, 0.961], // #3b82f6  
      [0.937, 0.267, 0.267], // #ef4444
      [0.961, 0.584, 0.043], // #f59e0b
      [0.545, 0.361, 0.961], // #8b5cf6
    ];
    const colorIndex = index % colors.length;
    return colors[colorIndex];
  }
  
  private renderPaylinePath(payline: number[], color: [number, number, number], alpha: number): void {
    if (!this.lineProgram) {
      console.log('🔍 DEBUG: Missing lineProgram');
      return;
    }
    if (!this.lineVertexBuffer) {
      console.log('🔍 DEBUG: Missing lineVertexBuffer');
      return;
    }
    
    const gl = this.renderer['gl'];
    const reelWidth = this.config.width / 5;
    const symbolHeight = this.SYMBOL_HEIGHT;
    
    console.log('🔍 DEBUG: Config dimensions:', this.config.width, 'x', this.config.height, 'reelWidth:', reelWidth, 'symbolHeight:', symbolHeight);
    
    // Simple approach: draw colored circles at each payline position
    for (let reel = 0; reel < payline.length; reel++) {
      const row = payline[reel];
      const x = reel * reelWidth + reelWidth / 2;
      const y = row * symbolHeight + symbolHeight / 2;
      
      console.log(`🔍 DEBUG: Position ${reel},${row} -> coordinates (${x.toFixed(1)}, ${y.toFixed(1)})`);
      
      if (x < 0 || x > this.config.width || y < 0 || y > this.config.height) {
        console.log('🔍 DEBUG: Coordinates are outside viewport bounds!');
      }
      
      // Create a small square at each position
      const size = 10;
      const vertices = new Float32Array([
        x - size, y - size,
        x + size, y - size,
        x - size, y + size,
        x + size, y + size
      ]);
      
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      
      this.renderer.useProgram(this.lineProgram);
      
      // Set uniforms
      const resolutionLocation = gl.getUniformLocation(this.lineProgram, 'u_resolution');
      const colorLocation = gl.getUniformLocation(this.lineProgram, 'u_color');
      const alphaLocation = gl.getUniformLocation(this.lineProgram, 'u_alpha');
      
      console.log('🔍 DEBUG: Uniform locations - resolution:', resolutionLocation, 'color:', colorLocation, 'alpha:', alphaLocation);
      
      if (resolutionLocation) {
        gl.uniform2f(resolutionLocation, this.config.width, this.config.height);
        console.log('🔍 DEBUG: Set resolution uniform to:', this.config.width, this.config.height);
      }
      if (colorLocation) {
        gl.uniform3f(colorLocation, color[0], color[1], color[2]);
        console.log('🔍 DEBUG: Set color uniform to:', color);
      }
      if (alphaLocation) {
        gl.uniform1f(alphaLocation, alpha);
        console.log('🔍 DEBUG: Set alpha uniform to:', alpha);
      }
      
      const positionLocation = gl.getAttribLocation(this.lineProgram, 'a_position');
      console.log('🔍 DEBUG: Position attribute location:', positionLocation);
      
      if (positionLocation >= 0) {
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      } else {
        console.log('🔍 DEBUG: Position attribute not found in shader!');
      }
      
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      
      // Draw triangle strip to make a square
      console.log(`🔍 DEBUG: Drawing square at (${x}, ${y}) with size ${size}, color [${color.join(', ')}], alpha ${alpha}`);
      
      // Check for WebGL errors before drawing
      let error = gl.getError();
      if (error !== gl.NO_ERROR) {
        console.log('🔍 DEBUG: WebGL error before draw:', error);
      }
      
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      
      // Check for WebGL errors after drawing  
      error = gl.getError();
      if (error !== gl.NO_ERROR) {
        console.log('🔍 DEBUG: WebGL error after draw:', error);
      }
      
      if (positionLocation >= 0) {
        gl.disableVertexAttribArray(positionLocation);
      }
    }
    
    gl.disable(gl.BLEND);
  }
  
  isAnimating(): boolean {
    return this.reelStates.some(state => state.isSpinning);
  }
  
  reset(): void {
    for (const state of this.reelStates) {
      state.position = 0;
      state.velocity = 0;
      state.targetPosition = 0;
      state.isSpinning = false;
      state.finalOutcome = [];
    }
    
    this.clearHighlights();
  }
  
  updateConfig(config: DisplayConfig): void {
    this.config = config;
    
    // Recreate geometry if dimensions changed
    this.createGeometry();
  }
}