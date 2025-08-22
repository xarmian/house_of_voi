// Utility functions for detecting winning paylines and preparing data for line highlighting

import { algorandService } from '$lib/services/algorand';
import { get } from 'svelte/store';
import { walletStore } from '$lib/stores/wallet';

export interface WinningPaylineData {
  paylineIndex: number;
  payline: number[];
  symbol: string;
  count: number;
  multiplier: number;
  winAmount: number;
}

/**
 * Analyze a grid outcome to detect winning paylines
 * This mirrors the logic from blockchain.ts calculateWinnings but returns detailed payline data
 */
export async function detectWinningPaylines(
  grid: string[][],
  betPerLine: number,
  selectedPaylines: number
): Promise<WinningPaylineData[]> {
  try {
    if (!algorandService) {
      throw new Error('AlgorandService not properly initialized');
    }

    const winningPaylines: WinningPaylineData[] = [];

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

    // Check each selected payline for wins
    for (let line = 0; line < Math.min(selectedPaylines, paylines.length); line++) {
      const payline = paylines[line];
      
      // Count occurrences of each symbol anywhere in the payline
      const symbolCounts: { [symbol: string]: number } = {
        'A': 0,
        'B': 0,
        'C': 0,
        'D': 0
      };

      // Check all positions in the payline
      for (let col = 0; col < 5; col++) {
        const pos = col * 3 + payline[col]; // Column-major: column * 3 + row
        const symbol = gridString[pos];
        
        if (['A', 'B', 'C', 'D'].includes(symbol)) {
          symbolCounts[symbol]++;
        }
      }

      // Find the symbol with the highest count (must be at least 3)
      let bestSymbol = '';
      let bestCount = 0;
      
      for (const symbol of ['A', 'B', 'C', 'D']) {
        if (symbolCounts[symbol] >= 3 && symbolCounts[symbol] > bestCount) {
          bestSymbol = symbol;
          bestCount = symbolCounts[symbol];
        }
      }

      // If we have a winning combination, get the multiplier and calculate winnings
      if (bestCount >= 3) {
        try {
          const multiplier = await algorandService.getPayoutMultiplier(bestSymbol, bestCount, userAddress);
          const winAmount = betPerLine * multiplier;
          
          winningPaylines.push({
            paylineIndex: line,
            payline: [...payline], // Copy the payline array
            symbol: bestSymbol,
            count: bestCount,
            multiplier,
            winAmount
          });
        } catch (error) {
          console.error(`Failed to get multiplier for ${bestSymbol}x${bestCount}:`, error);
          // Continue processing other paylines even if one fails
        }
      }
    }

    return winningPaylines;
  } catch (error) {
    console.error('Failed to detect winning paylines:', error);
    return [];
  }
}

/**
 * Extract symbols from grid positions along a payline for validation
 */
export function getPaylineSymbols(grid: string[][], payline: number[]): string[] {
  const symbols = [];
  
  for (let col = 0; col < Math.min(5, payline.length); col++) {
    const row = payline[col];
    if (row >= 0 && row < 3 && col >= 0 && col < grid.length) {
      symbols.push(grid[col][row]);
    }
  }
  
  return symbols;
}

/**
 * Get color scheme for different symbols (used by renderer)
 */
export function getSymbolColorScheme(symbol: string): { primary: string; glow: string } {
  const schemes = {
    'A': { primary: '#FFD700', glow: '#FFF700' }, // Gold - Diamond
    'B': { primary: '#C0C0C0', glow: '#E0E0E0' }, // Silver - Gold symbol
    'C': { primary: '#CD7F32', glow: '#FF9F42' }, // Bronze - Silver symbol
    'D': { primary: '#32CD32', glow: '#42FF42' }, // Green - Bronze symbol
  };
  
  return schemes[symbol] || { primary: '#FFFFFF', glow: '#FFFFFF' };
}

/**
 * Format payline data for debugging/logging
 */
export function formatPaylineDebugInfo(winningPaylines: WinningPaylineData[]): string {
  if (winningPaylines.length === 0) {
    return 'No winning paylines detected';
  }
  
  let debug = `Found ${winningPaylines.length} winning payline(s):\n`;
  
  winningPaylines.forEach((paylineData, index) => {
    debug += `  ${index + 1}. Payline ${paylineData.paylineIndex + 1}: ${paylineData.count}x ${paylineData.symbol} `;
    debug += `(${paylineData.multiplier}x multiplier) = ${paylineData.winAmount} microVOI\n`;
    debug += `     Path: [${paylineData.payline.join(', ')}]\n`;
  });
  
  return debug;
}