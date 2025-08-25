import { decodeReplayData, validateReplayData } from '$lib/utils/replayEncoder';
import { formatVOI } from '$lib/constants/betting';

export const load = async ({ url }) => {
  const encodedData = url.searchParams.get('d');
  
  if (!encodedData) {
    return {
      meta: {
        title: 'Invalid Replay - House of Voi',
        description: 'This replay link is invalid or expired. Create your own spins at House of Voi!',
        ogImage: '/og-image-replay.svg',
        ogUrl: url.toString(),
        twitterImage: '/og-image-replay.svg',
        siteName: 'House of Voi',
        themeColor: '#10b981',
        canonical: 'https://house-of-voi.vercel.app'
      },
      error: 'No replay data found in URL',
      replayData: null
    };
  }

  try {
    const replayData = decodeReplayData(encodedData);
    
    if (!replayData || !validateReplayData(replayData)) {
      return {
        meta: {
          title: 'Invalid Replay - House of Voi',
          description: 'This replay link is invalid, corrupted, or expired. Try creating a fresh spin at House of Voi!',
          ogImage: '/og-image-replay.svg',
          ogUrl: url.toString(),
          twitterImage: '/og-image-replay.svg',
          siteName: 'House of Voi',
          themeColor: '#10b981',
          canonical: 'https://house-of-voi.vercel.app'
        },
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
      ? `${resultEmoji} Amazing win! Watch this House of Voi spin replay where someone won ${formatVOI(replayData.winnings)} VOI on ${replayData.paylines} paylines. Spin on ${spinDate}.`
      : `🎰 Watch this House of Voi spin replay. Bet ${formatVOI(replayData.betAmount)} VOI on ${replayData.paylines} paylines. Play yourself for a chance to win big!`;

    return {
      meta: {
        title,
        description,
        keywords: `house of voi, spin replay, slot machine, ${isWin ? 'big win, jackpot, ' : ''}voi network, blockchain gaming, crypto slots`,
        ogImage: '/og-image-replay.svg',
        ogUrl: url.toString(),
        twitterImage: '/og-image-replay.svg',
        author: 'House of Voi Team',
        siteName: 'House of Voi',
        themeColor: isWin ? '#f59e0b' : '#10b981', // Gold for wins, green for regular
        canonical: 'https://house-of-voi.vercel.app/app' // Canonical points to main game
      },
      replayData,
      error: null
    };
  } catch (err) {
    console.error('Error processing replay data:', err);
    return {
      meta: {
        title: 'Replay Error - House of Voi',
        description: 'Unable to load this replay. The link may be corrupted or expired. Try the game yourself!',
        ogImage: '/og-image-replay.svg',
        ogUrl: url.toString(),
        twitterImage: '/og-image-replay.svg',
        siteName: 'House of Voi',
        themeColor: '#10b981',
        canonical: 'https://house-of-voi.vercel.app'
      },
      error: 'Failed to process replay data',
      replayData: null
    };
  }
};