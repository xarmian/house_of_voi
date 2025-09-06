import type { ThemeColors } from '$lib/stores/theme';

interface PreloadedImages {
  [imagePath: string]: HTMLImageElement;
}

class ThemeImagePreloader {
  private preloadedImages: PreloadedImages = {};
  private preloadingPromises: Map<string, Promise<HTMLImageElement>> = new Map();

  /**
   * Preload a single image
   */
  private async preloadImage(imagePath: string): Promise<HTMLImageElement> {
    // Check if already preloaded
    if (this.preloadedImages[imagePath]) {
      return this.preloadedImages[imagePath];
    }

    // Check if currently preloading
    if (this.preloadingPromises.has(imagePath)) {
      return this.preloadingPromises.get(imagePath)!;
    }

    // Start preloading
    const preloadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        this.preloadedImages[imagePath] = img;
        this.preloadingPromises.delete(imagePath);
        resolve(img);
      };
      
      img.onerror = () => {
        this.preloadingPromises.delete(imagePath);
        reject(new Error(`Failed to preload image: ${imagePath}`));
      };
      
      img.src = imagePath;
    });

    this.preloadingPromises.set(imagePath, preloadPromise);
    return preloadPromise;
  }

  /**
   * Preload essential theme assets only (background + basic symbols)
   * MEMORY OPTIMIZATION: Load only critical assets upfront
   */
  async preloadEssentialThemeAssets(theme: ThemeColors): Promise<void> {
    const essentialImages: string[] = [];

    // Add background image if theme uses it (critical for display)
    if (theme.useBackgroundImage && theme.backgroundImage) {
      essentialImages.push(theme.backgroundImage);
    }

    // Add only basic symbols (A, B, C, D, X) - not additional theme assets
    if (theme.symbolPath) {
      const basicSymbols = ['A.png', 'B.png', 'C.png', 'D.png', 'X.png'];
      basicSymbols.forEach(symbolName => {
        essentialImages.push(`${theme.symbolPath}/${symbolName}`);
      });
    }

    // Preload essential images in parallel
    try {
      await Promise.all(
        essentialImages.map(imagePath => this.preloadImage(imagePath))
      );
      console.log(`✅ Preloaded ${essentialImages.length} essential images for theme: ${theme.displayName}`);
    } catch (error) {
      console.warn(`⚠️ Failed to preload some essential images for theme: ${theme.displayName}`, error);
      // Don't throw - partial preloading is acceptable
    }
  }

  /**
   * Preload additional theme assets (decorative/non-critical)
   * MEMORY OPTIMIZATION: Load additional assets on demand
   */
  async preloadAdditionalThemeAssets(theme: ThemeColors): Promise<void> {
    const additionalImages: string[] = [];

    // Only load additional assets for specific themes when needed
    if (theme.symbolPath && theme.name === 'dorks') {
      const additionalAssets = [
        'Crystal Ball 100.png',
        'Secrets 100.png', 
        'black_pearl 100.png',
        'dragon 100.png',
        'octopus_cute 100.png',
        'top_hat_v1 100.png',
        'v_baloon 100.png'
      ];
      additionalAssets.forEach(asset => {
        additionalImages.push(`${theme.symbolPath}/${asset}`);
      });
    }

    if (additionalImages.length === 0) return;

    // Preload additional images with lower priority
    try {
      await Promise.all(
        additionalImages.map(imagePath => this.preloadImage(imagePath))
      );
      console.log(`✅ Preloaded ${additionalImages.length} additional images for theme: ${theme.displayName}`);
    } catch (error) {
      console.warn(`⚠️ Failed to preload some additional images for theme: ${theme.displayName}`, error);
    }
  }

  /**
   * Preload all theme assets (backward compatibility)
   */
  async preloadThemeAssets(theme: ThemeColors): Promise<void> {
    // Load essential assets first, then additional ones
    await this.preloadEssentialThemeAssets(theme);
    
    // Load additional assets in the background (don't await)
    this.preloadAdditionalThemeAssets(theme).catch(error => {
      console.warn(`Background loading of additional theme assets failed:`, error);
    });
  }

  /**
   * Check if image is already preloaded
   */
  isImagePreloaded(imagePath: string): boolean {
    return imagePath in this.preloadedImages;
  }

  /**
   * Get preloaded image element
   */
  getPreloadedImage(imagePath: string): HTMLImageElement | null {
    return this.preloadedImages[imagePath] || null;
  }

  /**
   * Clear preloaded images (optional cleanup)
   */
  clearPreloadedImages(themeNames?: string[]): void {
    if (themeNames) {
      // Clear images for specific themes only
      Object.keys(this.preloadedImages).forEach(imagePath => {
        if (themeNames.some(themeName => imagePath.includes(`/themes/${themeName}/`))) {
          delete this.preloadedImages[imagePath];
        }
      });
    } else {
      // Clear all preloaded images
      this.preloadedImages = {};
    }
    
    // Clear any pending promises
    this.preloadingPromises.clear();
  }

  /**
   * Get preloading status for debugging
   */
  getPreloadingStatus(): {
    preloadedCount: number;
    pendingCount: number;
    preloadedPaths: string[];
  } {
    return {
      preloadedCount: Object.keys(this.preloadedImages).length,
      pendingCount: this.preloadingPromises.size,
      preloadedPaths: Object.keys(this.preloadedImages)
    };
  }
}

// Export singleton instance
export const themeImagePreloader = new ThemeImagePreloader();