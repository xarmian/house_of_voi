<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { 
    X, Volume2, VolumeX, Headphones, Music, MousePointer, Disc, 
    Palette, Settings, Gamepad2, Zap, Plus, Minus, RotateCcw, GripVertical, Star
  } from 'lucide-svelte';
  import { 
    preferencesStore, 
    soundPreferences, 
    themePreferences, 
    bettingPreferences, 
    animationPreferences,
    type QuickBet 
  } from '$lib/stores/preferences';
  import { themeStore } from '$lib/stores/theme';
  import { playButtonClick, playWinSound, playSpinStart, playReelStop } from '$lib/services/soundService';
  import { portal } from '$lib/utils/portal';
  import type { SoundCategory } from '$lib/stores/sound';

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  export let isVisible = false;
  export let initialTab: 'sound' | 'theme' | 'betting' | 'animations' = 'sound';

  // Current active tab
  let activeTab: 'sound' | 'theme' | 'betting' | 'animations' = initialTab;
  
  // Update active tab when modal becomes visible and initialTab changes
  $: if (isVisible) {
    activeTab = initialTab;
  }

  // Local state for preferences
  $: soundPrefs = $soundPreferences;
  $: themePrefs = $themePreferences;
  $: bettingPrefs = $bettingPreferences;
  $: animationPrefs = $animationPreferences;

  // Available themes from theme store
  $: availableThemes = themeStore.getAvailableThemes();

  function handleClose() {
    dispatch('close');
  }

  // Sound functions
  function handleToggleCategory(category: SoundCategory) {
    const enabledKey = `${category}SoundsEnabled` as keyof typeof soundPrefs;
    preferencesStore.updateSoundPreferences({
      [enabledKey]: !soundPrefs[enabledKey]
    });
  }

  function handleVolumeChange(category: SoundCategory, event: Event) {
    const target = event.target as HTMLInputElement;
    const volume = parseFloat(target.value);
    const volumeKey = `${category}Volume` as keyof typeof soundPrefs;
    preferencesStore.updateSoundPreferences({
      [volumeKey]: volume
    });
  }

  function handleMasterVolumeChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const volume = parseFloat(target.value);
    preferencesStore.updateSoundPreferences({ masterVolume: volume });
  }

  function toggleMasterSound() {
    preferencesStore.updateSoundPreferences({ 
      masterEnabled: !soundPrefs.masterEnabled 
    });
  }

  async function testSound(category: SoundCategory) {
    await playButtonClick().catch(() => {});
    
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
        break;
    }
  }

  // Theme functions
  function handleThemeChange(themeName: string) {
    themeStore.setTheme(themeName);
    preferencesStore.updateThemePreferences({ currentTheme: themeName });
  }

  // Betting functions
  let newQuickBetAmount = '';
  let newQuickBetLines = 1;
  let draggedIndex: number | null = null;
  
  function addQuickBet() {
    const amount = parseFloat(newQuickBetAmount);
    const lines = parseInt(newQuickBetLines.toString());
    
    if (amount > 0 && amount <= 100 && lines >= 1 && lines <= 20 && bettingPrefs.quickBets.length < 4) {
      // Check if this combination already exists
      const exists = bettingPrefs.quickBets.some(qb => qb.amount === amount && qb.lines === lines);
      if (!exists) {
        const newQuickBets = [...bettingPrefs.quickBets, { amount, lines }];
        preferencesStore.updateBettingPreferences({ quickBets: newQuickBets });
        newQuickBetAmount = '';
        newQuickBetLines = 1;
      }
    }
  }

  function removeQuickBet(quickBet: QuickBet) {
    if (bettingPrefs.quickBets.length > 1) {
      const newQuickBets = bettingPrefs.quickBets.filter(qb => 
        !(qb.amount === quickBet.amount && qb.lines === quickBet.lines)
      );
      preferencesStore.updateBettingPreferences({ quickBets: newQuickBets });
    }
  }

  function updateQuickBet(index: number, field: 'amount' | 'lines', value: number) {
    if (index >= 0 && index < bettingPrefs.quickBets.length) {
      const newQuickBets = [...bettingPrefs.quickBets];
      newQuickBets[index] = { ...newQuickBets[index], [field]: value };
      preferencesStore.updateBettingPreferences({ quickBets: newQuickBets });
    }
  }

  // Drag and drop functions
  function handleDragStart(event: DragEvent, index: number) {
    draggedIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  function handleDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      const newQuickBets = [...bettingPrefs.quickBets];
      const draggedItem = newQuickBets[draggedIndex];
      
      // Remove the dragged item
      newQuickBets.splice(draggedIndex, 1);
      
      // Insert at the new position
      newQuickBets.splice(dropIndex, 0, draggedItem);
      
      preferencesStore.updateBettingPreferences({ quickBets: newQuickBets });
    }
    draggedIndex = null;
  }

  function handleDragEnd() {
    draggedIndex = null;
  }

  function updateDefaultPaylines(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value);
    preferencesStore.updateBettingPreferences({ defaultPaylines: value });
  }

  function setDefaultQuickBet(quickBet: QuickBet | null) {
    preferencesStore.updateBettingPreferences({ defaultQuickBet: quickBet });
  }

  // Animation functions
  function toggleAnimationPreference(key: keyof typeof animationPrefs) {
    preferencesStore.updateAnimationPreferences({
      [key]: !animationPrefs[key]
    });
  }

  // Reset functions
  function resetSoundSettings() {
    preferencesStore.resetSection('sound');
  }

  function resetThemeSettings() {
    preferencesStore.resetSection('theme');
    // Apply the default theme to the DOM immediately
    themeStore.setTheme('purple'); // Default theme
  }

  function resetBettingSettings() {
    preferencesStore.resetSection('betting');
  }

  function resetAnimationSettings() {
    preferencesStore.resetSection('animations');
  }

  // Category configurations for sound settings
  const soundCategories = [
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

  // Tab configuration
  const tabs = [
    { id: 'sound', name: 'Sound', icon: Volume2 },
    { id: 'theme', name: 'Theme', icon: Palette },
    { id: 'betting', name: 'Betting', icon: Gamepad2 },
    { id: 'animations', name: 'Effects', icon: Zap }
  ];
</script>

{#if isVisible}
  <!-- Modal backdrop -->
  <div 
    class="modal-backdrop"
    use:portal
    on:click={handleClose}
    transition:fade={{ duration: 200 }}
    role="dialog"
    aria-labelledby="preferences-title"
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
          <Settings class="w-6 h-6 text-voi-400" />
          <h2 id="preferences-title" class="text-xl font-semibold text-theme">User Preferences</h2>
        </div>
        <button
          class="close-button"
          on:click={handleClose}
          aria-label="Close preferences"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Tab Navigation -->
      <div class="tab-nav">
        {#each tabs as tab}
          <button
            class="tab-button"
            class:active={activeTab === tab.id}
            on:click={() => activeTab = tab.id}
            aria-label={`${tab.name} settings`}
          >
            <svelte:component this={tab.icon} class="w-4 h-4" />
            <span>{tab.name}</span>
          </button>
        {/each}
      </div>

      <!-- Content -->
      <div class="modal-body">
        {#if activeTab === 'sound'}
          <!-- Sound Settings -->
          <div class="tab-content">
            <!-- Master Volume Control -->
            <div class="setting-section">
              <div class="setting-header">
                <div class="flex items-center gap-2">
                  {#if soundPrefs.masterEnabled}
                    <Volume2 class="w-5 h-5 text-voi-400" />
                  {:else}
                    <VolumeX class="w-5 h-5 text-gray-400" />
                  {/if}
                  <h3 class="setting-title">Master Volume</h3>
                </div>
                <div class="flex items-center gap-2">
                  <button class="reset-icon-button" on:click={resetSoundSettings} title="Reset sound settings">
                    <RotateCcw class="w-4 h-4" />
                  </button>
                  <button
                    class="toggle-button"
                    class:enabled={soundPrefs.masterEnabled}
                    on:click={toggleMasterSound}
                  >
                    <span class="toggle-slider"></span>
                  </button>
                </div>
              </div>
              
              {#if soundPrefs.masterEnabled}
                <div class="volume-control">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={soundPrefs.masterVolume}
                    on:input={handleMasterVolumeChange}
                    class="volume-slider master-volume"
                  />
                  <div class="volume-display">
                    {Math.round(soundPrefs.masterVolume * 100)}%
                  </div>
                </div>
              {/if}
            </div>

            <!-- Category Controls -->
            {#each soundCategories as category}
              <div class="setting-section">
                <div class="setting-header">
                  <div class="flex items-center gap-2">
                    <svelte:component 
                      this={category.icon} 
                      class="w-5 h-5 {soundPrefs[category.enabledKey] ? 'text-voi-400' : 'text-gray-400'}"
                    />
                    <div>
                      <h3 class="setting-title">{category.name}</h3>
                      <p class="setting-description">{category.description}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      class="test-button"
                      on:click={() => testSound(category.id)}
                      disabled={!soundPrefs.masterEnabled || !soundPrefs[category.enabledKey]}
                    >
                      Test
                    </button>
                    <button
                      class="toggle-button"
                      class:enabled={soundPrefs[category.enabledKey]}
                      on:click={() => handleToggleCategory(category.id)}
                      disabled={!soundPrefs.masterEnabled}
                    >
                      <span class="toggle-slider"></span>
                    </button>
                  </div>
                </div>
                
                {#if soundPrefs.masterEnabled && soundPrefs[category.enabledKey]}
                  <div class="volume-control">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={soundPrefs[category.volumeKey]}
                      on:input={(e) => handleVolumeChange(category.id, e)}
                      class="volume-slider"
                    />
                    <div class="volume-display">
                      {Math.round(soundPrefs[category.volumeKey] * 100)}%
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>

        {:else if activeTab === 'theme'}
          <!-- Theme Settings -->
          <div class="tab-content">
            <div class="setting-section">
              <div class="setting-header">
                <h3 class="setting-title">Color Theme</h3>
                <button class="reset-icon-button" on:click={resetThemeSettings} title="Reset theme settings">
                  <RotateCcw class="w-4 h-4" />
                </button>
              </div>
              <div class="theme-grid">
                {#each Object.entries(availableThemes) as [themeKey, theme]}
                  <button
                    class="theme-option"
                    class:active={themePrefs.currentTheme === themeKey}
                    on:click={() => handleThemeChange(themeKey)}
                    style="--theme-primary: {theme.primary}; --theme-secondary: {theme.secondary};"
                  >
                    <div class="theme-preview" style="background: linear-gradient({theme.background.direction}, {theme.background.from}, {theme.background.to});">
                      <div class="theme-accent" style="background-color: {theme.primary};"></div>
                    </div>
                    <span class="theme-name">{theme.displayName}</span>
                  </button>
                {/each}
              </div>
            </div>
          </div>

        {:else if activeTab === 'betting'}
          <!-- Betting Settings -->
          <div class="tab-content">
            <!-- Quick Bet Amounts -->
            <div class="setting-section">
              <div class="setting-header">
                <h3 class="setting-title">Quick Bet Buttons</h3>
                <button class="reset-icon-button" on:click={resetBettingSettings} title="Reset betting settings">
                  <RotateCcw class="w-4 h-4" />
                </button>
              </div>
              <p class="setting-description">Customize quick bet buttons (amount + paylines). Click the star to set as default. Maximum of 4 buttons.</p>
              
              <div class="quick-bet-list">
                {#each bettingPrefs.quickBets as quickBet, index}
                  <div 
                    class="quick-bet-item"
                    class:dragging={draggedIndex === index}
                    draggable="true"
                    on:dragstart={(e) => handleDragStart(e, index)}
                    on:dragover={handleDragOver}
                    on:drop={(e) => handleDrop(e, index)}
                    on:dragend={handleDragEnd}
                  >
                    <div class="drag-handle" title="Drag to reorder">
                      <GripVertical class="w-4 h-4 text-gray-400" />
                    </div>
                    <div class="quick-bet-inputs">
                      <input
                        type="number"
                        value={quickBet.amount}
                        on:input={(e) => updateQuickBet(index, 'amount', parseFloat(e.currentTarget.value) || 1)}
                        min="0.1"
                        max="100"
                        step="0.1"
                        class="quick-bet-amount-input"
                        placeholder="VOI"
                      />
                      <span class="quick-bet-separator">VOI ×</span>
                      <input
                        type="number"
                        value={quickBet.lines}
                        on:input={(e) => updateQuickBet(index, 'lines', parseInt(e.currentTarget.value) || 1)}
                        min="1"
                        max="20"
                        class="quick-bet-lines-input"
                        placeholder="Lines"
                      />
                      <span class="quick-bet-suffix">L</span>
                    </div>
                    <div class="quick-bet-actions">
                      <button
                        class="default-button"
                        class:active={bettingPrefs.defaultQuickBet?.amount === quickBet.amount && bettingPrefs.defaultQuickBet?.lines === quickBet.lines}
                        on:click={() => {
                          const isCurrentlyDefault = bettingPrefs.defaultQuickBet?.amount === quickBet.amount && bettingPrefs.defaultQuickBet?.lines === quickBet.lines;
                          setDefaultQuickBet(isCurrentlyDefault ? null : quickBet);
                        }}
                        title={bettingPrefs.defaultQuickBet?.amount === quickBet.amount && bettingPrefs.defaultQuickBet?.lines === quickBet.lines ? "Remove as default" : "Set as default"}
                      >
                        <Star class="w-3 h-3" />
                      </button>
                      <button
                        class="remove-button"
                        on:click={() => removeQuickBet(quickBet)}
                        disabled={bettingPrefs.quickBets.length <= 1}
                        title="Remove quick bet"
                      >
                        <Minus class="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                {/each}
              </div>

              {#if bettingPrefs.quickBets.length < 4}
                <div class="add-quick-bet">
                  <input
                    type="number"
                    bind:value={newQuickBetAmount}
                    placeholder="VOI amount"
                    min="0.1"
                    max="100"
                    step="0.1"
                    class="quick-bet-input"
                  />
                  <span class="input-separator">×</span>
                  <input
                    type="number"
                    bind:value={newQuickBetLines}
                    placeholder="Lines"
                    min="1"
                    max="20"
                    class="quick-bet-lines-input-new"
                  />
                  <button
                    class="add-button"
                    on:click={addQuickBet}
                    disabled={!newQuickBetAmount || parseFloat(newQuickBetAmount) <= 0 || newQuickBetLines < 1 || newQuickBetLines > 20}
                    title="Add quick bet"
                  >
                    <Plus class="w-4 h-4" />
                  </button>
                </div>
              {:else}
                <div class="max-quick-bets-message">
                  <p class="text-sm text-theme-text opacity-70">Maximum of 4 quick bet buttons reached</p>
                </div>
              {/if}
            </div>

            <!-- Default Paylines -->
            <div class="setting-section">
              <div class="setting-header">
                <h3 class="setting-title">Default Paylines</h3>
              </div>
              <p class="setting-description">
                Choose the default number of paylines when starting the game
              </p>
              
              <div class="paylines-control">
                <label for="default-paylines">
                  Default Paylines:
                </label>
                <input
                  id="default-paylines"
                  type="range"
                  min="1"
                  max="20"
                  value={bettingPrefs.defaultPaylines}
                  on:input={updateDefaultPaylines}
                  class="paylines-slider"
                />
                <span class="paylines-value">
                  {bettingPrefs.defaultPaylines}
                </span>
              </div>
            </div>
          </div>

        {:else if activeTab === 'animations'}
          <!-- Animation Settings -->
          <div class="tab-content">
            <div class="setting-section">
              <div class="setting-header">
                <h3 class="setting-title">Animation & Effects</h3>
                <button class="reset-icon-button" on:click={resetAnimationSettings} title="Reset animation settings">
                  <RotateCcw class="w-4 h-4" />
                </button>
              </div>

              <div class="animation-options">
                <div class="animation-option">
                  <div>
                    <h4 class="option-title">Reduced Motion</h4>
                    <p class="option-description">Minimize animations for accessibility</p>
                  </div>
                  <button
                    class="toggle-button"
                    class:enabled={animationPrefs.reducedMotion}
                    on:click={() => toggleAnimationPreference('reducedMotion')}
                  >
                    <span class="toggle-slider"></span>
                  </button>
                </div>

                <div class="animation-option">
                  <div>
                    <h4 class="option-title">High Performance</h4>
                    <p class="option-description">Enable enhanced visual effects</p>
                  </div>
                  <button
                    class="toggle-button"
                    class:enabled={animationPrefs.highPerformance}
                    on:click={() => toggleAnimationPreference('highPerformance')}
                    disabled={animationPrefs.reducedMotion}
                  >
                    <span class="toggle-slider"></span>
                  </button>
                </div>

                <div class="animation-option">
                  <div>
                    <h4 class="option-title">Haptic Feedback</h4>
                    <p class="option-description">Vibration feedback on supported devices</p>
                  </div>
                  <button
                    class="toggle-button"
                    class:enabled={animationPrefs.hapticEnabled}
                    on:click={() => toggleAnimationPreference('hapticEnabled')}
                  >
                    <span class="toggle-slider"></span>
                  </button>
                </div>

                <div class="animation-option">
                  <div>
                    <h4 class="option-title">Particle Effects</h4>
                    <p class="option-description">Win celebrations and visual effects</p>
                  </div>
                  <button
                    class="toggle-button"
                    class:enabled={animationPrefs.particlesEnabled}
                    on:click={() => toggleAnimationPreference('particlesEnabled')}
                    disabled={animationPrefs.reducedMotion}
                  >
                    <span class="toggle-slider"></span>
                  </button>
                </div>

                <div class="animation-option">
                  <div>
                    <h4 class="option-title">Battery Optimization</h4>
                    <p class="option-description">Reduce effects to save battery</p>
                  </div>
                  <button
                    class="toggle-button"
                    class:enabled={animationPrefs.batteryOptimized}
                    on:click={() => toggleAnimationPreference('batteryOptimized')}
                  >
                    <span class="toggle-slider"></span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    @apply fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4;
    z-index: 9999;
  }

  .modal-content {
    @apply bg-surface-primary border border-surface-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden;
  }

  .modal-header {
    @apply flex items-center justify-between p-6 border-b border-slate-600;
  }

  .close-button {
    @apply p-2 rounded-lg hover:bg-surface-hover text-theme-text opacity-60 hover:text-theme transition-colors;
  }

  .tab-nav {
    @apply flex border-b border-slate-600;
  }

  .tab-button {
    @apply flex items-center gap-2 px-6 py-3 text-theme-text opacity-60 hover:text-theme hover:bg-surface-hover transition-colors relative;
  }

  .tab-button.active {
    @apply text-theme-primary bg-surface-secondary;
  }

  .tab-button.active::after {
    content: '';
    @apply absolute bottom-0 left-0 right-0 h-0.5 bg-theme-primary;
  }

  .modal-body {
    @apply p-6 max-h-[calc(90vh-200px)] overflow-y-auto;
  }

  .tab-content {
    @apply space-y-6;
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
    @apply relative w-12 h-6 bg-slate-600 rounded-full transition-colors duration-200;
  }

  .toggle-button.enabled {
    @apply bg-voi-600;
  }

  .toggle-button:disabled {
    @apply opacity-50 cursor-not-allowed;
  }

  .toggle-slider {
    @apply absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200;
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

  .volume-slider::-webkit-slider-thumb {
    @apply appearance-none w-4 h-4 bg-white border-2 border-voi-600 rounded-full cursor-pointer shadow-md;
  }

  .volume-display {
    @apply text-sm font-medium text-gray-300 min-w-[3ch] text-center;
  }

  .test-button {
    @apply px-3 py-1 text-xs font-medium bg-surface-secondary hover:bg-surface-hover disabled:bg-surface-primary disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 hover:text-theme rounded-md transition-colors;
  }

  .reset-icon-button {
    @apply p-2 rounded-lg hover:bg-surface-hover text-theme-text opacity-60 hover:text-theme transition-colors;
  }

  /* Theme Settings */
  .theme-grid {
    @apply grid grid-cols-2 gap-3;
  }

  .theme-option {
    @apply relative p-3 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors;
  }

  .theme-option.active {
    @apply border-theme-primary bg-surface-secondary;
  }

  .theme-preview {
    @apply w-full h-12 rounded-lg mb-2 relative overflow-hidden;
  }

  .theme-accent {
    @apply absolute top-1 right-1 w-3 h-3 rounded-full;
  }

  .theme-name {
    @apply text-sm text-theme font-medium;
  }

  /* Betting Settings */
  .quick-bet-list {
    @apply flex flex-col gap-3;
  }

  .quick-bet-item {
    @apply flex items-center gap-3 px-4 py-3 bg-surface-secondary rounded-lg border border-surface-border transition-all duration-200 cursor-move;
  }

  .quick-bet-item:hover {
    @apply shadow-md border-surface-hover;
  }

  .quick-bet-item.dragging {
    @apply opacity-50 scale-105 shadow-lg;
  }

  .drag-handle {
    @apply flex items-center justify-center cursor-grab active:cursor-grabbing;
  }

  .quick-bet-inputs {
    @apply flex items-center gap-2 flex-1;
  }

  .quick-bet-amount-input,
  .quick-bet-lines-input {
    @apply w-16 px-2 py-1 bg-surface-tertiary border border-surface-border rounded text-center text-theme text-sm focus:outline-none focus:ring-1 focus:ring-theme-primary focus:border-theme-primary;
  }

  .quick-bet-separator,
  .quick-bet-suffix {
    @apply text-sm text-theme-text opacity-70 font-medium;
  }

  .remove-button {
    @apply p-1.5 rounded hover:bg-red-600 hover:bg-opacity-20 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .add-quick-bet {
    @apply flex items-center gap-2 mt-3 p-3 bg-surface-tertiary border border-dashed border-surface-border rounded-lg opacity-50;
  }

  .quick-bet-input,
  .quick-bet-lines-input-new {
    @apply px-3 py-2 bg-surface-secondary border border-surface-border rounded-lg text-theme placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-theme-primary text-sm;
  }

  .quick-bet-input {
    @apply flex-1;
  }

  .quick-bet-lines-input-new {
    @apply w-20;
  }

  .input-separator {
    @apply text-theme-text opacity-70 font-medium;
  }

  .add-button {
    @apply p-2 bg-voi-600 hover:bg-voi-700 disabled:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors;
  }

  .max-quick-bets-message {
    @apply mt-3 p-3 bg-surface-tertiary bg-opacity-30 border border-surface-border rounded-lg text-center;
  }

  .quick-bet-actions {
    @apply flex items-center gap-1;
  }

  .default-button {
    @apply w-8 h-8 rounded bg-surface-tertiary hover:bg-surface-hover text-theme-text opacity-60 hover:text-voi-400 transition-all duration-200 flex items-center justify-center;
  }

  .default-button.active {
    @apply bg-voi-600 hover:bg-voi-700 text-white opacity-100;
  }

  .paylines-control {
    @apply flex items-center gap-3 ml-7;
  }

  .paylines-slider {
    @apply flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer;
  }

  .paylines-slider::-webkit-slider-thumb {
    @apply appearance-none w-4 h-4 bg-white border-2 border-voi-600 rounded-full cursor-pointer shadow-md;
  }

  .paylines-value {
    @apply text-sm font-medium text-gray-300 min-w-[2ch] text-center;
  }

  .paylines-slider.dimmed,
  .paylines-value.dimmed {
    @apply opacity-50;
  }

  .setting-note {
    @apply text-xs text-gray-500 italic mt-2;
  }

  /* Animation Settings */
  .animation-options {
    @apply space-y-4;
  }

  .animation-option {
    @apply flex items-center justify-between p-3 rounded-lg bg-surface-secondary bg-opacity-50;
  }

  .option-title {
    @apply font-medium text-theme;
  }

  .option-description {
    @apply text-sm text-gray-400;
  }

  /* Scrollbar */
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

  /* Mobile optimizations */
  @media (max-width: 640px) {
    .modal-content {
      @apply mx-2 max-w-full;
    }

    .theme-grid {
      @apply grid-cols-1;
    }

    .tab-button {
      @apply px-3 text-sm;
    }
  }
</style>