/**
 * Symbol Atlas - Manages symbol textures efficiently
 * Combines all symbol images into a single texture atlas for optimal GPU performance
 */

import type { WebGLRenderer } from './WebGLRenderer';
import { getSymbol } from '../../constants/symbols';

export interface SymbolUV {
  u1: number; // Left U coordinate
  v1: number; // Top V coordinate
  u2: number; // Right U coordinate
  v2: number; // Bottom V coordinate
}

export interface AtlasEntry {
  symbol: string;
  x: number;
  y: number;
  width: number;
  height: number;
  uv: SymbolUV;
}

export class SymbolAtlas {
  private renderer: WebGLRenderer;
  private atlas: Map<string, AtlasEntry> = new Map();
  private atlasTexture: WebGLTexture | null = null;
  private atlasCanvas: HTMLCanvasElement | null = null;
  private atlasContext: CanvasRenderingContext2D | null = null;
  
  // Atlas configuration
  private readonly ATLAS_SIZE = 1024; // 1024x1024 atlas texture
  private readonly SYMBOL_SIZE = 128; // Each symbol is 128x128
  private readonly SYMBOLS_PER_ROW = Math.floor(this.ATLAS_SIZE / this.SYMBOL_SIZE);
  private readonly PADDING = 2; // Padding between symbols to prevent bleeding
  
  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
  }
  
  async initialize(): Promise<void> {
    try {
      // Create atlas canvas
      this.atlasCanvas = document.createElement('canvas');
      this.atlasCanvas.width = this.ATLAS_SIZE;
      this.atlasCanvas.height = this.ATLAS_SIZE;
      this.atlasContext = this.atlasCanvas.getContext('2d');
      
      if (!this.atlasContext) {
        throw new Error('Failed to get 2D context for atlas');
      }
      
      // Set up context for crisp rendering
      this.atlasContext.imageSmoothingEnabled = false;
      
      // Load and pack all symbols
      await this.loadAllSymbols();
      
      // Create WebGL texture from atlas
      this.createAtlasTexture();
      
      console.log(`✅ Symbol atlas created with ${this.atlas.size} symbols`);
      
    } catch (error) {
      console.error('❌ Failed to initialize symbol atlas:', error);
      throw error;
    }
  }
  
  private async loadAllSymbols(): Promise<void> {
    // Import the SLOT_SYMBOLS to get all available symbols
    const { SLOT_SYMBOLS } = await import('../../constants/symbols');
    let symbolIds = Object.keys(SLOT_SYMBOLS); // Get all symbol IDs: A, B, C, D, x, y, z, etc.
    
    // Add underscore as a separate symbol that maps to 'x' texture
    // This handles the reel data that uses '_' characters
    if (!symbolIds.includes('_')) {
      symbolIds.push('_');
    }
    
    console.log(`🎯 Loading ${symbolIds.length} symbols into atlas:`, symbolIds);
    
    const loadPromises: Promise<void>[] = [];
    
    let currentX = this.PADDING;
    let currentY = this.PADDING;
    
    for (const symbolId of symbolIds) {
      loadPromises.push(this.loadSymbol(symbolId, currentX, currentY));
      
      // Calculate next position
      currentX += this.SYMBOL_SIZE + this.PADDING;
      if (currentX + this.SYMBOL_SIZE > this.ATLAS_SIZE) {
        currentX = this.PADDING;
        currentY += this.SYMBOL_SIZE + this.PADDING;
      }
      
      if (currentY + this.SYMBOL_SIZE > this.ATLAS_SIZE) {
        throw new Error(`Atlas size (${this.ATLAS_SIZE}x${this.ATLAS_SIZE}) too small for ${symbolIds.length} symbols. Need larger atlas or smaller symbols.`);
      }
    }
    
    await Promise.all(loadPromises);
    console.log(`✅ Successfully loaded ${symbolIds.length} symbols into atlas`);
  }
  
  private async loadSymbol(symbolId: string, x: number, y: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Special handling for underscore - use 'x' symbol data but keep separate atlas entry
      const symbol = getSymbol(symbolId); // This will map '_' to 'x' symbol data
      const image = new Image();
      
      image.onload = () => {
        if (!this.atlasContext) {
          reject(new Error('Atlas context not available'));
          return;
        }
        
        // Draw symbol to atlas
        this.atlasContext.drawImage(
          image, 
          x, y, 
          this.SYMBOL_SIZE, this.SYMBOL_SIZE
        );
        
        // Calculate UV coordinates
        const uv: SymbolUV = {
          u1: x / this.ATLAS_SIZE,
          v1: y / this.ATLAS_SIZE,
          u2: (x + this.SYMBOL_SIZE) / this.ATLAS_SIZE,
          v2: (y + this.SYMBOL_SIZE) / this.ATLAS_SIZE
        };
        
        // Store atlas entry with original symbolId (so '_' and 'x' have separate entries)
        const entry: AtlasEntry = {
          symbol: symbolId,
          x,
          y,
          width: this.SYMBOL_SIZE,
          height: this.SYMBOL_SIZE,
          uv
        };
        
        this.atlas.set(symbolId, entry);
        console.log(`✅ Loaded symbol '${symbolId}' using image: ${symbol.image}`);
        resolve();
      };
      
      image.onerror = () => {
        console.warn(`⚠️ Failed to load symbol image: ${symbol.image} for symbol ${symbolId}, using fallback`);
        // Create a simple fallback colored rectangle
        if (this.atlasContext) {
          this.atlasContext.fillStyle = symbol.color || '#666666';
          this.atlasContext.fillRect(x, y, this.SYMBOL_SIZE, this.SYMBOL_SIZE);
          
          // Add symbol text as fallback
          this.atlasContext.fillStyle = 'white';
          this.atlasContext.font = '48px Arial';
          this.atlasContext.textAlign = 'center';
          this.atlasContext.fillText(symbolId, x + this.SYMBOL_SIZE/2, y + this.SYMBOL_SIZE/2 + 16);
          
          // Store atlas entry even for fallback
          const uv: SymbolUV = {
            u1: x / this.ATLAS_SIZE,
            v1: y / this.ATLAS_SIZE,
            u2: (x + this.SYMBOL_SIZE) / this.ATLAS_SIZE,
            v2: (y + this.SYMBOL_SIZE) / this.ATLAS_SIZE
          };
          
          const entry: AtlasEntry = {
            symbol: symbolId,
            x,
            y,
            width: this.SYMBOL_SIZE,
            height: this.SYMBOL_SIZE,
            uv
          };
          
          this.atlas.set(symbolId, entry);
          resolve();
        } else {
          reject(new Error(`Failed to load symbol image: ${symbol.image}`));
        }
      };
      
      // Start loading
      image.crossOrigin = 'anonymous';
      image.src = symbol.image;
    });
  }
  
  private createAtlasTexture(): void {
    if (!this.atlasCanvas) {
      throw new Error('Atlas canvas not available');
    }
    
    // Create WebGL texture from the atlas canvas
    this.atlasTexture = this.renderer.createTexture('symbol-atlas', this.atlasCanvas);
    
    console.log(`✅ Atlas texture created: ${this.ATLAS_SIZE}x${this.ATLAS_SIZE}`);
  }
  
  /**
   * Get UV coordinates for a symbol
   */
  getSymbolUV(symbolId: string): SymbolUV | null {
    const entry = this.atlas.get(symbolId);
    return entry ? entry.uv : null;
  }
  
  /**
   * Get atlas entry for a symbol
   */
  getSymbolEntry(symbolId: string): AtlasEntry | null {
    return this.atlas.get(symbolId) || null;
  }
  
  /**
   * Get the atlas texture
   */
  getAtlasTexture(): WebGLTexture | null {
    return this.atlasTexture;
  }
  
  /**
   * Get all symbol IDs in the atlas
   */
  getAllSymbolIds(): string[] {
    return Array.from(this.atlas.keys());
  }
  
  /**
   * Check if a symbol exists in the atlas
   */
  hasSymbol(symbolId: string): boolean {
    return this.atlas.has(symbolId);
  }
  
  /**
   * Get atlas dimensions
   */
  getAtlasDimensions(): { width: number; height: number } {
    return {
      width: this.ATLAS_SIZE,
      height: this.ATLAS_SIZE
    };
  }
  
  /**
   * Get atlas utilization stats
   */
  getStats(): {
    symbolCount: number;
    utilization: number; // Percentage of atlas used
    memoryUsage: number; // Bytes
  } {
    const symbolCount = this.atlas.size;
    const symbolArea = symbolCount * this.SYMBOL_SIZE * this.SYMBOL_SIZE;
    const totalArea = this.ATLAS_SIZE * this.ATLAS_SIZE;
    const utilization = (symbolArea / totalArea) * 100;
    const memoryUsage = this.ATLAS_SIZE * this.ATLAS_SIZE * 4; // RGBA bytes
    
    return {
      symbolCount,
      utilization,
      memoryUsage
    };
  }
  
  /**
   * Export atlas for debugging (returns data URL)
   */
  exportAtlas(): string | null {
    return this.atlasCanvas?.toDataURL() || null;
  }
  
  /**
   * Create a quad mesh for rendering symbols
   * Returns vertex data with position and UV coordinates
   */
  createSymbolQuad(symbolId: string, x: number, y: number, width: number, height: number): Float32Array | null {
    const uv = this.getSymbolUV(symbolId);
    if (!uv) return null;
    
    // Create quad vertices: position (x, y) + UV (u, v)
    // Triangle 1: top-left, bottom-left, top-right
    // Triangle 2: top-right, bottom-left, bottom-right
    const vertices = new Float32Array([
      // Position   UV
      x,         y,          uv.u1, uv.v1, // Top-left
      x,         y + height, uv.u1, uv.v2, // Bottom-left
      x + width, y,          uv.u2, uv.v1, // Top-right
      
      x + width, y,          uv.u2, uv.v1, // Top-right
      x,         y + height, uv.u1, uv.v2, // Bottom-left
      x + width, y + height, uv.u2, uv.v2, // Bottom-right
    ]);
    
    return vertices;
  }
  
  /**
   * Create UV coordinates for a batch of symbols
   */
  createBatchUVs(symbolIds: string[]): Float32Array {
    const uvs: number[] = [];
    
    for (const symbolId of symbolIds) {
      const uv = this.getSymbolUV(symbolId);
      if (uv) {
        // Add UV coordinates for quad (6 vertices, 2 UVs each = 12 values)
        uvs.push(
          uv.u1, uv.v1, // Top-left
          uv.u1, uv.v2, // Bottom-left
          uv.u2, uv.v1, // Top-right
          uv.u2, uv.v1, // Top-right
          uv.u1, uv.v2, // Bottom-left
          uv.u2, uv.v2, // Bottom-right
        );
      } else {
        // Use placeholder UVs if symbol not found
        console.warn(`Symbol ${symbolId} not found in atlas`);
        for (let i = 0; i < 12; i++) {
          uvs.push(0);
        }
      }
    }
    
    return new Float32Array(uvs);
  }
  
  /**
   * Destroy the atlas and free resources
   */
  destroy(): void {
    this.atlas.clear();
    this.atlasCanvas = null;
    this.atlasContext = null;
    this.atlasTexture = null;
    
    console.log('🗑️ Symbol atlas destroyed');
  }
}