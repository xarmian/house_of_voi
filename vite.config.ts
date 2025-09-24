import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      srcDir: './src',
      mode: 'production',
      scope: '/',
      base: '/',
      selfDestroying: process.env.NODE_ENV === 'development',
      manifest: {
        short_name: 'House of Voi',
        name: 'House of Voi - Blockchain Slot Machine',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        description: 'Play blockchain-powered slot machines on the Voi network',
        icons: [
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globDirectory: 'build/',
        globPatterns: [
          '**/*.{html,js,css,png,svg,jpg,jpeg,gif,webp,woff,woff2,ttf,eot,ico}'
        ],
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
        runtimeCaching: []
      },
      devOptions: {
        enabled: false,
        type: 'module',
        navigateFallback: 'index.html'
      }
    }),
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
    include: ['buffer']
    // MEMORY OPTIMIZATION: Removed 'algosdk' from optimizeDeps to enable lazy loading
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // MEMORY OPTIMIZATION: Split heavy blockchain libraries into separate chunks
          'wallet': ['avm-wallet-svelte'],
          // Split Svelte components into logical chunks
          'game-components': [
            'src/lib/components/game/Leaderboard.svelte',
            'src/lib/components/game/PlayerStats.svelte', 
            'src/lib/components/game/GameStaking.svelte'
          ],
          'ui-components': [
            'lucide-svelte'
          ]
        }
      }
    },
    chunkSizeWarningLimit: 1000 // Increase limit to avoid warnings for intentionally large chunks
  }
});