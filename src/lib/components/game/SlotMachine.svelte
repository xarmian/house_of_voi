<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { gameStore, currentGrid, isSpinning, waitingForOutcome, currentSpinId, isAutoSpinning } from '$lib/stores/game';
  import { bettingStore } from '$lib/stores/betting';
  import { queueStore, pendingSpins } from '$lib/stores/queue';
  import { queueProcessor } from '$lib/services/queueProcessor';
  import { preferencesStore } from '$lib/stores/preferences';
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
  import WinCelebration from './WinCelebration.svelte';
  import LoadingOverlay from '../ui/LoadingOverlay.svelte';
  import { soundService, playSpinStart, playReelStop, playWinSound, playLoss } from '$lib/services/soundService';
  import { themeStore, currentTheme } from '$lib/stores/theme';
  import { themeImagePreloader } from '$lib/services/themeImagePreloader';
  import { selectedContract, isMultiContractMode } from '$lib/stores/multiContract';
  import type { ContractPair } from '$lib/types/multiContract';
  
  // Reference to single ReelGrid component for direct function calls
  let reelGrid: ReelGrid;
  
  function callReelGrid(methodName: string, ...args: any[]) {
    if (reelGrid && typeof reelGrid[methodName] === 'function') {
      reelGrid[methodName](...args);
    }
  }

  // Theme switching function
  let isThemeChanging = false;
  async function handleThemeClick(event: MouseEvent) {
    return false;

    event.preventDefault();
    event.stopPropagation();
    
    // Add visual feedback
    isThemeChanging = true;
    
    // Get current and next theme
    const currentThemes = themeStore.getAvailableThemes();
    const themeNames = Object.keys(currentThemes);
    const currentIndex = themeNames.indexOf($currentTheme.name);
    const nextIndex = (currentIndex + 1) % themeNames.length;
    const nextTheme = currentThemes[themeNames[nextIndex]];
    
    // MEMORY OPTIMIZATION: Preload only essential theme assets in background
    if (nextTheme) {
      themeImagePreloader.preloadEssentialThemeAssets(nextTheme).catch(error => {
        console.warn('Failed to preload essential theme assets:', error);
        // Continue with theme switch even if preloading fails
      });
    }
    
    // Switch theme
    themeStore.nextTheme();
    
    setTimeout(() => {
      isThemeChanging = false;
    }, 500);
  }

  import { PUBLIC_DEBUG_MODE } from '$env/static/public';
  
  
  export let disabled = false;
  export let initialReplayData: any = null;
  export let hideBettingControls = false;
  export let contractContext: ContractPair | null = null; // Optional contract context for multi-contract mode
  
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
  
  // MEMORY LEAK FIX: Limit the size of active celebrations to prevent unbounded growth
  const MAX_ACTIVE_CELEBRATIONS = 10;
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
  
  // Outcome display queue state
  let outcomeDisplayQueue: any[] = [];
  let isDisplayingOutcome = false;
  
  
  
  // Get current contract for operations - use prop override or global selected contract
  $: currentContract = contractContext || $selectedContract;
  
  // Track auto spin changes and handle cleanup of stuck spins
  let wasAutoSpinning = false;
  let autoSpinStopTimeout: NodeJS.Timeout | null = null;
  
  $: {
    if (wasAutoSpinning && !$isAutoSpinning) {
      // Auto spin just stopped - let animations complete naturally, but set a safety timeout
      console.log('🛑 Auto spin stopped, allowing animations to complete naturally');
      
      // Set a timeout to check for stuck spins after auto spin stops
      autoSpinStopTimeout = setTimeout(() => {
        checkForStuckSpins();
      }, 15000); // Wait 15 seconds for remaining spins to complete
    } else if (!wasAutoSpinning && $isAutoSpinning) {
      // Auto spin just started - clear any existing timeout
      if (autoSpinStopTimeout) {
        clearTimeout(autoSpinStopTimeout);
        autoSpinStopTimeout = null;
      }
    }
    wasAutoSpinning = $isAutoSpinning;
  }
  
  // Payline overlay visibility with auto-fade
  let showPaylineOverlay = false;
  let paylineTimeout: NodeJS.Timeout | null = null;
  let lastSelectedPaylines = $bettingStore.selectedPaylines;
  
  // GLOBAL deduplication to prevent multiple SlotMachine instances from processing same replay
  // MEMORY LEAK FIX: Use a more limited global set to prevent unbounded growth
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
        console.log('PaylineOverlay DEBUG: toggled on due to selection change. prev=', previousPaylines, 'now=', $bettingStore.selectedPaylines);
        
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

  // Overlay debug: active indices when visible
  $: defaultActivePaylines = Array.from({ length: $bettingStore.selectedPaylines }, (_, i) => i);
  $: if (showPaylineOverlay) {
    console.log('PaylineOverlay DEBUG: active indices =', defaultActivePaylines);
  }
  
  onMount(() => {
    // Use setTimeout to avoid reactive update conflicts
    setTimeout(() => {
      // Reset game state to ensure clean start
      gameStore.reset();
      gameStore.initializeGrid();
      
      // Preload current theme assets
      themeImagePreloader.preloadThemeAssets($currentTheme).catch(error => {
        console.warn('Failed to preload initial theme assets:', error);
      });
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

    // @ts-ignore
    document.addEventListener('replay-spin', handleReplayEvent);
    // @ts-ignore
    document.addEventListener('start-spin-animation', handleStartAnimation);
    // @ts-ignore
    document.addEventListener('display-spin-outcome', handleDisplayOutcome);
    
    // Auto-start replay if initialReplayData is provided
    if (initialReplayData) {
      console.log('🎬 Initializing replay with data:', initialReplayData);
      
      const waitForReels = async () => {
        console.log('⏳ Waiting for reels to be ready...');
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        
        while (attempts < maxAttempts) {
          // Check if the reel grid is ready
          const hasReadyGrid = reelGrid && reelGrid.isReady?.();
          
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
      // @ts-ignore
      document.removeEventListener('start-spin-animation', handleStartAnimation);
      // @ts-ignore
      document.removeEventListener('display-spin-outcome', handleDisplayOutcome);
    };
  });
  
  onDestroy(() => {
    queueProcessor.stop(); // Stop queue processing
    houseBalanceActions.reset(); // Stop house balance monitoring
    if (queueUnsubscribe) queueUnsubscribe();
    if (spinningInterval) clearInterval(spinningInterval);
    if (lossFeedbackTimeout) clearTimeout(lossFeedbackTimeout);
    if (paylineTimeout) clearTimeout(paylineTimeout);
    if (failureFeedbackTimeout) clearTimeout(failureFeedbackTimeout);
    if (autoSpinStopTimeout) clearTimeout(autoSpinStopTimeout);
    
    // Clear outcome display queue
    try {
      if (typeof outcomeDisplayQueue !== 'undefined') {
        outcomeDisplayQueue = [];
      }
      if (typeof isDisplayingOutcome !== 'undefined') {
        isDisplayingOutcome = false;
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // Clear all replay timeouts
    try {
      if (typeof replayTimeouts !== 'undefined' && Array.isArray(replayTimeouts)) {
        replayTimeouts.forEach(timeout => clearTimeout(timeout));
        replayTimeouts = [];
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // Clear all active celebration timeouts
    try {
      if (typeof activeCelebrations !== 'undefined' && activeCelebrations instanceof Map) {
        activeCelebrations.forEach(celebration => {
          clearTimeout(celebration.timeout);
        });
        activeCelebrations.clear();
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // MEMORY LEAK FIX: Clean up global deduplication set periodically
    try {
      if (typeof GLOBAL_PROCESSED_REPLAYS !== 'undefined' && GLOBAL_PROCESSED_REPLAYS instanceof Set && GLOBAL_PROCESSED_REPLAYS.size > 50) {
        GLOBAL_PROCESSED_REPLAYS.clear();
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // MEMORY LEAK FIX: Clear auto-celebrated spin IDs to prevent memory bloat
    try {
      if (typeof autoCelebratedSpinIds !== 'undefined' && autoCelebratedSpinIds instanceof Set) {
        autoCelebratedSpinIds.clear();
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // Stop any spinning sounds
    soundService.stopLoopingSound('spin-loop', { fadeOut: 0.1 }).catch(() => {
      // Ignore sound errors
    });
    
    // NAVIGATION FIX: Ensure document event listeners are removed
    // This is critical for preventing navigation issues
    try {
      // @ts-ignore
      document.removeEventListener('replay-spin', handleReplayEvent);
      // @ts-ignore
      document.removeEventListener('start-spin-animation', handleStartAnimation);
      // @ts-ignore
      document.removeEventListener('display-spin-outcome', handleDisplayOutcome);
    } catch (e) {
      // Ignore errors if handlers are undefined
    }
  });
  
  // Document event handlers - defined at component scope for proper cleanup
  const handleReplayEvent = (event: CustomEvent) => {
    handleReplaySpin(event.detail);
  };
  
  const handleStartAnimation = (event: CustomEvent) => {
    const { spinId } = event.detail;
    console.log(`🎬 SlotMachine: Queue requested animation for ${spinId.slice(-8)}`);
    startContinuousSpinning(spinId);
  };
  
  const handleDisplayOutcome = (event: CustomEvent) => {
    const { spin, outcome, winnings, betAmount } = event.detail;
    console.log(`🎯 SlotMachine: Displaying outcome for ${spin.id.slice(-8)}`);
    
    // Display the outcome (stop reels and show results)
    displayOutcome({ ...spin, outcome, winnings, totalBet: betAmount });
  };
  
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
      callReelGrid('stopSpin');
      // Reset game store state to ensure $isSpinning is false before starting new spin
      gameStore.reset();
    }
    
    // Mark that user has initiated a spin this session
    userSessionStarted = true;
    
    // Play spin start sound
    playSpinStart().catch(() => {
      // Ignore sound errors
    });
    
    // ONLY add spin to queue - queue handles blockchain processing
    const spinId = queueStore.addSpin(betPerLine, selectedPaylines, totalBet, undefined, $selectedContract?.id);
    console.log(`📝 Spin ${spinId.slice(-8)} added to queue - queue will handle all processing`);

    // Start animation for the correct next spin (head-of-line), not necessarily the newly added one.
    // This prevents auto mode from highlighting the newest spin instead of the next in queue.
    if (!$currentSpinId || !$isSpinning) {
      // Grab a synchronous snapshot of the queue
      let snapshot: { spins: any[] } = { spins: [] };
      const unsub = queueStore.subscribe((s) => { snapshot = s; });
      unsub();

      // Find the oldest non-terminal spin (the one that should be animated/displayed next)
      const nonTerminal = snapshot.spins.filter((s) => ![SpinStatus.COMPLETED, SpinStatus.FAILED, SpinStatus.EXPIRED].includes(s.status));
      const nextSpin = nonTerminal.sort((a, b) => a.timestamp - b.timestamp)[0];

      const targetSpinId = nextSpin?.id || spinId;
      document.dispatchEvent(new CustomEvent('start-spin-animation', { detail: { spinId: targetSpinId } }));
    }

    // Mark this spin as user-initiated so queue knows to reveal immediately when ready
    queueProcessor.markSpinAsUserInitiated(spinId);

    // Kick processing
    queueProcessor.checkQueue();
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
    callReelGrid('startSpin', spinId);
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
    callReelGrid('stopSpin');
    
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
        callReelGrid('stopSpin');
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
    
    // Animation queue now handles outcome display sequentially
    // Remove parallel processing - the animation queue will handle this

    // MEMORY LEAK FIX: Clean up old auto-celebrated IDs to prevent memory bloat
    if (autoCelebratedSpinIds.size > 20) {
      const idsArray = Array.from(autoCelebratedSpinIds);
      autoCelebratedSpinIds = new Set(idsArray.slice(-10));
    }
    
    // Set flag to false after initial processing
    if (isInitialMount) {
      setTimeout(() => {
        isInitialMount = false;
      }, 500);
    }
    
    // Clean up completed spins that are no longer current
    if ($currentSpinId) {
      const currentSpin = queueState.spins.find((spin: any) => spin.id === $currentSpinId);
      if (!currentSpin || [SpinStatus.COMPLETED, SpinStatus.FAILED, SpinStatus.EXPIRED].includes(currentSpin.status)) {
        if (currentSpin && [SpinStatus.FAILED, SpinStatus.EXPIRED].includes(currentSpin.status)) {
          handleFailedSpin(currentSpin);
        }
      }
    }
  }

  // Process the outcome display queue sequentially
  // Queue processor handles everything now - no separate display queue needed

  async function displayOutcome(spin: any) {
    console.log(`🎬 Displaying outcome for spin ${spin.id.slice(-8)}`);
    
    // Stop spinning
    await soundService.forceStopWithVerification('spin-loop', 3);
    playReelStop().catch(() => {});
    
    // Show final outcome
    callReelGrid('setFinalPositions', spin.outcome, spin.id);
    gameStore.completeSpin(spin.id, spin.outcome);
    
    // DEBUG: Log payline overlay state when outcome is displayed
    console.log('PaylineOverlay DEBUG: outcome reveal, selectedPaylines=', $bettingStore.selectedPaylines);
    
    // Show win/loss celebration
    setTimeout(() => {
      const isRapidMode = preferencesStore.getSnapshot().betting.rapidQueueMode;
      
      if (spin.winnings > 0) {
        const winLevel = spin.winnings >= 100000000 ? 'jackpot' : 
                       spin.winnings >= 50000000 ? 'large' : 
                       spin.winnings >= 20000000 ? 'medium' : 'small';
        
        playWinSound(winLevel).catch(() => {});
        triggerWinCelebration({
          amount: spin.winnings,
          betAmount: spin.totalBet,
          level: winLevel,
          gridOutcome: spin.outcome,
          selectedPaylines: spin.selectedPaylines || $bettingStore.selectedPaylines
        }, spin.id);

        // Signal completion after the celebration duration for this win level
        const celebrationDurations: Record<'small'|'medium'|'large'|'jackpot', number> = {
          small: 600,
          medium: 700,
          large: 800,
          jackpot: 800
        };
        const durationMs = celebrationDurations[winLevel] ?? 800;
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent('spin-animation-complete', { detail: { spinId: spin.id } }));
        }, durationMs + 100);
      } else {
        // In Rapid mode, skip loss animations and complete immediately
        if (isRapidMode) {
          // Skip loss sound and feedback in Rapid mode, signal immediate completion
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent('spin-animation-complete', { detail: { spinId: spin.id } }));
          }, 50); // Minimal delay for smooth flow
        } else {
          // Normal mode: show full loss animation
          playLoss().catch(() => {});
          triggerLossFeedback({
            id: spin.id,
            totalBet: spin.totalBet
          });

          // Loss feedback auto-hides after 2 seconds; then signal completion
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent('spin-animation-complete', { detail: { spinId: spin.id } }));
          }, 2000 + 100);
        }
      }
      
      // The animation queue will handle completion timing - no need to manually complete here
      
    }, 100); // Brief delay after reel stops
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
    // MEMORY LEAK FIX: Prevent unbounded growth of active celebrations
    if (activeCelebrations.size >= MAX_ACTIVE_CELEBRATIONS) {
      // Clear oldest celebration to make room
      const oldestKey = activeCelebrations.keys().next().value;
      if (oldestKey) {
        const oldestCelebration = activeCelebrations.get(oldestKey);
        if (oldestCelebration) {
          clearTimeout(oldestCelebration.timeout);
        }
        activeCelebrations.delete(oldestKey);
      }
    }
    
    // Create unique celebration ID
    const celebrationId = spinId || `celebration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Record that we've celebrated this spin
    if (spinId) {
      lastCelebratedSpinId = spinId;
      // Also mark as auto-celebrated to prevent stale background replays later
      // This ensures a spin celebrated in the foreground won't be re-queued by the
      // background auto-celebration loop when queue updates arrive out of order.
      autoCelebratedSpinIds.add(spinId);
    }
    
    // Celebration duration tuned shorter to fit tighter timing
    const duration = {
      small: 900,    // 0.9s
      medium: 1200,  // 1.2s
      large: 1500,   // 1.5s
      jackpot: 1800  // 1.8s
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
    // Skip loss feedback entirely in Rapid mode
    const isRapidMode = preferencesStore.getSnapshot().betting.rapidQueueMode;
    if (isRapidMode) {
      return;
    }
    
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

  // Emergency cleanup function - only for error recovery or manual cleanup
  async function forceCleanupAllAnimations() {
    console.log('🧹 SlotMachine: EMERGENCY cleanup - stopping all animations');
    
    // 1. Stop all reel animations
    callReelGrid('stopSpin');
    callReelGrid('forceCleanup');
    
    // 2. Clear spinning interval
    if (spinningInterval) {
      clearInterval(spinningInterval);
      spinningInterval = null;
    }
    
    // 3. Force stop spin loop sound with verification
    try {
      const soundStopped = await soundService.forceStopWithVerification('spin-loop', 5);
      if (!soundStopped) {
        console.warn('⚠️ SlotMachine: Failed to stop spin-loop sound after cleanup');
        // Force stop all sounds as fallback
        soundService.stopAllSounds();
      }
    } catch (error) {
      console.error('❌ SlotMachine: Error stopping sounds:', error);
      soundService.stopAllSounds();
    }
    
    // 4. Clear all timeouts
    if (lossFeedbackTimeout) {
      clearTimeout(lossFeedbackTimeout);
      lossFeedbackTimeout = null;
    }
    if (paylineTimeout) {
      clearTimeout(paylineTimeout);
      paylineTimeout = null;
    }
    if (failureFeedbackTimeout) {
      clearTimeout(failureFeedbackTimeout);
      failureFeedbackTimeout = null;
    }
    
    // 5. Clear all replay timeouts
    replayTimeouts.forEach(timeout => clearTimeout(timeout));
    replayTimeouts = [];
    
    // 6. CAREFULLY clear celebrations - only if they seem stuck
    activeCelebrations.forEach(celebration => {
      clearTimeout(celebration.timeout);
    });
    activeCelebrations.clear();
    
    // 7. Reset all visual states
    showLossFeedback = false;
    showFailureFeedback = false;
    isReplayMode = false;
    
    // 8. Force reset game state
    gameStore.forceReset();
    
    // 9. Give reels a moment to clean up, then set to clean positions
    setTimeout(() => {
      callReelGrid('setFinalPositions', [['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_']], 'force-cleanup');
    }, 500);
    
    console.log('✅ SlotMachine: EMERGENCY cleanup complete');
  }

  // Gentle cleanup for normal auto spin stopping - only stops spinning-related things
  async function gentleCleanupSpinning() {
    console.log('🧹 SlotMachine: Gentle cleanup - stopping spinning only');
    
    // Only stop spinning interval - don't touch celebrations or other animations
    if (spinningInterval) {
      clearInterval(spinningInterval);
      spinningInterval = null;
    }
    
    // Only stop spin loop sound - let other sounds continue
    try {
      const soundStopped = await soundService.forceStopWithVerification('spin-loop', 3);
      if (!soundStopped) {
        console.warn('⚠️ SlotMachine: Failed to stop spin-loop sound');
      }
    } catch (error) {
      console.error('❌ SlotMachine: Error stopping spin sound:', error);
    }
    
    console.log('✅ SlotMachine: Gentle cleanup complete - celebrations allowed to continue');
  }

  // Check for stuck spins after auto spin stops
  function checkForStuckSpins() {
    console.log('🔍 Checking for stuck spins after auto spin stopped...');
    
    // Check if we're still spinning but auto spin is off
    if ($isSpinning && !$isAutoSpinning) {
      console.log('⚠️ Found stuck spinning state after auto spin stopped');
      
      // Check if there are any pending spins in the queue
      const hasPendingSpins = $pendingSpins && $pendingSpins.length > 0;
      
      if (!hasPendingSpins) {
        // No pending spins but still spinning - this is stuck
        console.log('🛠️ No pending spins but still spinning - forcing cleanup');
        gentleCleanupSpinning();
        callReelGrid('stopSpin');
        gameStore.reset();
      } else {
        // There are pending spins - give them more time
        console.log('⏳ Still have pending spins, waiting longer...');
        autoSpinStopTimeout = setTimeout(() => {
          checkForStuckSpins();
        }, 10000); // Check again in 10 seconds
      }
    } else {
      console.log('✅ No stuck spins detected - all good');
    }
  }

  // Export cleanup function for external components
  export function cleanupAnimations() {
    return forceCleanupAllAnimations();
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
      callReelGrid('stopSpin');
      callReelGrid('setFinalPositions', [['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_']], 'cancel-previous');
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
    callReelGrid('stopSpin');
    callReelGrid('setFinalPositions', [['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_'], ['_', '_', '_']], 'force-stop');
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
      callReelGrid('startSpin', replayAnimationId);
      
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
        callReelGrid('setFinalPositions', replayData.outcome, replayAnimationId);
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
        
        // Cleanup after replay completes (preserve final outcome on screen)
        const cleanupTimeout = setTimeout(() => {
          // Do NOT reset the reels to blank or initial positions; keep the final outcome visible
          // Only clear UI highlights/state associated with replay animations
          try { gameStore.clearHighlights(); } catch {}
          
          // Clear replay mode flag to allow normal operation
          isReplayMode = false;
          
          // Global deduplication already cleared earlier
          
          // Remove completed timeouts from tracking
          replayTimeouts = replayTimeouts.filter(t => t !== startTimeout && t !== outcomeTimeout && t !== celebrationTimeout && t !== cleanupTimeout);
          
          console.log(`=== REPLAY: Cleanup completed for ${replayId} ===`);
        }, 4000); // Clear the replay after 4 seconds
        replayTimeouts.push(cleanupTimeout);
      }, 3000); // Show spinning for 3 seconds
      replayTimeouts.push(outcomeTimeout);
    }, 0);
    replayTimeouts.push(startTimeout);
  }
</script>

<!-- Reactive theme styles -->
<div class="slot-machine-container h-full" 
     style="--theme-primary: {$currentTheme.primary}; --theme-secondary: {$currentTheme.secondary}; --theme-lights: {$currentTheme.lights};">


  <!-- Single Slot Machine Layout - Responsive -->
  <div class="slot-machine-wrapper">
    <!-- Slot Machine Frame -->
    <div class="slot-machine-frame">
      
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
          <div class="inner-frame" class:background-theme={$currentTheme.useBackgroundImage}>
            <!-- Main game grid -->
            <div class="game-grid" class:background-theme={$currentTheme.useBackgroundImage}>
              <!-- Single Reel Grid for all viewports -->
              <ReelGrid bind:this={reelGrid} grid={$currentGrid} isSpinning={$isSpinning} />
              
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
                  <PaylineOverlay showPaylines={true} activePaylines={defaultActivePaylines} />
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Betting Controls - Below slot machine, responsive -->
    {#if !hideBettingControls && !initialReplayData}
      <div class="betting-controls-section">
        <BettingControls on:spin={handleSpin} disabled={disabled} />
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

  /* Slot Machine Wrapper - Responsive Layout */
  .slot-machine-wrapper {
    @apply w-full h-full flex flex-col items-center;
    margin: 0 auto;
  }

  .betting-controls-section {
    @apply w-full mt-4;
  }

  /* Enhanced Slot Machine Frame Styling */
  .slot-machine-frame {
    @apply relative w-full;
    filter: drop-shadow(0 25px 50px rgba(0, 0, 0, 0.4));
    margin: 0 auto;
    overflow: hidden; /* Prevent casino-border from causing horizontal overflow */
  }

  /* Desktop: Wider reel area */
  @media (min-width: 1024px) {
    .slot-machine-wrapper {
      max-width: 900px;
    }
    
    .slot-machine-frame {
      max-width: 800px;
    }
  }

  /* Tablet */
  @media (min-width: 768px) and (max-width: 1023px) {
    .slot-machine-wrapper {
      max-width: 700px;
    }
    
    .slot-machine-frame {
      max-width: 600px;
    }
  }

  /* Mobile: Remove transform scaling to prevent spacing issues */
  @media (max-width: 767px) {
    .slot-machine-wrapper {
      /* Remove transform scale to prevent large gaps underneath */
      max-width: 100%;
      padding: 0 0.5rem;
    }
    
    .slot-machine-frame {
      max-width: calc(100vw - 2rem); /* Ensure frame fits within viewport minus wrapper padding */
    }
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
    background: linear-gradient(45deg, 
      var(--theme-primary) 0%, var(--theme-secondary) 25%, var(--theme-primary) 50%, var(--theme-secondary) 75%, var(--theme-primary) 100%);
/*    background: linear-gradient(145deg, 
      var(--theme-surface-primary) 0%, 
      var(--theme-surface-secondary) 25%, 
      var(--theme-surface-tertiary) 50%, 
      var(--theme-surface-secondary) 75%, 
      var(--theme-surface-primary) 100%);*/
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

  /* Make inner-frame show background image for Dorks theme */
  :global(.background-theme) .inner-frame {
    background: var(--theme-bg-image) !important;
    background-size: cover !important;
    background-position: center !important;
    background-repeat: no-repeat !important;
    border: none !important;
    box-shadow: none !important;
  }

  /* Ensure background scales properly on mobile */
  @media (max-width: 767px) {
    :global(.background-theme) .inner-frame {
      background-size: contain !important;
      background-position: center center !important;
    }
    
    :global(.background-theme) .game-grid {
      background-size: contain !important;
      background-position: center center !important;
    }
  }

  .game-grid {
    @apply relative rounded border-2;
    background: linear-gradient(180deg, var(--theme-bg-from) 0%, var(--theme-surface-primary) 100%);
    border-color: var(--theme-surface-border);
    box-shadow: 
      inset 0 2px 4px rgba(0, 0, 0, 0.6),
      0 0 10px var(--theme-lights);
  }

  /* Make game-grid show background image for Dorks theme */
  :global(.background-theme) .game-grid {
    background: var(--theme-bg-image) !important;
    background-size: cover !important;
    background-position: center !important;
    background-repeat: no-repeat !important;
    border: none !important;
    box-shadow: none !important;
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

  @media (max-width: 480px) {
    .slot-machine-wrapper {
      /* Remove transform scale to prevent spacing issues on small screens */
      max-width: 100%;
      padding: 0;
    }
  }
</style>
