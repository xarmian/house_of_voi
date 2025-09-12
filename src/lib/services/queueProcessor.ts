// Simplified FIFO Queue Processor
// Processes exactly one spin at a time in FIFO order.

import { queueStore } from '$lib/stores/queue';
import { blockchainService } from './blockchain';
import { SpinStatus } from '$lib/types/queue';
import type { QueuedSpin } from '$lib/types/queue';

export class QueueProcessor {
  private isRunning = false;
  private unsubscribe: (() => void) | null = null;
  private processingSpins = new Set<string>();
  private isDisplaying = false;
  private displayed = new Set<string>();
  private enteredOrder: string[] = [];
  private sessionStart = Date.now();

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.sessionStart = Date.now();
    // React to queue changes to keep things simple and responsive
    this.unsubscribe = queueStore.subscribe((state) => {
      // Append any new session spins to enteredOrder without reordering existing entries
      const sessionSpins = state.spins
        .filter((s) => s.timestamp >= this.sessionStart)
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((s) => s.id);
      for (const id of sessionSpins) {
        if (!this.enteredOrder.includes(id)) {
          this.enteredOrder.push(id);
        }
      }

      this.maybeKickProcessing();
      this.maybeDisplayNext();
    });
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.isRunning = false;
  }

  checkQueue() {
    // Trigger an immediate check without waiting for store updates
    this.maybeKickProcessing();
    this.maybeDisplayNext();
  }

  private getQueueSnapshot(): QueuedSpin[] {
    let spins: QueuedSpin[] = [];
    const unsub = queueStore.subscribe((state) => {
      spins = state.spins.slice();
    });
    unsub();
    return spins;
  }

  private maybeKickProcessing() {
    if (!this.isRunning) return;
    const spins = this.getQueueSnapshot();
    // Pick all spins not terminal; process concurrently when not already processing
    const candidates = spins.filter(
      (s) => ![SpinStatus.FAILED, SpinStatus.EXPIRED, SpinStatus.COMPLETED].includes(s.status)
    );
    for (const s of candidates) {
      if (this.processingSpins.has(s.id)) continue;
      if (s.status === SpinStatus.PENDING) {
        // Start processing this pending spin
        this.processSpin(s.id);
      } else if (s.status === SpinStatus.WAITING || s.status === SpinStatus.PROCESSING || s.status === SpinStatus.READY_TO_CLAIM || s.status === SpinStatus.CLAIMING || s.status === SpinStatus.SUBMITTING) {
        // Continue monitoring spins already in-flight
        this.processSpin(s.id);
      }
    }
  }

  private async processSpin(spinId: string) {
    this.processingSpins.add(spinId);
    try {
      // Grab a fresh snapshot each step
      let spin = this.getQueueSnapshot().find((x) => x.id === spinId);
      if (!spin) return;

      // If a previous submission is stuck in SUBMITTING too long, retry or fail
      if (spin.status === SpinStatus.SUBMITTING) {
        const now = Date.now();
        const since = now - (spin.lastRetry || spin.timestamp);
        const maxSubmitRetries = 2;
        if (since > 15000) { // 15s without progress
          const nextRetry = (spin.retryCount || 0) + 1;
          if (nextRetry <= maxSubmitRetries) {
            queueStore.updateSpin({
              id: spin.id,
              status: SpinStatus.PENDING,
              data: {
                retryCount: nextRetry,
                lastRetry: now,
                error: 'Submission stalled; retrying'
              }
            });
          } else {
            queueStore.updateSpin({
              id: spin.id,
              status: SpinStatus.FAILED,
              data: { error: 'Submission stalled; max retries exceeded' }
            });
          }
          return; // End this processing pass; will be re-picked
        }
      }

      // Submit if still pending
      if (spin.status === SpinStatus.PENDING) {
        try {
          await blockchainService.submitSpin(spin);
        } catch (e: any) {
          const msg = (e && (e.message || e.toString())) || 'submit error';
          const now = Date.now();
          const maxSubmitRetries = 2;
          // Special case: already in ledger → treat as submitted; move to WAITING
          if (/already in ledger/i.test(msg)) {
            queueStore.updateSpin({ id: spin.id, status: SpinStatus.WAITING });
          } else {
            const nextRetry = (spin.retryCount || 0) + 1;
            if (nextRetry <= maxSubmitRetries) {
              queueStore.updateSpin({
                id: spin.id,
                status: SpinStatus.PENDING,
                data: { retryCount: nextRetry, lastRetry: now, error: msg }
              });
            } else {
              queueStore.updateSpin({ id: spin.id, status: SpinStatus.FAILED, data: { error: msg } });
            }
          }
          return; // End this processing pass; state updated, will be re-picked
        }
      }

      // Wait for outcome (or terminal)
      await this.waitForSpinState(
        spinId,
        (s) => (!!s.outcome) || s.status === SpinStatus.FAILED || s.status === SpinStatus.EXPIRED,
        5 * 60 * 1000
      );

      spin = this.getQueueSnapshot().find((x) => x.id === spinId);
      if (!spin) return;
      if (!spin.outcome || [SpinStatus.FAILED, SpinStatus.EXPIRED].includes(spin.status)) return;

      // Mark completed in background; reveal is strictly handled by maybeDisplayNext (FIFO)
      await this.sleep(10);
      queueStore.updateSpin({ id: spin.id, status: SpinStatus.COMPLETED });
      this.maybeDisplayNext();
    } finally {
      this.processingSpins.delete(spinId);
    }
  }

  // Compatibility method (no-op path now)
  private getHeadOfLineId(): string | null { return null; }

  private async submitAndAwaitOutcome(spin: QueuedSpin) {
    // Keep trying submission respecting basic retry semantics already baked into blockchainService + store
    try {
      await blockchainService.submitSpin(spin);
    } catch (e) {
      // Submission error: rely on store retry logic; if it transitions to FAILED, we'll move on
    }

    // Wait for this spin to reach READY_TO_CLAIM or a terminal failure
    await this.waitForSpinState(
      spin.id,
      (s) => {
        return (!!s.outcome) || s.status === SpinStatus.FAILED || s.status === SpinStatus.EXPIRED;
      },
      5 * 60 * 1000 // Safety timeout 5 minutes
    );
  }

  private async displayOutcomeAndComplete(spin: QueuedSpin) {
    // Notify SlotMachine to render the outcome
    document.dispatchEvent(
      new CustomEvent('display-spin-outcome', {
        detail: {
          spin,
          outcome: spin.outcome,
          winnings: spin.winnings || 0,
          betAmount: spin.totalBet,
        },
      })
    );

    // Do not block on UI animations here. Caller decides completion.
  }

  private enqueueForDisplay(_spinId: string) { /* simplified path no longer uses this */ }

  private async maybeDisplayNext() {
    if (this.isDisplaying) return;
    const snapshot = this.getQueueSnapshot();

    // Enforce strict FIFO gating: find first undispayed spin in entered order
    // Skip over earlier spins that are terminal (failed/expired/completed)
    let nextId: string | null = null;
    for (const id of this.enteredOrder) {
      if (this.displayed.has(id)) continue;
      const s = snapshot.find((x) => x.id === id);
      if (!s) { this.displayed.add(id); continue; }
      if ([SpinStatus.FAILED, SpinStatus.EXPIRED].includes(s.status)) { this.displayed.add(id); continue; }
      if (!!s.outcome) { nextId = id; break; }
      // The head-of-line is not ready yet; wait
      return;
    }
    if (!nextId) return;

    // Immediate path removed; single visual path handles all spins

    // Confirm spin still exists and has outcome
    const spin = this.getQueueSnapshot().find((s) => s.id === nextId);
    if (!spin || !spin.outcome) {
      // Remove invalid and continue
      this.visualQueue.shift();
      this.maybeDisplayNext();
      return;
    }

    this.isDisplaying = true;
    try {
      // Always start the spin animation for this spin
      document.dispatchEvent(new CustomEvent('start-spin-animation', { detail: { spinId: spin.id } }));
      
      // For subsequent spins, add delay to allow animation
      if (this.displayed.size > 0) {
        const revealMs = 2200; // 2.2s abbreviated spin
        await this.sleep(revealMs);
      }

      // Reveal outcome and celebration
      // Mark as displayed up front and set revealed flag so UI switches from Confirming to Completed
      this.displayed.add(spin.id);
      queueStore.updateSpin({ id: spin.id, status: spin.status, data: { revealed: true } });
      await this.displayOutcomeAndComplete(spin);

      // Mark as displayed
      this.displayed.add(spin.id);
      // Small gap to avoid visual overlap (slightly longer for clarity)
      await this.sleep(1200);
    } finally {
      this.isDisplaying = false;
      // Continue with any remaining displays
      this.maybeDisplayNext();
    }
  }

  private waitForSpinState(
    spinId: string,
    predicate: (s: QueuedSpin) => boolean,
    timeoutMs: number
  ): Promise<void> {
    return new Promise((resolve) => {
      const start = Date.now();
      let finished = false;

      const check = () => {
        const s = this.getQueueSnapshot().find((x) => x.id === spinId);
        if (!s) {
          finished = true;
          resolve();
          return;
        }
        if (predicate(s)) {
          finished = true;
          resolve();
          return;
        }
        if (Date.now() - start > timeoutMs) {
          finished = true;
          resolve();
          return;
        }
      };

      const unsub = queueStore.subscribe(() => {
        if (!finished) check();
      });

      // Initial check in case it's already satisfied
      check();

      // Ensure cleanup when resolved
      const finish = () => {
        if (unsub) unsub();
      };
      const originalResolve = resolve as any;
      const wrapped = () => {
        finish();
        originalResolve();
      };
      // Replace resolve in this closure scope
      // @ts-ignore
      resolve = wrapped;
    });
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Public helpers preserved for compatibility
  async submitClaim(spin: QueuedSpin, isAutoClaim: boolean = false): Promise<void> {
    await blockchainService.submitClaim(spin, isAutoClaim);
  }

  async getNetworkStatus() {
    return await blockchainService.getNetworkStatus();
  }

  markSpinAsUserInitiated(spinId: string) {
    if (!this.enteredOrder.includes(spinId)) {
      this.enteredOrder.push(spinId);
    }
  }

  // Emergency cleanup
  forceCleanupAllSpins() {
    this.processingSpins.clear();
    this.visualQueue = [];
    this.displayed.clear();
    this.enteredOrder = [];
    queueStore.clearOldSpins(0);
  }

  // Compatibility: called by UI if needed
  onAnimationStart(_spinId: string) {
    // No-op; SlotMachine drives animations based on events
  }

  onAnimationComplete(spinId: string) {
    queueStore.updateSpin({ id: spinId, status: SpinStatus.COMPLETED });
  }
}

// Singleton instance
export const queueProcessor = new QueueProcessor();

// Export for emergency cleanup (can be called from console)
if (typeof window !== 'undefined') {
  (window as any).forceCleanupQueue = () => queueProcessor.forceCleanupAllSpins();
}
