// Phase 7: Blockchain Integration Service
// Bridge between queue system and smart contract interactions

import { algorandService } from './algorand';
import { queueStore } from '$lib/stores/queue';
import { walletStore } from '$lib/stores/wallet';
import { SpinStatus } from '$lib/types/queue';
import { BLOCKCHAIN_CONFIG } from '$lib/constants/network';
import type { QueuedSpin } from '$lib/types/queue';
import type { SpinTransaction, BlockchainError } from '$lib/types/blockchain';
import { balanceCalculator } from './balanceCalculator';
import { balanceManager } from './balanceManager';
import { get } from 'svelte/store';

// Add global debug method to clear invalid queue data
if (typeof window !== 'undefined') {
  (window as any).clearInvalidQueueData = () => {
    console.log('🧹 Clearing invalid queue data...');
    queueStore.clear();
    console.log('✅ Queue data cleared!');
  };
}

export class BlockchainService {
  private processingSpins = new Set<string>();
  private claimingBets = new Set<string>(); // Track ongoing claims by betKey

  /**
   * Sleep for a specified number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Submit a spin to the blockchain
   */
  async submitSpin(spin: QueuedSpin): Promise<void> {
    if (this.processingSpins.has(spin.id)) {
      return; // Already processing
    }

    if (!algorandService) {
      throw new Error('AlgorandService not properly initialized');
    }

    this.processingSpins.add(spin.id);

    try {
      // Update status to submitting
      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.SUBMITTING
      });

      // Get wallet account
      const account = await this.getWalletAccount();
      if (!account) {
        throw new Error('Wallet not connected');
      }

      // Enhanced balance validation and cost calculation
      const balanceValidation = await balanceCalculator.validateSufficientBalance(
        spin.betPerLine,
        spin.selectedPaylines,
        account.address,
        get(walletStore).balance
      );

      if (!balanceValidation.isValid) {
        const shortfall = balanceValidation.requirement.totalRequired - balanceValidation.requirement.availableAfterReserved;
        throw new Error(
          `Insufficient balance for spin. Need ${(shortfall / 1000000).toFixed(6)} more VOI. ` +
          `Details: ${balanceValidation.errors.join('; ')}`
        );
      }

      // Use calculated costs from enhanced validation
      const extraPayment = balanceValidation.requirement.contractCosts + balanceValidation.requirement.networkFees;

      // **NO OPTIMISTIC BALANCE UPDATE NEEDED**: The reservedBalance system already prevents overspending
      // by reducing availableForBetting when spins are queued. The actual balance will update when
      // the blockchain transaction confirms.

      // Prepare spin transaction
      const spinTx: SpinTransaction = {
        betAmount: spin.betPerLine * spin.selectedPaylines, // Total bet amount for all paylines
        maxPaylineIndex: spin.selectedPaylines - 1, // Contract expects 0-indexed
        index: Math.floor(Math.random() * 1000), // Random index for outcome
        extraPayment
      };

      // Submit to blockchain
      const result = await algorandService.submitSpin(account, spinTx);

      // Track a pending deduction so the UI can indicate pending state and
      // the balance manager can release reserved funds when on-chain debit posts
      try {
        const expectedDebit = spin.estimatedTotalCost || (spin.betPerLine * spin.selectedPaylines + extraPayment);
        const pendingTxId = (result as any).paymentTxId || result.txId; // Track the payment tx for debit detection
        balanceManager.trackPendingTransaction(pendingTxId, expectedDebit, account.address, 'deduction');
      } catch (e) {
        console.warn('Failed to track pending deduction:', e);
      }

      // Update with transaction details - this will release the reserved balance later
      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.WAITING,
        data: {
          txId: result.txId, // app call tx id for linking and verification
          groupTxId: (result as any).groupTxId,
          paymentTxId: (result as any).paymentTxId,
          betKey: result.betKey,
          commitmentRound: result.round
        }
      });
      
      console.log(`💰 Spin ${spin.id.slice(-8)} moved to WAITING - reserved balance should now be released`);

      // Kick off immediate outcome processing to avoid queue polling delay
      ;(async () => {
        try {
          const immediateSpin: any = {
            ...spin,
            txId: result.txId,
            betKey: result.betKey,
            commitmentRound: result.round,
            status: SpinStatus.WAITING,
          };
          await this.checkBetOutcome(immediateSpin);
        } catch (e) {
          console.warn('Immediate outcome processing failed:', e);
        }
      })();

    } catch (error) {
      const retryInfo = spin.retryCount ? ` (attempt ${spin.retryCount + 1})` : '';
      console.error(`Error submitting spin${retryInfo}:`, error);
      
      // Don't directly mark as FAILED here - let the queueProcessor handle retries
      // The queueProcessor will catch this error and decide whether to retry or fail
      throw error;
    } finally {
      this.processingSpins.delete(spin.id);
    }
  }

  /**
   * Check if bet is ready for outcome
   */
  async checkBetOutcome(spin: QueuedSpin): Promise<void> {
    if (!spin.betKey || !spin.commitmentRound) return;

    if (!algorandService) {
      throw new Error('AlgorandService not properly initialized');
    }

    // Validate bet key format before processing
    if (!spin.betKey || spin.betKey.length !== 112 || !/^[0-9a-fA-F]+$/.test(spin.betKey)) {
      console.warn('⚠️ Invalid bet key format in queue, marking as failed:', {
        spinId: spin.id,
        betKey: spin.betKey,
        length: spin.betKey?.length
      });
      
      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.FAILED,
        data: {
          error: `Invalid bet key format: ${spin.betKey?.length || 0} chars`
        }
      });
      return;
    }

    try {
      // First check if the bet still exists - with retry logic for "Bet not found" errors
      /*let betExists = true;
      let betInfo = null;
      
      const maxRetries = 3;
      let attempt = 0;
      
      while (attempt < maxRetries && betInfo === null) {
        try {
          betInfo = await algorandService.getBetInfo(spin.betKey);
          betExists = true;
          break;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          if (errorMessage.includes('Bet not found') || 
              errorMessage.includes('box not found') ||
              errorMessage.includes('status 404')) {
            
            attempt++;
            
            if (attempt < maxRetries) {
              console.log(`🔄 Bet not found (attempt ${attempt}/${maxRetries}), retrying in 2 seconds...`);
              await this.sleep(2000); // Wait 2 seconds before retry
            } else {
              console.log(`❌ Bet not found after ${maxRetries} attempts, treating as non-existent`);
              betExists = false;
            }
          } else {
            // Re-throw if it's a different error (not "Bet not found")
            throw error;
          }
        }
      }
      
      if (!betExists) {
        console.log('📦 Bet no longer exists - treating as already completed');
        
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.COMPLETED,
          data: {
            claimTxId: 'bet-not-found',
            totalPayout: 0,
            note: 'Bet box not found - likely already processed by background service'
          }
        });
        
        // Balance will be updated automatically by balance manager
        return;
      }*/
      
      // Fast path to outcome: wait aggressively for claim round block, then compute deterministically
      const userAddr = get(walletStore).account?.address || '';
      // Claim round = commitment round + 1 (matches contract round_future_delta)
      const commitmentRound = (spin as any)?.commitmentRound || 0;
      const claimRound = commitmentRound ? commitmentRound + 1 : 0;
      if (!claimRound) {
        throw new Error('Missing commitmentRound; cannot derive claimRound');
      }
      // Wait exactly for the block after commitment round
      await algorandService.waitForBlockAfter(commitmentRound);

      // Compute deterministic grid at claim round
      const gridString = await algorandService.getBetGridDeterministic(spin.betKey, claimRound, userAddr);
      const grid: string[][] = [];
      for (let col = 0; col < 5; col++) {
        grid[col] = [] as any;
        for (let row = 0; row < 3; row++) {
          grid[col][row] = gridString[col * 3 + row];
        }
      }

      // Calculate winnings using contract payout tables
      const winnings = await this.calculateWinnings(grid, spin.betPerLine, spin.selectedPaylines);
        
        // Log the bet outcome
        const totalBet = spin.betPerLine * spin.selectedPaylines;
        const profit = winnings - totalBet;
        
        console.log('🎰 SPIN OUTCOME DETECTED - UPDATING UI IMMEDIATELY:');
        console.log(`💰 Bet: ${totalBet.toLocaleString()} microVOI (${(totalBet / 1000000).toFixed(6)} VOI)`);
        console.log(`🎊 Won: ${winnings.toLocaleString()} microVOI (${(winnings / 1000000).toFixed(6)} VOI)`);
        console.log(`📊 Profit: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} microVOI (${(profit / 1000000).toFixed(6)} VOI)`);
        console.log(`🎲 Grid: "${gridString || 'N/A'}"`);
        console.log(`📋 Bet Key: ${spin.betKey?.slice(0, 16)}...`);
        console.log(`🔄 Paylines: ${spin.selectedPaylines}`);
        console.log(`⏰ Status: Moving to READY_TO_CLAIM with winnings visible immediately`);
        
        if (profit > 0) {
          console.log('🎉 WINNER! 🎉');
        } else if (profit === 0) {
          console.log('💫 Break even');
        } else {
          console.log('💔 Better luck next time - but you can still claim to recover box storage fees!');
        }

        // **TRANSACTION CONFIRMED**: The spin transaction has been confirmed on blockchain
        // Force balance refresh to show the real blockchain balance (with actual deduction)
        console.log(`✅ Spin ${spin.id.slice(-8)} confirmed on blockchain - refreshing balance`);
        const account = await this.getWalletAccount();
        if (account) {
          balanceManager.getBalance(account.address, true);
        }

        // Always show the outcome and winnings immediately, then proceed to claim
        // This allows users to see win/loss result even if claim fails
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.READY_TO_CLAIM,
          data: {
            outcome: grid,
            winnings,
            outcomeRound: claimRound
          }
        });

        // Auto-claim immediately once outcome is known
        try {
          const spinForClaim: any = { ...spin, outcome: grid, winnings };
          await this.submitClaim(spinForClaim, true);
        } catch (e) {
          console.warn('Auto-claim failed; UI remains READY_TO_CLAIM:', e);
        }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error checking bet outcome:', errorMessage);
      
      // Check if this is a "box not found" error that should terminate the spin
      const isBoxNotFound = errorMessage.includes('box not found') || 
                           errorMessage.includes('Bet not found') ||
                           errorMessage.includes('unable to determine outcome') ||
                           errorMessage.includes('does not exist');
      
      if (isBoxNotFound) {
        console.log('📦 Bet box not found - TERMINATING SPIN immediately');
        
        // **FORCE SPIN TERMINATION**: Cannot determine outcome, end the spin
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.FAILED,
          data: {
            error: 'Unable to determine outcome - bet box not found',
            terminatedDueToMissingBox: true
          }
        });
        return;
      }
      
      console.log('📦 Other error - treating as already completed');
      
      // **TRANSACTION COMPLETED**: Bet no longer exists (already claimed elsewhere)
      console.log(`✅ Spin ${spin.id.slice(-8)} completed elsewhere - refreshing balance`);
      const account = await this.getWalletAccount();
      if (account) {
        balanceManager.getBalance(account.address, true);
      }
        
      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.COMPLETED,
        data: {
          error: this.formatError(error)
        }
      });
    }
  }

  /**
   * Submit claim transaction
   */
  async submitClaim(spin: QueuedSpin, isAutoClaim: boolean = false): Promise<void> {
    if (!spin.betKey) {
      throw new Error('No bet key available for claim');
    }

    // Check if this bet is already being claimed
    if (this.claimingBets.has(spin.betKey)) {
      console.log(`⏳ Bet ${spin.betKey.slice(0, 16)}... is already being claimed, skipping duplicate`);
      return;
    }

    // Also check if the spin is already in CLAIMING status
    if (spin.status === SpinStatus.CLAIMING) {
      console.log(`⏳ Spin ${spin.id.slice(-8)} is already in CLAIMING status, skipping duplicate`);
      return;
    }

    console.log(`🎯 Attempting to claim spin ${spin.id.slice(-8)}:`, {
      betKey: spin.betKey.slice(0, 16) + '...',
      betKeyLength: spin.betKey.length,
      spinStatus: spin.status,
      hasOutcome: !!spin.outcome,
      winnings: spin.winnings || 0
    });

    // Lock this bet to prevent concurrent claims
    this.claimingBets.add(spin.betKey);
    
    try {
      // First verify the bet exists in the contract
      // console.log('🔍 Verifying bet exists in contract...');
      // const betInfo = await algorandService.getBetInfo(spin.betKey);
      // console.log('✅ Bet found in contract:', betInfo);

      // Update status to claiming for all claims - UI will handle silent display for losing spins
      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.CLAIMING
      });

      const account = await this.getWalletAccount();
      if (!account) {
        throw new Error('Wallet not connected');
      }

      console.log('💸 Submitting claim transaction...');
      const result = await algorandService.submitClaim(account, spin.betKey);

      // Log the successful claim
      console.log('💸 CLAIM PROCESSED:');
      const gameWinnings = spin.winnings || 0;
      const storageRefund = result.payout - gameWinnings;
      
      if (gameWinnings > 0) {
        console.log(`🏆 Game Winnings: ${gameWinnings.toLocaleString()} microVOI (${(gameWinnings / 1000000).toFixed(6)} VOI)`);
      }
      
      if (storageRefund > 0) {
        console.log(`📦 Box Storage Refund: ${storageRefund.toLocaleString()} microVOI (${(storageRefund / 1000000).toFixed(6)} VOI)`);
      }
      
      console.log(`💰 Total Payout: ${result.payout.toLocaleString()} microVOI (${(result.payout / 1000000).toFixed(6)} VOI)`);
      console.log(`📋 Claim Tx: ${result.txId}`);
      console.log(`📋 Bet Key: ${spin.betKey?.slice(0, 16)}...`);

      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.COMPLETED,
        data: {
          claimTxId: result.txId,
          totalPayout: result.payout,
          isAutoClaimInProgress: undefined
          // Keep the original winnings value (game winnings only, not including storage refund)
        }
      });

      // Track a pending addition only if payout > 0
      try {
        if (result.payout && result.payout > 0) {
          balanceManager.trackPendingTransaction(result.txId, result.payout, account.address, 'addition');
        }
      } catch (e) {
        console.warn('Failed to track pending addition:', e);
      }

      // **SPIN COMPLETE**: Force refresh balance from blockchain to show winnings
      console.log(`✅ Spin ${spin.id.slice(-8)} completed - refreshing balance`);
      if (account) {
        balanceManager.getBalance(account.address, true);
      }

    } catch (error) {
      console.error('Error submitting claim:', error);
      
      // Check if this is a "box not found" error (404) - this means the box was already claimed by another process
      const errorMessage = this.formatError(error);
      const isBoxNotFound = errorMessage.includes('box not found') || 
                           errorMessage.includes('status 404') ||
                           (error as any)?.message?.includes('box not found');
      
      if (isBoxNotFound) {
        console.log('📦 Box not found - treating as already claimed');
        
        // Update spin as completed since the box doesn't exist (already claimed)
        // Preserve the outcome and winnings data that we already know
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.COMPLETED,
          data: {
            claimTxId: 'already-claimed',
            totalPayout: 0,
            isAutoClaimInProgress: undefined,
            note: 'Box not found - likely already claimed by background process',
            // Keep existing outcome and winnings data so UI can display results
            outcome: spin.outcome,
            winnings: spin.winnings
          }
        });
        
        // **SPIN ALREADY COMPLETED**: Force refresh balance from blockchain to get accurate state
        console.log(`✅ Spin ${spin.id.slice(-8)} already claimed - refreshing balance`);
        const account = get(walletStore).account;
        if (account) {
          balanceManager.getBalance(account.address, true);
        }
        
        return; // Early return to avoid the error handling below
      }
      
      // For auto-claims, don't update the spin state here - let queueProcessor handle it
      // But still re-throw the error so queueProcessor knows it failed
      if (isAutoClaim) {
        throw error;
      }
      
      // For manual claims, update the state with error
      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.CLAIMING,
        data: {
          error: errorMessage,
          isAutoClaimInProgress: undefined
        }
      });
    } finally {
      // Always remove the lock when done (success or failure)
      this.claimingBets.delete(spin.betKey);
    }
  }

  /**
   * Check transaction status
   */
  async checkTransactionStatus(txId: string): Promise<{confirmed: boolean, failed: boolean, pending: boolean}> {
    try {
      const status = await algorandService.getTransactionStatus(txId);
      return {
        confirmed: status.confirmed,
        failed: status.failed || false,
        pending: !status.confirmed && !status.failed
      };
    } catch (error) {
      console.error('Error checking transaction status:', error);
      // If we can't check the status, assume it failed for retry purposes
      return {
        confirmed: false,
        failed: true,
        pending: false
      };
    }
  }

  /**
   * Get current network round (cached for performance)
   */
  async getCurrentRound(): Promise<number> {
    try {
      // Check cache first
      const cached = this.getCachedRound();
      if (cached) return cached;
      
      const round = await algorandService.getCurrentRound();
      this.setCachedRound(round);
      return round;
    } catch (error) {
      console.error('Error getting current round:', error);
      return 0;
    }
  }

  /**
   * Get network status for monitoring
   */
  async getNetworkStatus() {
    try {
      const currentRound = await algorandService.getCurrentRound();
      const lastUpdate = Date.now();
      
      return {
        connected: true,
        currentRound,
        lastUpdate,
        blockTime: BLOCKCHAIN_CONFIG.blockTime
      };
    } catch (error) {
      return {
        connected: false,
        currentRound: 0,
        lastUpdate: Date.now(),
        error: this.formatError(error)
      };
    }
  }

  /**
   * Get wallet account from store
   */
  private async getWalletAccount(): Promise<{ address: string; privateKey: string } | null> {
    return new Promise((resolve) => {
      let unsubscribe: (() => void) | undefined;
      
      unsubscribe = walletStore.subscribe(state => {
        if (state.account && !state.isLocked) {
          resolve({
            address: state.account.address,
            privateKey: state.account.privateKey
          });
        } else {
          resolve(null);
        }
        if (unsubscribe) unsubscribe();
      });
    });
  }

  /**
   * Calculate winnings based on outcome (simplified version)
   */
  private async calculateWinnings(grid: string[][], betPerLine: number, selectedPaylines: number): Promise<number> {
    try {
      if (!algorandService) {
        throw new Error('AlgorandService not properly initialized');
      }

      let totalWinnings = 0;

      // Get user address for contract calls
      const userAddress = get(walletStore).account?.address || '';
      
      // Get paylines from the contract
      const paylines = await algorandService.getPaylines(userAddress);
      
      // Convert 2D grid to 1D string for column-major processing
      // grid[col][row] -> position col*3 + row in column-major format
      let gridString = '';
      for (let col = 0; col < 5; col++) {
        for (let row = 0; row < 3; row++) {
          gridString += grid[col][row];
        }
      }

      for (let line = 0; line < Math.min(selectedPaylines, paylines.length); line++) {
        const payline = paylines[line];
        
        // Count occurrences of each symbol anywhere in the payline
        const symbolCounts: { [symbol: string]: number } = {
          'A': 0,
          'B': 0,
          'C': 0,
          'D': 0
        };

        // Check all positions in the payline
        for (let col = 0; col < 5; col++) {
          const pos = col * 3 + payline[col]; // Column-major: column * 3 + row
          const symbol = gridString[pos];
          
          if (['A', 'B', 'C', 'D'].includes(symbol)) {
            symbolCounts[symbol]++;
          }
        }

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
          // Get multiplier from the contract (now with caching!)
          const multiplier = await algorandService.getPayoutMultiplier(bestSymbol, bestCount, userAddress);
          totalWinnings += betPerLine * multiplier;
        }
      }

      return totalWinnings;
    } catch (error) {
      console.error('Failed to calculate winnings from contract:', error);
      // Fallback to 0 if contract calls fail
      return 0;
    }
  }

  /**
   * Cache current round for performance
   */
  private getCachedRound(): number | null {
    if (typeof window === 'undefined') return null;
    
    const cached = sessionStorage.getItem('current_round');
    if (cached) {
      const { round, timestamp } = JSON.parse(cached);
      // Cache for configured timeout
      if (Date.now() - timestamp < BLOCKCHAIN_CONFIG.roundCacheTimeout) {
        return round;
      }
    }
    return null;
  }

  private setCachedRound(round: number) {
    if (typeof window === 'undefined') return;
    
    sessionStorage.setItem('current_round', JSON.stringify({
      round,
      timestamp: Date.now()
    }));
  }

  /**
   * Format error for display
   */
  private formatError(error: any): string {
    if (error && typeof error === 'object') {
      if ('message' in error) {
        return error.message;
      }
      if ('type' in error && 'message' in error) {
        // Handle BlockchainError type
        return `${error.type}: ${error.message}`;
      }
    }
    return String(error);
  }
}

export const blockchainService = new BlockchainService();
