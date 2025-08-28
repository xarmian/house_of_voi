/**
 * Particle System - WebGL-based particle effects for slot machine
 * Handles win celebrations, explosions, and other visual effects
 */

import type { WebGLRenderer, ShaderSource } from './WebGLRenderer';
import type { DisplayConfig, ParticleConfig } from '../ISlotDisplay';

interface Particle {
  x: number;
  y: number;
  vx: number; // Velocity X
  vy: number; // Velocity Y
  life: number; // Current life (0-1)
  maxLife: number; // Maximum life in seconds
  size: number;
  color: [number, number, number, number]; // RGBA
  rotation: number;
  rotationSpeed: number;
}

interface ParticleEffect {
  id: string;
  particles: Particle[];
  config: ParticleConfig;
  startTime: number;
  duration: number;
  active: boolean;
}

export class ParticleSystem {
  private renderer: WebGLRenderer;
  private config: DisplayConfig;
  
  private effects: Map<string, ParticleEffect> = new Map();
  private nextEffectId = 1;
  
  // WebGL resources
  private program: WebGLProgram | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private maxParticles = 1000;
  
  // Shader uniforms
  private uniforms: {
    resolution?: WebGLUniformLocation;
    time?: WebGLUniformLocation;
  } = {};
  
  constructor(renderer: WebGLRenderer, config: DisplayConfig) {
    this.renderer = renderer;
    this.config = config;
    
    this.initializeShaders();
    this.createBuffers();
  }
  
  private initializeShaders(): void {
    const vertexShader = `
      precision mediump float;
      
      attribute vec2 a_position;
      attribute vec2 a_velocity;
      attribute float a_life;
      attribute float a_maxLife;
      attribute float a_size;
      attribute vec4 a_color;
      attribute float a_rotation;
      
      uniform vec2 u_resolution;
      uniform float u_time;
      
      varying vec4 v_color;
      varying float v_life;
      
      void main() {
        // Calculate current position based on velocity and time
        vec2 position = a_position + a_velocity * u_time;
        
        // Apply gravity (for coin-rain effect)
        position.y += 0.5 * 980.0 * u_time * u_time; // Gravity acceleration
        
        // Convert to clip space
        vec2 clipSpace = ((position / u_resolution) * 2.0) - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        
        // Calculate life-based alpha
        float lifeRatio = a_life / a_maxLife;
        float alpha = 1.0 - lifeRatio; // Fade out over time
        
        v_color = vec4(a_color.rgb, a_color.a * alpha);
        v_life = lifeRatio;
        
        // Size based on life (can grow/shrink over time)
        float sizeMultiplier = 1.0 + sin(lifeRatio * 3.14159) * 0.5;
        gl_PointSize = a_size * sizeMultiplier;
      }
    `;
    
    const fragmentShader = `
      precision mediump float;
      
      uniform float u_time;
      
      varying vec4 v_color;
      varying float v_life;
      
      void main() {
        // Create circular particles
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        
        if (dist > 0.5) {
          discard; // Outside circle
        }
        
        // Soft edges
        float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
        
        // Sparkle effect
        float sparkle = 1.0 + 0.3 * sin(u_time * 10.0 + v_life * 20.0);
        
        gl_FragColor = vec4(v_color.rgb * sparkle, v_color.a * alpha);
      }
    `;
    
    const shaderSource: ShaderSource = {
      vertex: vertexShader,
      fragment: fragmentShader
    };
    
    this.program = this.renderer.createProgram('particle-shader', shaderSource);
    
    // Get uniform locations
    const gl = this.renderer['gl'];
    if (this.program) {
      this.uniforms.resolution = gl.getUniformLocation(this.program, 'u_resolution');
      this.uniforms.time = gl.getUniformLocation(this.program, 'u_time');
    }
  }
  
  private createBuffers(): void {
    // Create buffer for particle data
    // Each particle needs: position(2) + velocity(2) + life(1) + maxLife(1) + size(1) + color(4) + rotation(1) = 12 floats
    const bufferSize = this.maxParticles * 12;
    const buffer = new Float32Array(bufferSize);
    
    this.vertexBuffer = this.renderer.createBuffer('particle-vertices', buffer, 'vertex');
  }
  
  createEffect(config: ParticleConfig): string {
    const effectId = `effect_${this.nextEffectId++}`;
    
    const particles = this.createParticlesForConfig(config);
    
    const effect: ParticleEffect = {
      id: effectId,
      particles,
      config,
      startTime: performance.now(),
      duration: config.duration,
      active: true
    };
    
    this.effects.set(effectId, effect);
    
    console.log(`✨ Particle effect created: ${config.type} (${particles.length} particles)`);
    
    return effectId;
  }
  
  private createParticlesForConfig(config: ParticleConfig): Particle[] {
    const particles: Particle[] = [];
    const centerX = this.config.width / 2;
    const centerY = this.config.height / 2;
    
    switch (config.type) {
      case 'explosion':
        particles.push(...this.createExplosionParticles(config, centerX, centerY));
        break;
        
      case 'coin-rain':
        particles.push(...this.createCoinRainParticles(config));
        break;
        
      case 'symbol-burst':
        particles.push(...this.createSymbolBurstParticles(config, centerX, centerY));
        break;
        
      case 'sparkles':
        particles.push(...this.createSparkleParticles(config));
        break;
    }
    
    return particles;
  }
  
  private createExplosionParticles(config: ParticleConfig, centerX: number, centerY: number): Particle[] {
    const particles: Particle[] = [];
    
    for (let i = 0; i < config.count; i++) {
      const angle = (i / config.count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = 100 + Math.random() * 300; // Pixels per second
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      
      const colorIndex = Math.floor(Math.random() * config.colors.length);
      const color = this.hexToRgba(config.colors[colorIndex]);
      
      particles.push({
        x: centerX + (Math.random() - 0.5) * 50,
        y: centerY + (Math.random() - 0.5) * 50,
        vx,
        vy,
        life: 0,
        maxLife: 1 + Math.random() * 2, // 1-3 seconds
        size: 3 + Math.random() * 8,
        color,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 4
      });
    }
    
    return particles;
  }
  
  private createCoinRainParticles(config: ParticleConfig): Particle[] {
    const particles: Particle[] = [];
    
    for (let i = 0; i < config.count; i++) {
      const x = Math.random() * this.config.width;
      const y = -50 - Math.random() * 200; // Start above screen
      const vx = (Math.random() - 0.5) * 100; // Small horizontal drift
      const vy = 50 + Math.random() * 100; // Downward velocity
      
      particles.push({
        x,
        y,
        vx,
        vy,
        life: 0,
        maxLife: 3 + Math.random() * 2, // 3-5 seconds
        size: 8 + Math.random() * 6,
        color: [1.0, 0.84, 0.0, 1.0], // Gold color
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: 2 + Math.random() * 4
      });
    }
    
    return particles;
  }
  
  private createSymbolBurstParticles(config: ParticleConfig, centerX: number, centerY: number): Particle[] {
    const particles: Particle[] = [];
    
    // Create multiple bursts from different positions
    const burstCount = Math.min(5, Math.max(1, Math.floor(config.count / 20)));
    
    for (let burst = 0; burst < burstCount; burst++) {
      const burstX = centerX + (Math.random() - 0.5) * 200;
      const burstY = centerY + (Math.random() - 0.5) * 200;
      const particlesPerBurst = Math.floor(config.count / burstCount);
      
      for (let i = 0; i < particlesPerBurst; i++) {
        const angle = (i / particlesPerBurst) * Math.PI * 2;
        const speed = 150 + Math.random() * 400;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        
        const colorIndex = Math.floor(Math.random() * config.colors.length);
        const color = this.hexToRgba(config.colors[colorIndex]);
        
        particles.push({
          x: burstX,
          y: burstY,
          vx,
          vy,
          life: 0,
          maxLife: 1.5 + Math.random() * 1.5,
          size: 4 + Math.random() * 10,
          color,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 6
        });
      }
    }
    
    return particles;
  }
  
  private createSparkleParticles(config: ParticleConfig): Particle[] {
    const particles: Particle[] = [];
    
    for (let i = 0; i < config.count; i++) {
      const x = Math.random() * this.config.width;
      const y = Math.random() * this.config.height;
      
      particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0.5 + Math.random() * 1.5,
        size: 2 + Math.random() * 4,
        color: [1.0, 1.0, 1.0, 1.0], // White sparkles
        rotation: 0,
        rotationSpeed: 0
      });
    }
    
    return particles;
  }
  
  private hexToRgba(hex: string): [number, number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b, 1.0];
  }
  
  update(deltaTime: number): void {
    const deltaSeconds = deltaTime / 1000;
    const currentTime = performance.now();
    
    // Update all active effects
    for (const [effectId, effect] of this.effects) {
      if (!effect.active) continue;
      
      // Check if effect has expired
      if (currentTime - effect.startTime > effect.duration) {
        effect.active = false;
        continue;
      }
      
      // Update particles
      for (let i = effect.particles.length - 1; i >= 0; i--) {
        const particle = effect.particles[i];
        
        // Update life
        particle.life += deltaSeconds;
        
        // Remove dead particles
        if (particle.life > particle.maxLife) {
          effect.particles.splice(i, 1);
          continue;
        }
        
        // Update position
        particle.x += particle.vx * deltaSeconds;
        particle.y += particle.vy * deltaSeconds;
        
        // Update rotation
        particle.rotation += particle.rotationSpeed * deltaSeconds;
        
        // Apply drag
        particle.vx *= 0.99;
        particle.vy *= 0.99;
        
        // Gravity for coin rain
        if (effect.config.type === 'coin-rain') {
          particle.vy += 980 * deltaSeconds; // Gravity
        }
      }
      
      // Remove effect if no particles left
      if (effect.particles.length === 0) {
        effect.active = false;
      }
    }
    
    // Clean up inactive effects
    for (const [effectId, effect] of this.effects) {
      if (!effect.active) {
        this.effects.delete(effectId);
      }
    }
  }
  
  render(): void {
    if (!this.program || !this.vertexBuffer) return;
    
    // Collect all active particles
    const allParticles: Particle[] = [];
    for (const effect of this.effects.values()) {
      if (effect.active) {
        allParticles.push(...effect.particles);
      }
    }
    
    if (allParticles.length === 0) return;
    
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
    
    // Prepare vertex data
    const vertexData = new Float32Array(allParticles.length * 12);
    let index = 0;
    
    for (const particle of allParticles) {
      vertexData[index++] = particle.x;
      vertexData[index++] = particle.y;
      vertexData[index++] = particle.vx;
      vertexData[index++] = particle.vy;
      vertexData[index++] = particle.life;
      vertexData[index++] = particle.maxLife;
      vertexData[index++] = particle.size;
      vertexData[index++] = particle.color[0];
      vertexData[index++] = particle.color[1];
      vertexData[index++] = particle.color[2];
      vertexData[index++] = particle.color[3];
      vertexData[index++] = particle.rotation;
    }
    
    // Update buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);
    
    // Set up attributes
    const stride = 12 * 4; // 12 floats * 4 bytes
    let offset = 0;
    
    const positionLocation = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, offset);
    offset += 2 * 4;
    
    const velocityLocation = gl.getAttribLocation(this.program, 'a_velocity');
    gl.enableVertexAttribArray(velocityLocation);
    gl.vertexAttribPointer(velocityLocation, 2, gl.FLOAT, false, stride, offset);
    offset += 2 * 4;
    
    const lifeLocation = gl.getAttribLocation(this.program, 'a_life');
    gl.enableVertexAttribArray(lifeLocation);
    gl.vertexAttribPointer(lifeLocation, 1, gl.FLOAT, false, stride, offset);
    offset += 1 * 4;
    
    const maxLifeLocation = gl.getAttribLocation(this.program, 'a_maxLife');
    gl.enableVertexAttribArray(maxLifeLocation);
    gl.vertexAttribPointer(maxLifeLocation, 1, gl.FLOAT, false, stride, offset);
    offset += 1 * 4;
    
    const sizeLocation = gl.getAttribLocation(this.program, 'a_size');
    gl.enableVertexAttribArray(sizeLocation);
    gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, stride, offset);
    offset += 1 * 4;
    
    const colorLocation = gl.getAttribLocation(this.program, 'a_color');
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, stride, offset);
    offset += 4 * 4;
    
    const rotationLocation = gl.getAttribLocation(this.program, 'a_rotation');
    gl.enableVertexAttribArray(rotationLocation);
    gl.vertexAttribPointer(rotationLocation, 1, gl.FLOAT, false, stride, offset);
    
    // Render particles as points
    this.renderer.drawArrays(allParticles.length, gl.POINTS);
    
    // Clean up attributes
    gl.disableVertexAttribArray(positionLocation);
    gl.disableVertexAttribArray(velocityLocation);
    gl.disableVertexAttribArray(lifeLocation);
    gl.disableVertexAttribArray(maxLifeLocation);
    gl.disableVertexAttribArray(sizeLocation);
    gl.disableVertexAttribArray(colorLocation);
    gl.disableVertexAttribArray(rotationLocation);
  }
  
  hasActiveEffects(): boolean {
    return Array.from(this.effects.values()).some(effect => effect.active);
  }
  
  getActiveParticleCount(): number {
    return Array.from(this.effects.values())
      .filter(effect => effect.active)
      .reduce((total, effect) => total + effect.particles.length, 0);
  }
  
  clearAll(): void {
    this.effects.clear();
    console.log('🧹 All particle effects cleared');
  }
  
  updateConfig(config: DisplayConfig): void {
    this.config = config;
  }
}