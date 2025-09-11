// Service for reconstructing spin details from on-chain transaction data
import { algorandService } from '$lib/services/algorand';
import { supabaseService } from '$lib/services/supabase';
import { multiContractStore } from '$lib/stores/multiContract';
import { ensureBase32TxId } from '$lib/utils/transactionUtils';
import { detectWinningPaylines, type WinningPaylineData } from '$lib/utils/winLineDetection';
import type { QueuedSpin } from '$lib/types/queue';
import type { PlayerSpin } from '$lib/types/hovStats';

export interface SpinOutcomeData {
  grid: string[][];
  gridString: string;
  betKey: string;
  blockSeed: string;
  claimRound: number;
  winningPaylines: WinningPaylineData[];
  totalWinnings: number;
  isVerified: boolean;
  verificationError?: string;
}

export interface ReconstructedSpinData {
  originalSpin: QueuedSpin | PlayerSpin;
  outcome?: SpinOutcomeData;
  loading: boolean;
  error?: string;
}

/**
 * Main service class for reconstructing spin details
 */
export class SpinDetailsService {
  /**
   * Reconstruct full spin details including outcome verification
   */
  async reconstructSpinDetails(spin: QueuedSpin | PlayerSpin): Promise<ReconstructedSpinData> {
    const result: ReconstructedSpinData = {
      originalSpin: spin,
      loading: true
    };

    try {
      // Extract bet key from the spin
      const betKey = await this.extractBetKey(spin);
      if (!betKey) {
        return {
          ...result,
          loading: false,
          error: 'Could not extract bet key from transaction data'
        };
      }

      // Get claim round
      const claimRound = await this.getClaimRound(spin);
      if (!claimRound) {
        return {
          ...result,
          loading: false,
          error: 'Could not determine claim round'
        };
      }

      // Reconstruct the grid outcome
      const outcomeData = await this.reconstructOutcome(betKey, claimRound, spin);
      
      return {
        ...result,
        outcome: outcomeData,
        loading: false
      };
    } catch (error) {
      console.error('Failed to reconstruct spin details:', error);
      return {
        ...result,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Extract bet key from transaction data (similar to replay link generation)
   */
  private async extractBetKey(spin: QueuedSpin | PlayerSpin): Promise<string | null> {
    // If spin already has betKey, use it
    if ('betKey' in spin && spin.betKey) {
      return spin.betKey;
    }

    // Try to extract from transaction logs/args
    try {
      const txId = 'txId' in spin ? spin.txId : 'txid' in spin ? spin.txid : null;
      if (!txId) {
        console.warn('No transaction ID available');
        return null;
      }

      const indexer = algorandService.getIndexer();
      const base32TxId = ensureBase32TxId(txId);
      const tx = await indexer.lookupTransactionByID(base32TxId).do();

      // Find the app call transaction
      let appTxn: any = (tx?.transaction?.['tx-type'] === 'appl') ? tx.transaction : null;
      const groupId = tx?.transaction?.group;
      if (!appTxn && groupId) {
        try {
          const grp = await indexer.searchForTransactions().group(groupId).do();
          const appl = grp?.transactions?.find((t: any) => t['tx-type'] === 'appl');
          if (appl) appTxn = appl;
        } catch {}
      }

      const logs: string[] = appTxn?.logs || tx?.transaction?.logs || [];

      // Try to find 112-char hex bet key in logs
      for (const b64 of logs) {
        try {
          const bin = typeof atob !== 'undefined' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
          if (hex.length === 112) {
            return hex;
          }
        } catch {}
      }

      // If not found in logs, try to reconstruct from hov_events table
      return await this.reconstructBetKeyFromEvents(spin);
      
    } catch (error) {
      console.error('Failed to extract bet key:', error);
      return null;
    }
  }

  /**
   * Reconstruct bet key from database event data
   */
  private async reconstructBetKeyFromEvents(spin: QueuedSpin | PlayerSpin): Promise<string | null> {
    try {
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }

      const client = supabaseService.getClient();
      const txId = 'txId' in spin ? spin.txId : 'txid' in spin ? spin.txid : null;
      
      const { data: event } = await client
        .from('hov_events')
        .select('amount,max_payline_index,index_value,who')
        .eq('txid', txId)
        .limit(1)
        .maybeSingle();

      if (!event) {
        return null;
      }

      const amount = Number(event.amount || 0);
      const maxIdx = Number(event.max_payline_index || 0);
      const idxVal = Number(event.index_value || 0);
      const who = event.who;

      if (amount > 0 && who) {
        const algosdk = (await import('algosdk')).default;
        const senderBytes = algosdk.decodeAddress(who).publicKey;
        const u64be = (val: number | bigint) => {
          const buf = new Uint8Array(8);
          new DataView(buf.buffer).setBigUint64(0, BigInt(val), false);
          return buf;
        };
        
        const keyBytes = new Uint8Array(32 + 8 + 8 + 8);
        keyBytes.set(senderBytes, 0);
        keyBytes.set(u64be(amount), 32);
        keyBytes.set(u64be(maxIdx), 40);
        keyBytes.set(u64be(idxVal), 48);
        
        return Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      }

      return null;
    } catch (error) {
      console.error('Failed to reconstruct bet key from events:', error);
      return null;
    }
  }

  /**
   * Get claim round from spin data
   */
  private async getClaimRound(spin: QueuedSpin | PlayerSpin): Promise<number | null> {
    // Try to get from spin data first
    if ('commitmentRound' in spin && spin.commitmentRound) {
      return spin.commitmentRound + 1; // Claim round is commitment + 1
    }
    
    if ('outcomeRound' in spin && spin.outcomeRound) {
      return spin.outcomeRound;
    }

    if ('claim_round' in spin && spin.claim_round) {
      return Number(spin.claim_round);
    }

    // If not available, try to derive from transaction
    try {
      const txId = 'txId' in spin ? spin.txId : 'txid' in spin ? spin.txid : null;
      if (!txId) return null;

      const client = algorandService.getClient();
      const base32TxId = ensureBase32TxId(txId);
      const pendingInfo = await client.pendingTransactionInformation(base32TxId).do();
      const confirmedRound = pendingInfo['confirmed-round'];
      
      if (confirmedRound && confirmedRound > 0) {
        return confirmedRound + 1;
      }
    } catch (error) {
      console.error('Failed to derive claim round from transaction:', error);
    }

    return null;
  }

  /**
   * Reconstruct the outcome grid and analyze paylines
   */
  private async reconstructOutcome(
    betKey: string, 
    claimRound: number, 
    spin: QueuedSpin | PlayerSpin
  ): Promise<SpinOutcomeData> {
    try {
      // Ensure we're using the correct app ID
      if ('contractId' in spin && spin.contractId) {
        const contract = multiContractStore.getContract(spin.contractId);
        if (contract?.slotMachineAppId) {
          algorandService.updateAppId(contract.slotMachineAppId);
        }
      }

      // Get the deterministic grid
      const gridString = await algorandService.getBetGridDeterministic(betKey, claimRound, '');
      
      // Convert to 2D grid
      const grid = this.gridStringToOutcome(gridString);
      
      // Get block seed for verification
      const blockSeed = await this.getBlockSeedHex(claimRound);
      
      // Get betting parameters
      const betPerLine = this.getBetPerLine(spin);
      const selectedPaylines = this.getSelectedPaylines(spin);
      
      // Analyze winning paylines
      const winningPaylines = await detectWinningPaylines(grid, betPerLine, selectedPaylines);
      const totalWinnings = winningPaylines.reduce((sum, line) => sum + line.winAmount, 0);
      
      // Verify against spin data if available
      const expectedWinnings = this.getExpectedWinnings(spin);
      const isVerified = expectedWinnings === null || Math.abs(totalWinnings - expectedWinnings) < 1000; // Allow small rounding differences

      return {
        grid,
        gridString,
        betKey,
        blockSeed,
        claimRound,
        winningPaylines,
        totalWinnings,
        isVerified,
        verificationError: !isVerified ? 
          `Calculated winnings (${totalWinnings}) don't match expected (${expectedWinnings})` : 
          undefined
      };

    } catch (error) {
      console.error('Failed to reconstruct outcome:', error);
      throw new Error(`Failed to reconstruct outcome: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert grid string to 2D outcome array
   */
  private gridStringToOutcome(gridString: string): string[][] {
    const grid: string[][] = [];
    for (let col = 0; col < 5; col++) {
      grid[col] = [];
      for (let row = 0; row < 3; row++) {
        const index = col * 3 + row;
        grid[col][row] = gridString[index] || '_';
      }
    }
    return grid;
  }

  /**
   * Get block seed as hex string for display
   */
  private async getBlockSeedHex(round: number): Promise<string> {
    try {
      const client = algorandService.getClient();
      const block = await client.block(round).do();
      const blockSeed = block.block.seed;
      
      let seedBytes: Uint8Array;
      if (blockSeed instanceof Uint8Array) {
        seedBytes = blockSeed;
      } else if (typeof blockSeed === 'string') {
        seedBytes = new Uint8Array(Buffer.from(blockSeed, 'base64'));
      } else {
        throw new Error('Invalid block seed format');
      }
      
      return Array.from(seedBytes.slice(-32)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('Failed to get block seed:', error);
      return 'Unable to fetch';
    }
  }

  /**
   * Extract bet per line from spin data
   */
  private getBetPerLine(spin: QueuedSpin | PlayerSpin): number {
    if ('totalBet' in spin && 'selectedPaylines' in spin) {
      return Math.floor(spin.totalBet / spin.selectedPaylines);
    }
    if ('bet_amount_per_line' in spin) {
      return Number(spin.bet_amount_per_line);
    }
    if ('total_bet_amount' in spin && 'paylines_count' in spin) {
      return Math.floor(Number(spin.total_bet_amount) / Number(spin.paylines_count));
    }
    return 0;
  }

  /**
   * Extract selected paylines from spin data
   */
  private getSelectedPaylines(spin: QueuedSpin | PlayerSpin): number {
    if ('selectedPaylines' in spin) {
      return spin.selectedPaylines;
    }
    if ('paylines_count' in spin) {
      return Number(spin.paylines_count);
    }
    return 20; // Default fallback
  }

  /**
   * Get expected winnings from spin data for verification
   */
  private getExpectedWinnings(spin: QueuedSpin | PlayerSpin): number | null {
    if ('winnings' in spin && typeof spin.winnings === 'number') {
      return spin.winnings;
    }
    if ('payout' in spin) {
      return Number(spin.payout);
    }
    return null;
  }
}

// Export singleton instance
export const spinDetailsService = new SpinDetailsService();