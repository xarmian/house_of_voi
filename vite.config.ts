import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    // Enable crypto polyfills for browser
    global: 'globalThis'
  },
  optimizeDeps: {
    include: ['algosdk']
  }
});