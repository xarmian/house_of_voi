import { decodeReplayData, validateReplayData, decodeBetKeyReplay } from '$lib/utils/replayEncoder';
import { formatVOI } from '$lib/constants/betting';
import { extractSpinDataFromTransaction } from '$lib/utils/transactionUtils';
import type { MetaTagsProps } from 'svelte-meta-tags';

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
