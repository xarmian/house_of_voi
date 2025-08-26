import { decodeReplayData, validateReplayData } from '$lib/utils/replayEncoder';
import { formatVOI } from '$lib/constants/betting';
import type { MetaTagsProps } from 'svelte-meta-tags';

export const load = async ({ url }) => {
  const encodedData = url.searchParams.get('d');
  
  if (!encodedData) {
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