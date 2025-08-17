export interface BettingState {
  betPerLine: number; // In microVOI
  selectedPaylines: number;
  totalBet: number; // Calculated: betPerLine * selectedPaylines
  isValidBet: boolean;
  errors: string[];
  lastBet: BetHistory | null;
}

export interface BetHistory {
  betPerLine: number;
  selectedPaylines: number;
  totalBet: number;
  timestamp: number;
  outcome?: string;
}

export interface BettingLimits {
  minBetPerLine: number;
  maxBetPerLine: number;
  minPaylines: number;
  maxPaylines: number;
  maxTotalBet: number;
  walletBalance: number;
}

export interface BetValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}