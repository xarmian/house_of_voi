<script lang="ts">
  import { onMount } from 'svelte';
  import { Settings, Volume2, VolumeX } from 'lucide-svelte';
  import { soundStore, soundPreferences, isSoundSupported } from '$lib/stores/sound';
  import { soundService } from '$lib/services/soundService';
  import UserPreferencesModal from './UserPreferencesModal.svelte';

  export let compact = false;
  export let showSettings = false;

  let showVolumeSlider = false;
  let volumeSliderTimeout: NodeJS.Timeout;
  let isInitialized = false;
  let showPreferencesModal = false;

  $: soundPrefs = $soundPreferences;
  $: isSoundEnabled = soundPrefs.masterEnabled;
  $: masterVolume = soundPrefs.masterVolume;

  onMount(async () => {
    // Initialize sound service (doesn't create AudioContext yet)
    await soundService.init();
    isInitialized = true;
  });

  async function handleToggleSound() {
    soundStore.toggleMasterSound();
    
    // When enabling sound for the first time, this user interaction allows AudioContext creation
    if (!isSoundEnabled && isInitialized) {
      // Play a test click sound (this will trigger AudioContext creation)
      setTimeout(async () => {
        try {
          await soundService.playSound('button-click');
          // Start preloading essential sounds in background after successful test
          soundService.preloadEssentialSounds().catch(error => {
            console.warn('Failed to preload sounds:', error);
          });
        } catch (error) {
          console.warn('Failed to play test sound:', error);
        }
      }, 100);
    }
  }

  function handleVolumeChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const volume = parseFloat(target.value);
    soundStore.setMasterVolume(volume);
  }

  function showVolumeSliderTemporary() {
    showVolumeSlider = true;
    clearTimeout(volumeSliderTimeout);
    volumeSliderTimeout = setTimeout(() => {
      showVolumeSlider = false;
    }, 3000);
  }

  function handleVolumeSliderClick(event: MouseEvent) {
    event.stopPropagation();
    showVolumeSliderTemporary();
  }

  function handleMouseEnter() {
    if (!compact) {
      showVolumeSliderTemporary();
    }
  }

  function handleMouseLeave() {
    if (!compact) {
      clearTimeout(volumeSliderTimeout);
      volumeSliderTimeout = setTimeout(() => {
        showVolumeSlider = false;
      }, 1000);
    }
  }

  function openPreferences() {
    showPreferencesModal = true;
  }

  function closePreferences() {
    showPreferencesModal = false;
  }
</script>

<div 
  class="sound-toggle-container"
  class:compact
  on:mouseenter={handleMouseEnter}
  on:mouseleave={handleMouseLeave}
  role="group"
  aria-label="Sound controls and preferences"
>
  <!-- Main sound toggle button -->
  <button
    class="sound-toggle-btn"
    class:compact
    class:enabled={isSoundEnabled}
    class:disabled={!isSoundEnabled}
    on:click={handleToggleSound}
    disabled={!$isSoundSupported}
    title={$isSoundSupported 
      ? (isSoundEnabled ? 'Disable sound' : 'Enable sound')
      : 'Sound not supported in this browser'
    }
    aria-label={isSoundEnabled ? 'Disable sound' : 'Enable sound'}
    aria-pressed={isSoundEnabled}
  >
    {#if isSoundEnabled}
      <Volume2 class={compact ? 'w-4 h-4' : 'w-5 h-5'} />
    {:else}
      <VolumeX class={compact ? 'w-4 h-4' : 'w-5 h-5'} />
    {/if}
  </button>

  <!-- Volume slider (appears on hover/click) -->
  {#if showVolumeSlider && isSoundEnabled && $isSoundSupported}
    <div 
      class="volume-slider-container"
      class:compact
      on:click={handleVolumeSliderClick}
    >
      <div class="volume-slider-wrapper">
        <label for="master-volume" class="sr-only">Master Volume</label>
        <input
          id="master-volume"
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={masterVolume}
          on:input={handleVolumeChange}
          class="volume-slider"
          aria-label="Master volume"
        />
        <div class="volume-indicator">
          {Math.round(masterVolume * 100)}%
        </div>
      </div>
    </div>
  {/if}

  <!-- Settings button (optional) -->
  {#if showSettings && !compact}
    <button
      class="sound-settings-btn"
      on:click={openPreferences}
      title="User preferences and settings"
      aria-label="Open user preferences"
    >
      <Settings class="w-4 h-4" />
    </button>
  {/if}

  <!-- Sound status indicator -->
  {#if !$isSoundSupported}
    <div class="sound-status-indicator" title="Sound not supported">
      <span class="status-dot unsupported"></span>
    </div>
  {:else if isSoundEnabled}
    <div class="sound-status-indicator" title="Sound enabled">
      <span class="status-dot enabled"></span>
    </div>
  {:else}
    <div class="sound-status-indicator" title="Sound disabled">
      <span class="status-dot disabled"></span>
    </div>
  {/if}
</div>

<!-- Preferences Modal -->
<UserPreferencesModal 
  bind:isVisible={showPreferencesModal}
  on:close={closePreferences}
/>

<style>
  .sound-toggle-container {
    @apply relative flex items-center gap-2;
  }

  .sound-toggle-container.compact {
    @apply gap-1;
  }

  .sound-toggle-btn {
    @apply flex items-center justify-center px-2 py-2 rounded-lg bg-surface-secondary hover:bg-surface-hover text-gray-300 hover:text-theme transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-voi-500 focus:ring-offset-2 focus:ring-offset-surface-primary;
    min-height: 40px;
    min-width: 40px;
    touch-action: manipulation;
  }

  .sound-toggle-btn.compact {
    min-height: 36px;
    min-width: 36px;
  }

  .sound-toggle-btn:disabled {
    @apply opacity-50 cursor-not-allowed hover:bg-surface-secondary hover:text-gray-300;
  }

  .sound-toggle-btn.enabled {
    @apply bg-voi-700 hover:bg-voi-600 text-theme;
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.3);
  }

  .sound-toggle-btn.disabled {
    @apply bg-surface-secondary hover:bg-surface-hover text-gray-400;
  }

  .button-text {
    @apply text-sm font-medium select-none;
  }

  .volume-slider-container {
    @apply absolute top-full left-0 mt-2 bg-surface-primary border border-surface-border rounded-lg shadow-lg p-3 z-50;
    animation: slideDown 0.2s ease-out;
    min-width: 200px;
  }

  .volume-slider-container.compact {
    @apply right-0 left-auto;
    min-width: 150px;
  }

  .volume-slider-wrapper {
    @apply flex items-center gap-3;
  }

  .volume-slider {
    @apply flex-1 h-2 bg-surface-secondary rounded-lg appearance-none cursor-pointer;
    background-image: linear-gradient(
      to right, 
      #10b981 0%, 
      #10b981 var(--value, 70)%, 
      #475569 var(--value, 70)%, 
      #475569 100%
    );
  }

  .volume-slider::-webkit-slider-thumb {
    @apply appearance-none w-4 h-4 bg-white border-2 border-voi-600 rounded-full cursor-pointer shadow-md;
    transition: all 0.2s ease;
  }

  .volume-slider::-webkit-slider-thumb:hover {
    @apply scale-110 shadow-lg;
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
  }

  .volume-slider::-moz-range-thumb {
    @apply w-4 h-4 bg-white border-2 border-voi-600 rounded-full cursor-pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .volume-indicator {
    @apply text-xs font-medium text-gray-300 min-w-[3ch] text-center;
  }

  .sound-settings-btn {
    @apply p-2 rounded-lg bg-surface-secondary hover:bg-surface-hover text-gray-400 hover:text-theme transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-voi-500 focus:ring-offset-2 focus:ring-offset-surface-primary;
  }

  .sound-status-indicator {
    @apply flex items-center;
  }

  .status-dot {
    @apply w-2 h-2 rounded-full;
  }

  .status-dot.enabled {
    @apply bg-green-400;
    box-shadow: 0 0 4px rgba(34, 197, 94, 0.5);
    animation: pulse 2s infinite;
  }

  .status-dot.disabled {
    @apply bg-gray-500;
  }

  .status-dot.unsupported {
    @apply bg-red-500;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .sound-toggle-btn,
    .volume-slider-container {
      transition: none !important;
      animation: none !important;
    }
    
    .status-dot.enabled {
      animation: none !important;
    }
    
    .volume-slider::-webkit-slider-thumb {
      transition: none !important;
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .sound-toggle-btn {
      @apply border-2 border-current;
    }
    
    .sound-toggle-btn.enabled {
      @apply border-green-400;
    }
    
    .volume-slider-container {
      @apply border-2 border-gray-400;
    }
  }

  /* Mobile optimizations */
  @media (max-width: 768px) {
    .sound-toggle-btn {
      min-height: 44px; /* Better touch target */
      min-width: 44px;
    }
    
    .sound-toggle-btn.compact {
      min-height: 40px;
      min-width: 40px;
    }
    
    .volume-slider-container {
      @apply p-4;
      min-width: 180px;
    }
    
    .volume-slider {
      @apply h-3; /* Larger for easier touch interaction */
    }
    
    .volume-slider::-webkit-slider-thumb {
      @apply w-5 h-5; /* Larger thumb for touch */
    }
  }

  @media (max-width: 480px) {
    .volume-slider-container {
      min-width: 140px;
    }
  }

  /* Touch device optimizations */
  @media (hover: none) and (pointer: coarse) {
    .sound-toggle-btn:hover,
    .sound-settings-btn:hover {
      /* Remove hover effects on touch devices */
      @apply bg-surface-secondary;
    }
    
    .sound-toggle-btn.enabled:hover {
      @apply bg-voi-700;
    }
    
    .volume-slider::-webkit-slider-thumb:hover {
      transform: none;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
  }
</style>