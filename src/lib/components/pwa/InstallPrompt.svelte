<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  let showInstallPrompt = false;
  let deferredPrompt: any = null;
  let isIOS = false;
  let isInStandaloneMode = false;

  onMount(() => {
    if (!browser) return;

    // Check if running in standalone mode
    isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches;

    // Check if iOS
    isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallPrompt = true;
    });

    // Check if app is already installed
    window.addEventListener('appinstalled', () => {
      showInstallPrompt = false;
      deferredPrompt = null;
    });

    // For iOS, show install prompt if not in standalone mode and not dismissed
    if (isIOS && !isInStandaloneMode) {
      const dismissed = localStorage.getItem('ios-install-dismissed');
      if (!dismissed) {
        showInstallPrompt = true;
      }
    }
  });

  async function handleInstall() {
    if (!deferredPrompt) {
      // iOS fallback - just show instructions
      if (isIOS) {
        showInstallPrompt = false;
        alert('To install House of Voi:\n1. Tap the Share button\n2. Scroll down and tap "Add to Home Screen"');
      }
      return;
    }

    const { outcome } = await deferredPrompt.prompt();

    if (outcome === 'accepted') {
      showInstallPrompt = false;
    }

    deferredPrompt = null;
  }

  function dismissPrompt() {
    showInstallPrompt = false;

    if (isIOS) {
      // Remember dismissal for iOS users
      localStorage.setItem('ios-install-dismissed', 'true');
    }
  }
</script>

{#if showInstallPrompt && !isInStandaloneMode}
  <div class="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
    <div class="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg">
      <!-- Header -->
      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-lg bg-gradient-to-r from-voi-600 to-blue-500 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18.5l-7-7 7-7 7 7z" />
            </svg>
          </div>
          <div>
            <h3 class="text-white font-medium text-sm">Install House of Voi</h3>
            <p class="text-gray-400 text-xs">Add to home screen for quick access</p>
          </div>
        </div>

        <button
          on:click={dismissPrompt}
          class="text-gray-400 hover:text-gray-300 transition-colors"
          aria-label="Dismiss install prompt"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Benefits -->
      <div class="mb-4">
        <ul class="text-xs text-gray-300 space-y-1">
          <li class="flex items-center">
            <svg class="w-3 h-3 text-green-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            Faster loading times
          </li>
          <li class="flex items-center">
            <svg class="w-3 h-3 text-green-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            Full-screen experience
          </li>
          <li class="flex items-center">
            <svg class="w-3 h-3 text-green-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            Works like a native app
          </li>
        </ul>
      </div>

      <!-- Action buttons -->
      <div class="flex space-x-2">
        <button
          on:click={handleInstall}
          class="flex-1 bg-voi-600 hover:bg-voi-700 text-white text-sm font-medium py-2 px-3 rounded-md transition-colors duration-200"
        >
          {#if isIOS}
            Show Instructions
          {:else}
            Install App
          {/if}
        </button>
        <button
          on:click={dismissPrompt}
          class="px-3 py-2 text-gray-400 hover:text-gray-300 text-sm transition-colors duration-200"
        >
          Not now
        </button>
      </div>
    </div>
  </div>
{/if}