import type { SlotSymbol } from '$lib/types/symbols';

// Winning symbols (these can form winning combinations)
export const WINNING_SYMBOLS: Record<string, SlotSymbol> = {
  A: {
    id: 'A',
    name: 'diamond',
    displayName: 'Diamond',
    image: '/symbols/diamond.svg',
    rarity: 'legendary',
    multipliers: { 3: 50, 4: 200, 5: 1000 },
    color: '#3b82f6',
    glowColor: '#60a5fa'
  },
  B: {
    id: 'B',
    name: 'gold',
    displayName: 'Gold',
    image: '/symbols/gold.svg',
    rarity: 'rare',
    multipliers: { 3: 20, 4: 100, 5: 500 },
    color: '#f59e0b',
    glowColor: '#fbbf24'
  },
  C: {
    id: 'C',
    name: 'silver',
    displayName: 'Silver',
    image: '/symbols/silver.svg',
    rarity: 'uncommon',
    multipliers: { 3: 10, 4: 50, 5: 200 },
    color: '#6b7280',
    glowColor: '#9ca3af'
  },
  D: {
    id: 'D',
    name: 'bronze',
    displayName: 'Bronze',
    image: '/symbols/bronze.svg',
    rarity: 'common',
    multipliers: { 3: 5, 4: 20, 5: 100 },
    color: '#92400e',
    glowColor: '#d97706'
  }
};

// Decorative symbols (these are non-winning symbols for visual variety)
export const DECORATIVE_SYMBOLS: Record<string, SlotSymbol> = {
  boat: {
    id: 'boat',
    name: 'boat',
    displayName: 'Boat',
    image: '/symbols/boat.svg',
    rarity: 'common',
    multipliers: {},
    color: '#6b7280',
    glowColor: '#9ca3af'
  },
  clock: {
    id: 'clock',
    name: 'clock',
    displayName: 'Clock',
    image: '/symbols/clock.svg',
    rarity: 'common',
    multipliers: {},
    color: '#6b7280',
    glowColor: '#9ca3af'
  },
  bird: {
    id: 'bird',
    name: 'bird',
    displayName: 'Bird',
    image: '/symbols/bird.svg',
    rarity: 'common',
    multipliers: {},
    color: '#6b7280',
    glowColor: '#9ca3af'
  },
  star: {
    id: 'star',
    name: 'star',
    displayName: 'Star',
    image: '/symbols/star.svg',
    rarity: 'common',
    multipliers: {},
    color: '#6b7280',
    glowColor: '#9ca3af'
  },
  anchor: {
    id: 'anchor',
    name: 'anchor',
    displayName: 'Anchor',
    image: '/symbols/anchor.svg',
    rarity: 'common',
    multipliers: {},
    color: '#6b7280',
    glowColor: '#9ca3af'
  },
  crown: {
    id: 'crown',
    name: 'crown',
    displayName: 'Crown',
    image: '/symbols/crown.svg',
    rarity: 'common',
    multipliers: {},
    color: '#6b7280',
    glowColor: '#9ca3af'
  }
};

// All symbols combined
export const SLOT_SYMBOLS: Record<string, SlotSymbol> = {
  ...WINNING_SYMBOLS,
  ...DECORATIVE_SYMBOLS
};

// Use the main symbols directly (no more placeholders needed)
export const PLACEHOLDER_SYMBOLS: Record<string, SlotSymbol> = SLOT_SYMBOLS;

// Get symbol by ID with fallback to random decorative symbol
export function getSymbol(id: string): SlotSymbol {
  return SLOT_SYMBOLS[id] || getRandomDecorativeSymbol();
}

// Generate random symbol (for development/testing)
export function getRandomSymbol(): SlotSymbol {
  const symbolIds = Object.keys(SLOT_SYMBOLS);
  const randomId = symbolIds[Math.floor(Math.random() * symbolIds.length)];
  return getSymbol(randomId);
}

// Get a random decorative symbol (non-winning)
export function getRandomDecorativeSymbol(): SlotSymbol {
  const decorativeIds = Object.keys(DECORATIVE_SYMBOLS);
  const randomId = decorativeIds[Math.floor(Math.random() * decorativeIds.length)];
  return DECORATIVE_SYMBOLS[randomId];
}

// Get a random winning symbol
export function getRandomWinningSymbol(): SlotSymbol {
  const winningIds = Object.keys(WINNING_SYMBOLS);
  const randomId = winningIds[Math.floor(Math.random() * winningIds.length)];
  return WINNING_SYMBOLS[randomId];
}

// Get deterministic symbol based on position (modulo approach) - uses ALL symbols
export function getDeterministicSymbol(position: number): SlotSymbol {
  const allSymbolIds = Object.keys(SLOT_SYMBOLS);
  const symbolId = allSymbolIds[position % allSymbolIds.length];
  return SLOT_SYMBOLS[symbolId];
}

// Get deterministic symbol for reel initialization (combines reel and position) - uses ALL symbols
export function getDeterministicReelSymbol(reelIndex: number, symbolIndex: number): SlotSymbol {
  // Create a unique position by combining reel and symbol indices
  // This ensures different reels have different patterns but includes winning symbols
  const position = (reelIndex * 17 + symbolIndex) % Object.keys(SLOT_SYMBOLS).length;
  return getDeterministicSymbol(position);
}

// Check if a symbol is a winning symbol
export function isWinningSymbol(symbolId: string): boolean {
  return symbolId in WINNING_SYMBOLS;
}