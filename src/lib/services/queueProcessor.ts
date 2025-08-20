// Phase 6: Queue Processing Service  
// Background processing for blockchain spin lifecycle management

import { queueStore } from '$lib/stores/queue';
import { blockchainService } from './blockchain';
import { SpinStatus } from '$lib/types/queue';
import type { QueuedSpin } from '$lib/types/queue';

export class QueueProcessor {
  private processingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 2000); // Check every 2 seconds
  }

  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.isRunning = false;
  }

  private async processQueue() {
    // Get current queue state
    let currentSpins: QueuedSpin[] = [];
    
    const unsubscribe = queueStore.subscribe(state => {
      currentSpins = state.spins;
    });
    unsubscribe();

    // Process each spin based on its status (skip completed/failed spins)
    for (const spin of currentSpins) {
      // Skip spins that don't need processing
      if ([SpinStatus.COMPLETED, SpinStatus.FAILED, SpinStatus.EXPIRED].includes(spin.status)) {
        continue;
      }

      try {
        switch (spin.status) {
          case SpinStatus.PENDING:
            await this.submitSpin(spin);
            break;
          case SpinStatus.WAITING:
            await this.checkCommitment(spin);
            break;
          case SpinStatus.PROCESSING:
            await this.checkOutcome(spin);
            break;
          case SpinStatus.CLAIMING:
            await this.checkClaimStatus(spin);
            break;
          case SpinStatus.READY_TO_CLAIM:
            await this.attemptAutoClaim(spin);
            break;
          default:
            // No action needed for other statuses
            break;
        }
      } catch (error) {
        console.error(`Error processing spin ${spin.id}:`, error);
        this.handleSpinError(spin, error);
      }
    }
  }

  private async submitSpin(spin: QueuedSpin) {
    try {
      await blockchainService.submitSpin(spin);
    } catch (error) {
      console.error(`Error submitting spin ${spin.id}:`, error);
      this.handleSpinError(spin, error);
    }
  }

  private async checkCommitment(spin: QueuedSpin) {
    if (!spin.commitmentRound) return;

    try {
      const currentRound = await blockchainService.getCurrentRound();
      
      if (currentRound >= spin.commitmentRound) {
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.PROCESSING,
          data: {
            outcomeRound: currentRound + 1
          }
        });
      }
    } catch (error) {
      console.error(`Error checking commitment for spin ${spin.id}:`, error);
    }
  }

  private async checkOutcome(spin: QueuedSpin) {
    try {
      // TIMEOUT MECHANISM: Check if spin has been PROCESSING too long (5 minutes)
      const PROCESSING_TIMEOUT = 5 * 60 * 1000; // 5 minutes
      const timeInProcessing = Date.now() - spin.timestamp;
      
      if (timeInProcessing > PROCESSING_TIMEOUT) {
        console.warn(`⏰ Spin ${spin.id} has been PROCESSING for ${Math.round(timeInProcessing / 1000)}s, marking as failed`);
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.FAILED,
          data: {
            error: 'Processing timeout - please try again'
          }
        });
        return;
      }

      await blockchainService.checkBetOutcome(spin);
    } catch (error) {
      console.error(`Error checking outcome for spin ${spin.id}:`, error);
      this.handleSpinError(spin, error);
    }
  }

  private async checkClaimStatus(spin: QueuedSpin) {
    if (!spin.claimTxId) return;
    
    try {
      const txStatus = await blockchainService.checkTransactionStatus(spin.claimTxId);
      if (txStatus.confirmed) {
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.COMPLETED
        });
      } else if (txStatus.failed) {
        // Transaction failed, reset to READY_TO_CLAIM for retry
        console.log(`❌ Claim transaction failed for spin ${spin.id}, resetting for retry`);
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.READY_TO_CLAIM,
          data: {
            error: 'Claim transaction failed, will retry automatically',
            claimTxId: undefined, // Clear failed transaction ID
            isAutoClaimInProgress: undefined
          }
        });
      }
      // If still pending, do nothing and check again later
    } catch (error) {
      console.error(`Error checking claim status for spin ${spin.id}:`, error);
      // On error checking status, reset to ready for retry
      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.READY_TO_CLAIM,
        data: {
          error: 'Failed to check claim status, will retry',
          isAutoClaimInProgress: undefined
        }
      });
    }
  }

  private async attemptAutoClaim(spin: QueuedSpin) {
    const currentTime = Date.now();
    const claimRetryCount = spin.claimRetryCount || 0;
    const lastClaimRetry = spin.lastClaimRetry || 0;
    
    // Don't auto-claim if we've already tried 3 times
    if (claimRetryCount >= 3) {
      console.log(`Auto-claim disabled for spin ${spin.id} after ${claimRetryCount} attempts. Manual claim required.`);
      return;
    }
    
    // Don't retry too frequently (wait at least 5 seconds between attempts)
    if (lastClaimRetry && (currentTime - lastClaimRetry) < 5000) {
      return;
    }
    
    try {
      console.log(`Attempting auto-claim for spin ${spin.id} (attempt ${claimRetryCount + 1}/3)`);
      
      // Update retry tracking and mark as auto-claiming before attempting
      queueStore.updateSpin({
        id: spin.id,
        data: {
          claimRetryCount: claimRetryCount + 1,
          lastClaimRetry: currentTime,
          isAutoClaimInProgress: true
        }
      });
      
      await this.submitClaim(spin, true); // Pass true for auto-claim
      console.log(`Auto-claim submitted successfully for spin ${spin.id}`);
      
    } catch (error) {
      console.error(`Auto-claim attempt ${claimRetryCount + 1} failed for spin ${spin.id}:`, error);
      
      if (claimRetryCount + 1 >= 3) {
        console.log(`Auto-claim disabled for spin ${spin.id} after ${claimRetryCount + 1} failed attempts. Manual claim required.`);
        // After 3 failed attempts, mark as ready to claim with error for manual intervention
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.READY_TO_CLAIM,
          data: {
            error: `Auto-claim failed after ${claimRetryCount + 1} attempts. Manual claim required.`,
            isAutoClaimInProgress: undefined
          }
        });
      } else {
        // For attempts < 3, reset to READY_TO_CLAIM so it can be retried
        console.log(`Will retry auto-claim for spin ${spin.id} in 5 seconds (attempt ${claimRetryCount + 1}/3)`);
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.READY_TO_CLAIM,
          data: {
            error: `Auto-claim attempt ${claimRetryCount + 1} failed, will retry automatically`,
            isAutoClaimInProgress: undefined
          }
        });
      }
    }
  }

  private handleSpinError(spin: QueuedSpin, error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    queueStore.updateSpin({
      id: spin.id,
      status: SpinStatus.FAILED,
      data: {
        error: errorMessage
      }
    });
  }

  /**
   * Check if we should submit a claim transaction for a spin
   * This is called by the GameQueue component when user clicks claim
   */
  async submitClaim(spin: QueuedSpin, isAutoClaim: boolean = false): Promise<void> {
    await blockchainService.submitClaim(spin, isAutoClaim);
  }

  /**
   * Get current network status
   */
  async getNetworkStatus() {
    return await blockchainService.getNetworkStatus();
  }
}

// Singleton instance
export const queueProcessor = new QueueProcessor();