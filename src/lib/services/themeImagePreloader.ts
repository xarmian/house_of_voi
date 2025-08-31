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
   * Preload all theme assets
   */
  async preloadThemeAssets(theme: ThemeColors): Promise<void> {
    const imagesToPreload: string[] = [];

    // Add background image if theme uses it
    if (theme.useBackgroundImage && theme.backgroundImage) {
      imagesToPreload.push(theme.backgroundImage);
    }

    // Add theme-specific symbols if theme has custom symbol path
    if (theme.symbolPath) {
      const symbolNames = ['A.png', 'B.png', 'C.png', 'D.png', 'X.png'];
      symbolNames.forEach(symbolName => {
        imagesToPreload.push(`${theme.symbolPath}/${symbolName}`);
      });

      // Also preload additional Dorks theme assets
      if (theme.name === 'dorks') {
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
          imagesToPreload.push(`${theme.symbolPath}/${asset}`);
        });
      }
    }

    // Preload all images in parallel
    try {
      await Promise.all(
        imagesToPreload.map(imagePath => this.preloadImage(imagePath))
      );
      console.log(`✅ Preloaded ${imagesToPreload.length} images for theme: ${theme.displayName}`);
    } catch (error) {
      console.warn(`⚠️ Failed to preload some images for theme: ${theme.displayName}`, error);
      // Don't throw - partial preloading is acceptable
    }
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