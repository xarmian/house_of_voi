export interface SlotSymbol {
  id: string;
  name: string;
  displayName: string;
  image: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  multipliers: {
    3?: number;
    4?: number;
    5?: number;
  };
  color: string;
  glowColor: string;
}

export interface ReelPosition {
  reel: number;
  row: number;
  symbol: SlotSymbol;
}

export interface GameGrid {
  reels: SlotSymbol[][];
  visibleGrid: SlotSymbol[][]; // 5x3 visible portion
}

export interface SpinAnimation {
  reelIndex: number;
  duration: number;
  delay: number;
  finalSymbols: SlotSymbol[];
}

export interface SpinSequence {
  reelIndex: number;
  startDelay: number;
  spinDuration: number;
  settleDuration: number;
  finalSymbols: string[];
  physics: {
    acceleration: number;
    maxSpeed: number;
    deceleration: number;
    settleBounciness: number;
  };
}

export interface PaylineHighlight {
  paylineIndex: number;
  positions: ReelPosition[];
  winAmount: number;
  isActive: boolean;
}