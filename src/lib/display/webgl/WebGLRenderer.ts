/**
 * WebGL Renderer - Core WebGL rendering engine for slot machine
 * Handles shaders, buffers, textures, and rendering pipeline
 */

export interface ShaderSource {
  vertex: string;
  fragment: string;
}

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  vertices: number;
  textureMemory: number; // bytes
  frameTime: number; // ms
}

export class WebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private programs: Map<string, WebGLProgram> = new Map();
  private textures: Map<string, WebGLTexture> = new Map();
  private buffers: Map<string, WebGLBuffer> = new Map();
  
  private stats: RenderStats = {
    drawCalls: 0,
    triangles: 0,
    vertices: 0,
    textureMemory: 0,
    frameTime: 0
  };
  
  private animationFrame: number = 0;
  private renderCallbacks: Function[] = [];
  private lastFrameTime = 0;
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) {
      throw new Error('WebGL not supported on this device');
    }
    
    this.gl = gl as WebGLRenderingContext;
    this.initializeGL();
  }
  
  private initializeGL(): void {
    const gl = this.gl;
    
    // Set up basic GL state
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // Enable required extensions
    this.enableExtensions();
    
    console.log('✅ WebGL renderer initialized');
  }
  
  private enableExtensions(): void {
    const gl = this.gl;
    
    // Try to enable useful extensions
    const extensions = [
      'OES_vertex_array_object',
      'WEBGL_debug_renderer_info',
      'OES_texture_float',
      'OES_texture_half_float'
    ];
    
    extensions.forEach(ext => {
      const extension = gl.getExtension(ext);
      if (extension) {
        console.log(`✅ WebGL extension enabled: ${ext}`);
      }
    });
  }
  
  /**
   * Compile and link a shader program
   */
  createProgram(name: string, shaderSource: ShaderSource): WebGLProgram {
    const gl = this.gl;
    
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, shaderSource.vertex);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, shaderSource.fragment);
    
    const program = gl.createProgram();
    if (!program) {
      throw new Error(`Failed to create program: ${name}`);
    }
    
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Failed to link program ${name}: ${info}`);
    }
    
    // Clean up shaders
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    
    this.programs.set(name, program);
    console.log(`✅ Shader program created: ${name}`);
    
    return program;
  }
  
  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    
    if (!shader) {
      throw new Error('Failed to create shader');
    }
    
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compilation error: ${info}`);
    }
    
    return shader;
  }
  
  /**
   * Get a compiled program by name
   */
  getProgram(name: string): WebGLProgram | null {
    return this.programs.get(name) || null;
  }
  
  /**
   * Create and upload a texture
   */
  createTexture(name: string, image: HTMLImageElement | HTMLCanvasElement): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    
    if (!texture) {
      throw new Error(`Failed to create texture: ${name}`);
    }
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    
    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Generate mipmaps if image is power of 2
    if (this.isPowerOfTwo(image.width) && this.isPowerOfTwo(image.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    this.textures.set(name, texture);
    this.stats.textureMemory += image.width * image.height * 4; // RGBA bytes
    
    console.log(`✅ Texture created: ${name} (${image.width}x${image.height})`);
    return texture;
  }
  
  private isPowerOfTwo(value: number): boolean {
    return (value & (value - 1)) === 0;
  }
  
  /**
   * Get a texture by name
   */
  getTexture(name: string): WebGLTexture | null {
    return this.textures.get(name) || null;
  }
  
  /**
   * Create a buffer
   */
  createBuffer(name: string, data: Float32Array | Uint16Array, type: 'vertex' | 'index' = 'vertex'): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    
    if (!buffer) {
      throw new Error(`Failed to create buffer: ${name}`);
    }
    
    const target = type === 'index' ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    gl.bindBuffer(target, null);
    
    this.buffers.set(name, buffer);
    return buffer;
  }
  
  /**
   * Get a buffer by name
   */
  getBuffer(name: string): WebGLBuffer | null {
    return this.buffers.get(name) || null;
  }
  
  /**
   * Set the viewport
   */
  setViewport(width: number, height: number): void {
    this.gl.viewport(0, 0, width, height);
    this.canvas.width = width;
    this.canvas.height = height;
  }
  
  /**
   * Clear the screen
   */
  clear(r = 0, g = 0, b = 0, a = 1): void {
    const gl = this.gl;
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // Reset stats for new frame
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;
    this.stats.vertices = 0;
  }
  
  /**
   * Use a shader program
   */
  useProgram(program: WebGLProgram): void {
    this.gl.useProgram(program);
  }
  
  /**
   * Set uniform values
   */
  setUniform(program: WebGLProgram, name: string, value: any): void {
    const gl = this.gl;
    const location = gl.getUniformLocation(program, name);
    
    if (location === null) {
      console.warn(`Uniform ${name} not found in shader`);
      return;
    }
    
    if (typeof value === 'number') {
      gl.uniform1f(location, value);
    } else if (Array.isArray(value)) {
      if (value.length === 2) {
        gl.uniform2fv(location, value);
      } else if (value.length === 3) {
        gl.uniform3fv(location, value);
      } else if (value.length === 4) {
        gl.uniform4fv(location, value);
      } else if (value.length === 16) {
        gl.uniformMatrix4fv(location, false, value);
      }
    }
  }
  
  /**
   * Draw indexed triangles
   */
  drawElements(indexBuffer: WebGLBuffer, indexCount: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
    
    this.stats.drawCalls++;
    this.stats.triangles += indexCount / 3;
  }
  
  /**
   * Draw arrays
   */
  drawArrays(vertexCount: number, mode: number = this.gl.TRIANGLES): void {
    this.gl.drawArrays(mode, 0, vertexCount);
    
    this.stats.drawCalls++;
    this.stats.vertices += vertexCount;
    if (mode === this.gl.TRIANGLES) {
      this.stats.triangles += vertexCount / 3;
    }
  }
  
  /**
   * Start the render loop
   */
  startRenderLoop(): void {
    const renderFrame = (timestamp: number) => {
      this.stats.frameTime = timestamp - this.lastFrameTime;
      this.lastFrameTime = timestamp;
      
      // Call all registered render callbacks
      this.renderCallbacks.forEach(callback => callback(timestamp));
      
      this.animationFrame = requestAnimationFrame(renderFrame);
    };
    
    this.animationFrame = requestAnimationFrame(renderFrame);
  }
  
  /**
   * Stop the render loop
   */
  stopRenderLoop(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
  }
  
  /**
   * Add a render callback
   */
  onRender(callback: (timestamp: number) => void): void {
    this.renderCallbacks.push(callback);
  }
  
  /**
   * Remove a render callback
   */
  offRender(callback: (timestamp: number) => void): void {
    const index = this.renderCallbacks.indexOf(callback);
    if (index > -1) {
      this.renderCallbacks.splice(index, 1);
    }
  }
  
  /**
   * Get current render statistics
   */
  getStats(): RenderStats {
    return { ...this.stats };
  }
  
  /**
   * Get WebGL context info
   */
  getContextInfo(): any {
    const gl = this.gl;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    
    return {
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown',
      unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown',
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS)
    };
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopRenderLoop();
    
    // Delete all programs
    this.programs.forEach(program => this.gl.deleteProgram(program));
    this.programs.clear();
    
    // Delete all textures
    this.textures.forEach(texture => this.gl.deleteTexture(texture));
    this.textures.clear();
    
    // Delete all buffers
    this.buffers.forEach(buffer => this.gl.deleteBuffer(buffer));
    this.buffers.clear();
    
    this.renderCallbacks = [];
    
    console.log('🗑️ WebGL renderer destroyed');
  }
}