<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Plus, Minus, Zap, DollarSign, BarChart3, Lock, Edit3 } from 'lucide-svelte';
  import { bettingStore, betPerLineVOI, totalBetVOI, canAffordBet } from '$lib/stores/betting';
  import { walletStore, walletBalance, isWalletConnected, isWalletGuest, walletAddress, isNewUser, hasExistingWallet } from '$lib/stores/wallet';
  import { walletActions } from '$lib/stores/walletActions';
  import { isSpinning } from '$lib/stores/game';
  import AddFundsModal from '$lib/components/wallet/AddFundsModal.svelte';
  import BalanceBreakdown from '$lib/components/wallet/BalanceBreakdown.svelte';
  import PaylinePayoutModal from '$lib/components/game/PaylinePayoutModal.svelte';
  import UserPreferencesModal from '$lib/components/ui/UserPreferencesModal.svelte';
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
  let spinButtonElement: HTMLElement;
  let showAddFundsModal = false;
  let showPaylinePayouts = false;
  let showPreferencesModal = false;

  // Password overlay state for locked wallets
  let password = '';
  let showPassword = false;
  let passwordError = '';
  let unlocking = false;

  // Subscribe to animation preferences
  $: preferences = $animationPreferences;
  $: reduceMotion = $shouldReduceAnimations;
  
  // Subscribe to betting preferences
  $: bettingPrefs = $bettingPreferences;
  $: customQuickBets = bettingPrefs.quickBets;
  $: defaultPaylineCount = bettingPrefs.defaultPaylines;
  
  // Detect when wallet exists but is locked
  $: walletExistsButLocked = $hasExistingWallet && !$isWalletConnected;
  $: isLegacyWallet = walletExistsButLocked && walletService.isLegacyWallet();
  
  // Update input when store changes
  $: betInputValue = $betPerLineVOI;
  
  // Initialize with user's preferred defaults (removed onMount to avoid interfering with wallet unlock validation)
  
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
  
  $: spinButtonDisabled = disabled || !$canAffordBet || !$isWalletConnected || !$bettingStore.isValidBet || !$isSlotMachineOperational;
  $: spinButtonText = $isSpinning ? 'Queue Spin' : 
                     !$isWalletConnected ? 'Wallet Loading...' :
                     !$isSlotMachineOperational ? 'Under Maintenance' :
                     !$canAffordBet ? 'Insufficient Balance' :
                     !$bettingStore.isValidBet ? 'Invalid Bet' :
                     'Spin';
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

  <!-- Main betting controls - horizontal layout for desktop -->
  {#if !compact}
    <div class="desktop-betting-grid" class:blurred-background={$isNewUser || walletExistsButLocked}>
      <div class="main-betting-row">
        <!-- Left side: Controls -->
        <div class="betting-controls-left">
          <!-- Paylines Control -->
          <div class="control-section">
            <div class="control-label">
              <span class="label-text">Paylines</span>
              <span class="label-value">{$bettingStore.selectedPaylines}/20</span>
            </div>
            <div class="card p-3 flex items-center gap-3">
              <button
                on:click={(e) => handleControlButton(() => bettingStore.decreasePaylines(), e.currentTarget)}
                disabled={$bettingStore.selectedPaylines <= BETTING_CONSTANTS.MIN_PAYLINES || disabled}
                class="control-button text-theme"
                aria-label="Decrease paylines"
              >
                <Minus class="w-4 h-4" />
              </button>
              
              <div class="flex-1 relative">
                <div class="absolute inset-0 flex items-center justify-center">
                  <div class="text-center">
                    <div class="text-xl font-bold text-theme">{$bettingStore.selectedPaylines}</div>
                    <div class="text-xs text-theme-text opacity-70">Lines</div>
                  </div>
                </div>
                <div class="flex items-center justify-center">
                  <div class="text-center invisible">
                    <div class="text-xl font-bold">{$bettingStore.selectedPaylines}</div>
                    <div class="text-xs">Lines</div>
                  </div>
                  <button
                    on:click={(e) => handleControlButton(() => bettingStore.setMaxPaylines(), e.currentTarget)}
                    disabled={$bettingStore.selectedPaylines >= BETTING_CONSTANTS.MAX_PAYLINES || disabled}
                    class="relative z-10 ml-16 px-2 py-1 bg-surface-secondary hover:bg-surface-hover disabled:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium rounded-md transition-all duration-200 text-theme"
                  >
                    Max
                  </button>
                </div>
              </div>
              
              <button
                on:click={(e) => handleControlButton(() => bettingStore.increasePaylines(), e.currentTarget)}
                disabled={$bettingStore.selectedPaylines >= BETTING_CONSTANTS.MAX_PAYLINES || disabled}
                class="control-button text-theme"
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
            <div class="card p-3 flex items-center gap-3">
              <button
                on:click={(e) => handleControlButton(() => bettingStore.decreaseBetPerLine(), e.currentTarget)}
                disabled={$bettingStore.betPerLine <= BETTING_CONSTANTS.MIN_BET_PER_LINE || disabled}
                class="control-button text-theme"
                aria-label="Decrease bet per line"
              >
                <Minus class="w-4 h-4" />
              </button>
              
              <div class="flex-1 relative">
                <input
                  type="number"
                  min={formatVOI(BETTING_CONSTANTS.MIN_BET_PER_LINE)}
                  max={formatVOI(BETTING_CONSTANTS.MAX_BET_PER_LINE)}
                  bind:value={betInputValue}
                  on:input={handleBetInput}
                  disabled={disabled}
                  class="input-field pr-12 text-center font-medium text-lg w-full"
                  placeholder="1"
                />
                <div class="absolute right-3 top-1/2 transform -translate-y-1/2 text-theme-text opacity-70 font-medium text-xs">
                  VOI
                </div>
              </div>
              
              <button
                on:click={(e) => handleControlButton(() => bettingStore.increaseBetPerLine(), e.currentTarget)}
                disabled={$bettingStore.betPerLine >= BETTING_CONSTANTS.MAX_BET_PER_LINE || disabled}
                class="control-button text-theme"
                aria-label="Increase bet per line"
              >
                <Plus class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Quick Bet Buttons -->
          <div class="control-section">
            <div class="control-label">
              <span class="label-text">Quick Bets</span>
              <button
                on:click={openBettingSettings}
                class="edit-button"
                title="Edit betting settings"
                disabled={$isNewUser || walletExistsButLocked}
              >
                <Edit3 class="w-4 h-4" />
              </button>
            </div>
            <div class="grid grid-cols-4 gap-2">
              {#each customQuickBets as quickBet}
                <button
                  on:click={(e) => setQuickBet(quickBet, e.currentTarget)}
                  disabled={disabled}
                  class="quick-bet-button text-theme"
                  class:active={$bettingStore.betPerLine === quickBet.amount * 1_000_000 && $bettingStore.selectedPaylines === quickBet.lines}
                >
                  {quickBet.amount} × {quickBet.lines}L
                </button>
              {/each}
            </div>
            
            <!-- Max Bet Button -->
            <button
              on:click={(e) => handleControlButton(() => bettingStore.setMaxBet(), e.currentTarget)}
              disabled={disabled}
              class="w-full btn-secondary mt-2 text-theme"
            >
              Max Bet ({formatVOI(BETTING_CONSTANTS.MAX_BET_PER_LINE)} VOI)
            </button>
          </div>
        </div>

        <!-- Right side: Total Bet -->
        <div class="betting-controls-right">
          <div class="bg-gradient-to-r from-voi-900/20 to-blue-900/20 border border-voi-700/30 rounded-lg p-4 h-full">
            <div class="flex flex-col justify-center h-full">
              <div class="text-center mb-3">
                <div class="text-theme-text font-medium mb-2">Total Bet</div>
                <div class="flex items-center justify-center gap-2">
                  <span class="text-3xl font-bold text-theme">{$totalBetVOI} VOI</span>
                </div>
              </div>
              
              <div class="text-center text-sm text-theme-text opacity-70 mb-3">
                {$bettingStore.selectedPaylines} lines × {$betPerLineVOI} VOI
              </div>
              
              <!-- Available Credits -->
              <div class="border-t border-surface-border pt-3 mb-3">
                <BalanceBreakdown />
              </div>
              
              <!-- Add Funds Button -->
              <div class="text-center">
                <button
                  on:click={() => showAddFundsModal = true}
                  disabled={!$isWalletConnected}
                  class="btn-primary text-sm py-2 px-4"
                >
                  Add Credits
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <!-- Compact mobile layout (unchanged) -->
    <div class="space-y-3" class:blurred-background={$isNewUser || walletExistsButLocked}>
      <!-- Paylines Control -->
      <div class="control-group">
        <div class="card p-2 flex items-center gap-3">
          <button
            on:click={(e) => handleControlButton(() => bettingStore.decreasePaylines(), e.currentTarget)}
            disabled={$bettingStore.selectedPaylines <= BETTING_CONSTANTS.MIN_PAYLINES || disabled}
            class="control-button w-8 h-8 text-theme"
            aria-label="Decrease paylines"
          >
            <Minus class="w-3 h-3" />
          </button>
          
          <div class="flex-1 relative">
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="text-sm font-medium text-theme">{$bettingStore.selectedPaylines} Lines</div>
            </div>
            <div class="flex items-center justify-center">
              <div class="text-sm font-medium invisible">{$bettingStore.selectedPaylines} Lines</div>
              <button
                on:click={(e) => handleControlButton(() => bettingStore.setMaxPaylines(), e.currentTarget)}
                disabled={$bettingStore.selectedPaylines >= BETTING_CONSTANTS.MAX_PAYLINES || disabled}
                class="relative z-10 ml-16 px-2 py-0.5 bg-surface-secondary hover:bg-surface-hover disabled:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium rounded transition-all duration-200 text-theme"
              >
                Max
              </button>
            </div>
          </div>
          
          <button
            on:click={(e) => handleControlButton(() => bettingStore.increasePaylines(), e.currentTarget)}
            disabled={$bettingStore.selectedPaylines >= BETTING_CONSTANTS.MAX_PAYLINES || disabled}
            class="control-button w-8 h-8 text-theme"
            aria-label="Increase paylines"
          >
            <Plus class="w-3 h-3" />
          </button>
        </div>
      </div>

      <!-- Bet Per Line Control -->
      <div class="control-group">
        <div class="space-y-2">
          <!-- Bet Input with Plus/Minus -->
          <div class="card p-2 flex items-center gap-2">
            <button
              on:click={(e) => handleControlButton(() => bettingStore.decreaseBetPerLine(), e.currentTarget)}
              disabled={$bettingStore.betPerLine <= BETTING_CONSTANTS.MIN_BET_PER_LINE || disabled}
              class="control-button w-8 h-8 text-theme"
              aria-label="Decrease bet per line"
            >
              <Minus class="w-3 h-3" />
            </button>
            
            <div class="flex-1 relative">
              <input
                type="number"
                min={formatVOI(BETTING_CONSTANTS.MIN_BET_PER_LINE)}
                max={formatVOI(BETTING_CONSTANTS.MAX_BET_PER_LINE)}
                bind:value={betInputValue}
                on:input={handleBetInput}
                disabled={disabled}
                class="input-field pr-12 text-center font-medium text-sm py-2 w-full"
                placeholder="1"
              />
              <div class="absolute right-3 top-1/2 transform -translate-y-1/2 text-theme-text opacity-70 font-medium text-xs">
                VOI
              </div>
            </div>
            
            <button
              on:click={(e) => handleControlButton(() => bettingStore.increaseBetPerLine(), e.currentTarget)}
              disabled={$bettingStore.betPerLine >= BETTING_CONSTANTS.MAX_BET_PER_LINE || disabled}
              class="control-button w-8 h-8 text-theme"
              aria-label="Increase bet per line"
            >
              <Plus class="w-3 h-3" />
            </button>
          </div>
          
          <!-- Quick Bet Buttons -->
          <div class="grid grid-cols-3 gap-1">
            {#each customQuickBets.slice(0, 3) as quickBet}
              <button
                on:click={(e) => setQuickBet(quickBet, e.currentTarget)}
                disabled={disabled}
                class="quick-bet-button text-xs py-1.5 text-theme"
                class:active={$bettingStore.betPerLine === quickBet.amount * 1_000_000 && $bettingStore.selectedPaylines === quickBet.lines}
              >
                {quickBet.amount}×{quickBet.lines}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Total Bet Display with Add Credits -->
      <div class="control-group">
        <div class="bg-gradient-to-r from-voi-900/20 to-blue-900/20 border border-voi-700/30 rounded-lg p-2">
          <div class="flex items-center gap-4">
            <!-- Total display (left) -->
            <div class="flex-1">
              <div class="flex items-center justify-between">
                <span class="text-theme-text text-sm font-medium">Total</span>
                <div class="flex items-center gap-1">
                  <span class="text-lg font-bold text-theme">{$totalBetVOI}</span>
                  <span class="text-xs text-theme-text opacity-70">VOI</span>
                </div>
              </div>
              
              <div class="text-xs text-theme-text opacity-70 mt-1">
                {$bettingStore.selectedPaylines}L × {$betPerLineVOI}
              </div>
            </div>
            
            <!-- Add Credits button (right) -->
            <button
              on:click={() => showAddFundsModal = true}
              disabled={!$isWalletConnected}
              class="btn-primary text-xs py-1.5 px-2 flex items-center gap-1 shrink-0"
              title="Add credits to your wallet"
            >
              <Plus class="w-3 h-3" />
              <span class="text-xs max-w-12 text-center">Add Credits</span>
            </button>
          </div>
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
  
  <!-- Spin Button -->
  <div class="control-group" class:mt-4={!compact} class:mt-3={compact} class:blurred-background={$isNewUser || walletExistsButLocked}>
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

<style lang="postcss">
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
    @apply text-sm font-medium text-theme-text;
  }
  
  .label-value {
    @apply text-sm font-semibold text-voi-400;
  }
  
  .edit-button {
    @apply p-1.5 rounded-md bg-surface-secondary hover:bg-surface-hover disabled:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed text-theme-text hover:text-theme transition-all duration-200 flex items-center justify-center;
    position: relative;
    overflow: hidden;
    transform-origin: center;
    backface-visibility: hidden;
  }
  
  .edit-button:active:not(:disabled) {
    transform: scale(0.95);
  }
  
  .control-button {
    @apply w-10 h-10 bg-surface-secondary hover:bg-surface-hover disabled:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all duration-200 flex items-center justify-center;
    position: relative;
    overflow: hidden;
    transform-origin: center;
    backface-visibility: hidden;
  }
  
  .control-button:active:not(:disabled) {
    transform: scale(0.95);
  }
  
  .input-field {
    @apply w-full px-3 py-2 bg-surface-secondary border border-surface-border rounded-lg text-theme-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-transparent transition-all duration-200;
  }

  /* Hide number input spinners */
  .input-field[type="number"]::-webkit-outer-spin-button,
  .input-field[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .input-field[type="number"] {
    -moz-appearance: textfield;
  }
  
  .input-field:focus {
    transform: scale(1.02);
  }
  
  .quick-bet-button {
    @apply py-2 px-3 bg-surface-secondary hover:bg-surface-hover disabled:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium rounded-md transition-all duration-200;
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
    @apply px-4 py-2 bg-surface-secondary hover:bg-surface-hover disabled:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed font-medium rounded-lg transition-all duration-200;
    position: relative;
    overflow: hidden;
    transform-origin: center;
    backface-visibility: hidden;
    touch-action: manipulation;
  }
  
  .btn-secondary:active:not(:disabled) {
    transform: scale(0.95);
  }
  
  .btn-primary {
    @apply bg-voi-600 hover:bg-voi-700 disabled:bg-voi-600/50 disabled:opacity-50 disabled:cursor-not-allowed text-theme font-medium rounded-lg transition-all duration-200;
    position: relative;
    overflow: hidden;
    transform-origin: center;
    backface-visibility: hidden;
    touch-action: manipulation;
  }
  
  .btn-primary:active:not(:disabled) {
    transform: scale(0.95);
  }
  
  .spin-button {
    @apply w-full py-4 px-6 bg-gradient-to-r from-voi-600 to-voi-700 hover:from-voi-700 hover:to-voi-800 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-100 font-bold text-lg rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:shadow-none;
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
    .btn-primary,
    .spin-button,
    .input-field {
      transition: opacity 0.2s ease !important;
      transform: none !important;
      animation: none !important;
    }
    
    .control-button:active:not(:disabled),
    .quick-bet-button:active:not(:disabled),
    .btn-secondary:active:not(:disabled),
    .btn-primary:active:not(:disabled),
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
    .btn-secondary,
    .btn-primary {
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
    
    .btn-secondary,
    .btn-primary {
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
    .btn-primary,
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
    
    .btn-secondary,
    .btn-primary {
      font-size: 0.875rem;
      min-height: 40px;
    }
  }
  
  /* Touch device optimizations */
  @media (hover: none) and (pointer: coarse) {
    .control-button:hover,
    .quick-bet-button:hover,
    .btn-secondary:hover,
    .btn-primary:hover,
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