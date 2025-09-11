import { decodeReplayData, validateReplayData, decodeBetKeyReplay } from '$lib/utils/replayEncoder';
import { formatVOI } from '$lib/constants/betting';
import type { MetaTagsProps } from 'svelte-meta-tags';

export const load = async ({ url }) => {
  const encodedData = url.searchParams.get('d');
  const betKey = url.searchParams.get('k'); // hex bet key (Bytes56)
  const claimRoundParam = url.searchParams.get('cr'); // numeric round (claim round)
  const txId = url.searchParams.get('tx'); // optional: spin tx id
  const contractId = url.searchParams.get('cid') || undefined; // optional: multi-contract id
  const betAmount = url.searchParams.get('bet'); // optional: atomic units
  const paylines = url.searchParams.get('lines'); // optional: number of paylines
  const timestamp = url.searchParams.get('ts'); // optional: ms timestamp
  const encodedR = url.searchParams.get('r'); // compact bet-key replay
  
  if (!encodedData && !betKey && !encodedR) {
    const pageMetaTags = {
      title: 'Invalid Spin Details - House of Voi',
      description: 'This spin details link is invalid or expired. Create your own spins at House of Voi!',
      openGraph: {
        title: 'Invalid Spin Details - House of Voi',
        description: 'This spin details link is invalid or expired. Create your own spins at House of Voi!',
        images: [
          {
            url: 'https://house-of-voi.vercel.app/og-image-replay.png',
            width: 1200,
            height: 630,
            alt: 'House of Voi - Invalid Spin Details'
          }
        ]
      },
      twitter: {
        title: 'Invalid Spin Details - House of Voi',
        description: 'This spin details link is invalid or expired. Create your own spins at House of Voi!',
        image: 'https://house-of-voi.vercel.app/og-image-replay.png',
        imageAlt: 'House of Voi - Invalid Spin Details'
      }
    } satisfies MetaTagsProps;
    
    return {
      pageMetaTags,
      error: 'No spin data found in URL',
      replayData: null
    };
  }

  try {
    // Legacy encoded data path
    if (encodedData) {
      const replayData = decodeReplayData(encodedData);
    
    if (!replayData || !validateReplayData(replayData)) {
      const pageMetaTags = {
        title: 'Invalid Spin Details - House of Voi',
        description: 'This spin details link is invalid, corrupted, or expired. Try creating a fresh spin at House of Voi!',
        openGraph: {
          title: 'Invalid Spin Details - House of Voi',
          description: 'This spin details link is invalid, corrupted, or expired. Try creating a fresh spin at House of Voi!',
          images: [
            {
              url: 'https://house-of-voi.vercel.app/og-image-replay.png',
              width: 1200,
              height: 630,
              alt: 'House of Voi - Invalid Spin Details'
            }
          ]
        },
        twitter: {
          title: 'Invalid Spin Details - House of Voi',
          description: 'This spin details link is invalid, corrupted, or expired. Try creating a fresh spin at House of Voi!',
          image: 'https://house-of-voi.vercel.app/og-image-replay.png',
          imageAlt: 'House of Voi - Invalid Spin Details'
        }
      } satisfies MetaTagsProps;
      
      return {
        pageMetaTags,
        error: 'Invalid or corrupted spin data',
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
      ? `Big Win Details! ${winText} - House of Voi`
      : `Spin Details - House of Voi Slots`;
      
    const description = isWin
      ? `${resultEmoji} Amazing win details! View the breakdown of this House of Voi spin where someone won ${formatVOI(replayData.winnings)} VOI on ${replayData.paylines} paylines!`
      : `🎰 View the detailed breakdown of this House of Voi spin. Bet ${formatVOI(replayData.betAmount)} VOI on ${replayData.paylines} paylines. See the complete verification and analysis!`;

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
        { name: 'keywords', content: `house of voi, spin details, verification, slot machine, ${isWin ? 'big win, jackpot, ' : ''}voi network, blockchain gaming, crypto slots` },
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
          pageMetaTags: { title: 'Invalid Spin Details - House of Voi', description: 'Invalid spin details link' },
          error: 'Invalid spin details link',
          replayData: null
        };
      }

      const pageMetaTags = {
        title: 'Spin Details - House of Voi',
        description: 'Viewing detailed spin verification from bet key.'
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
        title: 'Spin Details - House of Voi',
        description: 'Viewing detailed spin verification from bet key.'
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
    console.error('Error processing spin details data:', err);
    
    const pageMetaTags = {
      title: 'Spin Details Error - House of Voi',
      description: 'Unable to load these spin details. The link may be corrupted or expired. Try the game yourself!',
      openGraph: {
        title: 'Spin Details Error - House of Voi',
        description: 'Unable to load these spin details. The link may be corrupted or expired. Try the game yourself!',
        images: [
          {
            url: 'https://house-of-voi.vercel.app/og-image-replay.png',
            width: 1200,
            height: 630,
            alt: 'House of Voi - Spin Details Error'
          }
        ]
      },
      twitter: {
        title: 'Spin Details Error - House of Voi',
        description: 'Unable to load these spin details. The link may be corrupted or expired. Try the game yourself!',
        image: 'https://house-of-voi.vercel.app/og-image-replay.png',
        imageAlt: 'House of Voi - Spin Details Error'
      }
    } satisfies MetaTagsProps;
    
    return {
      pageMetaTags,
      error: 'Failed to process spin details data',
      replayData: null
    };
  }
};