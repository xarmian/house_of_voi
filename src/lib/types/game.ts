export interface GameState {
  isPlaying: boolean;
  currentBet: number;
  selectedPaylines: number;
  totalBet: number;
  lastSpin: SpinResult | null;
  balance: number;
}

export interface SpinResult {
  id: string;
  betAmount: number;
  paylines: number;
  outcome: number[][];
  winnings: number;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface SlotSymbol {
  id: string;
  name: string;
  image: string;
  value: number;
  multipliers: {
    3: number;
    4: number;
    5: number;
  };
}