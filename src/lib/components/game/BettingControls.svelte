<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { Plus, Minus, Zap, DollarSign, BarChart3, Lock, Edit3, RotateCcw, Square } from 'lucide-svelte';
  import { bettingStore, betPerLineVOI, totalBetVOI, canAffordBet } from '$lib/stores/betting';
  import { walletStore, walletBalance, isWalletConnected, isWalletGuest, walletAddress, isNewUser, hasExistingWallet } from '$lib/stores/wallet';
  import { walletActions } from '$lib/stores/walletActions';
  import { isSpinning, isAutoSpinning, autoSpinCount, gameStore } from '$lib/stores/game';
  import AddFundsModal from '$lib/components/wallet/AddFundsModal.svelte';
  import BalanceBreakdown from '$lib/components/wallet/BalanceBreakdown.svelte';
  import PaylinePayoutModal from '$lib/components/game/PaylinePayoutModal.svelte';
  import UserPreferencesModal from '$lib/components/ui/UserPreferencesModal.svelte';
  import AutoSpinModal from '$lib/components/game/AutoSpinModal.svelte';
  import { BETTING_CONSTANTS, formatVOI } from '$lib/constants/betting';
  import { 
    animationPreferences, 
    shouldReduceAnimations 
  } from '$lib/stores/animations';
  import { bettingPreferences, type QuickBet } from '$lib/stores/preferences';
  import { triggerTouchFeedback } from '$lib/utils/animations';
  import { isSlotMachineOperational } from '$lib/stores/houseBalance';
  import { playButtonClick } from '$lib/services/soundService';
  import { walletService } from '$lib/services/wallet';
  
  const dispatch = createEventDispatcher<{
    spin: { betPerLine: number; selectedPaylines: number; totalBet: number };
  }>();
  
  export let disabled = false;
  
  let betInputValue = $betPerLineVOI;
  let spinButtonElement: HTMLElement;
  let showAddFundsModal = false;
  let showPaylinePayouts = false;
  let showPreferencesModal = false;
  let showAutoSpinModal = false;

  // Password overlay state for locked wallets
  let password = '';
  let showPassword = false;
  let passwordError = '';
  let unlocking = false;

  // Auto Spin state - now using centralized store
  let autoSpinInterval: NodeJS.Timeout | null = null;
  let autoSpinDelay = 4000; // Default: 4s between spins
  let lastAutoSpinDelay = autoSpinDelay;

  // Subscribe to animation preferences
  $: preferences = $animationPreferences;
  $: reduceMotion = $shouldReduceAnimations;
  
  // Subscribe to betting preferences
  $: bettingPrefs = $bettingPreferences;
  $: customQuickBets = bettingPrefs.quickBets;
  $: defaultQuickBet = bettingPrefs.defaultQuickBet;
  // Adjust auto spin interval based on Rapid mode preference
  $: autoSpinDelay = bettingPrefs.rapidQueueMode ? 3000 : 4000;
  // If auto spin is active and delay changes, restart interval with new delay
  $: if ($isAutoSpinning && autoSpinDelay !== lastAutoSpinDelay) {
    lastAutoSpinDelay = autoSpinDelay;
    if (autoSpinInterval) clearInterval(autoSpinInterval);
    autoSpinInterval = setInterval(() => {
      executeAutoSpin();
    }, autoSpinDelay);
  }
  
  // Detect when wallet exists but is locked
  $: walletExistsButLocked = $hasExistingWallet && !$isWalletConnected;
  $: isLegacyWallet = walletExistsButLocked && walletService.isLegacyWallet();
  
  // Update input when store changes
  $: betInputValue = $betPerLineVOI;
  
  // Initialize with user's preferred defaults (removed onMount to avoid interfering with wallet unlock validation)
  
  // Track if we've already applied the default quick bet
  let hasAppliedDefaultQuickBet = false;
  
  // Apply default quick bet only once when wallet connects and user has one set
  $: if ($isWalletConnected && $walletAddress && defaultQuickBet && !hasAppliedDefaultQuickBet && !$isSpinning) {
    // Only apply if current bet doesn't match the default quick bet
    const currentBet = $bettingStore.betPerLine / 1_000_000; // Convert from microVOI to VOI
    const currentLines = $bettingStore.selectedPaylines;
    
    if (currentBet !== defaultQuickBet.amount || currentLines !== defaultQuickBet.lines) {
      bettingStore.setQuickBet(defaultQuickBet);
    }
    hasAppliedDefaultQuickBet = true;
  }
  
  // Reset the flag if wallet disconnects
  $: if (!$isWalletConnected) {
    hasAppliedDefaultQuickBet = false;
  }
  
  // DISABLED: Automatic validation was causing infinite loops
  // Enhanced validation will be triggered manually when needed
  // let validationTimeout: number;
  // $: if ($isWalletConnected && $walletAddress && ($bettingStore.betPerLine || $bettingStore.selectedPaylines)) {
  //   // Validation disabled to prevent excessive network requests
  // }
  
  // Handle bet input changes
  function handleBetInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = target.value;
    
    // Only update store if value is valid
    if (value && !isNaN(parseFloat(value))) {
      bettingStore.setBetFromVOI(value);
    }
  }

  function togglePaylinePayouts() {
    showPaylinePayouts = !showPaylinePayouts;
  }
  
  function openBettingSettings() {
    showPreferencesModal = true;
  }
  
  function handleSpin() {
    const currentSpinButton = spinButtonElement;
    
    if (!$canAffordBet || !$isWalletConnected || !$bettingStore.isValidBet || disabled || !$isSlotMachineOperational) {
      // Provide feedback for invalid spin attempts
      if (currentSpinButton && preferences.hapticEnabled) {
        triggerTouchFeedback(currentSpinButton, {
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
    if (currentSpinButton && preferences.hapticEnabled && !reduceMotion) {
      triggerTouchFeedback(currentSpinButton, {
        type: 'scale',
        duration: 200,
        intensity: 0.95,
        easing: 'ease-out'
      });
      
      // Add haptic feedback
      setTimeout(() => {
        if (preferences.hapticEnabled) {
          triggerTouchFeedback(currentSpinButton, {
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
  
  function setQuickBet(quickBet: QuickBet, buttonElement?: HTMLElement) {
    // Play button click sound
    playButtonClick().catch(() => {
      // Ignore sound errors
    });
    
    bettingStore.setQuickBet(quickBet);
    
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

  // Password unlock functions
  async function handlePasswordSubmit() {
    if (!password.trim() && !walletService.getPublicWalletData()?.isPasswordless) {
      passwordError = 'Password is required';
      return;
    }

    unlocking = true;
    passwordError = '';

    try {
      await walletStore.unlock(password);
      // Clear form on success
      password = '';
      showPassword = false;
    } catch (error) {
      passwordError = error instanceof Error ? error.message : 'Failed to unlock wallet';
    } finally {
      unlocking = false;
    }
  }

  function handlePasswordKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handlePasswordSubmit();
    } else if (event.key === 'Escape') {
      password = '';
      passwordError = '';
      showPassword = false;
    }
  }

  // Auto Spin functions - interval-based rapid queuing
  function handleAutoSpinClick() {
    if ($isAutoSpinning) {
      stopAutoSpin();
    } else {
      showAutoSpinModal = true;
    }
  }

  function startAutoSpin(count: number | 'unlimited') {
    // Start auto spin in game store
    gameStore.startAutoSpin(count);
    
    // Execute first spin immediately
    executeAutoSpin();
    
    // Start the interval for subsequent spins using current mode's delay
    lastAutoSpinDelay = autoSpinDelay;
    autoSpinInterval = setInterval(() => {
      executeAutoSpin();
    }, autoSpinDelay);
  }

  function executeAutoSpin() {
    // Check if we should continue auto spinning
    if (!$isAutoSpinning || !$canAffordBet || !$isWalletConnected || !$bettingStore.isValidBet || disabled || !$isSlotMachineOperational) {
      stopAutoSpin();
      return;
    }

    // Check if we've reached the spin limit before executing
    if ($autoSpinCount !== 'unlimited') {
      if ($autoSpinCount <= 0) {
        stopAutoSpin();
        return;
      }
      // Decrement count after confirming we can spin
      gameStore.decrementAutoSpinCount();
    }

    // Execute the spin - this will queue it even if previous spins are still processing
    handleSpin();
  }

  function stopAutoSpin() {
    // Stop auto spin in game store
    gameStore.stopAutoSpin();
    
    // Clear interval
    if (autoSpinInterval) {
      clearInterval(autoSpinInterval);
      autoSpinInterval = null;
    }
  }

  function handleAutoSpinConfirm(event: CustomEvent<{ count: number | 'unlimited' }>) {
    startAutoSpin(event.detail.count);
  }

  // Cleanup on component destroy
  onDestroy(() => {
    stopAutoSpin();
  });
  
  $: spinButtonDisabled = disabled || !$canAffordBet || !$isWalletConnected || !$bettingStore.isValidBet || !$isSlotMachineOperational;
  $: spinButtonText = $isSpinning ? 'Queue Spin' : 
                     !$isWalletConnected ? 'Wallet Loading...' :
                     !$isSlotMachineOperational ? 'Under Maintenance' :
                     !$canAffordBet ? 'Insufficient Balance' :
                     !$bettingStore.isValidBet ? 'Invalid Bet' :
                     'Spin';
  $: autoSpinButtonDisabled = disabled || !$isWalletConnected || !$bettingStore.isValidBet || !$isSlotMachineOperational;
  $: autoSpinButtonText = $isAutoSpinning ? 'Stop Auto' : 'Auto Spin';
  $: autoSpinCountDisplay = $isAutoSpinning ? ($autoSpinCount === 'unlimited' ? '∞' : $autoSpinCount) : '';
</script>

<div class="betting-controls relative">
  <!-- Header - Hidden on mobile -->
  <div class="header-section" class:blurred-background={$isNewUser || walletExistsButLocked}>
    <div class="flex items-center gap-2 text-amber-400">
      <DollarSign class="w-5 h-5" />
      <h3 class="font-bold text-lg">Betting Controls</h3>
    </div>
    <button
      on:click={togglePaylinePayouts}
      class="nav-item flex items-center gap-2"
      title="Show paylines and payouts"
      disabled={$isNewUser}
    >
      <BarChart3 class="w-4 h-4" />
      <span class="text-sm">Paylines & Payouts</span>
    </button>
  </div>

  <!-- Main Responsive Layout -->
  <div class="responsive-betting-layout" class:blurred-background={$isNewUser || walletExistsButLocked}>
    
    <!-- Betting Controls Section -->
    <div class="controls-section">
      <!-- Paylines Control -->
      <div class="control-group-horizontal">
        <div class="control-label-section">
          <span class="control-title">Lines:</span>
          <span class="control-value">{$bettingStore.selectedPaylines}</span>
        </div>
        <div class="control-buttons">
          <button
            on:click={(e) => handleControlButton(() => bettingStore.decreasePaylines(), e.currentTarget)}
            disabled={$bettingStore.selectedPaylines <= BETTING_CONSTANTS.MIN_PAYLINES || disabled}
            class="control-btn"
            aria-label="Decrease paylines"
          >
            <Minus class="w-4 h-4" />
          </button>
          <button
            on:click={(e) => handleControlButton(() => bettingStore.setMaxPaylines(), e.currentTarget)}
            disabled={$bettingStore.selectedPaylines >= BETTING_CONSTANTS.MAX_PAYLINES || disabled}
            class="max-btn"
          >
            Max
          </button>
          <button
            on:click={(e) => handleControlButton(() => bettingStore.increasePaylines(), e.currentTarget)}
            disabled={$bettingStore.selectedPaylines >= BETTING_CONSTANTS.MAX_PAYLINES || disabled}
            class="control-btn"
            aria-label="Increase paylines"
          >
            <Plus class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Bet Per Line Control -->
      <div class="control-group-horizontal">
        <div class="control-label-section">
          <span class="control-title">Bet:</span>
          <span class="control-value">{$betPerLineVOI} VOI</span>
        </div>
        <div class="control-buttons">
          <button
            on:click={(e) => handleControlButton(() => bettingStore.decreaseBetPerLine(), e.currentTarget)}
            disabled={$bettingStore.betPerLine <= BETTING_CONSTANTS.MIN_BET_PER_LINE || disabled}
            class="control-btn"
            aria-label="Decrease bet per line"
          >
            <Minus class="w-4 h-4" />
          </button>
          <input
            type="number"
            min={formatVOI(BETTING_CONSTANTS.MIN_BET_PER_LINE)}
            max={formatVOI(BETTING_CONSTANTS.MAX_BET_PER_LINE)}
            bind:value={betInputValue}
            on:input={handleBetInput}
            disabled={disabled}
            class="bet-input"
            placeholder="1"
          />
          <button
            on:click={(e) => handleControlButton(() => bettingStore.increaseBetPerLine(), e.currentTarget)}
            disabled={$bettingStore.betPerLine >= BETTING_CONSTANTS.MAX_BET_PER_LINE || disabled}
            class="control-btn"
            aria-label="Increase bet per line"
          >
            <Plus class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Quick Bets -->
      <div class="quick-bets-section">
        <div class="quick-bets-container">
          {#each customQuickBets.slice(0, 4) as quickBet}
            <button
              on:click={(e) => setQuickBet(quickBet, e.currentTarget)}
              disabled={disabled}
              class="quick-bet-btn"
              class:active={$bettingStore.betPerLine === quickBet.amount * 1_000_000 && $bettingStore.selectedPaylines === quickBet.lines}
            >
              {quickBet.amount}×{quickBet.lines}
            </button>
          {/each}
          <button
            on:click={openBettingSettings}
            class="edit-quick-bets"
            title="Edit betting settings"
            disabled={$isNewUser || walletExistsButLocked}
          >
            <Edit3 class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Spin Section -->
    <div class="spin-section" class:blurred-background={$isNewUser || walletExistsButLocked}>
      <button
        bind:this={spinButtonElement}
        on:click={handleSpin}
        disabled={spinButtonDisabled}
        class="spin-button"
        class:spinning={$isSpinning}
      >
        {#if $isSpinning}
          <div class="flex items-center justify-center gap-3">
            <div class="border-2 border-white border-t-transparent rounded-full animate-spin w-6 h-6"></div>
            <span class="spin-text">Spinning...</span>
          </div>
        {:else}
          <div class="flex items-center justify-center gap-3">
            <Zap class="spin-icon" />
            <span class="spin-text">SPIN</span>
          </div>
        {/if}
      </button>
      
      <!-- Auto Spin Button -->
      <button
        on:click={handleAutoSpinClick}
        disabled={autoSpinButtonDisabled}
        class="auto-spin-button"
        class:active={$isAutoSpinning}
      >
        <div class="flex items-center justify-center gap-2">
          {#if $isAutoSpinning}
            <Square class="w-5 h-5" />
            <span class="auto-spin-text">{autoSpinButtonText}</span>
            {#if autoSpinCountDisplay}
              <span class="text-sm opacity-80">({autoSpinCountDisplay})</span>
            {/if}
          {:else}
            <RotateCcw class="w-5 h-5" />
            <span class="auto-spin-text">{autoSpinButtonText}</span>
          {/if}
        </div>
      </button>
    </div>

    <!-- Total & Credits Section -->
    <div class="totals-section">
      <div class="total-display">
        <div class="total-header">
          <span class="total-label">Total Bet</span>
          <span class="total-amount">{$totalBetVOI} VOI</span>
        </div>
        <div class="total-breakdown">
          {$bettingStore.selectedPaylines} lines × {$betPerLineVOI} VOI
        </div>
        <div class="balance-info">
          <BalanceBreakdown />
        </div>
      </div>
      <button
        on:click={() => showAddFundsModal = true}
        disabled={!$isWalletConnected}
        class="add-credits-btn"
      >
        <Plus class="w-4 h-4" />
        <span>Add Credits</span>
      </button>
    </div>

  </div>

  <!-- Error Messages -->
  {#if $bettingStore.errors.length > 0}
    <div class="error-section" class:blurred-background={$isNewUser || walletExistsButLocked}>
      <div class="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
        {#each $bettingStore.errors as error}
          <p class="text-red-400 text-sm">{error}</p>
        {/each}
      </div>
    </div>
  {/if}
  

  <!-- New User Overlay - only for users who don't have a wallet yet -->
  {#if $isNewUser}
    <div class="absolute -left-4 -right-4 -bottom-4 top-0 flex items-center justify-center z-[5] rounded-lg bg-black/20">
      <div class="bg-surface-tertiary rounded-lg shadow-lg border border-surface-border backdrop-blur-sm text-center py-8 px-8">
        <div class="flex items-center justify-center gap-2 text-amber-400 mb-4">
          <DollarSign class="w-6 h-6" />
          <h3 class="font-bold text-lg">Ready to Play!</h3>
        </div>
        <p class="text-theme-text text-sm mb-4">Create, Login, or Import an account to start spinning</p>
        <button
          class="px-6 py-3 bg-green-600 hover:bg-green-700 font-semibold rounded-lg transition-colors text-theme"
          on:click={() => walletActions.triggerWalletSetup()}
        >
          Create, Login, or Import Account
        </button>
      </div>
    </div>
  {/if}

  <!-- Wallet Locked Overlay - for users with existing but locked wallets -->
  {#if walletExistsButLocked}
    <div class="absolute -left-4 -right-4 -bottom-4 top-0 flex items-center justify-center z-[5] rounded-lg bg-black/20">
      <div class="bg-surface-tertiary rounded-lg shadow-lg border border-surface-border backdrop-blur-sm text-center py-8 px-8 max-w-sm w-full">
        <div class="flex items-center justify-center gap-2 text-amber-400 mb-4">
          <Lock class="w-6 h-6" />
          <h3 class="font-bold text-lg">Wallet Locked</h3>
        </div>
        {#if isLegacyWallet}
          <p class="text-theme-text text-sm mb-4">Your wallet is currently locked</p>
        {:else}
          <p class="text-theme-text text-sm mb-4">Enter your password to unlock and start playing</p>
          
          {#if passwordError}
            <div class="p-3 bg-red-900/20 border border-red-500/30 rounded-lg mb-4">
              <p class="text-red-400 text-sm">{passwordError}</p>
            </div>
          {/if}

          <!-- Password input -->
          <form on:submit|preventDefault={handlePasswordSubmit} class="space-y-3 mb-4">
            <div class="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                bind:value={password}
                disabled={unlocking}
                placeholder="Enter your wallet password"
                class="input-field w-full disabled:opacity-50"
                autocomplete="off"
                data-lpignore="true"
                data-form-type="other"
                on:keydown={handlePasswordKeydown}
              />
              <button
                type="button"
                on:click={() => showPassword = !showPassword}
                disabled={unlocking}
                class="absolute right-2 top-1/2 -translate-y-1/2 text-theme-text opacity-70 hover:opacity-100 disabled:opacity-50"
              >
                {#if showPassword}
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.5 6.5m3.378 3.378a3 3 0 004.243 4.243M21.5 6.5l-15 15"></path>
                  </svg>
                {:else}
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7-1.275 4.057-5.065 7-9.543 7-4.477 0-8.268-2.943-9.542-7z"></path>
                  </svg>
                {/if}
              </button>
            </div>
            
            <button
              type="submit"
              disabled={unlocking}
              class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-theme"
            >
              {#if unlocking}
                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              {/if}
              <span>Unlock Wallet</span>
            </button>
          </form>
        {/if}
        
      </div>
    </div>
  {/if}
</div>

<!-- Add Funds Modal -->
{#if showAddFundsModal && $walletAddress}
  <AddFundsModal
    address={$walletAddress}
    on:close={() => showAddFundsModal = false}
  />
{/if}

<!-- Payline Payout Modal -->
<PaylinePayoutModal bind:showModal={showPaylinePayouts} />

<!-- Preferences Modal -->
<UserPreferencesModal 
  bind:isVisible={showPreferencesModal}
  initialTab="betting"
  on:close={() => showPreferencesModal = false}
/>

<!-- Auto Spin Modal -->
{#if showAutoSpinModal}
  <AutoSpinModal
    on:close={() => showAutoSpinModal = false}
    on:confirm={handleAutoSpinConfirm}
  />
{/if}

<style lang="postcss">
  /* Base betting controls */
  .betting-controls {
    @apply max-w-full;
  }

  /* Header Section - Hidden on mobile */
  .header-section {
    @apply flex items-center justify-between my-2 py-1 border-b border-surface-tertiary;
  }

  /* Responsive Main Layout */
  .responsive-betting-layout {
    @apply grid gap-4 p-4 backdrop-blur-sm lg:border lg:border-surface-border rounded-xl shadow-lg;
    /*background: linear-gradient(135deg, rgba(var(--theme-surface-primary-rgb), 0.8) 0%, rgba(var(--theme-surface-secondary-rgb), 0.6) 100%);*/
    
    /* Desktop: 3-column layout */
    grid-template-columns: 1fr 2fr 1fr;
    grid-template-areas: "controls spin totals";
    min-height: 120px;
  }

  /* Controls Section */
  .controls-section {
    grid-area: controls;
    @apply flex flex-col gap-2 p-3 rounded-lg border border-surface-border;
    background: rgba(var(--theme-surface-primary-rgb), 0.3);
    min-width: 280px;
  }

  .control-group {
    @apply space-y-2;
  }

  .control-group-horizontal {
    @apply flex items-center justify-between gap-3;
  }

  .control-label-section {
    @apply flex flex-row gap-1 min-w-0 flex-shrink-0;
  }

  .control-header {
    @apply flex items-center justify-between;
  }

  .control-title {
    @apply text-sm font-medium text-theme-text uppercase tracking-wide;
  }

  .control-value {
    @apply text-sm font-bold text-theme;
  }

  .control-buttons {
    @apply flex items-center gap-2 justify-center;
  }

  .control-btn {
    @apply w-10 h-10 rounded-md bg-surface-tertiary hover:bg-surface-hover disabled:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 text-theme-text hover:text-theme;
  }

  .max-btn {
    @apply text-xs font-medium px-5 py-3 text-voi-400 hover:text-voi-300 bg-surface-secondary hover:bg-surface-hover rounded;
  }

  .bet-input {
    @apply w-16 h-10 px-2 text-center text-sm font-medium bg-surface-primary border border-surface-border rounded text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-transparent;
    -moz-appearance: textfield;
    font-size: 16px; /* Prevent zoom on iOS */
  }

  .bet-input::-webkit-outer-spin-button,
  .bet-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  /* Quick Bets Section */
  .quick-bets-section {
    @apply pt-2 border-t border-surface-border;
  }

  .quick-bets-container {
    @apply flex items-center gap-2 flex-wrap justify-center;
  }

  .quick-bet-btn {
    @apply px-3 py-2 text-xs font-medium bg-surface-tertiary hover:bg-surface-hover disabled:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all duration-200 text-theme-text hover:text-theme;
    min-height: 32px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .quick-bet-btn.active {
    @apply bg-voi-600 hover:bg-voi-700 text-white;
  }

  .edit-quick-bets {
    @apply p-2 rounded hover:bg-surface-hover text-theme-text hover:text-theme transition-colors duration-200;
  }

  /* Spin Section */
  .spin-section {
    grid-area: spin;
    @apply flex flex-col justify-center items-center gap-3;
  }

  .spin-button {
    @apply w-full bg-gradient-to-r from-voi-600 to-voi-700 hover:from-voi-700 hover:to-voi-800 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:shadow-none;
    height: 5rem; /* 80px */
    max-width: 320px;
    background-size: 200% 200%;
    animation: shimmer 3s ease-in-out infinite;
  }

  .spin-button:not(:disabled):hover {
    transform: scale(1.02);
  }

  .spin-button.spinning {
    animation: spin-button-pulse 1.5s ease-in-out infinite;
    background: linear-gradient(-45deg, #0f766e, #059669, #047857, #065f46);
    background-size: 400% 400%;
    animation: spin-button-gradient 2s ease infinite;
  }

  .spin-icon {
    @apply w-8 h-8;
  }

  .spin-text {
    @apply text-2xl font-bold;
  }

  /* Auto Spin Button */
  .auto-spin-button {
    @apply w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:shadow-none;
    height: 3rem; /* 48px */
    min-height: 48px;
    max-width: 320px;
  }

  .auto-spin-button:not(:disabled):hover {
    transform: scale(1.02);
  }

  .auto-spin-button.active {
    @apply from-red-600 to-red-700 hover:from-red-700 hover:to-red-800;
    animation: auto-spin-pulse 2s ease-in-out infinite;
  }

  .auto-spin-text {
    @apply text-lg font-bold;
  }

  /* Totals Section */
  .totals-section {
    grid-area: totals;
    @apply flex flex-col;
    min-width: 230px;
  }

  .total-display {
    @apply p-4 rounded-lg border border-surface-border mb-4 flex-1;
    background: rgba(var(--theme-surface-primary-rgb), 0.3);
  }

  .total-header {
    @apply flex items-center justify-between mb-3;
  }

  .total-label {
    @apply text-sm font-medium text-theme-text;
  }

  .total-amount {
    @apply text-xl font-bold text-voi-400;
  }

  .total-breakdown {
    @apply text-sm text-theme-text opacity-70 mb-3;
  }

  .balance-info {
    @apply border-t border-surface-border pt-3;
  }

  .add-credits-btn {
    @apply w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm;
  }

  /* Error Section */
  .error-section {
    @apply mt-4;
  }
  
  /* Animation keyframes */
  @keyframes shimmer {
    0%, 100% {
      background-position: 0% 0%;
    }
    50% {
      background-position: 100% 100%;
    }
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

  @keyframes auto-spin-pulse {
    0%, 100% { 
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
    }
    50% { 
      box-shadow: 0 0 30px rgba(239, 68, 68, 0.6);
    }
  }
  
  /* Responsive Design */
  @media (max-width: 1200px) {
    .responsive-betting-layout {
      @apply gap-3;
      grid-template-columns: 1fr 1.8fr 1fr;
    }
    
    .spin-button {
      height: 4.5rem; /* 72px */
      font-size: 1.8rem;
    }
    
    .spin-icon {
      @apply w-7 h-7;
    }
    
    .spin-text {
      @apply text-xl;
    }
    
    .auto-spin-button {
      height: 2.75rem; /* 44px */
    }
    
    .auto-spin-text {
      @apply text-base;
    }
  }
  
  @media (max-width: 1024px) {
    .responsive-betting-layout {
      @apply gap-2;
      grid-template-columns: 1fr 1.5fr 1fr;
    }
    
    .spin-button {
      height: 4rem; /* 64px */
      font-size: 1.5rem;
    }
    
    .spin-icon {
      @apply w-6 h-6;
    }
    
    .spin-text {
      @apply text-lg;
    }
    
    .auto-spin-button {
      height: 2.5rem; /* 40px */
    }
    
    .auto-spin-text {
      @apply text-sm;
    }
  }
  
  @media (max-width: 900px) {
    .header-section {
      @apply hidden;
    }
    
    .responsive-betting-layout {
      display: flex;
      flex-direction: column;
      @apply gap-3 p-3;
    }
    
    .controls-section {
      @apply grid grid-cols-2 gap-3 order-2;
    }
    
    .control-group,
    .control-group-horizontal {
      @apply p-3 rounded-lg border border-surface-border;
      background: rgba(var(--theme-surface-primary-rgb), 0.3);
      min-height: 100px;
    }

    .control-group-horizontal {
      @apply flex-col items-start gap-2;
    }

    .control-label-section {
      @apply flex-row items-center justify-between w-full;
    }

    .spin-section {
      @apply order-1;
    }

    .totals-section {
      @apply order-3;
    }

    .quick-bets-section {
      @apply col-span-2 pt-0;
      border-top: none;
    }

    .quick-bets-container {
      @apply grid grid-cols-4 gap-2 justify-center;
    }
    
    .spin-button {
      height: 4.5rem; /* 72px */
      font-size: 1.6rem;
    }
    
    .spin-icon {
      @apply w-7 h-7;
    }
    
    .spin-text {
      @apply text-xl;
    }
    
    .auto-spin-button {
      height: 3rem; /* 48px */
    }
    
    .auto-spin-text {
      @apply text-base;
    }
  }
  
  @media (max-width: 768px) {
    .responsive-betting-layout {
      @apply p-3 gap-3;
    }
    
    .controls-section {
      @apply gap-3;
    }
    
    .control-group,
    .control-group-horizontal {
      @apply p-2;
      min-height: 90px;
    }
    
    .control-btn {
      @apply w-9 h-9;
      min-height: 44px;
    }
    
    .bet-input {
      @apply w-14 h-9;
      min-height: 44px;
    }
    
    .spin-button {
      height: 4rem; /* 64px */
      font-size: 1.4rem;
    }
    
    .spin-icon {
      @apply w-6 h-6;
    }
    
    .spin-text {
      @apply text-lg;
    }
    
    .auto-spin-button {
      height: 2.75rem; /* 44px */
    }
    
    .auto-spin-text {
      @apply text-sm;
    }
    
    .totals-section {
      @apply flex flex-col;
    }
    
    .total-display {
      @apply text-center;
    }
    
    .total-amount {
      @apply text-2xl;
    }
    
    .quick-bets-container {
      @apply justify-center;
    }
    
    .quick-bet-btn {
      @apply text-sm py-2.5;
      min-height: 44px;
    }
  }

  @media (max-width: 640px) {
    .responsive-betting-layout {
      @apply gap-4;
    }
    
    .controls-section {
      @apply grid-cols-2 gap-3;
    }
    
    .control-group,
    .control-group-horizontal {
      min-height: 90px;
    }
    
    .spin-button {
      height: 4rem; /* 64px */
      font-size: 1.3rem;
    }
    
    .spin-text {
      @apply text-lg;
    }
    
    .auto-spin-button {
      height: 2.75rem; /* 44px */
    }
    
    .auto-spin-text {
      @apply text-sm;
    }
    
    .totals-section {
      @apply text-center;
    }
    
    .total-display {
      @apply mb-3;
    }
    
    .total-amount {
      @apply text-3xl;
    }
    
    /* Mobile Bottom Section - Matches first screenshot layout */
    .quick-bets-container {
      @apply flex gap-2 justify-center;
    }
    
    .quick-bet-btn {
      @apply text-sm py-2.5 px-3;
      min-height: 44px;
    }
    
    .add-credits-btn {
      @apply py-3 px-4 text-sm;
      min-height: 44px;
    }
  }
  
  /* Touch device optimizations */
  @media (hover: none) and (pointer: coarse) {
    .control-btn:hover,
    .quick-bet-btn:hover,
    .spin-button:hover,
    .auto-spin-button:hover {
      transform: none;
    }
    
    .spin-button:not(:disabled):active,
    .auto-spin-button:not(:disabled):active {
      transform: scale(0.98);
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .spin-button,
    .auto-spin-button,
    .control-btn {
      animation: none !important;
      transition: opacity 0.2s ease !important;
    }
    
    .spin-button.spinning {
      animation: none !important;
      background: #047857;
    }
    
    .auto-spin-button.active {
      animation: none !important;
      background: #dc2626;
    }
  }
  
  /* High contrast mode */
  @media (prefers-contrast: high) {
    .control-btn,
    .quick-bet-btn {
      border: 2px solid currentColor;
    }
    
    .spin-button,
    .auto-spin-button {
      border: 3px solid #10b981;
    }
    
    .quick-bet-btn.active {
      border-color: #10b981;
    }
    
    .auto-spin-button.active {
      border-color: #dc2626;
    }
  }

  /* Guest mode blur effect */
  .blurred-background {
    @apply opacity-40 pointer-events-none;
    filter: blur(1px) grayscale(0.5);
    transition: all 0.3s ease-in-out;
  }

  /* Ensure overlay is positioned correctly */
  .betting-controls.relative {
    position: relative;
    isolation: isolate;
  }
</style>
