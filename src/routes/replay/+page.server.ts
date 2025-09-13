import { decodeReplayData, validateReplayData, decodeBetKeyReplay } from '$lib/utils/replayEncoder';
import { formatVOI } from '$lib/constants/betting';
import { extractSpinDataFromTransaction } from '$lib/utils/transactionUtils';
import type { MetaTagsProps } from 'svelte-meta-tags';
import { algorandService } from '$lib/services/algorand';

// Helper function to convert grid string (15 chars) to 5x3 outcome grid
function gridStringToOutcome(gridString: string): string[][] {
  const grid: string[][] = [];
  for (let col = 0; col < 5; col++) {
    grid[col] = [];
    for (let row = 0; row < 3; row++) {
      const index = col * 3 + row;
      grid[col][row] = gridString[index];
    }
  }
  return grid;
}

// Helper function to compute winnings using config data
async function computeWinningsFromGrid(outcome: string[][], totalBetAtomic: number, selectedPaylines: number, appId: number): Promise<number> {
  try {
    // Get paylines and payouts from config
    const { MULTI_CONTRACT_CONFIG } = await import('$lib/constants/network');
    const contract = MULTI_CONTRACT_CONFIG.contracts.find(c => c.slotMachineAppId === appId);
    
    if (!contract || !contract.metadata.paylines || !contract.metadata.payouts) {
      console.warn('No paylines or payouts configured for app ID', appId);
      return 0;
    }

    const betPerLine = selectedPaylines > 0 ? Math.floor(totalBetAtomic / selectedPaylines) : 0;
    const paylines = contract.metadata.paylines;
    const payouts = contract.metadata.payouts;
    let totalWinnings = 0;

    // Check each active payline
    for (let i = 0; i < Math.min(selectedPaylines, paylines.length); i++) {
      const payline = paylines[i];
      const symbols: string[] = [];
      
      // Extract symbols for this payline
      for (let reelIndex = 0; reelIndex < 5; reelIndex++) {
        const rowIndex = payline[reelIndex];
        symbols.push(outcome[reelIndex][rowIndex]);
      }
      
      // Count occurrences of each symbol
      const symbolCounts: Record<string, number> = {};
      for (const symbol of symbols) {
        if (symbol !== '_') { // Skip empty symbols
          symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
        }
      }
      
      // Find the best payout for this payline
      let bestPayout = 0;
      let bestSymbol = '';
      let bestCount = 0;
      
      for (const [symbol, count] of Object.entries(symbolCounts)) {
        if (count >= 3 && payouts[symbol] && payouts[symbol][count]) {
          const multiplier = payouts[symbol][count];
          const payout = betPerLine * multiplier;
          if (payout > bestPayout) {
            bestPayout = payout;
            bestSymbol = symbol;
            bestCount = count;
          }
        }
      }
      
      if (bestPayout > 0) {
        totalWinnings += bestPayout;
      }
    }

    return totalWinnings;
  } catch (e) {
    console.warn('Failed to compute winnings from grid:', e);
    return 0;
  }
}

// Simplified server-side grid generation using config data
async function generateGridFromSeedServerSide(seed: Uint8Array, appId: number): Promise<string> {
  try {
    // Get reel data from multi-contract config
    const { MULTI_CONTRACT_CONFIG } = await import('$lib/constants/network');
    const contract = MULTI_CONTRACT_CONFIG.contracts.find(c => c.slotMachineAppId === appId);
    
    if (!contract || !contract.metadata.reelData) {
      throw new Error(`No reel data configured for app ID ${appId}`);
    }

    const reelData = contract.metadata.reelData;
    const reelLength = contract.metadata.reelLength || 100;
    const reelCount = contract.metadata.reelCount || 5;
    const windowLength = contract.metadata.windowLength || 3;

    // Port of _get_reel_tops() - calculate position for each reel
    const maxReelStop = reelLength - (windowLength + 1);
    const reelTops: number[] = [];
    
    for (let reelIndex = 1; reelIndex <= 5; reelIndex++) {
      // Exact port: op.sha256(seed + Bytes(b"1")), etc.
      const reelIdByte = new Uint8Array([0x30 + reelIndex]); // "1" = 0x31, "2" = 0x32, etc.
      const combined = new Uint8Array(seed.length + 1);
      combined.set(seed);
      combined.set(reelIdByte, seed.length);
      
      // Hash to get reel-specific seed
      const hashedSeed = await crypto.subtle.digest('SHA-256', combined);
      const reelSeedBytes = new Uint8Array(hashedSeed);
      
      // Get last 8 bytes and convert to BigUint64 (big endian, as per contract)
      const seedValue = new DataView(reelSeedBytes.buffer, reelSeedBytes.length - 8).getBigUint64(0, false);
      const position = Number(seedValue % BigInt(maxReelStop));
      reelTops.push(position);
    }
    
    // Port of _get_grid() - combine all reel windows
    let grid = '';
    for (let reelIndex = 0; reelIndex < 5; reelIndex++) {
      const reelWindow = getReelWindow(reelData, reelIndex, reelTops[reelIndex], reelLength, windowLength);
      grid += reelWindow;
    }
    
    return grid;
  } catch (error) {
    console.error('Failed to generate grid server-side:', error);
    throw error;
  }
}

// Helper function to get reel window (port of getReelWindow from AlgorandService)
function getReelWindow(reelData: string, reelIndex: number, position: number, reelLength: number, windowLength: number): string {
  // Get the reel data for this specific reel
  const reelStartInFullData = reelIndex * reelLength;
  const reelDataForThisReel = reelData.slice(reelStartInFullData, reelStartInFullData + reelLength);
  
  // Port of contract logic with wrap-around
  let window = '';
  for (let i = 0; i < windowLength; i++) {
    const pos = (position + i) % reelLength;
    window += reelDataForThisReel[pos];
  }
  
  return window;
}

// Helper function to get block seed for a given round
async function getBlockSeedForRound(round: number): Promise<Uint8Array> {
  try {
    const client = algorandService.getClient();
    const block = await client.block(round).do();
    const blockSeed = block.block.seed;
    let seedBytes: Uint8Array;
    if (blockSeed instanceof Uint8Array) {
      seedBytes = blockSeed;
    } else if (typeof blockSeed === 'string') {
      seedBytes = base64ToUint8Array(blockSeed);
    } else if (Array.isArray(blockSeed)) {
      seedBytes = new Uint8Array(blockSeed);
    } else {
      throw new Error(`Unexpected block seed type: ${typeof blockSeed}`);
    }
    return new Uint8Array(seedBytes.slice(-32));
  } catch (eAlgod: any) {
    console.warn('Algod block seed fetch failed, trying indexer:', eAlgod?.message || eAlgod);
    const indexer = algorandService.getIndexer();
    const block = await indexer.lookupBlock(round).do();
    const blockSeed = (block as any)?.seed || (block as any)?.block?.seed;
    if (!blockSeed) throw new Error('Indexer did not return a seed');
    let seedBytes: Uint8Array;
    if (blockSeed instanceof Uint8Array) {
      seedBytes = blockSeed;
    } else if (typeof blockSeed === 'string') {
      seedBytes = base64ToUint8Array(blockSeed);
    } else if (Array.isArray(blockSeed)) {
      seedBytes = new Uint8Array(blockSeed);
    } else {
      throw new Error(`Unexpected block seed type: ${typeof blockSeed}`);
    }
    return new Uint8Array(seedBytes.slice(-32));
  }
}

// Helper function to convert hex string to Uint8Array
function hexStringToUint8Array(hexString: string): Uint8Array {
  const bytes = [];
  for (let i = 0; i < hexString.length; i += 2) {
    bytes.push(parseInt(hexString.substr(i, 2), 16));
  }
  return new Uint8Array(bytes);
}

// Helper function to convert base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = typeof atob !== 'undefined' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export const load = async ({ url }) => {
  const encodedData = url.searchParams.get('d');
  const betKey = url.searchParams.get('k'); // hex bet key (Bytes56)
  const claimRoundParam = url.searchParams.get('cr'); // numeric round (claim round)
  const txId = url.searchParams.get('tx'); // transaction ID to extract all data from
  const contractId = url.searchParams.get('cid') || undefined; // optional: multi-contract id
  const betAmount = url.searchParams.get('bet'); // optional: atomic units
  const paylines = url.searchParams.get('lines'); // optional: number of paylines
  const timestamp = url.searchParams.get('ts'); // optional: ms timestamp
  const encodedR = url.searchParams.get('r'); // compact bet-key replay
  
  if (!encodedData && !betKey && !encodedR && !txId) {
    const pageMetaTags = {
      title: 'Invalid Replay - House of Voi',
      description: 'This replay link is invalid or expired. Create your own spins at House of Voi!',
      openGraph: {
        title: 'Invalid Replay - House of Voi',
        description: 'This replay link is invalid or expired. Create your own spins at House of Voi!',
        images: [
          {
            url: 'https://house-of-voi.vercel.app/og-image-replay.png',
            width: 1200,
            height: 630,
            alt: 'House of Voi - Invalid Replay'
          }
        ]
      },
      twitter: {
        title: 'Invalid Replay - House of Voi',
        description: 'This replay link is invalid or expired. Create your own spins at House of Voi!',
        image: 'https://house-of-voi.vercel.app/og-image-replay.png',
        imageAlt: 'House of Voi - Invalid Replay'
      }
    } satisfies MetaTagsProps;
    
    return {
      pageMetaTags,
      error: 'No replay data found in URL',
      replayData: null
    };
  }

  try {
    // Priority 1: Transaction ID path (shortest and most reliable URLs)
    if (txId) {
      const transactionData = await extractSpinDataFromTransaction(txId);
      if (!transactionData) {
        return {
          pageMetaTags: { title: 'Invalid Replay - House of Voi', description: 'Transaction not found or invalid' },
          error: 'Transaction not found or invalid',
          replayData: null
        };
      }

      try {

        // Compute the grid deterministically using the bet key and claim round
        // Use our simplified server-side method instead of AlgorandService to avoid store dependencies
        const blockSeed = await getBlockSeedForRound(transactionData.claimRound);
        const betKeyBytes = hexStringToUint8Array(transactionData.betKey);
        const combined = new Uint8Array(blockSeed.length + betKeyBytes.length);
        combined.set(blockSeed);
        combined.set(betKeyBytes, blockSeed.length);
        const hashedBytes = await crypto.subtle.digest('SHA-256', combined);
        const seed = new Uint8Array(hashedBytes);
        const gridString = await generateGridFromSeedServerSide(seed, transactionData.appId);
        const outcome = gridStringToOutcome(gridString);

        // Use bet details from transaction or derive defaults
        const paylines = transactionData.paylines ?? 20;
        const betAmount = transactionData.betAmount ?? 0;
        const totalBetAtomic = betAmount * paylines;

        // Compute winnings from the grid
        const winnings = await computeWinningsFromGrid(outcome, totalBetAtomic, paylines, transactionData.appId);

        // Create complete replay data
        const replayData = {
          outcome,
          winnings,
          betAmount: totalBetAtomic,
          paylines,
          timestamp: transactionData.timestamp,
          contractId: null,
          txId: txId,
          betKey: transactionData.betKey,
          claimRound: transactionData.claimRound,
        };

        // Generate dynamic metadata based on spin results
        const isWin = winnings > 0;
        const winText = isWin 
          ? `Won ${formatVOI(winnings)} VOI! 🎰`
          : `Bet ${formatVOI(totalBetAtomic)} VOI`;
        
        const resultEmoji = isWin ? '🎉' : '🎰';
        const spinDate = new Date(transactionData.timestamp).toLocaleDateString();
        
        const title = isWin 
          ? `Big Win! ${winText} - House of Voi Replay`
          : `Spin Replay - House of Voi Slots`;
          
        const description = isWin
          ? `${resultEmoji} Amazing win! Watch this House of Voi spin replay where someone won ${formatVOI(winnings)} VOI on ${paylines} paylines!`
          : `🎰 Watch this House of Voi spin replay. Bet ${formatVOI(totalBetAtomic)} VOI on ${paylines} paylines. Play yourself for a chance to win big!`;

        const pageMetaTags = {
          title,
          description,
          openGraph: {
            title,
            description,
            url: url.toString(),
            images: [
              {
                url: 'https://house-of-voi.vercel.app/og-image-replay.png',
                width: 1200,
                height: 630,
                alt: title
              }
            ]
          },
          twitter: {
            title,
            description,
            image: 'https://house-of-voi.vercel.app/og-image-replay.png',
            imageAlt: title
          },
          additionalMetaTags: [
            { name: 'keywords', content: `house of voi, spin replay, slot machine, ${isWin ? 'big win, jackpot, ' : ''}voi network, blockchain gaming, crypto slots` },
            { name: 'theme-color', content: isWin ? '#f59e0b' : '#10b981' }
          ]
        } satisfies MetaTagsProps;

        return {
          pageMetaTags,
          replayData,
          error: null
        };

      } catch (error) {
        console.error('Failed to compute replay data from transaction:', error);
        
        // Fallback to minimal metadata
        const pageMetaTags = {
          title: 'Spin Replay - House of Voi',
          description: `Replay spin outcome from transaction ${txId.slice(0, 8)}...`
        } satisfies MetaTagsProps;

        return {
          pageMetaTags,
          replayData: null,
          error: null,
          betKey: transactionData.betKey,
          claimRound: transactionData.claimRound,
          txId: txId,
          contractId: null,
          slotAppId: transactionData.appId,
          initialBetAmount: transactionData.betAmount ?? null,
          initialPaylines: transactionData.paylines ?? null,
          initialTimestamp: transactionData.timestamp
        };
      }
    }

    // Legacy encoded data path
    if (encodedData) {
      const replayData = decodeReplayData(encodedData);
    
    if (!replayData || !validateReplayData(replayData)) {
      const pageMetaTags = {
        title: 'Invalid Replay - House of Voi',
        description: 'This replay link is invalid, corrupted, or expired. Try creating a fresh spin at House of Voi!',
        openGraph: {
          title: 'Invalid Replay - House of Voi',
          description: 'This replay link is invalid, corrupted, or expired. Try creating a fresh spin at House of Voi!',
          images: [
            {
              url: 'https://house-of-voi.vercel.app/og-image-replay.png',
              width: 1200,
              height: 630,
              alt: 'House of Voi - Invalid Replay'
            }
          ]
        },
        twitter: {
          title: 'Invalid Replay - House of Voi',
          description: 'This replay link is invalid, corrupted, or expired. Try creating a fresh spin at House of Voi!',
          image: 'https://house-of-voi.vercel.app/og-image-replay.png',
          imageAlt: 'House of Voi - Invalid Replay'
        }
      } satisfies MetaTagsProps;
      
      return {
        pageMetaTags,
        error: 'Invalid or corrupted replay data',
        replayData: null
      };
    }

    // Generate dynamic metadata based on spin results
    const winAmount = replayData.winnings / 1000000; // Convert to VOI
    const betAmount = replayData.betAmount / 1000000; // Convert to VOI
    const isWin = replayData.winnings > 0;
    
    const winText = isWin 
      ? `Won ${formatVOI(replayData.winnings)} VOI! 🎰`
      : `Bet ${formatVOI(replayData.betAmount)} VOI`;
    
    const resultEmoji = isWin ? '🎉' : '🎰';
    const spinDate = new Date(replayData.timestamp).toLocaleDateString();
    
    const title = isWin 
      ? `Big Win! ${winText} - House of Voi Replay`
      : `Spin Replay - House of Voi Slots`;
      
    const description = isWin
      ? `${resultEmoji} Amazing win! Watch this House of Voi spin replay where someone won ${formatVOI(replayData.winnings)} VOI on ${replayData.paylines} paylines!`
      : `🎰 Watch this House of Voi spin replay. Bet ${formatVOI(replayData.betAmount)} VOI on ${replayData.paylines} paylines. Play yourself for a chance to win big!`;

    const pageMetaTags = {
      title,
      description,
      openGraph: {
        title,
        description,
        url: url.toString(),
        images: [
          {
            url: 'https://house-of-voi.vercel.app/og-image-replay.png',
            width: 1200,
            height: 630,
            alt: title
          }
        ]
      },
      twitter: {
        title,
        description,
        image: 'https://house-of-voi.vercel.app/og-image-replay.png',
        imageAlt: title
      },
      additionalMetaTags: [
        { name: 'keywords', content: `house of voi, spin replay, slot machine, ${isWin ? 'big win, jackpot, ' : ''}voi network, blockchain gaming, crypto slots` },
        { name: 'theme-color', content: isWin ? '#f59e0b' : '#10b981' }
      ]
    } satisfies MetaTagsProps;

      return {
        pageMetaTags,
        replayData,
        error: null
      };
    }

    // New compact bet-key path (client will compute the grid)
    if (encodedR) {
      const decoded = decodeBetKeyReplay(encodedR);
      if (!decoded) {
        return {
          pageMetaTags: { title: 'Invalid Replay - House of Voi', description: 'Invalid relay link' },
          error: 'Invalid relay link',
          replayData: null
        };
      }

      const pageMetaTags = {
        title: 'Spin Replay - House of Voi',
        description: 'Replaying spin outcome from bet key.'
      } satisfies MetaTagsProps;

      return {
        pageMetaTags,
        replayData: null,
        error: null,
        betKey: decoded.betKeyHex,
        claimRound: decoded.claimRound,
        txId: null,
        contractId: decoded.contractId || null,
        slotAppId: decoded.slotAppId || null,
        initialBetAmount: decoded.betAmount ?? null,
        initialPaylines: decoded.paylines ?? null,
        initialTimestamp: decoded.timestamp ?? Date.now()
      };
    }

    // New bet-key path (client will compute the grid)
    if (betKey) {
      // Basic validation for bet key format
      const isHex = /^[0-9a-fA-F]+$/.test(betKey) && betKey.length === 112;
      if (!isHex) {
        return {
          pageMetaTags: {
            title: 'Invalid Bet Key - House of Voi',
            description: 'The provided bet key is invalid. Please check your link.'
          },
          error: 'Invalid bet key format',
          replayData: null
        };
      }

      // Pass-through data for client-side computation
      const pageMetaTags = {
        title: 'Spin Replay - House of Voi',
        description: 'Replaying spin outcome from bet key.'
      } satisfies MetaTagsProps;

      return {
        pageMetaTags,
        // Indicate client mode with params to compute outcome in the browser
        replayData: null,
        error: null,
        betKey,
        claimRound: claimRoundParam ? Number(claimRoundParam) : null,
        txId: txId || null,
        contractId: contractId || null,
        // Optional extras
        initialBetAmount: betAmount ? Number(betAmount) : null,
        initialPaylines: paylines ? Number(paylines) : null,
        initialTimestamp: timestamp ? Number(timestamp) : Date.now()
      };
    }
  } catch (err) {
    console.error('Error processing replay data:', err);
    
    const pageMetaTags = {
      title: 'Replay Error - House of Voi',
      description: 'Unable to load this replay. The link may be corrupted or expired. Try the game yourself!',
      openGraph: {
        title: 'Replay Error - House of Voi',
        description: 'Unable to load this replay. The link may be corrupted or expired. Try the game yourself!',
        images: [
          {
            url: 'https://house-of-voi.vercel.app/og-image-replay.png',
            width: 1200,
            height: 630,
            alt: 'House of Voi - Replay Error'
          }
        ]
      },
      twitter: {
        title: 'Replay Error - House of Voi',
        description: 'Unable to load this replay. The link may be corrupted or expired. Try the game yourself!',
        image: 'https://house-of-voi.vercel.app/og-image-replay.png',
        imageAlt: 'House of Voi - Replay Error'
      }
    } satisfies MetaTagsProps;
    
    return {
      pageMetaTags,
      error: 'Failed to process replay data',
      replayData: null
    };
  }
};
