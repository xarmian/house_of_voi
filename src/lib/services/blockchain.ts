// Phase 7: Blockchain Integration Service
// Bridge between queue system and smart contract interactions

import { algorandService } from './algorand';
import { queueStore } from '$lib/stores/queue';
import { walletStore } from '$lib/stores/wallet';
import { SpinStatus } from '$lib/types/queue';
import { BLOCKCHAIN_CONFIG } from '$lib/constants/network';
import type { QueuedSpin } from '$lib/types/queue';
import type { SpinTransaction, BlockchainError } from '$lib/types/blockchain';
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

      // Calculate extra payment for transaction fees
      const suggestedParams = await algorandService.getSuggestedParams();
      const baseFee = suggestedParams.minFee;
      const extraPayment = Math.min(baseFee * 3, BLOCKCHAIN_CONFIG.maxExtraPayment); // Estimate for grouped transactions

      // Prepare spin transaction
      const spinTx: SpinTransaction = {
        betAmount: spin.betPerLine * spin.selectedPaylines, // Total bet amount for all paylines
        maxPaylineIndex: spin.selectedPaylines - 1, // Contract expects 0-indexed
        index: Math.floor(Math.random() * 1000), // Random index for outcome
        extraPayment
      };

      // Submit to blockchain
      const result = await algorandService.submitSpin(account, spinTx);

      // Update with transaction details
      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.WAITING,
        data: {
          txId: result.txId,
          betKey: result.betKey,
          commitmentRound: result.round
        }
      });

    } catch (error) {
      console.error('Error submitting spin:', error);
      
      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.FAILED,
        data: {
          error: this.formatError(error)
        }
      });
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
      // First check if the bet still exists
      let betExists = true;
      try {
        await algorandService.getBetInfo(spin.betKey);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Bet not found') || 
            errorMessage.includes('box not found') ||
            errorMessage.includes('status 404')) {
          betExists = false;
        } else {
          throw error; // Re-throw if it's a different error
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
        
        // Refresh wallet balance
        walletStore.refreshBalance();
        return;
      }
      
      const isReady = await algorandService.isBetReadyToClaim(spin.betKey);
      
      if (isReady) {
        // Get the grid outcome
        const gridOutcome = await algorandService.getGridOutcome(spin.betKey, get(walletStore).account?.address || '');
        
        // Calculate winnings using contract payout tables
        const winnings = await this.calculateWinnings(gridOutcome.grid, spin.betPerLine, spin.selectedPaylines);
        
        // Log the bet outcome
        const totalBet = spin.betPerLine * spin.selectedPaylines;
        const profit = winnings - totalBet;
        
        console.log('🎰 SPIN OUTCOME DETECTED - UPDATING UI IMMEDIATELY:');
        console.log(`💰 Bet: ${totalBet.toLocaleString()} microVOI (${(totalBet / 1000000).toFixed(6)} VOI)`);
        console.log(`🎊 Won: ${winnings.toLocaleString()} microVOI (${(winnings / 1000000).toFixed(6)} VOI)`);
        console.log(`📊 Profit: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} microVOI (${(profit / 1000000).toFixed(6)} VOI)`);
        console.log(`🎲 Grid: "${gridOutcome.gridString || 'N/A'}"`);
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

        // Always show the outcome and winnings immediately, then proceed to claim
        // This allows users to see win/loss result even if claim fails
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.READY_TO_CLAIM,
          data: {
            outcome: gridOutcome.grid,
            winnings,
            outcomeRound: gridOutcome.round
          }
        });
        
        // For losing spins, trigger silent auto-claim in the background
        // For winning spins, let the auto-claim processor handle it normally
        if (winnings === 0) {
          // Small delay to let UI show the result first
          setTimeout(async () => {
            try {
              // Get the updated spin object with latest data
              const updatedSpin = { ...spin, outcome: gridOutcome.grid, winnings, outcomeRound: gridOutcome.round };
              await this.submitClaim(updatedSpin, true); // Auto-claim silently
            } catch (error) {
              console.error('Silent auto-claim failed for losing spin:', error);
              // If auto-claim fails, keep as ready to claim so user can manually claim
              queueStore.updateSpin({
                id: spin.id,
                status: SpinStatus.READY_TO_CLAIM,
                data: {
                  error: 'Auto-claim failed, manual claim required'
                }
              });
            }
          }, 1000); // Small delay to let UI settle
        }
      }
    } catch (error) {
      console.error('Error checking bet outcome:', error);
      
      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.FAILED,
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
      console.log('🔍 Verifying bet exists in contract...');
      const betInfo = await algorandService.getBetInfo(spin.betKey);
      console.log('✅ Bet found in contract:', betInfo);

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

      // Refresh wallet balance
      walletStore.refreshBalance();

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
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.COMPLETED,
          data: {
            claimTxId: 'already-claimed',
            totalPayout: 0,
            isAutoClaimInProgress: undefined,
            note: 'Box not found - likely already claimed by background process'
          }
        });
        
        // Refresh wallet balance in case the claim was processed elsewhere
        walletStore.refreshBalance();
        
        return; // Early return to avoid the error handling below
      }
      
      // If this was a manual retry (claimRetryCount was reset), don't revert to READY_TO_CLAIM
      // Instead, keep as CLAIMING with error so user can retry again
      const isManualRetry = (spin.claimRetryCount || 0) === 0;
      
      queueStore.updateSpin({
        id: spin.id,
        status: isManualRetry ? SpinStatus.CLAIMING : SpinStatus.READY_TO_CLAIM,
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
        // Column-major positioning: first symbol at column 0, row payline[0]
        const firstPos = 0 * 3 + payline[0];
        const firstSymbol = gridString[firstPos];
        
        if (!['A', 'B', 'C', 'D'].includes(firstSymbol)) continue;

        let consecutiveCount = 1;
        for (let col = 1; col < 5; col++) {
          const pos = col * 3 + payline[col]; // Column-major: column * 3 + row
          if (gridString[pos] === firstSymbol) {
            consecutiveCount++;
          } else {
            break;
          }
        }

        if (consecutiveCount >= 3) {
          // Get multiplier from the contract (now with caching!)
          const multiplier = await algorandService.getPayoutMultiplier(firstSymbol, consecutiveCount, userAddress);
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