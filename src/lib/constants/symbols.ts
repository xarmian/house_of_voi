import type { SlotSymbol } from '$lib/types/symbols';

export const SLOT_SYMBOLS: Record<string, SlotSymbol> = {
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
  },
  _: {
    id: '_',
    name: 'empty',
    displayName: 'Empty',
    image: '/symbols/empty.svg',
    rarity: 'common',
    multipliers: {},
    color: '#374151',
    glowColor: '#4b5563'
  }
};

// Placeholder symbol configuration for development
export const PLACEHOLDER_SYMBOLS: Record<string, SlotSymbol> = {
  A: {
    ...SLOT_SYMBOLS.A,
    image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iOCIgZmlsbD0iIzNiODJmNiIvPgo8dGV4dCB4PSIzMiIgeT0iNDAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5BPC90ZXh0Pgo8L3N2Zz4K'
  },
  B: {
    ...SLOT_SYMBOLS.B,
    image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iOCIgZmlsbD0iI2Y1OWUwYiIvPgo8dGV4dCB4PSIzMiIgeT0iNDAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5CPC90ZXh0Pgo8L3N2Zz4K'
  },
  C: {
    ...SLOT_SYMBOLS.C,
    image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iOCIgZmlsbD0iIzZiNzI4MCIvPgo8dGV4dCB4PSIzMiIgeT0iNDAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5DPC90ZXh0Pgo8L3N2Zz4K'
  },
  D: {
    ...SLOT_SYMBOLS.D,
    image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iOCIgZmlsbD0iIzkyNDAwZSIvPgo8dGV4dCB4PSIzMiIgeT0iNDAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5EPC90ZXh0Pgo8L3N2Zz4K'
  },
  _: {
    ...SLOT_SYMBOLS._,
    image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iOCIgZmlsbD0iIzM3NDE1MSIgc3Ryb2tlPSIjNGI1NTYzIiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+'
  }
};

// Get symbol by ID with fallback to placeholder
export function getSymbol(id: string): SlotSymbol {
  return PLACEHOLDER_SYMBOLS[id] || PLACEHOLDER_SYMBOLS['_'];
}

// Generate random symbol (for development/testing)
export function getRandomSymbol(): SlotSymbol {
  const symbolIds = Object.keys(PLACEHOLDER_SYMBOLS);
  const randomId = symbolIds[Math.floor(Math.random() * symbolIds.length)];
  return getSymbol(randomId);
}