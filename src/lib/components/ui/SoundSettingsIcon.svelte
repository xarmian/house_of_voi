<script lang="ts">
  import { Settings } from 'lucide-svelte';
  import { soundPreferences, isSoundSupported } from '$lib/stores/sound';
  import SoundSettingsModal from './SoundSettingsModal.svelte';
  import { playButtonClick } from '$lib/services/soundService';

  let showSettingsModal = false;

  $: preferences = $soundPreferences;

  async function handleOpenSettings() {
    // Play button click sound (this user interaction allows AudioContext creation)
    try {
      await playButtonClick();
    } catch (error) {
      console.warn('Failed to play button click sound:', error);
    }
    
    showSettingsModal = true;
  }
</script>

<!-- Sound Settings Icon - Mobile optimized -->
<button
  class="sound-settings-icon-btn"
  class:sound-enabled={preferences.masterEnabled}
  class:sound-disabled={!preferences.masterEnabled}
  on:click={handleOpenSettings}
  disabled={!$isSoundSupported}
  title={$isSoundSupported 
    ? (preferences.masterEnabled ? 'Sound settings (sound on)' : 'Sound settings (sound off)')
    : 'Sound not supported'
  }
  aria-label="Open sound settings"
>
  <Settings class="w-5 h-5" />
  
  <!-- Status indicator dot -->
  <div class="status-indicator">
    {#if !$isSoundSupported}
      <span class="status-dot unsupported"></span>
    {:else if preferences.masterEnabled}
      <span class="status-dot enabled"></span>
    {:else}
      <span class="status-dot disabled"></span>
    {/if}
  </div>
</button>

<!-- Settings Modal -->
<SoundSettingsModal 
  bind:isVisible={showSettingsModal}
  on:close={() => showSettingsModal = false}
/>

<style>
  .sound-settings-icon-btn {
    @apply relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-voi-500 focus:ring-offset-2 focus:ring-offset-slate-800;
    background: rgba(51, 65, 85, 0.8);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(71, 85, 105, 0.5);
    touch-action: manipulation;
    min-height: 44px; /* Better touch target */
    min-width: 44px;
  }

  .sound-settings-icon-btn:not(:disabled):hover {
    background: rgba(71, 85, 105, 0.9);
    transform: scale(1.05);
  }

  .sound-settings-icon-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .sound-settings-icon-btn:disabled {
    @apply opacity-50 cursor-not-allowed;
  }

  .sound-settings-icon-btn.sound-enabled {
    color: #10b981;
    border-color: rgba(16, 185, 129, 0.3);
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.2);
  }

  .sound-settings-icon-btn.sound-disabled {
    color: #9ca3af;
    border-color: rgba(156, 163, 175, 0.3);
  }

  .status-indicator {
    @apply absolute -top-1 -right-1;
  }

  .status-dot {
    @apply w-3 h-3 rounded-full border border-slate-800;
  }

  .status-dot.enabled {
    @apply bg-green-400;
    box-shadow: 0 0 4px rgba(34, 197, 94, 0.5);
  }

  .status-dot.disabled {
    @apply bg-gray-500;
  }

  .status-dot.unsupported {
    @apply bg-red-500;
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .sound-settings-icon-btn {
      transition: none !important;
      transform: none !important;
    }
    
    .sound-settings-icon-btn:not(:disabled):hover,
    .sound-settings-icon-btn:active:not(:disabled) {
      transform: none !important;
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .sound-settings-icon-btn {
      @apply border-2 border-current bg-black;
    }
    
    .sound-settings-icon-btn.sound-enabled {
      @apply border-green-400 bg-black;
    }
  }

  /* Touch device optimizations */
  @media (hover: none) and (pointer: coarse) {
    .sound-settings-icon-btn:hover {
      transform: none;
      background: rgba(51, 65, 85, 0.8);
    }
  }
</style>