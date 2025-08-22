<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { X, Volume2, VolumeX, Headphones, Music, MousePointer, Disc } from 'lucide-svelte';
  import { soundStore, soundPreferences, type SoundCategory } from '$lib/stores/sound';
  import { playButtonClick, playWinSound, playSpinStart, playReelStop, playLoss } from '$lib/services/soundService';

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  export let isVisible = false;

  $: preferences = $soundPreferences;

  function handleClose() {
    dispatch('close');
  }

  function handleToggleCategory(category: SoundCategory) {
    soundStore.toggleCategorySound(category);
  }

  function handleVolumeChange(category: SoundCategory, event: Event) {
    const target = event.target as HTMLInputElement;
    const volume = parseFloat(target.value);
    soundStore.setCategoryVolume(category, volume);
  }

  function handleMasterVolumeChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const volume = parseFloat(target.value);
    soundStore.setMasterVolume(volume);
  }

  async function testSound(category: SoundCategory) {
    // Play test click sound for all categories
    await playButtonClick().catch(() => {});
    
    // Play category-specific test sound
    switch (category) {
      case 'spin':
        await playSpinStart().catch(() => {});
        setTimeout(() => {
          playReelStop().catch(() => {});
        }, 800);
        break;
      case 'win':
        await playWinSound('medium').catch(() => {});
        break;
      case 'ui':
        // Button click already played above
        break;
    }
  }

  function resetToDefaults() {
    soundStore.updatePreferences({
      masterEnabled: true,
      masterVolume: 0.7,
      spinSoundsEnabled: true,
      spinVolume: 0.8,
      winSoundsEnabled: true,
      winVolume: 0.9,
      uiSoundsEnabled: true,
      uiVolume: 0.5,
      backgroundEnabled: false,
      backgroundVolume: 0.3
    });
  }

  // Category configurations for easy management
  const categoryConfigs = [
    {
      id: 'spin' as SoundCategory,
      name: 'Spin Sounds',
      description: 'Reel spinning and stopping sounds',
      icon: Disc,
      enabledKey: 'spinSoundsEnabled',
      volumeKey: 'spinVolume'
    },
    {
      id: 'win' as SoundCategory,
      name: 'Win/Loss Sounds',
      description: 'Celebration and outcome sounds',
      icon: Music,
      enabledKey: 'winSoundsEnabled',
      volumeKey: 'winVolume'
    },
    {
      id: 'ui' as SoundCategory,
      name: 'Interface Sounds',
      description: 'Button clicks and UI feedback',
      icon: MousePointer,
      enabledKey: 'uiSoundsEnabled',
      volumeKey: 'uiVolume'
    },
    {
      id: 'background' as SoundCategory,
      name: 'Background Audio',
      description: 'Ambient casino atmosphere',
      icon: Headphones,
      enabledKey: 'backgroundEnabled',
      volumeKey: 'backgroundVolume'
    }
  ];
</script>

{#if isVisible}
  <!-- Modal backdrop -->
  <div 
    class="modal-backdrop"
    on:click={handleClose}
    transition:fade={{ duration: 200 }}
    role="dialog"
    aria-labelledby="sound-settings-title"
    aria-modal="true"
  >
    <!-- Modal content -->
    <div 
      class="modal-content"
      on:click|stopPropagation
      transition:fly={{ y: 20, duration: 300, delay: 100 }}
    >
      <!-- Header -->
      <div class="modal-header">
        <div class="flex items-center gap-3">
          <Volume2 class="w-6 h-6 text-voi-400" />
          <h2 id="sound-settings-title" class="text-xl font-semibold text-theme">Sound Settings</h2>
        </div>
        <button
          class="close-button"
          on:click={handleClose}
          aria-label="Close sound settings"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="modal-body">
        <!-- Master Volume Control -->
        <div class="setting-section">
          <div class="setting-header">
            <div class="flex items-center gap-2">
              {#if preferences.masterEnabled}
                <Volume2 class="w-5 h-5 text-voi-400" />
              {:else}
                <VolumeX class="w-5 h-5 text-gray-400" />
              {/if}
              <h3 class="setting-title">Master Volume</h3>
            </div>
            <button
              class="toggle-button"
              class:enabled={preferences.masterEnabled}
              on:click={() => soundStore.toggleMasterSound()}
              aria-label={preferences.masterEnabled ? 'Disable all sounds' : 'Enable all sounds'}
            >
              <span class="toggle-slider"></span>
            </button>
          </div>
          
          {#if preferences.masterEnabled}
            <div class="volume-control">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={preferences.masterVolume}
                on:input={handleMasterVolumeChange}
                class="volume-slider master-volume"
                aria-label="Master volume"
              />
              <div class="volume-display">
                {Math.round(preferences.masterVolume * 100)}%
              </div>
            </div>
          {/if}
        </div>

        <!-- Category Controls -->
        {#each categoryConfigs as category}
          <div class="setting-section">
            <div class="setting-header">
              <div class="flex items-center gap-2">
                <svelte:component 
                  this={category.icon} 
                  class="w-5 h-5 {preferences[category.enabledKey] ? 'text-voi-400' : 'text-gray-400'}"
                />
                <div>
                  <h3 class="setting-title">{category.name}</h3>
                  <p class="setting-description">{category.description}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <!-- Test button -->
                <button
                  class="test-button"
                  on:click={() => testSound(category.id)}
                  disabled={!preferences.masterEnabled || !preferences[category.enabledKey]}
                  aria-label="Test {category.name.toLowerCase()}"
                >
                  Test
                </button>
                <!-- Toggle -->
                <button
                  class="toggle-button"
                  class:enabled={preferences[category.enabledKey]}
                  on:click={() => handleToggleCategory(category.id)}
                  disabled={!preferences.masterEnabled}
                  aria-label={preferences[category.enabledKey] ? `Disable ${category.name.toLowerCase()}` : `Enable ${category.name.toLowerCase()}`}
                >
                  <span class="toggle-slider"></span>
                </button>
              </div>
            </div>
            
            {#if preferences.masterEnabled && preferences[category.enabledKey]}
              <div class="volume-control">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={preferences[category.volumeKey]}
                  on:input={(e) => handleVolumeChange(category.id, e)}
                  class="volume-slider"
                  aria-label="{category.name} volume"
                />
                <div class="volume-display">
                  {Math.round(preferences[category.volumeKey] * 100)}%
                </div>
              </div>
            {/if}
          </div>
        {/each}

        <!-- Reset to defaults -->
        <div class="setting-section">
          <button
            class="reset-button"
            on:click={resetToDefaults}
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    @apply fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4;
  }

  .modal-content {
    @apply bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden;
  }

  .modal-header {
    @apply flex items-center justify-between p-6 border-b border-slate-600;
  }

  .close-button {
    @apply p-2 rounded-lg hover:bg-slate-700 text-gray-400 hover:text-theme transition-colors;
  }

  .modal-body {
    @apply p-6 max-h-[calc(90vh-120px)] overflow-y-auto space-y-6;
  }

  .setting-section {
    @apply space-y-3;
  }

  .setting-header {
    @apply flex items-center justify-between;
  }

  .setting-title {
    @apply font-semibold text-theme;
  }

  .setting-description {
    @apply text-xs text-gray-400 mt-1;
  }

  .toggle-button {
    @apply relative w-12 h-6 bg-slate-600 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-voi-500 focus:ring-offset-2 focus:ring-offset-slate-800;
  }

  .toggle-button.enabled {
    @apply bg-voi-600;
  }

  .toggle-button:disabled {
    @apply opacity-50 cursor-not-allowed;
  }

  .toggle-slider {
    @apply absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200;
    transform: translateX(0);
  }

  .toggle-button.enabled .toggle-slider {
    transform: translateX(1.5rem);
  }

  .volume-control {
    @apply flex items-center gap-3 ml-7;
  }

  .volume-slider {
    @apply flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer;
  }

  .volume-slider.master-volume {
    background: linear-gradient(
      to right,
      #10b981 0%,
      #10b981 calc(var(--value, 70) * 1%),
      #475569 calc(var(--value, 70) * 1%),
      #475569 100%
    );
  }

  .volume-slider::-webkit-slider-thumb {
    @apply appearance-none w-4 h-4 bg-white border-2 border-voi-600 rounded-full cursor-pointer shadow-md;
  }

  .volume-slider::-webkit-slider-thumb:hover {
    @apply scale-110 shadow-lg;
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
  }

  .volume-slider::-moz-range-thumb {
    @apply w-4 h-4 bg-white border-2 border-voi-600 rounded-full cursor-pointer border-none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .volume-display {
    @apply text-sm font-medium text-gray-300 min-w-[3ch] text-center;
  }

  .test-button {
    @apply px-3 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 hover:text-theme rounded-md transition-colors;
  }

  .reset-button {
    @apply w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-theme font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-slate-800;
  }

  /* Custom scrollbar */
  .modal-body::-webkit-scrollbar {
    width: 4px;
  }
  
  .modal-body::-webkit-scrollbar-track {
    background: rgba(51, 65, 85, 0.3);
  }
  
  .modal-body::-webkit-scrollbar-thumb {
    background: rgba(16, 185, 129, 0.5);
    border-radius: 2px;
  }
  
  .modal-body::-webkit-scrollbar-thumb:hover {
    background: rgba(16, 185, 129, 0.7);
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .modal-content,
    .toggle-button,
    .toggle-slider,
    .volume-slider,
    .test-button,
    .reset-button {
      transition: none !important;
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .modal-content {
      @apply border-2 border-gray-300;
    }
    
    .toggle-button,
    .test-button,
    .reset-button {
      @apply border-2 border-current;
    }
  }

  /* Mobile optimizations */
  @media (max-width: 640px) {
    .modal-content {
      @apply mx-2 max-w-full;
    }
    
    .modal-header {
      @apply p-4;
    }
    
    .modal-body {
      @apply p-4;
    }
    
    .volume-slider::-webkit-slider-thumb {
      @apply w-5 h-5; /* Larger thumb for touch */
    }
    
    .test-button {
      @apply px-4 py-2 text-sm; /* Larger touch target */
    }
  }
</style>