// Enhanced Balance Calculator Service
// Comprehensive balance validation accounting for all transaction costs, pending spins, and MBR requirements

import { algorandService } from './algorand';
import { get } from 'svelte/store';
import { pendingSpins } from '$lib/stores/queue';
import { walletStore } from '$lib/stores/wallet';
import { BLOCKCHAIN_CONFIG } from '$lib/constants/network';
import { filterActivePendingSpins, calculateMbrBuffer } from '$lib/utils/balanceUtils';

export interface BalanceRequirement {
  betAmount: number;
  contractCosts: number;
  networkFees: number;
  accountMbr: number;
  boxStorage: number;
  pendingReserved: number;
  buffer: number;
  totalRequired: number;
  availableAfterReserved: number;
  breakdown: BalanceCostBreakdown[];
}

export interface BalanceCostBreakdown {
  label: string;
  amount: number;
  description: string;
}

export class BalanceCalculator {
  // Contract cost constants (from smart contract analysis)
  private static readonly SPIN_COST = 50500; // microVOI per spin
  private static readonly PAYLINE_COST = 30000; // microVOI per payline
  private static readonly BOX_STORAGE_COST = 28500; // microVOI for bet storage
  private static readonly SAFETY_BUFFER = 1_000_000; // 1 VOI buffer
  private static readonly MBR_BUFFER = 100_000; // 0.1 VOI for MBR fluctuations

  /**
   * Calculate comprehensive balance requirements for a spin
   */
  async calculateRequiredBalance(
    betPerLine: number, 
    paylines: number, 
    userAddress: string,
    currentWalletBalance: number
  ): Promise<BalanceRequirement> {
    try {
      // Basic bet calculation
      const betAmount = betPerLine * paylines;

      // Contract costs
      const spinCost = BalanceCalculator.SPIN_COST;
      const paylineCost = BalanceCalculator.PAYLINE_COST * paylines;
      const contractCosts = spinCost + paylineCost;

      // Network transaction fees
      const networkFees = await this.calculateNetworkFees();

      // Account MBR requirements
      const accountMbr = await this.getAccountMbr(userAddress);

      // Box storage costs
      const boxStorage = BalanceCalculator.BOX_STORAGE_COST;

      // Pending spins reserved funds
      const pendingReserved = await this.calculatePendingReservedFunds();

      // Safety buffer
      const buffer = BalanceCalculator.SAFETY_BUFFER + BalanceCalculator.MBR_BUFFER;

      // Total calculation
      const totalRequired = betAmount + contractCosts + networkFees + accountMbr + boxStorage + buffer;
      const availableAfterReserved = currentWalletBalance - pendingReserved;

      // Detailed breakdown for user display
      const breakdown: BalanceCostBreakdown[] = [
        {
          label: 'Bet Amount',
          amount: betAmount,
          description: `${(betPerLine / 1_000_000).toFixed(6)} VOI per line × ${paylines} paylines`
        },
        {
          label: 'Contract Fees',
          amount: contractCosts,
          description: `Spin processing (${(spinCost / 1_000_000).toFixed(3)} VOI) + Payline fees (${(paylineCost / 1_000_000).toFixed(3)} VOI)`
        },
        {
          label: 'Network Fees',
          amount: networkFees,
          description: 'Transaction fees for blockchain submission'
        },
        {
          label: 'Account MBR',
          amount: accountMbr,
          description: 'Minimum balance requirement for account operations'
        },
        {
          label: 'Box Storage',
          amount: boxStorage,
          description: 'Storage cost for bet data on blockchain'
        },
        {
          label: 'Safety Buffer',
          amount: buffer,
          description: 'Buffer for network fee fluctuations and claim winnings'
        }
      ];

      if (pendingReserved > 0) {
        breakdown.push({
          label: 'Reserved (Pending)',
          amount: pendingReserved,
          description: 'Funds reserved for active pending spins'
        });
      }

      return {
        betAmount,
        contractCosts,
        networkFees,
        accountMbr,
        boxStorage,
        pendingReserved,
        buffer,
        totalRequired,
        availableAfterReserved,
        breakdown
      };

    } catch (error) {
      console.error('Enhanced balance calculation failed:', error);
      // Fallback to simplified calculation
      return this.fallbackBalanceCalculation(betPerLine, paylines, currentWalletBalance);
    }
  }

  /**
   * Calculate network transaction fees
   */
  private async calculateNetworkFees(): Promise<number> {
    try {
      if (!algorandService) {
        throw new Error('AlgorandService not available');
      }

      const suggestedParams = await algorandService.getSuggestedParams();
      const baseFee = suggestedParams.minFee;
      
      // Estimate for grouped transactions (payment + spin call)
      const estimatedFees = baseFee * 3;
      
      // Cap at max extra payment limit
      return Math.min(estimatedFees, BLOCKCHAIN_CONFIG.maxExtraPayment);
    } catch (error) {
      console.error('Network fee calculation failed:', error);
      // Fallback to reasonable estimate
      return 10000; // 0.01 VOI fallback
    }
  }

  /**
   * Get account minimum balance requirement
   */
  private async getAccountMbr(userAddress: string): Promise<number> {
    try {
      if (!algorandService) {
        throw new Error('AlgorandService not available');
      }

      // Query account info to get current MBR
      const accountInfo = await algorandService.getClient().accountInformation(userAddress).do();
      const minBalance = accountInfo.minBalance || 100000; // Fallback to 0.1 VOI

      return minBalance + calculateMbrBuffer();
    } catch (error) {
      console.error('MBR calculation failed:', error);
      // Conservative fallback
      return 200000; // 0.2 VOI fallback
    }
  }

  /**
   * Calculate funds reserved by pending spins
   */
  private async calculatePendingReservedFunds(): Promise<number> {
    try {
      const activeSpins = filterActivePendingSpins(get(pendingSpins));
      
      return activeSpins.reduce((total, spin) => {
        // Estimate total cost for pending spin (bet + fees)
        const spinBetAmount = spin.betPerLine * spin.selectedPaylines;
        const estimatedTotalCost = spin.estimatedTotalCost || this.estimateSpinTotalCost(spinBetAmount, spin.selectedPaylines);
        return total + estimatedTotalCost;
      }, 0);
    } catch (error) {
      console.error('Pending reserved funds calculation failed:', error);
      return 0;
    }
  }

  /**
   * Estimate total cost for a spin (used for pending spin calculations)
   */
  private estimateSpinTotalCost(betAmount: number, paylines: number): number {
    const contractCosts = BalanceCalculator.SPIN_COST + (BalanceCalculator.PAYLINE_COST * paylines);
    const estimatedNetworkFees = 10000; // Conservative estimate
    const boxStorage = BalanceCalculator.BOX_STORAGE_COST;
    
    return betAmount + contractCosts + estimatedNetworkFees + boxStorage;
  }

  /**
   * Fallback calculation when enhanced calculation fails
   */
  private fallbackBalanceCalculation(
    betPerLine: number,
    paylines: number,
    currentWalletBalance: number
  ): BalanceRequirement {
    const betAmount = betPerLine * paylines;
    const estimatedOverhead = betAmount * 0.5; // 50% overhead estimate
    const totalRequired = betAmount + estimatedOverhead;

    return {
      betAmount,
      contractCosts: estimatedOverhead * 0.6,
      networkFees: estimatedOverhead * 0.1,
      accountMbr: estimatedOverhead * 0.2,
      boxStorage: estimatedOverhead * 0.1,
      pendingReserved: 0,
      buffer: BalanceCalculator.SAFETY_BUFFER,
      totalRequired,
      availableAfterReserved: currentWalletBalance,
      breakdown: [
        {
          label: 'Bet Amount',
          amount: betAmount,
          description: `${paylines} paylines at ${(betPerLine / 1_000_000).toFixed(6)} VOI each`
        },
        {
          label: 'Estimated Fees',
          amount: estimatedOverhead,
          description: 'Estimated contract and network fees (fallback calculation)'
        }
      ]
    };
  }

  /**
   * Check if user has sufficient balance for a spin
   */
  async validateSufficientBalance(
    betPerLine: number,
    paylines: number,
    userAddress: string,
    currentWalletBalance: number
  ): Promise<{ isValid: boolean; requirement: BalanceRequirement; errors: string[] }> {
    const requirement = await this.calculateRequiredBalance(betPerLine, paylines, userAddress, currentWalletBalance);
    const errors: string[] = [];

    if (currentWalletBalance < requirement.totalRequired) {
      const shortfall = requirement.totalRequired - currentWalletBalance;
      errors.push(
        `Insufficient Balance: Need ${(shortfall / 1_000_000).toFixed(2)} more VOI`
      );
    }

    if (requirement.pendingReserved > currentWalletBalance * 0.8) {
      errors.push(
        `Most of your balance (${(requirement.pendingReserved / 1_000_000).toFixed(6)} VOI) is reserved for pending spins`
      );
    }

    return {
      isValid: errors.length === 0,
      requirement,
      errors
    };
  }
}

// Singleton instance
export const balanceCalculator = new BalanceCalculator();