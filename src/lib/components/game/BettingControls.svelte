<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Plus, Minus, Zap, DollarSign, BarChart3 } from 'lucide-svelte';
  import { bettingStore, betPerLineVOI, totalBetVOI, canAffordBet } from '$lib/stores/betting';
  import { walletBalance, isWalletConnected, walletAddress } from '$lib/stores/wallet';
  import { isSpinning } from '$lib/stores/game';
  import AddFundsModal from '$lib/components/wallet/AddFundsModal.svelte';
  import OddsAnalysis from '$lib/components/analytics/OddsAnalysis.svelte';
  import { BETTING_CONSTANTS, formatVOI } from '$lib/constants/betting';
  import { 
    animationPreferences, 
    shouldReduceAnimations 
  } from '$lib/stores/animations';
  import { triggerTouchFeedback } from '$lib/utils/animations';
  import { isSlotMachineOperational } from '$lib/stores/houseBalance';
  import { playButtonClick } from '$lib/services/soundService';
  
  const dispatch = createEventDispatcher<{
    spin: { betPerLine: number; selectedPaylines: number; totalBet: number }
  }>();
  
  export let disabled = false;
  export let compact = false;
  
  let betInputValue = $betPerLineVOI;
  let spinButtonElement: HTMLElement;
  let showAddFundsModal = false;
  let showOddsAnalysis = false;

  // Subscribe to animation preferences
  $: preferences = $animationPreferences;
  $: reduceMotion = $shouldReduceAnimations;
  
  // Update input when store changes
  $: betInputValue = $betPerLineVOI;
  
  // Handle bet input changes
  function handleBetInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = target.value;
    
    // Only update store if value is valid
    if (value && !isNaN(parseFloat(value))) {
      bettingStore.setBetFromVOI(value);
    }
  }

  function toggleOddsAnalysis() {
    // showOddsAnalysis = !showOddsAnalysis;
  }
  
  function handleSpin() {
    if (!$canAffordBet || !$isWalletConnected || !$bettingStore.isValidBet || disabled || !$isSlotMachineOperational) {
      // Provide feedback for invalid spin attempts
      if (spinButtonElement && preferences.hapticEnabled) {
        triggerTouchFeedback(spinButtonElement, {
          type: 'haptic',
          duration: 100,
          intensity: 0.2,
          easing: 'linear'
        });
      }
      return;
    }
    
    // Play button click sound for successful spin
    playButtonClick().catch(() => {
      // Ignore sound errors
    });
    
    // Provide success feedback for valid spin
    if (spinButtonElement && preferences.hapticEnabled && !reduceMotion) {
      triggerTouchFeedback(spinButtonElement, {
        type: 'scale',
        duration: 200,
        intensity: 0.95,
        easing: 'ease-out'
      });
      
      // Add haptic feedback
      setTimeout(() => {
        if (preferences.hapticEnabled) {
          triggerTouchFeedback(spinButtonElement, {
            type: 'haptic',
            duration: 80,
            intensity: 0.6,
            easing: 'linear'
          });
        }
      }, 50);
    }
    
    dispatch('spin', {
      betPerLine: $bettingStore.betPerLine,
      selectedPaylines: $bettingStore.selectedPaylines,
      totalBet: $bettingStore.totalBet
    });
    
    bettingStore.recordBet();
  }
  
  function setQuickBet(amount: number, buttonElement?: HTMLElement) {
    // Play button click sound
    playButtonClick().catch(() => {
      // Ignore sound errors
    });
    
    bettingStore.setQuickBet(amount);
    
    // Provide visual and haptic feedback
    if (buttonElement && preferences.hapticEnabled && !reduceMotion) {
      triggerTouchFeedback(buttonElement, {
        type: 'scale',
        duration: 150,
        intensity: 0.95,
        easing: 'ease-out'
      });
      
      triggerTouchFeedback(buttonElement, {
        type: 'haptic',
        duration: 30,
        intensity: 0.3,
        easing: 'linear'
      });
    }
  }
  
  function handleControlButton(action: () => void, buttonElement?: HTMLElement) {
    // Play button click sound
    playButtonClick().catch(() => {
      // Ignore sound errors
    });
    
    action();
    
    // Provide touch feedback
    if (buttonElement && preferences.hapticEnabled && !reduceMotion) {
      triggerTouchFeedback(buttonElement, {
        type: 'scale',
        duration: 120,
        intensity: 0.9,
        easing: 'ease-out'
      });
      
      triggerTouchFeedback(buttonElement, {
        type: 'haptic',
        duration: 25,
        intensity: 0.2,
        easing: 'linear'
      });
    }
  }
  
  $: spinButtonDisabled = disabled || !$canAffordBet || !$isWalletConnected || !$bettingStore.isValidBet || !$isSlotMachineOperational;
  $: spinButtonText = $isSpinning ? 'Queue Spin' : 
                     !$isWalletConnected ? 'Wallet Loading...' :
                     !$isSlotMachineOperational ? 'Under Maintenance' :
                     !$canAffordBet ? 'Insufficient Balance' :
                     !$bettingStore.isValidBet ? 'Invalid Bet' :
                     'Spin';
</script>

<div class="betting-controls" class:compact={compact}>
  <!-- Header -->
  {#if !compact}
  <div class="flex items-center justify-between pb-2">
    <div class="flex items-center gap-2 text-amber-400 mb-4">
      <DollarSign class="w-5 h-5" />
      <h3 class="font-bold text-lg">Betting Controls</h3>
    </div>
    <button
      on:click={toggleOddsAnalysis}
      class="flex items-center gap-2 text-gray-400 hover:text-white transition-colors px-3 py-1 rounded-md hover:bg-slate-700"
      title="Show win odds and analysis"
    >
      <BarChart3 class="w-4 h-4" />
      <span class="text-sm">Win Odds</span>
    </button>
  </div>
  {/if}

  <!-- Main betting controls - horizontal layout for desktop -->
  {#if !compact}
    <div class="desktop-betting-grid">
      <div class="main-betting-row">
        <!-- Left side: Controls -->
        <div class="betting-controls-left">
          <!-- Paylines Control -->
          <div class="control-section">
            <div class="control-label">
              <span class="label-text">Paylines</span>
              <span class="label-value">{$bettingStore.selectedPaylines}/20</span>
            </div>
            <div class="flex items-center justify-between bg-slate-800 rounded-lg border border-slate-700 p-3">
              <button
                on:click={(e) => handleControlButton(() => bettingStore.decreasePaylines(), e.currentTarget)}
                disabled={$bettingStore.selectedPaylines <= BETTING_CONSTANTS.MIN_PAYLINES || disabled}
                class="control-button"
                aria-label="Decrease paylines"
              >
                <Minus class="w-4 h-4" />
              </button>
              
              <div class="flex-1 text-center">
                <div class="text-xl font-bold text-white">{$bettingStore.selectedPaylines}</div>
                <div class="text-xs text-gray-400">Lines</div>
              </div>
              
              <button
                on:click={(e) => handleControlButton(() => bettingStore.increasePaylines(), e.currentTarget)}
                disabled={$bettingStore.selectedPaylines >= BETTING_CONSTANTS.MAX_PAYLINES || disabled}
                class="control-button"
                aria-label="Increase paylines"
              >
                <Plus class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Bet Per Line Control -->
          <div class="control-section">
            <div class="control-label">
              <span class="label-text">Bet Per Line</span>
              <span class="label-value">{$betPerLineVOI} VOI</span>
            </div>
            <div class="relative">
              <input
                type="number"
                step="0.01"
                min={formatVOI(BETTING_CONSTANTS.MIN_BET_PER_LINE)}
                max={formatVOI(BETTING_CONSTANTS.MAX_BET_PER_LINE)}
                bind:value={betInputValue}
                on:input={handleBetInput}
                disabled={disabled}
                class="input-field pr-12 text-center font-medium text-lg"
                placeholder="1.00"
              />
              <div class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 font-medium text-xs">
                VOI
              </div>
            </div>
          </div>

          <!-- Quick Bet Buttons -->
          <div class="control-section">
            <div class="control-label">
              <span class="label-text">Quick Bets</span>
            </div>
            <div class="grid grid-cols-4 gap-2">
              {#each BETTING_CONSTANTS.QUICK_BET_AMOUNTS as amount}
                <button
                  on:click={(e) => setQuickBet(amount, e.currentTarget)}
                  disabled={disabled}
                  class="quick-bet-button"
                  class:active={$bettingStore.betPerLine === amount * 1_000_000}
                >
                  {amount} VOI
                </button>
              {/each}
            </div>
            
            <!-- Max Bet Button -->
            <button
              on:click={(e) => handleControlButton(() => bettingStore.setMaxBet(), e.currentTarget)}
              disabled={disabled}
              class="w-full btn-secondary mt-2"
            >
              Max Bet
            </button>
          </div>
        </div>

        <!-- Right side: Total Bet -->
        <div class="betting-controls-right">
          <div class="bg-gradient-to-r from-voi-900/20 to-blue-900/20 border border-voi-700/30 rounded-lg p-4 h-full">
            <div class="flex flex-col justify-center h-full">
              <div class="text-center mb-3">
                <div class="text-gray-300 font-medium mb-2">Total Bet</div>
                <div class="flex items-center justify-center gap-2">
                  <DollarSign class="w-5 h-5 text-voi-400" />
                  <span class="text-3xl font-bold text-white">{$totalBetVOI} VOI</span>
                </div>
              </div>
              
              <div class="text-center text-sm text-gray-400 mb-3">
                {$bettingStore.selectedPaylines} lines × {$betPerLineVOI} VOI
              </div>
              
              <!-- Balance Check -->
              <div class="flex items-center justify-between text-sm border-t border-slate-700/50 pt-3 mb-3">
                <span class="text-gray-400">Balance:</span>
                <span class="font-medium" class:text-green-400={$canAffordBet} class:text-red-400={!$canAffordBet}>
                  {formatVOI($walletBalance)} VOI
                </span>
              </div>
              
              <!-- Add Funds Button -->
              <div class="text-center">
                <button
                  on:click={() => showAddFundsModal = true}
                  disabled={!$isWalletConnected}
                  class="btn-primary text-sm py-2 px-4"
                >
                  Add Funds
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <!-- Compact mobile layout (unchanged) -->
    <div class="space-y-3">
      <!-- Paylines Control -->
      <div class="control-group">
        <div class="flex items-center justify-between bg-slate-800 rounded-lg border border-slate-700 p-2">
          <button
            on:click={(e) => handleControlButton(() => bettingStore.decreasePaylines(), e.currentTarget)}
            disabled={$bettingStore.selectedPaylines <= BETTING_CONSTANTS.MIN_PAYLINES || disabled}
            class="control-button w-8 h-8"
            aria-label="Decrease paylines"
          >
            <Minus class="w-3 h-3" />
          </button>
          
          <div class="flex-1 text-center">
            <div class="text-sm font-medium text-white">{$bettingStore.selectedPaylines} Lines</div>
          </div>
          
          <button
            on:click={(e) => handleControlButton(() => bettingStore.increasePaylines(), e.currentTarget)}
            disabled={$bettingStore.selectedPaylines >= BETTING_CONSTANTS.MAX_PAYLINES || disabled}
            class="control-button w-8 h-8"
            aria-label="Increase paylines"
          >
            <Plus class="w-3 h-3" />
          </button>
        </div>
      </div>

      <!-- Bet Per Line Control -->
      <div class="control-group">
        <div class="space-y-2">
          <!-- Bet Input -->
          <div class="relative">
            <input
              type="number"
              step="0.01"
              min={formatVOI(BETTING_CONSTANTS.MIN_BET_PER_LINE)}
              max={formatVOI(BETTING_CONSTANTS.MAX_BET_PER_LINE)}
              bind:value={betInputValue}
              on:input={handleBetInput}
              disabled={disabled}
              class="input-field pr-12 text-center font-medium text-sm py-2"
              placeholder="1.0"
            />
            <div class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 font-medium text-xs">
              VOI
            </div>
          </div>
          
          <!-- Quick Bet Buttons -->
          <div class="grid grid-cols-3 gap-1">
            {#each BETTING_CONSTANTS.QUICK_BET_AMOUNTS.slice(0, 3) as amount}
              <button
                on:click={(e) => setQuickBet(amount, e.currentTarget)}
                disabled={disabled}
                class="quick-bet-button text-xs py-1.5"
                class:active={$bettingStore.betPerLine === amount * 1_000_000}
              >
                {amount}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Total Bet Display -->
      <div class="control-group">
        <div class="bg-gradient-to-r from-voi-900/20 to-blue-900/20 border border-voi-700/30 rounded-lg p-2">
          <div class="flex items-center justify-between">
            <span class="text-gray-300 text-sm font-medium">Total</span>
            <div class="flex items-center gap-1">
              <DollarSign class="w-3 h-3 text-voi-400" />
              <span class="text-lg font-bold text-white">{$totalBetVOI}</span>
              <span class="text-xs text-gray-400">VOI</span>
            </div>
          </div>
          
          <div class="text-xs text-gray-400 mt-1">
            {$bettingStore.selectedPaylines}L × {$betPerLineVOI}
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Error Messages -->
  {#if $bettingStore.errors.length > 0}
    <div class="control-group" class:mt-4={!compact} class:mt-3={compact}>
      <div class="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
        {#each $bettingStore.errors as error}
          <p class="text-red-400 text-sm">{error}</p>
        {/each}
      </div>
    </div>
  {/if}
  
  <!-- Spin Button -->
  <div class="control-group" class:mt-4={!compact} class:mt-3={compact}>
    <button
      bind:this={spinButtonElement}
      on:click={handleSpin}
      disabled={spinButtonDisabled}
      class="spin-button"
      class:spinning={$isSpinning}
      class:compact-spin={compact}
    >
      {#if $isSpinning}
        <div class="flex items-center justify-center" class:gap-3={!compact} class:gap-2={compact}>
          <div class={`border-2 border-white border-t-transparent rounded-full animate-spin ${compact ? 'w-4 h-4' : 'w-5 h-5'}`}></div>
          <span>Spinning...</span>
        </div>
      {:else}
        <div class="flex items-center justify-center" class:gap-3={!compact} class:gap-2={compact}>
          <Zap class={compact ? "w-4 h-4" : "w-5 h-5"} />
          <span>{compact ? 'Spin' : spinButtonText}</span>
        </div>
      {/if}
    </button>
  </div>
</div>

<!-- Add Funds Modal -->
{#if showAddFundsModal && $walletAddress}
  <AddFundsModal
    address={$walletAddress}
    on:close={() => showAddFundsModal = false}
  />
{/if}

<!-- Odds Analysis Modal -->
{#if showOddsAnalysis}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
    <div class="card max-w-4xl w-full max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <BarChart3 class="w-6 h-6 text-voi-400" />
            <h3 class="text-xl font-semibold text-white">Win Odds & Analysis</h3>
          </div>
          <button
            on:click={() => showOddsAnalysis = false}
            class="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        <OddsAnalysis {compact} isModal={true} />
      </div>
    </div>
  </div>
{/if}

<style>
  .betting-controls {
    @apply max-w-full;
  }
  
  .betting-controls.compact {
    @apply max-w-full;
  }
  
  .control-group {
    @apply space-y-2;
  }
  
  /* Desktop horizontal layout */
  .desktop-betting-grid {
    @apply w-full;
  }
  
  .main-betting-row {
    @apply grid grid-cols-3 gap-6;
  }
  
  .betting-controls-left {
    @apply col-span-2 space-y-4;
  }
  
  .betting-controls-right {
    @apply col-span-1;
  }
  
  .control-section {
    @apply space-y-2;
  }
  
  .control-label {
    @apply flex items-center justify-between;
  }
  
  .label-text {
    @apply text-sm font-medium text-gray-300;
  }
  
  .label-value {
    @apply text-sm font-semibold text-voi-400;
  }
  
  .control-button {
    @apply w-10 h-10 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all duration-200 flex items-center justify-center;
    position: relative;
    overflow: hidden;
    transform-origin: center;
    backface-visibility: hidden;
  }
  
  .control-button:active:not(:disabled) {
    transform: scale(0.95);
  }
  
  .input-field {
    @apply w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-voi-500 focus:border-transparent transition-all duration-200;
  }
  
  .input-field:focus {
    transform: scale(1.02);
  }
  
  .quick-bet-button {
    @apply py-2 px-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-md transition-all duration-200;
    position: relative;
    overflow: hidden;
    transform-origin: center;
    backface-visibility: hidden;
    min-height: 32px;
    touch-action: manipulation;
  }
  
  .quick-bet-button:active:not(:disabled) {
    transform: scale(0.95);
  }
  
  .quick-bet-button.active {
    @apply bg-voi-600 hover:bg-voi-700;
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.3);
  }
  
  .quick-bet-button.active::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    animation: button-shine 2s ease-in-out infinite;
  }
  
  .btn-secondary {
    @apply px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200;
    position: relative;
    overflow: hidden;
    transform-origin: center;
    backface-visibility: hidden;
    touch-action: manipulation;
  }
  
  .btn-secondary:active:not(:disabled) {
    transform: scale(0.95);
  }
  
  .spin-button {
    @apply w-full py-4 px-6 bg-gradient-to-r from-voi-600 to-voi-700 hover:from-voi-700 hover:to-voi-800 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:shadow-none;
    position: relative;
    overflow: hidden;
    transform-origin: center;
    backface-visibility: hidden;
    min-height: 56px;
    touch-action: manipulation;
    background-size: 200% 200%;
  }
  
  .spin-button.compact-spin {
    @apply py-3 px-4 text-base rounded-lg;
    min-height: 48px;
  }
  
  .spin-button:not(:disabled):hover {
    transform: scale(1.02);
    background-position: right center;
  }
  
  .spin-button:active:not(:disabled) {
    transform: scale(0.98);
  }
  
  .spin-button.spinning {
    animation: spin-button-pulse 1.5s ease-in-out infinite;
    background: linear-gradient(-45deg, #0f766e, #059669, #047857, #065f46);
    background-size: 400% 400%;
    animation: spin-button-gradient 2s ease infinite;
  }
  
  .spin-button::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    transform: translateX(-100%);
    transition: transform 0.6s;
  }
  
  .spin-button:not(:disabled):hover::before {
    transform: translateX(100%);
  }
  
  /* Animation keyframes */
  @keyframes button-shine {
    0%, 100% { transform: translateX(-100%); }
    50% { transform: translateX(100%); }
  }
  
  @keyframes spin-button-pulse {
    0%, 100% { 
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
    }
    50% { 
      box-shadow: 0 0 30px rgba(16, 185, 129, 0.6);
    }
  }
  
  @keyframes spin-button-gradient {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .control-button,
    .quick-bet-button,
    .btn-secondary,
    .spin-button,
    .input-field {
      transition: opacity 0.2s ease !important;
      transform: none !important;
      animation: none !important;
    }
    
    .control-button:active:not(:disabled),
    .quick-bet-button:active:not(:disabled),
    .btn-secondary:active:not(:disabled),
    .spin-button:active:not(:disabled) {
      opacity: 0.8;
      transform: none;
    }
    
    .quick-bet-button.active::before,
    .spin-button::before {
      display: none;
    }
  }
  
  /* High contrast mode */
  @media (prefers-contrast: high) {
    .control-button,
    .quick-bet-button,
    .btn-secondary {
      border: 2px solid currentColor;
    }
    
    .spin-button {
      border: 3px solid #10b981;
      background: #0f766e;
    }
    
    .quick-bet-button.active {
      border-color: #10b981;
      box-shadow: none;
    }
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .betting-controls {
      @apply max-w-full;
    }
    
    .control-button {
      @apply w-12 h-12;
      min-height: 48px; /* Better touch target */
    }
    
    .spin-button {
      @apply py-3 text-base;
      min-height: 60px; /* Larger touch target */
      font-size: 1.1rem;
    }
    
    .quick-bet-button {
      @apply py-2 text-xs;
      min-height: 40px; /* Better touch target */
    }
    
    .btn-secondary {
      min-height: 44px; /* Better touch target */
    }
    
    .input-field {
      min-height: 44px; /* Better touch target */
      font-size: 16px; /* Prevent zoom on iOS */
    }
    
    /* Larger tap targets for mobile */
    .control-button,
    .quick-bet-button,
    .btn-secondary,
    .spin-button {
      -webkit-tap-highlight-color: transparent; /* Remove iOS tap highlight */
    }
  }
  
  @media (max-width: 480px) {
    .control-button {
      @apply w-11 h-11;
    }
    
    .spin-button {
      font-size: 1rem;
      min-height: 56px;
    }
    
    .quick-bet-button {
      font-size: 0.75rem;
      min-height: 36px;
    }
    
    /* Further optimize for small screens */
    .quick-bet-button {
      padding: 6px 8px;
    }
    
    .btn-secondary {
      font-size: 0.875rem;
      min-height: 40px;
    }
  }
  
  /* Touch device optimizations */
  @media (hover: none) and (pointer: coarse) {
    .control-button:hover,
    .quick-bet-button:hover,
    .btn-secondary:hover,
    .spin-button:hover {
      transform: none; /* Disable hover transforms on touch devices */
    }
    
    .spin-button:not(:disabled):hover {
      transform: none;
      background-position: left center;
    }
    
    .spin-button:not(:disabled):hover::before {
      transform: translateX(-100%);
    }
  }
</style>