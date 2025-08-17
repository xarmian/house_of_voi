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
  import { Zap, Trophy, Info } from 'lucide-svelte';
  import ReelGrid from './ReelGrid.svelte';
  import PaylineOverlay from './PaylineOverlay.svelte';
  import BettingControls from './BettingControls.svelte';
  import GameQueue from './GameQueue.svelte';
  import WinCelebration from './WinCelebration.svelte';
  import LoadingOverlay from '../ui/LoadingOverlay.svelte';
  
  export let disabled = false;
  export let compact = false;
  
  // Win celebration state
  let showWinCelebration = false;
  let winAmount = 0;
  let winLevel: 'small' | 'medium' | 'large' | 'jackpot' = 'small';
  
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
  
  // Loading state
  $: currentLoadingState = $loadingStates[0]; // Get the first loading state
  $: isLoading = $loadingStates.length > 0;
  
  onMount(() => {
    // Reset game state to ensure clean start
    gameStore.reset();
    gameStore.initializeGrid();
    
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
    if (queueUnsubscribe) queueUnsubscribe();
    if (spinningInterval) clearInterval(spinningInterval);
    if (celebrationTimeout) clearTimeout(celebrationTimeout);
    if (lossFeedbackTimeout) clearTimeout(lossFeedbackTimeout);
  });
  
  function handleSpin(event: CustomEvent) {
    const { betPerLine, selectedPaylines, totalBet } = event.detail;
    
    // Add spin to queue (this will handle the blockchain processing in background)
    const spinId = queueStore.addSpin(betPerLine, selectedPaylines, totalBet);
    console.log('Added spin to queue:', spinId);
    
    // New spin takes over display immediately
    if ($isSpinning && $currentSpinId) {
      console.log(`New spin ${spinId} taking over from ${$currentSpinId}`);
    }
    
    // Start visual spin animation immediately with continuous spinning
    startContinuousSpinning(spinId);
  }

  function startContinuousSpinning(spinId: string) {
    // Start the initial spin animation
    gameStore.startSpin(spinId);
    
    // Set up continuous spinning until outcome is ready
    if (spinningInterval) clearInterval(spinningInterval);
    
    spinningInterval = setInterval(() => {
      // Only continue if we're waiting for outcome for this spin
      if ($currentSpinId === spinId && $waitingForOutcome) {
        gameStore.continueSpinning(spinId);
      } else {
        // Clean up interval if no longer needed
        if (spinningInterval) {
          clearInterval(spinningInterval);
          spinningInterval = null;
        }
      }
    }, 2000); // Continue spinning every 2 seconds
  }

  function handleQueueUpdate(queueState: any) {
    // Set flag to false after first queue update to allow future celebrations
    if (isInitialMount) {
      isInitialMount = false;
    }
    
    // If there are no spins at all, make sure we're not spinning
    if (!queueState.spins || queueState.spins.length === 0) {
      if ($isSpinning || $waitingForOutcome) {
        gameStore.reset();
        if (spinningInterval) {
          clearInterval(spinningInterval);
          spinningInterval = null;
        }
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
      
      // If this spin is currently displayed or can take over, show its outcome
      if ($currentSpinId === mostRecentSpin.id || gameStore.canTakeOverDisplay(mostRecentSpin.id)) {
        displayOutcome(mostRecentSpin);
      }
    }
    
    // Check if we need to start spinning for a new pending spin
    const pendingSpins = queueState.spins.filter((spin: any) => 
      [SpinStatus.PENDING, SpinStatus.SUBMITTING, SpinStatus.WAITING, SpinStatus.PROCESSING].includes(spin.status)
    );
    
    if (pendingSpins.length > 0 && !$currentSpinId) {
      // Start spinning for the most recent pending spin
      const mostRecentPending = pendingSpins[pendingSpins.length - 1];
      startContinuousSpinning(mostRecentPending.id);
    } else if (pendingSpins.length === 0 && $currentSpinId) {
      // No pending spins but we still have a current spin ID - check if it should be cleared
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

  function displayOutcome(spin: any) {
    if (spin.outcome) {
      // Stop continuous spinning
      if (spinningInterval) {
        clearInterval(spinningInterval);
        spinningInterval = null;
      }
      
      // Complete the spin with actual outcome
      gameStore.completeSpin(spin.id, spin.outcome);
      
      // Only trigger celebrations if this is not the initial mount and we haven't already celebrated this spin
      if (!isInitialMount && lastCelebratedSpinId !== spin.id) {
        // Check if we have actual winnings from blockchain first
        if (spin.winnings > 0) {
          // Use actual winnings from blockchain
          triggerWinCelebration({
            amount: spin.winnings,
            level: spin.winnings >= 100000000 ? 'jackpot' : 
                   spin.winnings >= 50000000 ? 'large' : 
                   spin.winnings >= 20000000 ? 'medium' : 'small'
          }, spin.id);
        } else {
          // Show loss feedback immediately (but only once per spin)
          if (lastLossFeedbackSpinId !== spin.id) {
            triggerLossFeedback(spin);
          }
        }
      }
    }
  }
  
  function checkForWins(outcome: string[][]) {
    // Simple win detection for demonstration
    // Check for three in a row on first payline
    const firstRow = outcome.map(reel => reel[0]);
    const isWin = firstRow[0] !== '_' && firstRow.slice(0, 3).every(symbol => symbol === firstRow[0]);
    
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

  function handleReplaySpin(replayData: { spin: any; outcome: string[][]; winnings: number; betAmount: number }) {
    console.log('🎮 Starting replay animation for spin:', replayData.spin.id);

    // Generate a unique replay ID
    const replayId = `replay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Stop any existing animations and clear state
    if (spinningInterval) {
      clearInterval(spinningInterval);
      spinningInterval = null;
    }
    gameStore.reset();
    
    // Start spin animation with the replay outcome
    gameStore.startSpin(replayId, replayData.outcome);
    
    // After a brief spinning period, complete with the actual outcome
    setTimeout(() => {
      gameStore.completeSpin(replayId, replayData.outcome);
      
      // Trigger win celebration if there were winnings
      if (replayData.winnings > 0) {
        const winLevel = replayData.winnings >= 100000000 ? 'jackpot' : 
                        replayData.winnings >= 50000000 ? 'large' : 
                        replayData.winnings >= 20000000 ? 'medium' : 'small';
        
        setTimeout(() => {
          triggerWinCelebration({
            amount: replayData.winnings,
            level: winLevel
          }, replayId);
        }, 500); // Small delay after outcome is shown
      }
    }, 2500); // Show spinning for 2.5 seconds
  }
</script>

<div class="slot-machine-container h-full">
  <!-- Desktop: Vertical Layout -->
  <div class="hidden lg:block">
    <!-- Slot Machine Frame -->
    <div class="relative bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl p-3 shadow-2xl border border-slate-700 mb-4">
      <div class="relative">
        <!-- Decorative frame -->
        <div class="absolute -inset-1 bg-gradient-to-r from-voi-600/20 to-blue-600/20 rounded-xl blur-sm"></div>
        
        <!-- Main game grid -->
        <div class="relative bg-slate-900 rounded-lg p-2 border-2 border-slate-600">
          <!-- Reel Grid -->
          <ReelGrid grid={$currentGrid} isSpinning={$isSpinning} />
          
          <!-- Payline Overlay -->
          <PaylineOverlay 
            showPaylines={$bettingStore.selectedPaylines > 1}
            activePaylines={Array.from({length: $bettingStore.selectedPaylines}, (_, i) => i)}
          />
          
          <!-- Spinning overlay -->
          {#if $isSpinning}
            <div class="absolute inset-0 bg-black/20 rounded-lg flex items-center justify-center pointer-events-none">
              <div class="text-center">
                <div class="text-white text-xl font-bold animate-pulse">
                  SPINNING...
                </div>
              </div>
            </div>
          {/if}
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
      <div class="flex-shrink-0 relative bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl p-3 shadow-2xl border border-slate-700 mb-3">
        <div class="relative">
          <!-- Decorative frame -->
          <div class="absolute -inset-1 bg-gradient-to-r from-voi-600/20 to-blue-600/20 rounded-xl blur-sm"></div>
          
          <!-- Main game grid -->
          <div class="relative bg-slate-900 rounded-lg p-2 border-2 border-slate-600">
            <!-- Reel Grid -->
            <ReelGrid grid={$currentGrid} isSpinning={$isSpinning} />
            
            <!-- Payline Overlay -->
            <PaylineOverlay 
              showPaylines={$bettingStore.selectedPaylines > 1}
              activePaylines={Array.from({length: $bettingStore.selectedPaylines}, (_, i) => i)}
            />
            
            <!-- Spinning overlay -->
            {#if $isSpinning}
              <div class="absolute inset-0 bg-black/20 rounded-lg flex items-center justify-center pointer-events-none">
                <div class="text-center">
                  <div class="text-white text-lg font-bold animate-pulse">
                    SPINNING...
                  </div>
                </div>
              </div>
            {/if}
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
        <div class="relative bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl p-4 shadow-2xl border border-slate-700">
          <div class="relative">
            <!-- Decorative frame -->
            <div class="absolute -inset-2 bg-gradient-to-r from-voi-600/20 to-blue-600/20 rounded-2xl blur-sm"></div>
            
            <!-- Main game grid -->
            <div class="relative bg-slate-900 rounded-xl p-3 border-2 border-slate-600">
              <!-- Reel Grid -->
              <ReelGrid grid={$currentGrid} isSpinning={$isSpinning} />
              
              <!-- Payline Overlay -->
              <PaylineOverlay 
                showPaylines={$bettingStore.selectedPaylines > 1}
                activePaylines={Array.from({length: $bettingStore.selectedPaylines}, (_, i) => i)}
              />
              
              <!-- Spinning overlay -->
              {#if $isSpinning}
                <div class="absolute inset-0 bg-black/20 rounded-xl flex items-center justify-center pointer-events-none">
                  <div class="text-center">
                    <div class="text-white text-xl font-bold animate-pulse">
                      SPINNING...
                    </div>
                  </div>
                </div>
              {/if}
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
  />
  
  <!-- Loss Feedback Overlay -->
  {#if showLossFeedback}
    <div class="fixed inset-0 flex items-center justify-center pointer-events-none z-40" 
         in:fly={{ y: -50, duration: 400 }}
         out:fade={{ duration: 300 }}>
      <div class="bg-red-900/90 border border-red-600 rounded-lg px-6 py-4 shadow-2xl">
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
  

</div>

<style>
  .slot-machine-container {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
</style>