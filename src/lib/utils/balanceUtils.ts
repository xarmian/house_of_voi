// Balance Utility Functions
// Helper functions for balance calculations, pending spin management, and MBR handling

import type { QueuedSpin } from '$lib/types/queue';
import { SpinStatus } from '$lib/types/queue';

/**
 * Check if a spin is recent enough to be considered "active"
 * Spins older than 5 minutes are considered potentially stuck/abandoned
 */
export function isRecentSpin(timestamp: number): boolean {
  const ACTIVE_SPIN_THRESHOLD = 300_000; // 5 minutes in milliseconds
  return Date.now() - timestamp < ACTIVE_SPIN_THRESHOLD;
}

/**
 * Filter spins to only include those that are actively pending and should have funds reserved
 */
export function filterActivePendingSpins(spins: QueuedSpin[]): QueuedSpin[] {
  return spins.filter(spin => 
    // Must be in an active processing state
    [SpinStatus.PENDING, SpinStatus.SUBMITTING, SpinStatus.WAITING, SpinStatus.PROCESSING].includes(spin.status) &&
    // Must be recent (not stuck/abandoned)
    isRecentSpin(spin.timestamp)
  );
}

/**
 * Filter spins to only include those that are old and potentially stuck
 */
export function filterStuckSpins(spins: QueuedSpin[]): QueuedSpin[] {
  return spins.filter(spin => 
    [SpinStatus.PENDING, SpinStatus.SUBMITTING, SpinStatus.WAITING, SpinStatus.PROCESSING].includes(spin.status) &&
    !isRecentSpin(spin.timestamp)
  );
}

/**
 * Calculate buffer amount for MBR fluctuations
 */
export function calculateMbrBuffer(): number {
  const MBR_BUFFER = 100_000; // 0.1 VOI buffer for MBR changes
  return MBR_BUFFER;
}

/**
 * Calculate estimated total transaction cost for a spin (used when actual cost isn't available)
 */
export function estimateSpinTransactionCost(betPerLine: number, paylines: number): number {
  // Contract costs
  const SPIN_COST = 50500;
  const PAYLINE_COST = 30000;
  const BOX_STORAGE_COST = 28500;
  
  // Network and other fees (conservative estimate)
  const ESTIMATED_NETWORK_FEES = 15000; // ~0.015 VOI
  const SAFETY_MARGIN = 50000; // ~0.05 VOI extra margin
  
  const betAmount = betPerLine * paylines;
  const contractCosts = SPIN_COST + (PAYLINE_COST * paylines);
  
  return betAmount + contractCosts + BOX_STORAGE_COST + ESTIMATED_NETWORK_FEES + SAFETY_MARGIN;
}

/**
 * Calculate total reserved balance for active pending spins
 */
export function calculateReservedBalance(pendingSpins: QueuedSpin[]): number {
  const activeSpins = filterActivePendingSpins(pendingSpins);
  
  return activeSpins.reduce((total, spin) => {
    // Use stored estimated cost if available, otherwise estimate
    if (spin.estimatedTotalCost) {
      return total + spin.estimatedTotalCost;
    }
    
    // Fallback estimation
    return total + estimateSpinTransactionCost(spin.betPerLine, spin.selectedPaylines);
  }, 0);
}

/**
 * Check if a wallet balance is sufficient for basic operations (considering MBR)
 */
export function hasMinimumOperatingBalance(balance: number, accountMbr: number = 100000): boolean {
  const MINIMUM_OPERATING_BUFFER = 200000; // 0.2 VOI buffer above MBR
  return balance > (accountMbr + MINIMUM_OPERATING_BUFFER);
}

/**
 * Format balance amount for display with appropriate precision
 */
export function formatBalance(microVOI: number, precision: number = 6): string {
  return (microVOI / 1_000_000).toFixed(precision);
}

/**
 * Format balance amount for display with smart precision (fewer decimals for larger amounts)
 */
export function formatBalanceSmartPrecision(microVOI: number): string {
  const voi = microVOI / 1_000_000;
  
  if (voi >= 1000) {
    return voi.toFixed(2); // 1000+ VOI: show 2 decimals
  } else if (voi >= 100) {
    return voi.toFixed(3); // 100-999 VOI: show 3 decimals
  } else if (voi >= 1) {
    return voi.toFixed(4); // 1-99 VOI: show 4 decimals
  } else {
    return voi.toFixed(6); // <1 VOI: show full precision
  }
}

/**
 * Calculate the effective available balance after accounting for reserved funds
 */
export function calculateAvailableBalance(totalBalance: number, pendingSpins: QueuedSpin[]): number {
  const reservedBalance = calculateReservedBalance(pendingSpins);
  return Math.max(0, totalBalance - reservedBalance);
}

/**
 * Get a human-readable description of why a balance is insufficient
 */
export function getInsufficientBalanceReason(
  required: number, 
  available: number, 
  reserved: number,
  breakdown?: { label: string; amount: number; description: string }[]
): string {
  const shortfall = required - available;
  let reason = `Need ${formatBalanceSmartPrecision(shortfall)} more VOI. `;
  
  if (reserved > 0) {
    reason += `(${formatBalanceSmartPrecision(reserved)} VOI currently reserved for pending spins) `;
  }
  
  if (breakdown && breakdown.length > 0) {
    const majorCosts = breakdown
      .filter(item => item.amount > shortfall * 0.1) // Only show costs >10% of shortfall
      .slice(0, 3) // Top 3 costs
      .map(item => `${item.label}: ${formatBalanceSmartPrecision(item.amount)} VOI`)
      .join(', ');
    
    if (majorCosts) {
      reason += `Main costs: ${majorCosts}`;
    }
  }
  
  return reason.trim();
}

/**
 * Check if the current time is within a "busy period" where extra buffer might be needed
 */
export function isNetworkBusyPeriod(): boolean {
  // This could be enhanced with actual network congestion detection
  // For now, just use time-based heuristics (peak hours, etc.)
  const hour = new Date().getUTCHours();
  
  // Assume busy periods: 12-14 UTC (noon in major timezones) and 20-22 UTC (evening)
  return (hour >= 12 && hour <= 14) || (hour >= 20 && hour <= 22);
}

/**
 * Get recommended buffer amount based on network conditions
 */
export function getRecommendedBuffer(baseBuffer: number = 1_000_000): number {
  if (isNetworkBusyPeriod()) {
    return Math.floor(baseBuffer * 1.5); // 50% more during busy periods
  }
  return baseBuffer;
}

/**
 * Validate that a bet amount makes sense relative to wallet balance
 */
export function validateBetSizing(betAmount: number, walletBalance: number): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  const betPercentage = (betAmount / walletBalance) * 100;
  
  if (betPercentage > 50) {
    warnings.push(`This bet is ${betPercentage.toFixed(1)}% of your total balance`);
  }
  
  if (betPercentage > 80) {
    warnings.push('Consider reducing your bet size to preserve funds for transaction fees');
  }
  
  if (betAmount < 1_000_000) { // Less than 1 VOI
    warnings.push('Very small bets may not be cost-effective due to transaction fees');
  }
  
  return {
    isValid: betPercentage <= 90, // Don't allow bets >90% of balance
    warnings
  };
}