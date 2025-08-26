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
  export let initialReplayData: any = null;
  export let hideBettingControls = false;
  
  // Win celebration state - support multiple concurrent celebrations
  type CelebrationData = {
    id: string;
    winAmount: number;
    betAmount: number;
    winLevel: 'small' | 'medium' | 'large' | 'jackpot';
    winningSymbols: SlotSymbol[];
    gridOutcome: string[][] | null;
    selectedPaylines: number;
    isReplay: boolean;
    startTime: number;
    timeout: NodeJS.Timeout;
  };
  
  let activeCelebrations: Map<string, CelebrationData> = new Map();
  
  // Loss feedback state
  let showLossFeedback = false;
  let lossAmount = 0;
  
  // Transaction failure feedback state
  let showFailureFeedback = false;
  let failureMessage = 'Transaction failed, please try again';
  let failureFeedbackTimeout: NodeJS.Timeout | null = null;
  
  // Continuous spinning management
  let spinningInterval: NodeJS.Timeout | null = null;
  let queueUnsubscribe: (() => void) | null = null;
  let isInitialMount = true;
  let lastCelebratedSpinId: string | null = null; // Keep for current spin celebrations
  let autoCelebratedSpinIds = new Set<string>(); // Track background auto-celebrations
  let lossFeedbackTimeout: NodeJS.Timeout | null = null;
  let lastLossFeedbackSpinId: string | null = null;
  let lastProcessedOutcomeSpinId: string | null = null;
  
  // Track whether user has started any spins this session
  let userSessionStarted = false;
  
  // Track replay timeouts to prevent overlapping replays
  let replayTimeouts: NodeJS.Timeout[] = [];
  
  // Track if we're in replay mode to prevent queue auto-start
  let isReplayMode = false;
  
  // Payline overlay visibility with auto-fade
  let showPaylineOverlay = false;
  let paylineTimeout: NodeJS.Timeout | null = null;
  let lastSelectedPaylines = $bettingStore.selectedPaylines;
  
  // GLOBAL deduplication to prevent multiple SlotMachine instances from processing same replay
  const GLOBAL_PROCESSED_REPLAYS = globalThis.GLOBAL_PROCESSED_REPLAYS || (globalThis.GLOBAL_PROCESSED_REPLAYS = new Set<string>());

  // Maintenance overlay state - don't show until after initial balance check
  let showMaintenanceOverlay = false;
  let hasInitialBalanceCheckCompleted = false;
  
  // Loading state
  $: currentLoadingState = $loadingStates[0]; // Get the first loading state
  $: isLoading = $loadingStates.length > 0;
  
  // Reactive statement to handle payline changes
  $: {
    if ($bettingStore.selectedPaylines !== lastSelectedPaylines) {
      const previousPaylines = lastSelectedPaylines;
      lastSelectedPaylines = $bettingStore.selectedPaylines;
      
      // Clear existing timeout
      if (paylineTimeout) {
        clearTimeout(paylineTimeout);
        paylineTimeout = null;
      }
      
      // Show paylines if more than 1, OR if dropping from 2+ to 1 (to show the single payline)
      if ($bettingStore.selectedPaylines > 1 || (previousPaylines > 1 && $bettingStore.selectedPaylines === 1)) {
        showPaylineOverlay = true;
        
        // Set timeout to fade out after 3 seconds
        paylineTimeout = setTimeout(() => {
          showPaylineOverlay = false;
          paylineTimeout = null;
        }, 3000);
      } else {
        showPaylineOverlay = false;
      }
    }
  }
  
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
      // Show maintenance popup if slot machine is not operational after initial check
      if (!$isSlotMachineOperational) {
        showMaintenanceOverlay = true;
      }
    });
    
    // DO NOT auto-clear queue - keep for testing
    
    queueProcessor.start(); // Start queue processing
    
    // Subscribe to queue changes to manage continuous spinning
    queueUnsubscribe = queueStore.subscribe(queueState => {
      // Initialize autoCelebratedSpinIds with existing completed wins on first load
      if (isInitialMount && queueState.spins && queueState.spins.length > 0) {
        const existingWinningSpins = queueState.spins.filter(spin => 
          [SpinStatus.READY_TO_CLAIM, SpinStatus.COMPLETED].includes(spin.status) && 
          spin.winnings > 0
        );
        existingWinningSpins.forEach(spin => autoCelebratedSpinIds.add(spin.id));
        console.log(`🎉 Initialized autoCelebratedSpinIds with ${existingWinningSpins.length} existing winning spins`);
      }
      
      handleQueueUpdate(queueState);
    });

    // Listen for replay events from GameQueue
    const handleReplayEvent = (event: CustomEvent) => {
      handleReplaySpin(event.detail);
    };

    // @ts-ignore
    document.addEventListener('replay-spin', handleReplayEvent);
    
    // Auto-start replay if initialReplayData is provided
    if (initialReplayData) {
      console.log('🎬 Initializing replay with data:', initialReplayData);
      
      const waitForReels = async () => {
        console.log('⏳ Waiting for reels to be ready...');
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        
        while (attempts < maxAttempts) {
          // Check if all mounted reel grids are ready
          const reelGrids = [desktopReelGrid, mobileReelGrid1, mobileReelGrid2].filter(Boolean);
          const hasReadyGrid = reelGrids.length > 0 && reelGrids.every(grid => grid?.isReady?.());
          
          if (hasReadyGrid) {
            console.log('✅ Reels are ready, starting replay');
            handleReplaySpin({
              spin: {
                id: 'initial-replay',
                ...initialReplayData
              },
              outcome: initialReplayData.outcome,
              winnings: initialReplayData.winnings,
              betAmount: initialReplayData.betAmount
            });
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (attempts >= maxAttempts) {
          console.warn('⚠️ Timeout waiting for reels to be ready, starting replay anyway');
          handleReplaySpin({
            spin: {
              id: 'initial-replay-fallback',
              ...initialReplayData
            },
            outcome: initialReplayData.outcome,
            winnings: initialReplayData.winnings,
            betAmount: initialReplayData.betAmount
          });
        }
      };
      
      waitForReels();
    }
    
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
    if (lossFeedbackTimeout) clearTimeout(lossFeedbackTimeout);
    if (paylineTimeout) clearTimeout(paylineTimeout);
    // Clear all replay timeouts
    replayTimeouts.forEach(timeout => clearTimeout(timeout));
    replayTimeouts = [];
    
    // Clear all active celebration timeouts
    activeCelebrations.forEach(celebration => {
      clearTimeout(celebration.timeout);
    });
    activeCelebrations.clear();
    
    // Stop any spinning sounds
    soundService.stopLoopingSound('spin-loop', { fadeOut: 0.1 }).catch(() => {
      // Ignore sound errors
    });
  });
  
  function handleSpin(event: CustomEvent) {
    const { betPerLine, selectedPaylines, totalBet } = event.detail;
    
    // CRITICAL: Cancel any active replay timers to prevent interference
    if (replayTimeouts.length > 0) {
      console.log(`🚫 Canceling ${replayTimeouts.length} replay timers for new real spin`);
      replayTimeouts.forEach(timeout => clearTimeout(timeout));
      replayTimeouts = [];
      
      // Also stop any replay mode
      isReplayMode = false;
      
      // Force stop any lingering replay animations
      callAllReelGrids('stopSpin');
    }
    
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

  async function handleFailedSpin(spin: any) {
    console.log(`🛑 Handling failed spin: ${spin.id} (${spin.status})`);
    
    // Show failure feedback to user
    const errorMessage = spin.error || 'Transaction failed, please try again';
    triggerFailureFeedback(errorMessage);
    
    // Stop spinning interval
    if (spinningInterval) {
      clearInterval(spinningInterval);
      spinningInterval = null;
    }
    
    // Stop spin-loop audio (same as successful spins)
    const soundStopped = await soundService.forceStopWithVerification('spin-loop', 3);
    if (!soundStopped) {
      console.warn('Failed to stop spin-loop sound after failed spin');
    }
    
    // Play reel stop sound to indicate spin has ended
    setTimeout(() => {
      playReelStop().catch(() => {
        // Ignore sound errors
      });
    }, 100);
    
    // Stop reel animations completely
    callAllReelGrids('stopSpin');
    
    // Reset game state
    gameStore.reset();
  }

  function handleQueueUpdate(queueState: any) {
    // Check if the current spinning spin has failed
    if ($currentSpinId && queueState.spins && queueState.spins.length > 0) {
      const currentSpin = queueState.spins.find((spin: any) => spin.id === $currentSpinId);
      
      // If the current spin just failed or expired, properly end the spin
      if (currentSpin && [SpinStatus.FAILED, SpinStatus.EXPIRED].includes(currentSpin.status)) {
        handleFailedSpin(currentSpin);
        return; // Don't continue with other processing
      }
    }
    
    // If there are no spins at all, make sure we're not spinning
    if (!queueState.spins || queueState.spins.length === 0) {
      if ($isSpinning || $waitingForOutcome) {
        // Use the same proper cleanup as failed spins
        console.log(`🛑 Queue is empty - ending any active spin`);
        soundService.forceStopWithVerification('spin-loop', 3).then(soundStopped => {
          if (!soundStopped) {
            console.warn('Failed to stop spin-loop sound after queue empty');
          }
        });
        callAllReelGrids('stopSpin');
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
    
    // Find spins that have outcomes ready
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
      
      // Display outcome if this is the current spin (for visual animation)
      if (!isTooOld && $currentSpinId === mostRecentSpin.id && userSessionStarted) {
        displayOutcome(mostRecentSpin);
      }
      
      // Check for any completed winning spins that we haven't auto-celebrated yet (background wins)
      if (userSessionStarted && !isInitialMount) {
        for (const spin of readySpins) {
          const spinTooOld = spin.timestamp < fiveMinutesAgo;
          if (!spinTooOld && 
              spin.winnings > 0 && 
              !autoCelebratedSpinIds.has(spin.id) &&
              spin.id !== lastCelebratedSpinId &&
              spin.id !== $currentSpinId) { // Don't auto-celebrate current spin (it gets normal treatment)
            
            // Mark as auto-celebrated
            autoCelebratedSpinIds.add(spin.id);
            
            // This is a background winning spin we haven't celebrated yet
            const winLevel = spin.winnings >= 100000000 ? 'jackpot' : 
                           spin.winnings >= 50000000 ? 'large' : 
                           spin.winnings >= 20000000 ? 'medium' : 'small';
            
            // Trigger win celebration for background spin
            triggerWinCelebration({
              amount: spin.winnings,
              betAmount: spin.betPerLine * spin.selectedPaylines,
              level: winLevel,
              gridOutcome: spin.outcome,
              selectedPaylines: spin.selectedPaylines || $bettingStore.selectedPaylines
            }, spin.id);
            
            break; // Only celebrate one spin per update to avoid overwhelming
          }
        }
        
        // Clean up old auto-celebrated IDs to prevent memory bloat
        if (autoCelebratedSpinIds.size > 20) {
          const idsArray = Array.from(autoCelebratedSpinIds);
          autoCelebratedSpinIds = new Set(idsArray.slice(-20));
        }
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
        // Failed/expired spins should have been handled earlier by handleFailedSpin
        // This section mainly handles completed spins that weren't displayed yet
        if (currentSpin && [SpinStatus.FAILED, SpinStatus.EXPIRED].includes(currentSpin.status)) {
          // This should have been caught earlier, but handle it just in case
          handleFailedSpin(currentSpin);
        } else {
          // Current spin is done (completed), reset the display
          gameStore.reset();
          if (spinningInterval) {
            clearInterval(spinningInterval);
            spinningInterval = null;
          }
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
    
    // SMOOTH TRANSITION: Start quick deceleration to actual outcome
    callAllReelGrids('startQuickDeceleration', spin.outcome);
    
    // Wait a moment for deceleration to take effect before stopping
    setTimeout(async () => {
      // Stop the spinning loop sound with verification
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
            betAmount: spin.betPerLine * spin.selectedPaylines,
            level: winLevel,
            gridOutcome: spin.outcome,
            selectedPaylines: spin.selectedPaylines || $bettingStore.selectedPaylines
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
    }, 1500); // Wait longer for smooth deceleration to outcome
  }
  
  function checkForWins(outcome: string[][]) {
    // Simple win detection for demonstration
    // Check for any 3+ matching symbols on first payline
    const firstRow = outcome.map(reel => reel[0]);
    
    // Count occurrences of each symbol
    const symbolCounts: { [symbol: string]: number } = {
      'A': 0,
      'B': 0,
      'C': 0,
      'D': 0
    };
    
    firstRow.forEach(symbol => {
      if (['A', 'B', 'C', 'D'].includes(symbol)) {
        symbolCounts[symbol]++;
      }
    });
    
    // Find the symbol with the highest count (must be at least 3)
    let bestSymbol = '';
    let bestCount = 0;
    
    for (const symbol of ['A', 'B', 'C', 'D']) {
      if (symbolCounts[symbol] >= 3 && symbolCounts[symbol] > bestCount) {
        bestSymbol = symbol;
        bestCount = symbolCounts[symbol];
      }
    }
    
    if (bestCount >= 3) {
      const multiplier = { 'A': 100, 'B': 50, 'C': 25, 'D': 10 }[bestSymbol] || 1;
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

  function generateTestWinData(level: 'small' | 'medium' | 'large' | 'jackpot') {
    // Use all 20 paylines so detection can find wins on any of them
    const selectedPaylines = 20;
    
    // Use standard payline patterns (all 20 paylines)
    const standardPaylines = [
      [1, 1, 1, 1, 1], // 0: Middle row
      [0, 0, 0, 0, 0], // 1: Top row
      [2, 2, 2, 2, 2], // 2: Bottom row
      [0, 1, 2, 1, 0], // 3: V shape
      [2, 1, 0, 1, 2], // 4: ^ shape
      [0, 0, 1, 2, 2], // 5: Diagonal down
      [2, 2, 1, 0, 0], // 6: Diagonal up
      [1, 0, 1, 2, 1], // 7: Zigzag
      [1, 2, 1, 0, 1], // 8: Zigzag reverse
      [0, 1, 0, 1, 0], // 9: Up-down pattern
      [2, 1, 2, 1, 2], // 10: Down-up pattern
      [0, 1, 1, 1, 0], // 11: Inverted V
      [2, 1, 1, 1, 2], // 12: W shape
      [1, 0, 0, 0, 1], // 13: U shape
      [1, 2, 2, 2, 1], // 14: Inverted U
      [0, 0, 1, 0, 0], // 15: Top dip
      [2, 2, 1, 2, 2], // 16: Bottom dip
      [1, 0, 2, 0, 1], // 17: Diamond
      [1, 2, 0, 2, 1], // 18: Inverted diamond
      [0, 2, 1, 0, 2], // 19: Scattered
    ];
    
    // Randomly select 3 paylines from all 20 available paylines - all 3 will be winning
    const winningPaylineIndices = [];
    while (winningPaylineIndices.length < 3) {
      const randomIndex = Math.floor(Math.random() * 20);
      if (!winningPaylineIndices.includes(randomIndex)) {
        winningPaylineIndices.push(randomIndex);
      }
    }
    
    // Generate base grid with random symbols
    const symbols = ['A', 'B', 'C', 'D'];
    const gridOutcome: string[][] = [];
    
    // Initialize 5x3 grid (5 reels, 3 rows each)
    for (let col = 0; col < 5; col++) {
      gridOutcome[col] = [];
      for (let row = 0; row < 3; row++) {
        gridOutcome[col][row] = symbols[Math.floor(Math.random() * symbols.length)];
      }
    }
    
    // Place unique winning symbols on ONLY the 3 selected paylines
    winningPaylineIndices.forEach((paylineIndex, winIndex) => {
      const payline = standardPaylines[paylineIndex];
      
      // Use different symbols for each winning payline to avoid cross-contamination
      const symbolOptions = ['A', 'B', 'C', 'D'];
      const winningSymbol = symbolOptions[winIndex]; // Different symbol for each winning line
      
      // Place winning symbols on this specific payline only
      const winCount = 3; // Always use exactly 3 symbols to be safe
      for (let i = 0; i < winCount; i++) {
        const col = i;
        const row = payline[col];
        gridOutcome[col][row] = winningSymbol;
      }
      
    });
    
    // Calculate win amounts based on level
    const baseAmounts = {
      small: 5000000,     // 5 VOI
      medium: 25000000,   // 25 VOI
      large: 75000000,    // 75 VOI
      jackpot: 150000000  // 150 VOI
    };
    
    // Add some randomness to the amount
    const baseAmount = baseAmounts[level];
    const amount = baseAmount + Math.floor(Math.random() * baseAmount * 0.5);
    
    return {
      amount,
      level,
      gridOutcome,
      selectedPaylines
    };
  }

  function triggerWinCelebration(win: { 
    amount: number;
    betAmount: number;
    level: 'small' | 'medium' | 'large' | 'jackpot'; 
    gridOutcome?: string[][];
    selectedPaylines?: number;
    isReplay?: boolean;
  }, spinId?: string) {
    // Create unique celebration ID
    const celebrationId = spinId || `celebration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Record that we've celebrated this spin
    if (spinId) {
      lastCelebratedSpinId = spinId;
    }
    
    // Auto-hide duration
    const duration = {
      small: 3000,
      medium: 4000,
      large: 5000,
      jackpot: 6000
    }[win.level];
    
    // Create celebration timeout
    const timeout = setTimeout(() => {
      activeCelebrations.delete(celebrationId);
      activeCelebrations = activeCelebrations; // Trigger reactivity
    }, duration);
    
    // Create new celebration data
    const celebration: CelebrationData = {
      id: celebrationId,
      winAmount: win.amount,
      betAmount: win.betAmount,
      winLevel: win.level,
      winningSymbols: generateWinningSymbols(win.level),
      gridOutcome: win.gridOutcome || null,
      selectedPaylines: win.selectedPaylines || $bettingStore.selectedPaylines,
      isReplay: win.isReplay || false,
      startTime: Date.now(),
      timeout
    };
    
    // Add to active celebrations
    activeCelebrations.set(celebrationId, celebration);
    activeCelebrations = activeCelebrations; // Trigger reactivity
  }

  function triggerLossFeedback(spin: any) {
    // Clear any existing loss feedback timeout
    if (lossFeedbackTimeout) {
      clearTimeout(lossFeedbackTimeout);
      lossFeedbackTimeout = null;
    }
    
    // Don't show loss feedback if we have active win celebrations
    if (activeCelebrations.size > 0) {
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

  function triggerFailureFeedback(message: string = 'Transaction failed, please try again') {
    // Clear any existing failure feedback timeout
    if (failureFeedbackTimeout) {
      clearTimeout(failureFeedbackTimeout);
      failureFeedbackTimeout = null;
    }
    
    // Don't show failure feedback if we have active win celebrations
    if (activeCelebrations.size > 0) {
      return;
    }
    
    failureMessage = message;
    showFailureFeedback = true;
    
    // Auto-hide failure feedback after 3 seconds
    failureFeedbackTimeout = setTimeout(() => {
      showFailureFeedback = false;
      failureFeedbackTimeout = null;
    }, 3000);
  }

  async function handleReplaySpin(replayData: { spin: any; outcome: string[][]; winnings: number; betAmount: number }) {
    const replayId = replayData.spin.id;
    
    // CRITICAL: Prevent duplicate processing of the same replay (GLOBAL across all SlotMachine instances)
    if (GLOBAL_PROCESSED_REPLAYS.has(replayId)) {
      console.warn(`Duplicate replay event ignored for spin: ${replayId} (GLOBAL deduplication)`);
      return;
    }
    
    // Cancel any existing replay and start new one
    if (isReplayMode) {
      console.log('⚠️ Canceling existing replay to start new one');
      // Cancel existing replay timeouts
      replayTimeouts.forEach(timeout => clearTimeout(timeout));
      replayTimeouts = [];
      // Force stop any ongoing animations
      callAllReelGrids('stopSpin');
      callAllReelGrids('setFinalPositions', [['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_']], 'cancel-previous');
      gameStore.reset();
    }
    
    // Mark this replay as processed GLOBALLY (temporarily to prevent immediate duplicates)
    GLOBAL_PROCESSED_REPLAYS.add(replayId);
    
    // Mark that user has initiated a replay (allows animations)
    userSessionStarted = true;
    isReplayMode = true; // Prevent queue auto-start during replay
    
    // Remove from global set after a short delay to allow future replays of same spin
    setTimeout(() => {
      GLOBAL_PROCESSED_REPLAYS.delete(replayId);
    }, 1000); // Allow re-replay after 1 second
    
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
              betAmount: replayData.betAmount,
              level: winLevel,
              gridOutcome: replayData.outcome,
              selectedPaylines: replayData.spin.paylines || $bettingStore.selectedPaylines,
              isReplay: true
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
          
          // Global deduplication already cleared earlier
          
          // Remove completed timeouts from tracking
          replayTimeouts = replayTimeouts.filter(t => t !== startTimeout && t !== outcomeTimeout && t !== celebrationTimeout && t !== cleanupTimeout);
          
          console.log(`=== REPLAY: Cleanup completed for ${replayId} ===`);
        }, 6000); // Clear the replay after 6 seconds
        replayTimeouts.push(cleanupTimeout);
      }, 5000); // Show spinning for 5 seconds
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
        <!-- Replay Mode Indicator -->
        {#if initialReplayData}
          <div class="replay-indicator">
            <span class="replay-badge">REPLAY MODE</span>
          </div>
        {/if}
        
        <!-- Chrome accent frame -->
        <div class="chrome-frame">
          <!-- Inner shadow frame -->
          <div class="inner-frame">
            <!-- Main game grid -->
            <div class="game-grid">
              <!-- Reel Grid -->
              <ReelGrid bind:this={desktopReelGrid} grid={$currentGrid} isSpinning={$isSpinning} />
              
              <!-- Always visible payline numbers -->
              <div class="payline-numbers">
                {#if $bettingStore.selectedPaylines > 1}
                  <svg class="payline-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {#each Array.from({length: $bettingStore.selectedPaylines}, (_, i) => i) as index}
                      <text
                        x="2"
                        y={5 + (index * 3)}
                        fill="#10b981"
                        font-size="2.5"
                        font-weight="bold"
                        class="payline-number"
                      >
                        {index + 1}
                      </text>
                    {/each}
                  </svg>
                {/if}
              </div>
              
              <!-- Fading payline paths overlay -->
              {#if showPaylineOverlay}
                <div transition:fade={{ duration: 500 }}>
                  <PaylineOverlay 
                    showPaylines={true}
                    activePaylines={Array.from({length: $bettingStore.selectedPaylines}, (_, i) => i)}
                  />
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Betting Controls - Below slot machine -->
    {#if !hideBettingControls && !initialReplayData}
      <BettingControls on:spin={handleSpin} {compact} disabled={disabled} />
    {/if}
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
                
                <!-- Always visible payline numbers -->
                <div class="payline-numbers">
                  {#if $bettingStore.selectedPaylines > 1}
                    <svg class="payline-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {#each Array.from({length: $bettingStore.selectedPaylines}, (_, i) => i) as index}
                        <text
                          x="2"
                          y={5 + (index * 3)}
                          fill="#10b981"
                          font-size="2.5"
                          font-weight="bold"
                          class="payline-number"
                        >
                          {index + 1}
                        </text>
                      {/each}
                    </svg>
                  {/if}
                </div>
                
                <!-- Fading payline paths overlay -->
                {#if showPaylineOverlay}
                  <div transition:fade={{ duration: 500 }}>
                    <PaylineOverlay 
                      showPaylines={true}
                      activePaylines={Array.from({length: $bettingStore.selectedPaylines}, (_, i) => i)}
                    />
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Mobile Controls - Vertical stacked layout -->
      <div class="flex-1 flex flex-col space-y-3">
        <!-- Betting Controls - Fixed height, takes priority -->
        {#if !hideBettingControls && !initialReplayData}
          <div class="flex-shrink-0">
            <BettingControls on:spin={handleSpin} {compact} disabled={disabled} />
          </div>
        {/if}
        
        <!-- Game Queue - Can scroll below the fold -->
        {#if !initialReplayData}
          <div class="flex-shrink-0">
            <GameQueue maxHeight="300px" />
          </div>
        {/if}
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
                  
                  <!-- Always visible payline numbers -->
                  <div class="payline-numbers">
                    {#if $bettingStore.selectedPaylines > 1}
                      <svg class="payline-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {#each Array.from({length: $bettingStore.selectedPaylines}, (_, i) => i) as index}
                          <text
                            x="2"
                            y={5 + (index * 3)}
                            fill="#10b981"
                            font-size="2.5"
                            font-weight="bold"
                            class="payline-number"
                          >
                            {index + 1}
                          </text>
                        {/each}
                      </svg>
                    {/if}
                  </div>
                  
                  <!-- Fading payline paths overlay -->
                  {#if showPaylineOverlay}
                    <div transition:fade={{ duration: 500 }}>
                      <PaylineOverlay 
                        showPaylines={true}
                        activePaylines={Array.from({length: $bettingStore.selectedPaylines}, (_, i) => i)}
                      />
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Mobile Controls and Queue -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {#if !hideBettingControls && !initialReplayData}
            <BettingControls on:spin={handleSpin} {compact} disabled={disabled} />
          {/if}
          {#if !initialReplayData}
            <GameQueue maxHeight="400px" />
          {/if}
        </div>
      </div>
    {/if}
  </div>
  
  <!-- Win Celebration Overlays - Multiple concurrent celebrations -->
  {#each [...activeCelebrations.values()] as celebration (celebration.id)}
    <WinCelebration 
      isVisible={true}
      winAmount={celebration.winAmount}
      betAmount={celebration.betAmount}
      winLevel={celebration.winLevel}
      winningSymbols={celebration.winningSymbols}
      gridOutcome={celebration.gridOutcome}
      selectedPaylines={celebration.selectedPaylines}
      isReplay={celebration.isReplay}
    />
  {/each}

  <!-- Development Test Controls -->
  {#if PUBLIC_DEBUG_MODE === 'true'}
    <div class="fixed bottom-4 right-4 card text-theme-text p-4 rounded-lg text-sm z-50">
      <div class="font-bold mb-2">Test Win Animations</div>
      <div class="flex flex-col gap-2">
        <button 
          class="status-success px-3 py-1 rounded text-xs"
          on:click={() => {
            const testData = generateTestWinData('small');
            // Update game grid to show the test outcome
            gameStore.completeSpin('test-small', testData.gridOutcome);
            // Show celebration with test data
            triggerWinCelebration({
              ...testData,
              betAmount: $bettingStore.betPerLine * $bettingStore.selectedPaylines
            }, 'test-small');
          }}
        >
          Small Win
        </button>
        <button 
          class="btn-primary px-3 py-1 rounded text-xs"
          on:click={() => {
            const testData = generateTestWinData('medium');
            // Update game grid to show the test outcome
            gameStore.completeSpin('test-medium', testData.gridOutcome);
            // Show celebration with test data
            triggerWinCelebration({
              ...testData,
              betAmount: $bettingStore.betPerLine * $bettingStore.selectedPaylines
            }, 'test-medium');
          }}
        >
          Medium Win
        </button>
        <button 
          class="bg-surface-secondary hover:bg-surface-hover text-theme font-medium rounded-lg transition-colors duration-200 px-3 py-1 text-xs"
          on:click={() => {
            const testData = generateTestWinData('large');
            // Update game grid to show the test outcome
            gameStore.completeSpin('test-large', testData.gridOutcome);
            // Show celebration with test data
            triggerWinCelebration({
              ...testData,
              betAmount: $bettingStore.betPerLine * $bettingStore.selectedPaylines
            }, 'test-large');
          }}
        >
          Large Win
        </button>
        <button 
          class="status-warning px-3 py-1 rounded text-xs"
          on:click={() => {
            const testData = generateTestWinData('jackpot');
            // Update game grid to show the test outcome
            gameStore.completeSpin('test-jackpot', testData.gridOutcome);
            // Show celebration with test data
            triggerWinCelebration({
              ...testData,
              betAmount: $bettingStore.betPerLine * $bettingStore.selectedPaylines
            }, 'test-jackpot');
          }}
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
  
  <!-- Transaction Failure Feedback Overlay -->
  {#if showFailureFeedback}
    <div class="fixed inset-0 flex items-center justify-center pointer-events-none z-50" 
         in:fly={{ y: -50, duration: 400 }}
         out:fade={{ duration: 300 }}>
      <div class="bg-surface-primary border-2 border-red-600 rounded-lg px-8 py-6 shadow-2xl max-w-md">
        <div class="text-center">
          <div class="text-red-500 text-3xl mb-3">⚠️</div>
          <div class="text-red-400 text-xl font-bold mb-2">
            Transaction Failed
          </div>
          <div class="text-red-300 text-sm">
            {failureMessage}
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
    <div class="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-40 rounded-xl">
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
            class="bg-surface-secondary hover:bg-surface-hover text-theme font-medium rounded-lg transition-colors duration-200 py-3 px-6 shadow-lg"
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

  .replay-indicator {
    @apply absolute top-2 left-1/2 transform -translate-x-1/2 z-20;
  }

  .replay-badge {
    @apply bg-amber-600 text-theme text-xs font-bold px-3 py-1 rounded-full shadow-lg animate-pulse;
    box-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
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

  /* Payline numbers styling */
  .payline-numbers {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 6;
  }
  
  .payline-numbers .payline-svg {
    width: 100%;
    height: 100%;
  }
  
  .payline-numbers .payline-number {
    text-shadow: 0 0 2px currentColor;
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