// Phase 6: Queue Processing Service  
// Background processing for blockchain spin lifecycle management

import { queueStore } from '$lib/stores/queue';
import { blockchainService } from './blockchain';
import { SpinStatus } from '$lib/types/queue';
import type { QueuedSpin } from '$lib/types/queue';

export class QueueProcessor {
  private processingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private processingSpins = new Set<string>(); // Track spins currently being processed

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
    
    // Skip processing if queue is empty or only has completed/failed spins
    const activeSpins = currentSpins.filter(spin => 
      ![SpinStatus.COMPLETED, SpinStatus.FAILED, SpinStatus.EXPIRED].includes(spin.status)
    );
    
    if (activeSpins.length === 0) {
      return; // Nothing to process
    }

    // Process all spins in parallel - don't block claims while waiting for other spins
    const processingPromises = currentSpins
      .filter(spin => ![SpinStatus.COMPLETED, SpinStatus.FAILED, SpinStatus.EXPIRED].includes(spin.status))
      .map(async (spin) => {
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
      });

    // Wait for all spins to process in parallel
    await Promise.allSettled(processingPromises);
  }

  private async submitSpin(spin: QueuedSpin) {
    // Check if we need to wait for retry delay (3 seconds as requested)
    const retryDelay = 3000; // 3 seconds
    const lastRetry = spin.lastRetry || 0;
    const currentTime = Date.now();
    const timeSinceLastRetry = currentTime - lastRetry;
    
    // If this is a retry attempt and not enough time has passed, skip for now
    if (spin.retryCount && spin.retryCount > 0 && timeSinceLastRetry < retryDelay) {
      const remainingWait = Math.ceil((retryDelay - timeSinceLastRetry) / 1000);
      console.log(`⏳ Waiting ${remainingWait}s before retry attempt ${spin.retryCount} for spin ${spin.id.slice(-8)}`);
      return;
    }
    
    try {
      // Log retry attempt if applicable
      if (spin.retryCount && spin.retryCount > 0) {
        console.log(`🔄 Executing retry attempt ${spin.retryCount}/3 for spin ${spin.id.slice(-8)}`);
      }
      
      await blockchainService.submitSpin(spin);
    } catch (error) {
      console.error(`Error submitting spin ${spin.id}:`, error);
      this.handleSpinError(spin, error);
    }
  }

  private async checkCommitment(spin: QueuedSpin) {
    if (!spin.commitmentRound) return;

    // Check if this spin is already being processed
    if (this.processingSpins.has(spin.id)) {
      return; // Skip if already processing
    }

    // Add to processing set
    this.processingSpins.add(spin.id);

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
    } finally {
      // Always remove from processing set when done
      this.processingSpins.delete(spin.id);
    }
  }

  private async checkOutcome(spin: QueuedSpin) {
    // Check if this spin is already being processed
    if (this.processingSpins.has(spin.id)) {
      return; // Skip if already processing
    }

    // Add to processing set
    this.processingSpins.add(spin.id);

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
    } finally {
      // Always remove from processing set when done
      this.processingSpins.delete(spin.id);
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
    // Check if this spin is already being processed
    if (this.processingSpins.has(spin.id)) {
      return; // Skip if already processing
    }

    // Add to processing set
    this.processingSpins.add(spin.id);

    const claimRetryCount = spin.claimRetryCount || 0;
    const lastClaimRetry = spin.lastClaimRetry || 0;

    try {
      const currentTime = Date.now();
      
      // Don't auto-claim if we've already tried 3 times - just give up silently
      if (claimRetryCount >= 3) {
        console.log(`Auto-claim completed for spin ${spin.id} after ${claimRetryCount} attempts. Likely claimed by bot (good!).`);

        // Mark as completed since claim failures usually mean someone else claimed it
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.COMPLETED
        });
        return;
      }
      
      // Wait 10-20 seconds between claim attempts (random to avoid collision with bots)
      const minWait = 10000; // 10 seconds
      const maxWait = 20000; // 20 seconds
      const randomWait = minWait + Math.random() * (maxWait - minWait);
      
      if (lastClaimRetry && (currentTime - lastClaimRetry) < randomWait) {
        return;
      }
      
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
        console.log(`Auto-claim completed for spin ${spin.id} after ${claimRetryCount + 1} attempts. Likely claimed by bot (good!).`);
        // After 3 failed attempts, just mark as completed - failures usually mean someone else claimed it
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.COMPLETED,
          data: {
            isAutoClaimInProgress: undefined
          }
        });
      } else {
        // For attempts < 3, reset to READY_TO_CLAIM so it can be retried with proper spacing
        console.log(`Will retry auto-claim for spin ${spin.id} in 10-20 seconds (attempt ${claimRetryCount + 1}/3)`);
        queueStore.updateSpin({
          id: spin.id,
          status: SpinStatus.READY_TO_CLAIM,
          data: {
            isAutoClaimInProgress: undefined,
            // KEEP the retry tracking fields that were just set
            claimRetryCount: claimRetryCount + 1,
            lastClaimRetry: Date.now()
          }
        });
      }
    } finally {
      // Always remove from processing set when done
      this.processingSpins.delete(spin.id);
    }
  }

  private handleSpinError(spin: QueuedSpin, error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const currentRetryCount = spin.retryCount || 0;
    const maxRetries = 3;
    
    // Only retry for submission failures (PENDING/SUBMITTING status)
    const isSubmissionFailure = [SpinStatus.PENDING, SpinStatus.SUBMITTING].includes(spin.status);
    
    if (isSubmissionFailure && currentRetryCount < maxRetries) {
      // Retry the spin - increment count and reset to PENDING with delay tracking
      const newRetryCount = currentRetryCount + 1;
      console.log(`🔄 Retrying spin ${spin.id.slice(-8)} (attempt ${newRetryCount}/${maxRetries}) after error: ${errorMessage}`);
      
      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.PENDING, // Reset to pending for retry
        data: {
          retryCount: newRetryCount,
          lastRetry: Date.now(),
          error: `Retry ${newRetryCount}/${maxRetries}: ${errorMessage}` // Keep error history
        }
      });
    } else {
      // Max retries exhausted or not a submission failure - mark as failed
      if (isSubmissionFailure) {
        console.log(`❌ Spin ${spin.id.slice(-8)} failed after ${currentRetryCount} retry attempts: ${errorMessage}`);
      }
      
      queueStore.updateSpin({
        id: spin.id,
        status: SpinStatus.FAILED,
        data: {
          error: errorMessage
        }
      });
    }
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