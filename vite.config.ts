import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit(),
    {
      name: 'version-injector',
      generateBundle() {
        // Generate version.json file with current timestamp and git commit (if available)
        const version = {
          timestamp: Date.now(),
          buildTime: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0'
        };
        
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify(version, null, 2)
        });
      }
    }
  ],
  define: {
    // Enable crypto polyfills for browser
    global: 'globalThis',
    __BUILD_TIME__: JSON.stringify(Date.now())
  },
  optimizeDeps: {
    include: ['algosdk']
  }
});