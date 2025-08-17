// Phase 6: Game Queue System Types
// Mobile-first queue management for blockchain slot machine

export enum SpinStatus {
  PENDING = 'pending',           // Queued locally, not yet submitted
  SUBMITTING = 'submitting',     // Transaction being submitted
  WAITING = 'waiting',           // Waiting for commitment block
  PROCESSING = 'processing',     // Waiting for outcome block
  READY_TO_CLAIM = 'ready_to_claim', // Outcome available, can claim
  CLAIMING = 'claiming',         // Claim transaction submitting
  COMPLETED = 'completed',       // Fully completed with winnings
  FAILED = 'failed',             // Transaction failed
  EXPIRED = 'expired'            // Too old to claim
}

export interface QueuedSpin {
  id: string;
  timestamp: number;
  status: SpinStatus;
  
  // Bet details
  betPerLine: number;
  selectedPaylines: number;
  totalBet: number;
  
  // Blockchain details
  txId?: string;
  betKey?: string;
  commitmentRound?: number;
  outcomeRound?: number;
  
  // Results
  outcome?: string[][];
  winnings?: number;
  claimTxId?: string;
  
  // Error handling
  error?: string;
  retryCount: number;
  lastRetry?: number;
  claimRetryCount?: number;
  lastClaimRetry?: number;
  isAutoClaimInProgress?: boolean;
  isLosingSpinAutoClaim?: boolean;
}

export interface QueueState {
  spins: QueuedSpin[];
  isProcessing: boolean;
  totalPendingValue: number;
  lastUpdated: number;
}

export interface QueueStats {
  totalSpins: number;
  pendingSpins: number;
  completedSpins: number;
  failedSpins: number;
  totalWagered: number;
  totalWinnings: number;
  netProfit: number;
}

export interface SpinUpdate {
  id: string;
  status: SpinStatus;
  data?: Partial<QueuedSpin>;
}