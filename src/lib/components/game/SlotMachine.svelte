<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { gameStore, currentGrid, isSpinning, waitingForOutcome, currentSpinId } from '$lib/stores/game';
  import { bettingStore } from '$lib/stores/betting';
  import { queueStore, pendingSpins } from '$lib/stores/queue';
  import { queueProcessor } from '$lib/services/queueProcessor';
  import { loadingStates } from '$lib/stores/animations';
  import { SpinStatus } from '$lib/types/queue';
  import { formatVOI } from '$lib/constants/betting';
  import { WINNING_SYMBOLS } from '$lib/constants/symbols';
  import type { SlotSymbol } from '$lib/types/symbols';
  import { 
    isSlotMachineOperational, 
    operationalStatusMessage, 
    houseBalanceActions,
    isLoadingHouseBalance
  } from '$lib/stores/houseBalance';
  import ReelGrid from './ReelGrid.svelte';
  import PaylineOverlay from './PaylineOverlay.svelte';
  import BettingControls from './BettingControls.svelte';
  import GameQueue from './GameQueue.svelte';
  import WinCelebration from './WinCelebration.svelte';
  import LoadingOverlay from '../ui/LoadingOverlay.svelte';
  import { soundService, playSpinStart, playReelStop, playWinSound, playLoss } from '$lib/services/soundService';
  import { themeStore, currentTheme } from '$lib/stores/theme';
  
  // References to ReelGrid components for direct function calls
  let desktopReelGrid: ReelGrid;
  let mobileReelGrid1: ReelGrid;
  let mobileReelGrid2: ReelGrid;
  
  function callAllReelGrids(methodName: string, ...args: any[]) {
    [desktopReelGrid, mobileReelGrid1, mobileReelGrid2].forEach(component => {
      if (component && typeof component[methodName] === 'function') {
        component[methodName](...args);
      }
    });
  }

  // Theme switching function
  let isThemeChanging = false;
  function handleThemeClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    
    // Add visual feedback
    isThemeChanging = true;
    setTimeout(() => {
      isThemeChanging = false;
    }, 500);
    
    themeStore.nextTheme();
  }

  import { PUBLIC_DEBUG_MODE } from '$env/static/public';
  
  
  export let disabled = false;
  export let compact = false;
  
  // Win celebration state
  let showWinCelebration = false;
  let winAmount = 0;
  let winLevel: 'small' | 'medium' | 'large' | 'jackpot' = 'small';
  let winningSymbols: SlotSymbol[] = [];
  
  // Loss feedback state
  let showLossFeedback = false;
  let lossAmount = 0;
  
  // Continuous spinning management
  let spinningInterval: NodeJS.Timeout | null = null;
  let queueUnsubscribe: (() => void) | null = null;
  let isInitialMount = true;
  let celebrationTimeout: NodeJS.Timeout | null = null;
  let lastCelebratedSpinId: string | null = null;
  let lossFeedbackTimeout: NodeJS.Timeout | null = null;
  let lastLossFeedbackSpinId: string | null = null;
  let lastProcessedOutcomeSpinId: string | null = null;
  
  // Track whether user has started any spins this session
  let userSessionStarted = false;
  
  // Track replay timeouts to prevent overlapping replays
  let replayTimeouts: NodeJS.Timeout[] = [];
  
  // Track if we're in replay mode to prevent queue auto-start
  let isReplayMode = false;
  
  // GLOBAL deduplication to prevent multiple SlotMachine instances from processing same replay
  const GLOBAL_PROCESSED_REPLAYS = globalThis.GLOBAL_PROCESSED_REPLAYS || (globalThis.GLOBAL_PROCESSED_REPLAYS = new Set<string>());

  // Maintenance overlay state - don't show until after initial balance check
  let showMaintenanceOverlay = true;
  let hasInitialBalanceCheckCompleted = false;
  
  // Loading state
  $: currentLoadingState = $loadingStates[0]; // Get the first loading state
  $: isLoading = $loadingStates.length > 0;
  
  onMount(() => {
    // Use setTimeout to avoid reactive update conflicts
    setTimeout(() => {
      // Reset game state to ensure clean start
      gameStore.reset();
      gameStore.initializeGrid();
    }, 0);
    
    // Initialize house balance monitoring
    houseBalanceActions.initialize().finally(() => {
      hasInitialBalanceCheckCompleted = true;
    });
    
    // DO NOT auto-clear queue - keep for testing
    
    queueProcessor.start(); // Start queue processing
    
    // Subscribe to queue changes to manage continuous spinning
    queueUnsubscribe = queueStore.subscribe(queueState => {
      handleQueueUpdate(queueState);
    });

    // Listen for replay events from GameQueue
    const handleReplayEvent = (event: CustomEvent) => {
      handleReplaySpin(event.detail);
    };

    // @ts-ignore
    document.addEventListener('replay-spin', handleReplayEvent);

    return () => {
      // @ts-ignore
      document.removeEventListener('replay-spin', handleReplayEvent);
    };
  });
  
  onDestroy(() => {
    queueProcessor.stop(); // Stop queue processing
    houseBalanceActions.reset(); // Stop house balance monitoring
    if (queueUnsubscribe) queueUnsubscribe();
    if (spinningInterval) clearInterval(spinningInterval);
    if (celebrationTimeout) clearTimeout(celebrationTimeout);
    if (lossFeedbackTimeout) clearTimeout(lossFeedbackTimeout);
    // Clear all replay timeouts
    replayTimeouts.forEach(timeout => clearTimeout(timeout));
    replayTimeouts = [];
    
    // Stop any spinning sounds
    soundService.stopLoopingSound('spin-loop', { fadeOut: 0.1 }).catch(() => {
      // Ignore sound errors
    });
  });
  
  function handleSpin(event: CustomEvent) {
    const { betPerLine, selectedPaylines, totalBet } = event.detail;
    
    // Mark that user has initiated a spin this session
    userSessionStarted = true;
    
    // Play spin start sound
    playSpinStart().catch(() => {
      // Ignore sound errors
    });
    
    // Add spin to queue (this will handle the blockchain processing in background)
    const spinId = queueStore.addSpin(betPerLine, selectedPaylines, totalBet);
    
    // New spin takes over display immediately
    
    // Start visual spin animation immediately with continuous spinning
    startContinuousSpinning(spinId);
  }

  async function startContinuousSpinning(spinId: string) {
    // SWITCHING SPINS: If we're switching to a different spin, stop the previous one's sound
    if ($currentSpinId && $currentSpinId !== spinId && $isSpinning) {
      console.log(`Switching from spin ${$currentSpinId} to ${spinId} - stopping previous sound`);
      await soundService.forceStopWithVerification('spin-loop', 2);
    }

    // SOUND GUARD: Don't restart sound if this spin is already playing
    if ($currentSpinId === spinId && $isSpinning) {
      return; // Same spin already spinning, don't restart sound
    }

    // CLEANUP: Clear any existing animation interval
    if (spinningInterval) {
      clearInterval(spinningInterval);
      spinningInterval = null;
    }
    
    // Start looping spin sound (only if we're not already playing for this spin)
    if ($currentSpinId !== spinId || !$isSpinning) {
      console.log(`Starting spin-loop sound for spin ${spinId}`);
      soundService.playLoopingSound('spin-loop', {
        fadeIn: 0.2,
        volume: 0.6
      }).catch(() => {
        // Ignore sound errors
      });
    }
    
    // Start the initial spin animation in game store
    gameStore.startSpin(spinId);
    
    // DIRECTLY call ReelGrid to start physics animation - NO REACTIVE DEPENDENCIES
    callAllReelGrids('startSpin', spinId);
  }

  function handleQueueUpdate(queueState: any) {
    // If there are no spins at all, make sure we're not spinning
    if (!queueState.spins || queueState.spins.length === 0) {
      if ($isSpinning || $waitingForOutcome) {
        gameStore.reset();
        if (spinningInterval) {
          clearInterval(spinningInterval);
          spinningInterval = null;
        }
      }
      // Set flag to false after initial processing when queue is empty
      if (isInitialMount) {
        isInitialMount = false;
      }
      return;
    }
    
    // Find the most recent spin that has an outcome ready
    const readySpins = queueState.spins.filter((spin: any) => 
      [SpinStatus.READY_TO_CLAIM, SpinStatus.COMPLETED].includes(spin.status) && 
      spin.outcome
    );
    
    if (readySpins.length > 0) {
      // Sort by timestamp to get the most recent
      readySpins.sort((a: any, b: any) => b.timestamp - a.timestamp);
      const mostRecentSpin = readySpins[0];
      
      // Additional safeguard: don't display very old outcomes on initial mount
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      const isTooOld = isInitialMount && mostRecentSpin.timestamp < fiveMinutesAgo;
      
      // CRITICAL FIX: Only display outcome if this spin is currently being displayed
      // This prevents PROCESSING spins from triggering animations for unrelated spins
      // ALSO: Only display outcomes if user has started a session (prevents auto-animation)
      if (!isTooOld && $currentSpinId === mostRecentSpin.id && userSessionStarted) {
        displayOutcome(mostRecentSpin);
      }
    }
    
    // Set flag to false after processing any spins to allow future celebrations
    // BUT don't set it to false immediately if we're about to display outcomes
    // This prevents the race condition where loss feedback shows on initial mount
    if (isInitialMount && readySpins.length > 0) {
      // Wait longer to ensure all initial outcome displays complete first
      setTimeout(() => {
        isInitialMount = false;
      }, 500);
    }
    
    // Check if we need to start spinning for a new pending spin
    // IMPORTANT FIX: Exclude PROCESSING spins from auto-starting new animations
    // PROCESSING spins should only affect animations if they're the current spin
    const pendingSpins = queueState.spins.filter((spin: any) => 
      [SpinStatus.PENDING, SpinStatus.SUBMITTING, SpinStatus.WAITING].includes(spin.status)
    );
    
    // Check for PROCESSING spins separately - only manage them if they're current
    const processingSpins = queueState.spins.filter((spin: any) => 
      spin.status === SpinStatus.PROCESSING
    );
    
    // If we have a current spin that's PROCESSING but got an outcome, display it
    if ($currentSpinId && userSessionStarted) {
      const currentSpin = queueState.spins.find((spin: any) => spin.id === $currentSpinId);
      if (currentSpin && currentSpin.status === SpinStatus.PROCESSING && currentSpin.outcome) {
        // This PROCESSING spin has an outcome and it's our current spin - display it
        displayOutcome(currentSpin);
        return; // Don't continue with other logic
      }
    }
    
    // REMOVED: Automatic spin starting logic that caused duplicate sounds
    // The spin should only start from handleSpin when user initiates it
    // This prevents the queue update from restarting sounds unnecessarily
    
    if (pendingSpins.length === 0 && processingSpins.length === 0 && $currentSpinId) {
      // No pending or processing spins but we still have a current spin ID - check if it should be cleared
      const currentSpin = queueState.spins.find((spin: any) => spin.id === $currentSpinId);
      if (!currentSpin || [SpinStatus.COMPLETED, SpinStatus.FAILED, SpinStatus.EXPIRED].includes(currentSpin.status)) {
        // Current spin is done, reset the display
        gameStore.reset();
        if (spinningInterval) {
          clearInterval(spinningInterval);
          spinningInterval = null;
        }
      }
    }
  }

  async function displayOutcome(spin: any) {
    // CRITICAL STATE COORDINATION CHECK: Only display if this spin is current
    if (!spin.outcome || $currentSpinId !== spin.id) {
      return;
    }

    // DUPLICATE PROTECTION: Prevent processing same outcome multiple times
    if (lastProcessedOutcomeSpinId === spin.id) {
      return;
    }
    lastProcessedOutcomeSpinId = spin.id;

    // ANIMATION GUARD: Prevent overlapping animations
    if ($isSpinning && spinningInterval) {
      // Stop any existing animation cleanly before starting new one
      clearInterval(spinningInterval);
      spinningInterval = null;
    }
    
    // Stop the spinning loop sound with verification (same as replays)
    const soundStopped = await soundService.forceStopWithVerification('spin-loop', 3);
    if (!soundStopped) {
      console.warn('Failed to stop spin-loop sound after normal spin');
    }
    
    // Play reel stop sound (only once, not from each ReelGrid)
    setTimeout(() => {
      playReelStop().catch(() => {
        // Ignore sound errors
      });
    }, 100);
    
    // DIRECTLY stop ReelGrid physics animation and set final positions
    callAllReelGrids('setFinalPositions', spin.outcome, spin.id);
    
    // Complete the spin with actual outcome
    gameStore.completeSpin(spin.id, spin.outcome);
    
    // Only trigger celebrations if this is not the initial mount and we haven't already celebrated this spin
    if (!isInitialMount && lastCelebratedSpinId !== spin.id) {
      // Check if we have actual winnings from blockchain first
      if (spin.winnings > 0) {
        // Determine win level and play appropriate sound
        const winLevel = spin.winnings >= 100000000 ? 'jackpot' : 
                         spin.winnings >= 50000000 ? 'large' : 
                         spin.winnings >= 20000000 ? 'medium' : 'small';
        
        // Play win sound
        playWinSound(winLevel).catch(() => {
          // Ignore sound errors
        });
        
        // Use actual winnings from blockchain
        triggerWinCelebration({
          amount: spin.winnings,
          level: winLevel
        }, spin.id);
      } else {
        // Show loss feedback immediately (but only once per spin and not on initial mount)
        if (lastLossFeedbackSpinId !== spin.id && !isInitialMount) {
          // Play loss sound (subtle, non-abrasive)
          playLoss().catch(() => {
            // Ignore sound errors
          });
          
          triggerLossFeedback(spin);
        }
      }
    }
  }
  
  function checkForWins(outcome: string[][]) {
    // Simple win detection for demonstration
    // Check for three in a row on first payline
    const firstRow = outcome.map(reel => reel[0]);
    const isWin = ['A', 'B', 'C', 'D'].includes(firstRow[0]) && firstRow.slice(0, 3).every(symbol => symbol === firstRow[0]);
    
    if (isWin) {
      const symbol = firstRow[0];
      const multiplier = { 'A': 100, 'B': 50, 'C': 25, 'D': 10 }[symbol] || 1;
      const amount = $bettingStore.betPerLine * multiplier;
      
      return {
        amount,
        level: amount >= 100000 ? 'jackpot' : 
               amount >= 50000 ? 'large' : 
               amount >= 20000 ? 'medium' : 'small'
      };
    }
    
    return null;
  }
  
  function generateWinningSymbols(level: 'small' | 'medium' | 'large' | 'jackpot'): SlotSymbol[] {
    const symbols: SlotSymbol[] = [];
    
    // Generate symbols based on win level
    switch (level) {
      case 'small':
        // Bronze and silver symbols
        symbols.push(WINNING_SYMBOLS.D, WINNING_SYMBOLS.C); // Bronze, Silver
        break;
      case 'medium':
        // Silver and gold symbols
        symbols.push(WINNING_SYMBOLS.C, WINNING_SYMBOLS.B); // Silver, Gold
        break;
      case 'large':
        // Gold and diamond symbols
        symbols.push(WINNING_SYMBOLS.B, WINNING_SYMBOLS.A); // Gold, Diamond
        break;
      case 'jackpot':
        // All premium symbols with emphasis on diamond
        symbols.push(WINNING_SYMBOLS.A, WINNING_SYMBOLS.A, WINNING_SYMBOLS.B); // Diamond x2, Gold
        break;
    }
    
    return symbols;
  }

  function triggerWinCelebration(win: { amount: number; level: 'small' | 'medium' | 'large' | 'jackpot' }, spinId?: string) {
    // Clear any existing celebration timeout to prevent conflicts
    if (celebrationTimeout) {
      clearTimeout(celebrationTimeout);
      celebrationTimeout = null;
    }
    
    // Don't trigger if already showing the same celebration
    if (showWinCelebration && winAmount === win.amount && winLevel === win.level) {
      return;
    }
    
    // Record that we've celebrated this spin
    if (spinId) {
      lastCelebratedSpinId = spinId;
    }
    
    winAmount = win.amount;
    winLevel = win.level;
    winningSymbols = generateWinningSymbols(win.level);
    showWinCelebration = true;
    
    // Auto-hide celebration after duration
    const duration = {
      small: 3000,
      medium: 4000,
      large: 5000,
      jackpot: 6000
    }[win.level];
    
    celebrationTimeout = setTimeout(() => {
      showWinCelebration = false;
      celebrationTimeout = null;
    }, duration);
  }

  function triggerLossFeedback(spin: any) {
    // Clear any existing loss feedback timeout
    if (lossFeedbackTimeout) {
      clearTimeout(lossFeedbackTimeout);
      lossFeedbackTimeout = null;
    }
    
    // Don't show loss feedback if we're already showing win celebration
    if (showWinCelebration) {
      return;
    }
    
    // Record that we've shown loss feedback for this spin
    lastLossFeedbackSpinId = spin.id;
    
    lossAmount = spin.totalBet;
    showLossFeedback = true;
    
    // Auto-hide loss feedback after 2 seconds
    lossFeedbackTimeout = setTimeout(() => {
      showLossFeedback = false;
      lossFeedbackTimeout = null;
    }, 2000);
  }

  async function handleReplaySpin(replayData: { spin: any; outcome: string[][]; winnings: number; betAmount: number }) {
    const replayId = replayData.spin.id;
    
    // CRITICAL: Prevent duplicate processing of the same replay (GLOBAL across all SlotMachine instances)
    if (GLOBAL_PROCESSED_REPLAYS.has(replayId)) {
      console.warn(`Duplicate replay event ignored for spin: ${replayId} (GLOBAL deduplication)`);
      return;
    }
    
    // Prevent overlapping replays
    if (isReplayMode) {
      console.warn('Replay already in progress, ignoring new replay request');
      return;
    }
    
    // Mark this replay as processed GLOBALLY
    GLOBAL_PROCESSED_REPLAYS.add(replayId);
    
    // Mark that user has initiated a replay (allows animations)
    userSessionStarted = true;
    isReplayMode = true; // Prevent queue auto-start during replay
    
    console.log(`=== REPLAY: Starting replay sequence for ${replayId} ===`);
    
    // Cancel any existing replay timeouts to prevent conflicts
    replayTimeouts.forEach(timeout => clearTimeout(timeout));
    replayTimeouts = [];
    
    // Generate a unique replay animation ID
    const replayAnimationId = `replay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Stop any existing animations and clear state
    if (spinningInterval) {
      clearInterval(spinningInterval);
      spinningInterval = null;
    }
    
    // Use new force stop with verification for replays
    console.log('=== REPLAY: Starting sound cleanup ===');
    const soundStopped = await soundService.forceStopWithVerification('spin-loop', 3);
    
    if (!soundStopped) {
      console.error('Failed to stop spin-loop sound, proceeding with replay anyway');
    }
    
    // Force stop any physics animations and reset game state
    callAllReelGrids('stopSpin');
    callAllReelGrids('setFinalPositions', [['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_']], 'force-stop');
    gameStore.reset();
    
    // Additional wait to ensure all cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log('=== REPLAY: Sound cleanup completed ===');
    
    // Use setTimeout to break out of any reactive update cycle
    const startTimeout = setTimeout(async () => {
      console.log('=== REPLAY: Starting new spin sound ===');
      
      // Double-check that spin-loop is stopped before starting new one
      if (!soundService.verifySoundStopped('spin-loop')) {
        console.warn('spin-loop still active, attempting one more cleanup');
        await soundService.forceStopWithVerification('spin-loop', 1);
      }
      
      // Start looping spin sound for replay
      soundService.playLoopingSound('spin-loop', {
        fadeIn: 0.1,
        volume: 0.6
      }).catch(() => {
        // Ignore sound errors
      });
      
      // Start spin using the same pattern as regular spins
      gameStore.startSpin(replayAnimationId);
      
      // CRITICAL: Start physics animation just like regular spins
      callAllReelGrids('startSpin', replayAnimationId);
      
      // After spinning duration, display the outcome
      const outcomeTimeout = setTimeout(() => {
        // Stop the spinning loop sound with fade out
        soundService.stopLoopingSound('spin-loop', { fadeOut: 0.3 }).catch(() => {
          // Ignore sound errors
        });
        
        // Play reel stop sound for replay
        setTimeout(() => {
          playReelStop().catch(() => {
            // Ignore sound errors
          });
        }, 100);
        
        // CRITICAL: Stop physics and set final positions just like regular spins
        callAllReelGrids('setFinalPositions', replayData.outcome, replayAnimationId);
        gameStore.completeSpin(replayAnimationId, replayData.outcome);
        
        // Trigger win/loss animation after a small delay
        const celebrationTimeout = setTimeout(() => {
          if (replayData.winnings > 0) {
            const winLevel = replayData.winnings >= 100000000 ? 'jackpot' : 
                            replayData.winnings >= 50000000 ? 'large' : 
                            replayData.winnings >= 20000000 ? 'medium' : 'small';
            
            triggerWinCelebration({
              amount: replayData.winnings,
              level: winLevel
            }, replayAnimationId);
          } else {
            triggerLossFeedback({
              id: replayAnimationId,
              totalBet: replayData.betAmount
            });
          }
        }, 500); // Small delay after outcome is shown
        replayTimeouts.push(celebrationTimeout);
        
        // Cleanup after replay completes
        const cleanupTimeout = setTimeout(() => {
          // Ensure complete cleanup
          gameStore.reset();
          callAllReelGrids('stopSpin');
          callAllReelGrids('setFinalPositions', [['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_']], 'cleanup');
          
          // Clear replay mode flag to allow normal operation
          isReplayMode = false;
          
          // Remove this replay from GLOBAL processed set (allow future replays of same spin)
          GLOBAL_PROCESSED_REPLAYS.delete(replayId);
          
          // Remove completed timeouts from tracking
          replayTimeouts = replayTimeouts.filter(t => t !== startTimeout && t !== outcomeTimeout && t !== celebrationTimeout && t !== cleanupTimeout);
          
          console.log(`=== REPLAY: Cleanup completed for ${replayId} ===`);
        }, 3000); // Clear the replay after 3 seconds
        replayTimeouts.push(cleanupTimeout);
      }, 2500); // Show spinning for 2.5 seconds
      replayTimeouts.push(outcomeTimeout);
    }, 0);
    replayTimeouts.push(startTimeout);
  }
</script>

<!-- Reactive theme styles -->
<div class="slot-machine-container h-full" 
     style="--theme-primary: {$currentTheme.primary}; --theme-secondary: {$currentTheme.secondary}; --theme-lights: {$currentTheme.lights};">
  <!-- Desktop: Vertical Layout -->
  <div class="hidden lg:block">
    <!-- Slot Machine Frame -->
    <div class="slot-machine-frame mb-4">
      <!-- Outer decorative border with casino lights -->
      <div class="casino-border" 
           class:theme-changing={isThemeChanging}
           role="button" 
           tabindex="0"
           aria-label="Change slot machine theme"
           title="Click to change theme: {$currentTheme.displayName}"
           on:click={handleThemeClick}
           on:keydown={(e) => e.key === 'Enter' && handleThemeClick(e)}>
        <div class="casino-lights"></div>
      </div>
      
      <!-- Machine body with metallic finish -->
      <div class="machine-body">
        <!-- Chrome accent frame -->
        <div class="chrome-frame">
          <!-- Inner shadow frame -->
          <div class="inner-frame">
            <!-- Main game grid -->
            <div class="game-grid">
              <!-- Reel Grid -->
              <ReelGrid bind:this={desktopReelGrid} grid={$currentGrid} isSpinning={$isSpinning} />
              
              <!-- Payline Overlay -->
              <PaylineOverlay 
                showPaylines={$bettingStore.selectedPaylines > 1}
                activePaylines={Array.from({length: $bettingStore.selectedPaylines}, (_, i) => i)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Betting Controls - Below slot machine -->
    <BettingControls on:spin={handleSpin} {compact} />
  </div>
  
  <!-- Mobile: Full height layout -->
  <div class="lg:hidden h-full flex flex-col">
    {#if compact}
      <!-- Slot Machine Frame - Fixed size -->
      <div class="flex-shrink-0 slot-machine-frame mb-3">
        <!-- Outer decorative border with casino lights -->
        <div class="casino-border" 
             class:theme-changing={isThemeChanging}
             role="button" 
             tabindex="0"
             aria-label="Change slot machine theme"
             title="Click to change theme: {$currentTheme.displayName}"
             on:click={handleThemeClick}
             on:keydown={(e) => e.key === 'Enter' && handleThemeClick(e)}>
          <div class="casino-lights"></div>
        </div>
        
        <!-- Machine body with metallic finish -->
        <div class="machine-body">
          <!-- Chrome accent frame -->
          <div class="chrome-frame">
            <!-- Inner shadow frame -->
            <div class="inner-frame">
              <!-- Main game grid -->
              <div class="game-grid">
                <!-- Reel Grid -->
                <ReelGrid bind:this={mobileReelGrid1} grid={$currentGrid} isSpinning={$isSpinning} />
                
                <!-- Payline Overlay -->
                <PaylineOverlay 
                  showPaylines={$bettingStore.selectedPaylines > 1}
                  activePaylines={Array.from({length: $bettingStore.selectedPaylines}, (_, i) => i)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Mobile Controls - Vertical stacked layout -->
      <div class="flex-1 flex flex-col space-y-3">
        <!-- Betting Controls - Fixed height, takes priority -->
        <div class="flex-shrink-0">
          <BettingControls on:spin={handleSpin} {compact} />
        </div>
        
        <!-- Game Queue - Can scroll below the fold -->
        <div class="flex-shrink-0">
          <GameQueue maxHeight="300px" />
        </div>
      </div>
    {:else}
      <!-- Original mobile layout for non-compact -->
      <div class="space-y-4">
        <!-- Slot Machine Frame -->
        <div class="slot-machine-frame">
          <!-- Outer decorative border with casino lights -->
          <div class="casino-border" 
               class:theme-changing={isThemeChanging}
               role="button" 
               tabindex="0"
               aria-label="Change slot machine theme"
               title="Click to change theme: {$currentTheme.displayName}"
               on:click={handleThemeClick}
               on:keydown={(e) => e.key === 'Enter' && handleThemeClick(e)}>
            <div class="casino-lights"></div>
          </div>
          
          <!-- Machine body with metallic finish -->
          <div class="machine-body">
            <!-- Chrome accent frame -->
            <div class="chrome-frame">
              <!-- Inner shadow frame -->
              <div class="inner-frame">
                <!-- Main game grid -->
                <div class="game-grid">
                  <!-- Reel Grid -->
                  <ReelGrid bind:this={mobileReelGrid2} grid={$currentGrid} isSpinning={$isSpinning} />
                  
                  <!-- Payline Overlay -->
                  <PaylineOverlay 
                    showPaylines={$bettingStore.selectedPaylines > 1}
                    activePaylines={Array.from({length: $bettingStore.selectedPaylines}, (_, i) => i)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Mobile Controls and Queue -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BettingControls on:spin={handleSpin} {compact} />
          <GameQueue maxHeight="400px" />
        </div>
      </div>
    {/if}
  </div>
  
  <!-- Win Celebration Overlay -->
  <WinCelebration 
    bind:isVisible={showWinCelebration}
    {winAmount}
    {winLevel}
    {winningSymbols}
  />

  <!-- Development Test Controls -->
  {#if PUBLIC_DEBUG_MODE === 'true'}
    <div class="fixed bottom-4 right-4 card text-theme-text p-4 rounded-lg text-sm z-50">
      <div class="font-bold mb-2">Test Win Animations</div>
      <div class="flex flex-col gap-2">
        <button 
          class="status-success px-3 py-1 rounded text-xs"
          on:click={() => triggerWinCelebration({ amount: 5000000, level: 'small' }, 'test-small')}
        >
          Small Win
        </button>
        <button 
          class="btn-primary px-3 py-1 rounded text-xs"
          on:click={() => triggerWinCelebration({ amount: 25000000, level: 'medium' }, 'test-medium')}
        >
          Medium Win
        </button>
        <button 
          class="bg-surface-secondary hover:bg-surface-hover text-white font-medium rounded-lg transition-colors duration-200 px-3 py-1 text-xs"
          on:click={() => triggerWinCelebration({ amount: 75000000, level: 'large' }, 'test-large')}
        >
          Large Win
        </button>
        <button 
          class="status-warning px-3 py-1 rounded text-xs"
          on:click={() => triggerWinCelebration({ amount: 150000000, level: 'jackpot' }, 'test-jackpot')}
        >
          Jackpot
        </button>
      </div>
    </div>
  {/if}
  
  <!-- Loss Feedback Overlay -->
  {#if showLossFeedback}
    <div class="fixed inset-0 flex items-center justify-center pointer-events-none z-40" 
         in:fly={{ y: -50, duration: 400 }}
         out:fade={{ duration: 300 }}>
      <div class="bg-surface-primary border border-red-500 rounded-lg px-6 py-4 shadow-2xl">
        <div class="text-center">
          <div class="text-red-300 text-lg font-bold mb-1">
            Better luck next time!
          </div>
          <div class="text-red-400 text-xl font-bold">
            -{formatVOI(lossAmount)} VOI
          </div>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Loading Overlay -->
  {#if isLoading && currentLoadingState}
    <LoadingOverlay 
      isVisible={isLoading}
      loadingState={currentLoadingState}
      showProgress={currentLoadingState.progress !== undefined}
    />
  {/if}
  
  <!-- Maintenance Overlay - only show after initial balance check completes -->
  {#if !$isSlotMachineOperational && showMaintenanceOverlay && hasInitialBalanceCheckCompleted && !$isLoadingHouseBalance}
    <div class="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 rounded-xl">
      <div class="bg-surface-primary border border-surface-border rounded-lg shadow-xl bg-gradient-to-br from-orange-900/90 to-red-900/90 border-orange-600 p-8 max-w-md mx-4 shadow-2xl">
        <div class="text-center">
          <!-- Maintenance Icon -->
          <div class="mb-4">
            <svg class="w-16 h-16 mx-auto text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
          </div>
          
          <!-- Title -->
          <h3 class="text-orange-300 text-2xl font-bold mb-4">
            Under Maintenance
          </h3>
          
          <!-- Message -->
          <p class="text-orange-200 text-lg leading-relaxed mb-6">
            {$operationalStatusMessage}
          </p>
          
          <!-- Close Button -->
          <button 
            class="bg-surface-secondary hover:bg-surface-hover text-white font-medium rounded-lg transition-colors duration-200 py-3 px-6 shadow-lg"
            on:click={() => showMaintenanceOverlay = false}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  {/if}
  

</div>

<style>
  .slot-machine-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  /* Enhanced Slot Machine Frame Styling */
  .slot-machine-frame {
    @apply relative;
    filter: drop-shadow(0 25px 50px rgba(0, 0, 0, 0.4));
  }

  .casino-border {
    @apply absolute -inset-4 rounded-2xl cursor-pointer;
    background: linear-gradient(45deg, 
      var(--theme-primary) 0%, var(--theme-secondary) 25%, var(--theme-primary) 50%, var(--theme-secondary) 75%, var(--theme-primary) 100%);
    background-size: 200% 200%;
    animation: shimmer 3s ease-in-out infinite;
    padding: 3px;
    border-radius: 20px;
    transition: all 0.3s ease;
  }

  .casino-border:hover {
    transform: scale(1.02);
    filter: brightness(1.1);
  }

  .casino-border:active {
    transform: scale(0.98);
  }

  .casino-border.theme-changing {
    animation: theme-change-pulse 0.5s ease-out;
  }

  @keyframes theme-change-pulse {
    0% { transform: scale(1); filter: brightness(1); }
    50% { transform: scale(1.05); filter: brightness(1.3); }
    100% { transform: scale(1); filter: brightness(1); }
  }

  .casino-lights {
    @apply absolute inset-0 rounded-2xl;
    background: repeating-linear-gradient(
      0deg,
      transparent 0px,
      var(--theme-lights) 2px,
      transparent 4px,
      transparent 20px
    );
    animation: casino-pulse 2s ease-in-out infinite alternate;
  }

  .machine-body {
    @apply relative rounded-xl p-3;
    background: linear-gradient(145deg, 
      var(--theme-surface-primary) 0%, 
      var(--theme-surface-secondary) 25%, 
      var(--theme-surface-tertiary) 50%, 
      var(--theme-surface-secondary) 75%, 
      var(--theme-surface-primary) 100%);
    border: 2px solid var(--theme-surface-border);
    box-shadow: 
      inset 0 2px 4px rgba(255, 255, 255, 0.1),
      inset 0 -2px 4px rgba(0, 0, 0, 0.3),
      0 0 20px var(--theme-lights);
  }

  .chrome-frame {
    @apply relative rounded-lg p-2;
    background: linear-gradient(135deg, 
      #e5e7eb 0%, 
      #9ca3af 25%, 
      #6b7280 50%, 
      #9ca3af 75%, 
      #e5e7eb 100%);
    border: 1px solid #9ca3af;
    box-shadow: 
      inset 0 1px 2px rgba(255, 255, 255, 0.8),
      inset 0 -1px 2px rgba(0, 0, 0, 0.2);
  }

  .inner-frame {
    @apply rounded-md p-2;
    background: radial-gradient(ellipse at center, var(--theme-bg-from) 0%, var(--theme-surface-primary) 100%);
    border: 2px inset var(--theme-surface-border);
    box-shadow: 
      inset 0 0 10px rgba(0, 0, 0, 0.8),
      0 0 5px var(--theme-lights);
  }

  .game-grid {
    @apply relative rounded border-2;
    background: linear-gradient(180deg, var(--theme-bg-from) 0%, var(--theme-surface-primary) 100%);
    border-color: var(--theme-surface-border);
    box-shadow: 
      inset 0 2px 4px rgba(0, 0, 0, 0.6),
      0 0 10px var(--theme-lights);
  }

  /* Animations */
  @keyframes shimmer {
    0%, 100% {
      background-position: 0% 0%;
    }
    50% {
      background-position: 100% 100%;
    }
  }

  @keyframes casino-pulse {
    0% {
      opacity: 0.4;
      transform: scale(1);
    }
    100% {
      opacity: 0.8;
      transform: scale(1.02);
    }
  }

  /* Responsive adjustments for mobile */
  @media (max-width: 1024px) {
    .casino-border {
      @apply -inset-2;
    }
    
    .machine-body {
      @apply p-2;
    }
    
    .chrome-frame {
      @apply p-1;
    }
  }
</style>