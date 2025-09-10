<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { Plus, Minus, Zap, DollarSign, BarChart3, Lock, Edit3, RotateCcw, Square } from 'lucide-svelte';
  import { bettingStore, betPerLineVOI, totalBetVOI, canAffordBet } from '$lib/stores/betting';
  import { walletStore, walletBalance, isWalletConnected, isWalletGuest, walletAddress, isNewUser, hasExistingWallet } from '$lib/stores/wallet';
  import { walletActions } from '$lib/stores/walletActions';
  import { isSpinning } from '$lib/stores/game';
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
  export let compact = false;
  
  let betInputValue = $betPerLineVOI;
  let desktopSpinButtonElement: HTMLElement;
  let mobileSpinButtonElement: HTMLElement;
  let showAddFundsModal = false;
  let showPaylinePayouts = false;
  let showPreferencesModal = false;
  let showAutoSpinModal = false;

  // Password overlay state for locked wallets
  let password = '';
  let showPassword = false;
  let passwordError = '';
  let unlocking = false;

  // Auto Spin state
  let autoSpinActive = false;
  let autoSpinCount: number | 'unlimited' = 0;
  let autoSpinInterval: NodeJS.Timeout | null = null;
  let autoSpinDelay = 5000; // 5 seconds between spins

  // Subscribe to animation preferences
  $: preferences = $animationPreferences;
  $: reduceMotion = $shouldReduceAnimations;
  
  // Subscribe to betting preferences
  $: bettingPrefs = $bettingPreferences;
  $: customQuickBets = bettingPrefs.quickBets;
  $: defaultPaylineCount = bettingPrefs.defaultPaylines;
  $: defaultQuickBet = bettingPrefs.defaultQuickBet;
  
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
    const currentSpinButton = compact ? mobileSpinButtonElement : desktopSpinButtonElement;
    
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

  // Auto Spin functions
  function handleAutoSpinClick() {
    if (autoSpinActive) {
      stopAutoSpin();
    } else {
      showAutoSpinModal = true;
    }
  }

  function startAutoSpin(count: number | 'unlimited') {
    autoSpinActive = true;
    autoSpinCount = count;
    
    // Execute first spin immediately
    executeAutoSpin();
    
    // Start the interval for subsequent spins
    autoSpinInterval = setInterval(() => {
      executeAutoSpin();
    }, autoSpinDelay);
  }

  function stopAutoSpin() {
    autoSpinActive = false;
    autoSpinCount = 0;
    if (autoSpinInterval) {
      clearInterval(autoSpinInterval);
      autoSpinInterval = null;
    }
  }

  function executeAutoSpin() {
    // Check if we should continue auto spinning
    if (!autoSpinActive || !$canAffordBet || !$isWalletConnected || !$bettingStore.isValidBet || disabled || !$isSlotMachineOperational) {
      stopAutoSpin();
      return;
    }

    // Check if we've reached the spin limit before executing
    if (autoSpinCount !== 'unlimited') {
      if (autoSpinCount <= 0) {
        stopAutoSpin();
        return;
      }
      // Decrement count after confirming we can spin
      autoSpinCount--;
    }

    // Execute the spin
    handleSpin();
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
  $: autoSpinButtonText = autoSpinActive ? 'Stop Auto' : 'Auto Spin';
  $: autoSpinCountDisplay = autoSpinActive ? (autoSpinCount === 'unlimited' ? '∞' : autoSpinCount) : '';
</script>

<div class="betting-controls relative" class:compact={compact}>
  <!-- Always show betting controls structure -->
  <!-- Header -->
  {#if !compact}
  <div class="flex items-center justify-between my-2 py-1 border-b border-surface-tertiary" class:blurred-background={$isNewUser || walletExistsButLocked}>
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
  {/if}

  <!-- Desktop: Clean Horizontal Layout -->
  {#if !compact}
    <div class="clean-betting-strip" class:blurred-background={$isNewUser || walletExistsButLocked}>
      
      <!-- Left: Betting Controls (Stacked) -->
      <div class="betting-controls-section">
        <!-- Paylines Row -->
        <div class="control-row">
          <span class="control-label">Lines: {$bettingStore.selectedPaylines}</span>
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
              class="control-btn max-btn"
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

        <!-- Bet Per Line Row -->
        <div class="control-row">
          <span class="control-label">Bet: {$betPerLineVOI} VOI</span>
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

        <!-- Quick Bets Row -->
        <div class="quick-bets-row">
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

      <!-- Center: Large Spin Button -->
      <div class="spin-section" class:blurred-background={$isNewUser || walletExistsButLocked}>
        <button
          bind:this={desktopSpinButtonElement}
          on:click={handleSpin}
          disabled={spinButtonDisabled}
          class="large-spin-button"
          class:spinning={$isSpinning}
        >
          {#if $isSpinning}
            <div class="flex items-center justify-center gap-3">
              <div class="border-2 border-white border-t-transparent rounded-full animate-spin w-6 h-6"></div>
              <span class="text-xl font-bold">Spinning...</span>
            </div>
          {:else}
            <div class="flex items-center justify-center gap-3">
              <Zap class="w-8 h-8" />
              <span class="text-2xl font-bold">SPIN</span>
            </div>
          {/if}
        </button>
        
        <!-- Auto Spin Button -->
        <button
          on:click={handleAutoSpinClick}
          disabled={autoSpinButtonDisabled}
          class="auto-spin-button"
          class:active={autoSpinActive}
        >
          <div class="flex items-center justify-center gap-2">
            {#if autoSpinActive}
              <Square class="w-5 h-5" />
              <span class="text-lg font-bold">{autoSpinButtonText}</span>
              {#if autoSpinCountDisplay}
                <span class="text-sm opacity-80">({autoSpinCountDisplay})</span>
              {/if}
            {:else}
              <RotateCcw class="w-5 h-5" />
              <span class="text-lg font-bold">{autoSpinButtonText}</span>
            {/if}
          </div>
        </button>
      </div>

      <!-- Right: Total & Credits -->
      <div class="total-section">
        <div class="total-display">
          <div class="total-header">
            <span class="total-label">Total Bet</span>
            <span class="total-amount">{$totalBetVOI} VOI</span>
          </div>
          <div class="total-breakdown">
            {$bettingStore.selectedPaylines} lines × {$betPerLineVOI} VOI
          </div>
          <div class="balance-info">
            <BalanceBreakdown compact={true} />
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
  {:else}
    <!-- Mobile: Balanced Layout -->
    <div class="mobile-balanced-layout" class:blurred-background={$isNewUser || walletExistsButLocked}>
      
      <!-- Top: Large Spin Button -->
      <div class="mobile-spin-section">
        <button
          bind:this={mobileSpinButtonElement}
          on:click={handleSpin}
          disabled={spinButtonDisabled}
          class="mobile-large-spin"
          class:spinning={$isSpinning}
        >
          {#if $isSpinning}
            <div class="flex items-center justify-center gap-3">
              <div class="border-2 border-white border-t-transparent rounded-full animate-spin w-6 h-6"></div>
              <span class="text-xl font-bold">Spinning...</span>
            </div>
          {:else}
            <div class="flex items-center justify-center gap-3">
              <Zap class="w-8 h-8" />
              <span class="text-xl font-bold">SPIN</span>
            </div>
          {/if}
        </button>
        
        <!-- Mobile Auto Spin Button -->
        <button
          on:click={handleAutoSpinClick}
          disabled={autoSpinButtonDisabled}
          class="mobile-auto-spin-button"
          class:active={autoSpinActive}
        >
          <div class="flex items-center justify-center gap-2">
            {#if autoSpinActive}
              <Square class="w-5 h-5" />
              <span class="text-base font-bold">{autoSpinButtonText}</span>
              {#if autoSpinCountDisplay}
                <span class="text-sm opacity-80">({autoSpinCountDisplay})</span>
              {/if}
            {:else}
              <RotateCcw class="w-5 h-5" />
              <span class="text-base font-bold">{autoSpinButtonText}</span>
            {/if}
          </div>
        </button>
      </div>

      <!-- Bottom: Expanded Controls Grid -->
      <div class="mobile-controls-grid">
        <!-- Lines Control -->
        <div class="mobile-control-card">
          <div class="mobile-control-header">
            <span class="mobile-control-title">Lines</span>
            <span class="mobile-control-value">{$bettingStore.selectedPaylines}</span>
          </div>
          <div class="mobile-control-buttons">
            <button
              on:click={(e) => handleControlButton(() => bettingStore.decreasePaylines(), e.currentTarget)}
              disabled={$bettingStore.selectedPaylines <= BETTING_CONSTANTS.MIN_PAYLINES || disabled}
              class="mobile-control-btn"
              aria-label="Decrease paylines"
            >
              <Minus class="w-4 h-4" />
            </button>
            <button
              on:click={(e) => handleControlButton(() => bettingStore.setMaxPaylines(), e.currentTarget)}
              disabled={$bettingStore.selectedPaylines >= BETTING_CONSTANTS.MAX_PAYLINES || disabled}
              class="mobile-max-btn"
            >
              Max
            </button>
            <button
              on:click={(e) => handleControlButton(() => bettingStore.increasePaylines(), e.currentTarget)}
              disabled={$bettingStore.selectedPaylines >= BETTING_CONSTANTS.MAX_PAYLINES || disabled}
              class="mobile-control-btn"
              aria-label="Increase paylines"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Bet Control -->
        <div class="mobile-control-card">
          <div class="mobile-control-header">
            <span class="mobile-control-title">Bet Per Line</span>
            <span class="mobile-control-value">{$betPerLineVOI} VOI</span>
          </div>
          <div class="mobile-control-buttons">
            <button
              on:click={(e) => handleControlButton(() => bettingStore.decreaseBetPerLine(), e.currentTarget)}
              disabled={$bettingStore.betPerLine <= BETTING_CONSTANTS.MIN_BET_PER_LINE || disabled}
              class="mobile-control-btn"
              aria-label="Decrease bet"
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
              class="mobile-bet-input"
              placeholder="1"
            />
            <button
              on:click={(e) => handleControlButton(() => bettingStore.increaseBetPerLine(), e.currentTarget)}
              disabled={$bettingStore.betPerLine >= BETTING_CONSTANTS.MAX_BET_PER_LINE || disabled}
              class="mobile-control-btn"
              aria-label="Increase bet"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <!-- Total & Quick Actions -->
      <div class="mobile-bottom-section">
        <div class="mobile-total-card">
          <div class="mobile-total-info">
            <div class="mobile-total-label">Total Bet</div>
            <div class="mobile-total-amount">{$totalBetVOI} VOI</div>
            <div class="mobile-total-breakdown">{$bettingStore.selectedPaylines} lines × {$betPerLineVOI} VOI</div>
          </div>
        </div>
        
        <div class="mobile-actions-row">
          <!-- Quick Bets -->
          <div class="mobile-quick-bets">
            {#each customQuickBets.slice(0, 4) as quickBet}
              <button
                on:click={(e) => setQuickBet(quickBet, e.currentTarget)}
                disabled={disabled}
                class="mobile-quick-bet-btn"
                class:active={$bettingStore.betPerLine === quickBet.amount * 1_000_000 && $bettingStore.selectedPaylines === quickBet.lines}
              >
                {quickBet.amount}×{quickBet.lines}
              </button>
            {/each}
          </div>
          
          <!-- Add Credits -->
          <button
            on:click={() => showAddFundsModal = true}
            disabled={!$isWalletConnected}
            class="mobile-add-credits-btn"
          >
            <Plus class="w-4 h-4" />
            <span>Add Credits</span>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Error Messages -->
  {#if $bettingStore.errors.length > 0}
    <div class="control-group" class:mt-4={!compact} class:mt-3={compact} class:blurred-background={$isNewUser || walletExistsButLocked}>
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
        <p class="text-theme-text text-sm mb-4">Add funds to your wallet to start spinning</p>
        <button
          class="px-6 py-3 bg-green-600 hover:bg-green-700 font-semibold rounded-lg transition-colors text-theme"
          on:click={() => walletActions.triggerWalletSetup()}
        >
          Add Funds to Play
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
  
  /* Desktop: Balanced Layout */
  .clean-betting-strip {
    @apply flex items-stretch gap-6 p-2 backdrop-blur-sm border border-surface-border rounded-xl shadow-lg;
    background: linear-gradient(135deg, rgba(var(--theme-surface-primary-rgb), 0.8) 0%, rgba(var(--theme-surface-secondary-rgb), 0.6) 100%);
    min-height: 120px;
    overflow: hidden;
  }
  
  /* Left Section: Betting Controls (Stacked) */
  .betting-controls-section {
    @apply flex flex-col gap-3 p-4 rounded-lg border border-surface-border;
    background: rgba(var(--theme-surface-primary-rgb), 0.3);
    flex: 0 1 auto;
    min-width: clamp(240px, 20vw, 280px);
    max-width: clamp(280px, 25vw, 320px);
  }
  
  .control-row {
    @apply flex items-center justify-between py-1;
  }
  
  .control-label {
    @apply text-sm font-medium text-theme-text min-w-[90px];
  }
  
  .control-buttons {
    @apply flex items-center gap-2;
  }
  
  .control-btn {
    @apply w-10 h-10 rounded-md bg-surface-tertiary hover:bg-surface-hover disabled:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 text-theme-text hover:text-theme;
  }
  
  .max-btn {
    @apply text-xs font-medium px-3 py-1 text-voi-400 hover:text-voi-300 bg-surface-secondary hover:bg-surface-hover rounded w-16;
  }
  
  .bet-input {
    @apply w-16 h-8 px-3 text-center text-sm font-medium bg-surface-primary border border-surface-border rounded text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-transparent;
    -moz-appearance: textfield;
  }
  
  .bet-input::-webkit-outer-spin-button,
  .bet-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  
  /* Quick Bets Row */
  .quick-bets-row {
    @apply mt-2 pt-2 border-t border-surface-border;
  }
  
  .quick-bets-container {
    @apply flex items-center gap-2 flex-wrap;
    min-width: 0;
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
    @apply rounded hover:bg-surface-hover text-theme-text hover:text-theme transition-colors duration-200;
  }
  
  /* Center Section: Responsive Spin Button */
  .spin-section {
    @apply flex-1 flex flex-col justify-center items-center gap-3;
    min-width: 0; /* Allow flex shrinking */
  }
  
  .large-spin-button {
    @apply w-full h-24 bg-gradient-to-r from-voi-600 to-voi-700 hover:from-voi-700 hover:to-voi-800 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:shadow-none;
    background-size: 200% 200%;
    animation: shimmer 3s ease-in-out infinite;
    width: clamp(180px, 100%, 320px);
    max-width: 100%;
  }
  
  .large-spin-button:not(:disabled):hover {
    transform: scale(1.02);
  }
  
  .large-spin-button.spinning {
    animation: spin-button-pulse 1.5s ease-in-out infinite;
    background: linear-gradient(-45deg, #0f766e, #059669, #047857, #065f46);
    background-size: 400% 400%;
    animation: spin-button-gradient 2s ease infinite;
  }
  
  /* Right Section: Total & Credits */
  .total-section {
    @apply flex flex-col;
    flex: 0 0 auto;
    width: clamp(180px, 18vw, 220px);
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
  
  /* Mobile: Balanced Layout */
  .mobile-balanced-layout {
    @apply space-y-4 p-4;
  }
  
  /* Mobile Spin Section */
  .mobile-spin-section {
    @apply w-full space-y-3;
  }
  
  .mobile-large-spin {
    @apply w-full bg-gradient-to-r from-voi-600 to-voi-700 hover:from-voi-700 hover:to-voi-800 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:shadow-none;
    height: 4.5rem; /* 72px */
    min-height: 72px;
    touch-action: manipulation;
  }
  
  .mobile-large-spin:not(:disabled):active {
    transform: scale(0.98);
  }
  
  .mobile-large-spin.spinning {
    animation: mobile-spin-pulse 1.5s ease-in-out infinite;
    background: linear-gradient(-45deg, #0f766e, #059669, #047857, #065f46);
    background-size: 400% 400%;
    animation: spin-button-gradient 2s ease infinite;
  }
  
  /* Mobile Controls Grid */
  .mobile-controls-grid {
    @apply grid grid-cols-2 gap-3;
  }
  
  .mobile-control-card {
    @apply p-3 rounded-lg border border-surface-border;
    background: rgba(var(--theme-surface-primary-rgb), 0.3);
    min-height: 100px;
  }
  
  .mobile-control-header {
    @apply flex items-center justify-between mb-3;
  }
  
  .mobile-control-title {
    @apply text-xs font-medium text-theme-text uppercase tracking-wide;
  }
  
  .mobile-control-value {
    @apply text-sm font-bold text-theme;
  }
  
  .mobile-control-buttons {
    @apply flex items-center gap-2 justify-center;
  }
  
  .mobile-control-btn {
    @apply w-10 h-10 rounded bg-surface-tertiary hover:bg-surface-hover disabled:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 text-theme-text hover:text-theme;
    min-height: 44px;
  }
  
  .mobile-max-btn {
    @apply text-xs font-medium px-3 py-2 text-voi-400 hover:text-voi-300 bg-surface-secondary hover:bg-surface-hover rounded;
    min-height: 36px;
  }
  
  .mobile-bet-input {
    @apply w-16 h-10 px-2 text-center text-sm font-medium bg-surface-primary border border-surface-border rounded text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-transparent;
    -moz-appearance: textfield;
    min-height: 44px;
    font-size: 16px; /* Prevent zoom on iOS */
  }
  
  .mobile-bet-input::-webkit-outer-spin-button,
  .mobile-bet-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  
  /* Mobile Bottom Section */
  .mobile-bottom-section {
    @apply space-y-3;
  }
  
  .mobile-total-card {
    @apply p-4 rounded-lg border border-surface-border;
    background: rgba(var(--theme-surface-primary-rgb), 0.3);
  }
  
  .mobile-total-info {
    @apply text-center;
  }
  
  .mobile-total-label {
    @apply text-sm font-medium text-theme-text mb-1;
  }
  
  .mobile-total-amount {
    @apply text-2xl font-bold text-voi-400 mb-1;
  }
  
  .mobile-total-breakdown {
    @apply text-sm text-theme-text opacity-70;
  }
  
  /* Mobile Actions Row */
  .mobile-actions-row {
    @apply flex items-center justify-between gap-3;
  }
  
  .mobile-quick-bets {
    @apply flex gap-2;
  }
  
  .mobile-quick-bet-btn {
    @apply px-3 py-2 text-sm font-medium bg-surface-tertiary hover:bg-surface-hover disabled:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all duration-200 text-theme-text hover:text-theme;
    min-height: 40px;
  }
  
  .mobile-quick-bet-btn.active {
    @apply bg-voi-600 hover:bg-voi-700 text-white;
  }
  
  .mobile-add-credits-btn {
    @apply py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200 flex items-center gap-2 text-sm;
    min-height: 44px;
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
  
  @keyframes mobile-spin-pulse {
    0%, 100% { 
      box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
    }
    50% { 
      box-shadow: 0 0 25px rgba(16, 185, 129, 0.6);
    }
  }
  
  @keyframes spin-button-gradient {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  
  /* Responsive Design */
  @media (max-width: 1200px) {
    .clean-betting-strip {
      @apply gap-4 p-4;
    }
    
    .betting-controls-section {
      min-width: clamp(220px, 22vw, 260px);
      max-width: clamp(260px, 28vw, 300px);
    }
    
    .total-section {
      width: clamp(160px, 20vw, 200px);
    }
    
    .large-spin-button {
      @apply h-20;
      width: clamp(160px, 100%, 280px);
      font-size: 1.1rem;
    }
  }
  
  @media (max-width: 1024px) {
    .clean-betting-strip {
      @apply gap-3 p-3;
    }
    
    .betting-controls-section {
      min-width: clamp(200px, 25vw, 240px);
      max-width: clamp(240px, 30vw, 280px);
    }
    
    .total-section {
      width: clamp(150px, 22vw, 180px);
    }
    
    .large-spin-button {
      @apply h-16;
      width: clamp(140px, 100%, 240px);
      font-size: 1rem;
    }
  }
  
  @media (max-width: 900px) {
    .clean-betting-strip {
      @apply flex-col gap-4 p-4;
      min-height: auto;
    }
    
    .betting-controls-section,
    .total-section {
      width: 100%;
    }
    
    .spin-section {
      @apply order-first;
    }
    
    .large-spin-button {
      @apply h-16;
      width: clamp(200px, 60%, 300px);
      margin: 0 auto;
    }
  }
  
  @media (max-width: 768px) {
    .mobile-balanced-layout {
      @apply space-y-3 p-3;
    }
    
    .mobile-large-spin {
      height: 4rem; /* 64px */
      min-height: 64px;
      font-size: 1rem;
    }
    
    .mobile-controls-grid {
      @apply gap-2;
    }
    
    .mobile-control-card {
      @apply p-2;
      min-height: 90px;
    }
    
    .mobile-control-btn {
      @apply w-9 h-9;
      min-height: 40px;
    }
    
    .mobile-total-amount {
      @apply text-xl;
    }
    
    .mobile-add-credits-btn {
      @apply py-2 px-3 text-xs;
    }
  }
  
  /* Touch device optimizations */
  @media (hover: none) and (pointer: coarse) {
    .control-btn:hover,
    .quick-bet-btn:hover,
    .mobile-control-btn:hover,
    .mobile-quick-bet-btn:hover,
    .large-spin-button:hover,
    .mobile-large-spin:hover {
      transform: none;
    }
    
    .large-spin-button:not(:disabled):active,
    .mobile-large-spin:not(:disabled):active {
      transform: scale(0.98);
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .large-spin-button,
    .mobile-large-spin,
    .control-btn,
    .mobile-control-btn {
      animation: none !important;
      transition: opacity 0.2s ease !important;
    }
    
    .large-spin-button.spinning,
    .mobile-large-spin.spinning {
      animation: none !important;
      background: #047857;
    }
  }
  
  /* High contrast mode */
  @media (prefers-contrast: high) {
    .control-btn,
    .mobile-control-btn,
    .quick-bet-btn,
    .mobile-quick-bet-btn {
      border: 2px solid currentColor;
    }
    
    .large-spin-button,
    .mobile-large-spin {
      border: 3px solid #10b981;
    }
    
    .quick-bet-btn.active,
    .mobile-quick-bet-btn.active {
      border-color: #10b981;
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

  /* Auto Spin Button Styles */
  .auto-spin-button {
    @apply w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:shadow-none;
    height: 3.5rem; /* 56px - about 60% of the main spin button */
    width: clamp(180px, 100%, 320px);
    max-width: 100%;
  }

  .auto-spin-button:not(:disabled):hover {
    transform: scale(1.02);
  }

  .auto-spin-button.active {
    @apply from-red-600 to-red-700 hover:from-red-700 hover:to-red-800;
    animation: auto-spin-pulse 2s ease-in-out infinite;
  }

  /* Mobile Auto Spin Button */
  .mobile-auto-spin-button {
    @apply w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:shadow-none;
    height: 3rem; /* 48px */
    min-height: 48px;
    touch-action: manipulation;
  }

  .mobile-auto-spin-button:not(:disabled):active {
    transform: scale(0.98);
  }

  .mobile-auto-spin-button.active {
    @apply from-red-600 to-red-700 hover:from-red-700 hover:to-red-800;
    animation: mobile-auto-spin-pulse 2s ease-in-out infinite;
  }

  /* Auto Spin Animation Keyframes */
  @keyframes auto-spin-pulse {
    0%, 100% { 
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
    }
    50% { 
      box-shadow: 0 0 30px rgba(239, 68, 68, 0.6);
    }
  }

  @keyframes mobile-auto-spin-pulse {
    0%, 100% { 
      box-shadow: 0 0 15px rgba(239, 68, 68, 0.3);
    }
    50% { 
      box-shadow: 0 0 25px rgba(239, 68, 68, 0.6);
    }
  }

  /* Auto Spin Responsive Adjustments */
  @media (max-width: 1200px) {
    .auto-spin-button {
      @apply h-12;
      width: clamp(160px, 100%, 280px);
      font-size: 1rem;
    }
  }

  @media (max-width: 1024px) {
    .auto-spin-button {
      @apply h-10;
      width: clamp(140px, 100%, 240px);
      font-size: 0.9rem;
    }
  }

  @media (max-width: 900px) {
    .auto-spin-button {
      @apply h-12;
      width: clamp(200px, 60%, 300px);
    }
  }

  @media (max-width: 768px) {
    .mobile-auto-spin-button {
      height: 2.75rem; /* 44px */
      min-height: 44px;
      font-size: 0.9rem;
    }
  }

  /* Touch device optimizations for Auto Spin */
  @media (hover: none) and (pointer: coarse) {
    .auto-spin-button:hover,
    .mobile-auto-spin-button:hover {
      transform: none;
    }
    
    .auto-spin-button:not(:disabled):active,
    .mobile-auto-spin-button:not(:disabled):active {
      transform: scale(0.98);
    }
  }

  /* Reduced motion support for Auto Spin */
  @media (prefers-reduced-motion: reduce) {
    .auto-spin-button,
    .mobile-auto-spin-button {
      animation: none !important;
      transition: opacity 0.2s ease !important;
    }
    
    .auto-spin-button.active,
    .mobile-auto-spin-button.active {
      animation: none !important;
      background: #dc2626;
    }
  }

  /* High contrast mode for Auto Spin */
  @media (prefers-contrast: high) {
    .auto-spin-button,
    .mobile-auto-spin-button {
      border: 3px solid #f59e0b;
    }
    
    .auto-spin-button.active,
    .mobile-auto-spin-button.active {
      border-color: #dc2626;
    }
  }
</style>