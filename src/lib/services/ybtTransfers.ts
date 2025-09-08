/**
 * YBT Transfers Service
 * Handles fetching user YBT transfer history and calculating profit/loss
 */

import { supabaseService } from './supabase';
import type {
  YBTTransaction,
  YBTTransferTotals,
  YBTTransfersData,
  YBTProfitLoss,
  GetUserYBTTransfersParams
} from '$lib/types/ybtTransfers';

class YBTTransfersService {
  /**
   * Fetch user YBT transfers from the database
   */
  async getUserYBTTransfers(params: GetUserYBTTransfersParams): Promise<YBTTransfersData> {
    try {
      // Ensure supabase is initialized
      await supabaseService.initialize();
      const client = supabaseService.getClient();
      
      const { data, error } = await client.rpc('get_user_ybt_transfers', {
        p_user_addr: params.userAddress,
        p_machine_app_id: params.machineAppId.toString(),
        p_ybt_app_id: params.ybtAppId.toString(),
        p_limit: params.limit || 1000,
        p_offset: params.offset || 0
      });

      if (error) throw error;

      // Convert string amounts to bigint
      const transactions: YBTTransaction[] = data.transactions.map((tx: any) => ({
        round: tx.round,
        intra: tx.intra,
        ts: tx.ts,
        txid: tx.txid,
        direction: tx.direction,
        amount: BigInt(tx.amount)
      }));

      const totals: YBTTransferTotals = {
        in: BigInt(data.totals.in),
        out: BigInt(data.totals.out),
        net: BigInt(data.totals.net)
      };

      return {
        transactions,
        totals
      };
    } catch (error) {
      console.error('Error fetching YBT transfers:', error);
      throw new Error('Failed to fetch YBT transfer history');
    }
  }

  /**
   * Calculate profit/loss based on transfers and current portfolio value
   */
  calculateProfitLoss(
    transfersData: YBTTransfersData,
    currentPortfolioValue: bigint
  ): YBTProfitLoss {
    const totalDeposited = transfersData.totals.in;
    const totalWithdrawn = transfersData.totals.out;
    const netDeposited = totalDeposited - totalWithdrawn;
    
    // Profit/Loss = Current Portfolio Value - Net Deposited Amount
    const profitLoss = currentPortfolioValue - netDeposited;
    
    // Calculate percentage: (Profit/Loss / Net Deposited) * 100
    // Handle edge case where net deposited is 0
    const profitLossPercentage = netDeposited === BigInt(0) 
      ? 0 
      : (Number(profitLoss * BigInt(10000)) / Number(netDeposited)) / 100;
    
    const isProfit = profitLoss >= BigInt(0);

    return {
      totalDeposited,
      totalWithdrawn,
      netDeposited,
      currentPortfolioValue,
      profitLoss,
      profitLossPercentage,
      isProfit
    };
  }

  /**
   * Format transfer amount for display
   */
  formatTransferAmount(amount: bigint): string {
    return (Number(amount) / 1_000_000).toFixed(6);
  }

  /**
   * Format profit/loss for display with appropriate sign
   */
  formatProfitLoss(profitLoss: bigint, isProfit: boolean): string {
    const formatted = this.formatTransferAmount(profitLoss);
    return isProfit ? `+${formatted}` : formatted;
  }

  /**
   * Format percentage with appropriate sign and color indication
   */
  formatProfitLossPercentage(percentage: number, isProfit: boolean): string {
    const formatted = Math.abs(percentage).toFixed(2);
    return isProfit ? `+${formatted}%` : `-${formatted}%`;
  }

  /**
   * Export transfers to CSV format
   */
  exportTransfersToCSV(transfers: YBTTransaction[]): string {
    const headers = ['Date', 'Time', 'Type', 'Amount (VOI)', 'Transaction ID'];
    const csvRows = [headers.join(',')];

    transfers.forEach(tx => {
      const date = new Date(tx.ts);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString();
      const type = tx.direction === 'in' ? 'Deposit' : 'Withdrawal';
      const amount = this.formatTransferAmount(tx.amount);
      
      csvRows.push([
        `"${dateStr}"`,
        `"${timeStr}"`,
        `"${type}"`,
        amount,
        `"${tx.txid}"`
      ].join(','));
    });

    return csvRows.join('\n');
  }

  /**
   * Download CSV file
   */
  downloadCSV(csvContent: string, filename: string = 'ybt-transfers.csv'): void {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const ybtTransfersService = new YBTTransfersService();