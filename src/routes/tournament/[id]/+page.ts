import type { MetaTagsProps } from 'svelte-meta-tags';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url }) => {
  const tournamentId = params.id;
  
  // Tournament metadata based on the House of Voi Weekend Tournament
  const tournamentData = {
    id: tournamentId,
    name: 'House of Voi Weekend Tournament',
    description: 'Compete for the ultimate prize in our most exciting tournament yet! Win across multiple categories including Volume, RTP, and Win Streak to become the Overall Champion.',
    startDate: new Date('2025-09-12T20:00:00-04:00'), // Friday 9/12 at 8:00 PM EST
    endDate: new Date('2025-09-14T23:59:59-04:00'), // Sunday 9/14 at 11:59 PM EST
    categories: [
      {
        id: 'volume',
        name: 'Volume',
        description: 'Highest total wagered',
        icon: 'coins'
      },
      {
        id: 'rtp', 
        name: 'RTP',
        description: 'Best Return to Player (minimum 500 spins and 25,000 Voi Volume to qualify)',
        icon: 'percent',
        requirements: {
          minSpins: 500,
          minVolume: 25000
        }
      },
      {
        id: 'win_streak',
        name: 'Win Streak', 
        description: 'Longest consecutive wins',
        icon: 'zap'
      },
      {
        id: 'losing_streak',
        name: 'Losing Streak',
        description: 'Longest consecutive losses (20 lines, 5 VOI/line minimum)',
        icon: 'trending-down'
      }
    ],
    prizes: {
      overall: [
        { place: 1, voi: 50000, trophy: 'Gold', description: '50,000 Voi + Gold Trophy' },
        { place: 2, voi: 20000, trophy: 'Silver', description: '20,000 Voi + Silver Trophy' },
        { place: 3, voi: 10000, trophy: 'Bronze', description: '10,000 Voi + Bronze Trophy' }
      ],
      category: [
        { place: 1, voi: 5000, trophy: 'Gold', description: '5,000 Voi + Gold Trophy' },
        { place: 2, voi: 0, trophy: 'Silver', description: 'Silver Trophy' },
        { place: 3, voi: 0, trophy: 'Bronze', description: 'Bronze Trophy' }
      ],
    },
    rules: [
      'One Wallet per Player!!',
      'The Trophies will be soulbound NFTs that you will be able to show off forever!!! Or until you lose those keys...'
    ]
  };

  // Create dynamic metadata
  const pageMetaTags = {
    title: `${tournamentData.name} - House of Voi`,
    description: tournamentData.description,
    canonical: new URL(url.pathname, url.origin).href,
    openGraph: {
      type: 'website',
      title: `${tournamentData.name} - House of Voi`,
      description: tournamentData.description,
      url: new URL(url.pathname, url.origin).href,
      siteName: 'House of Voi',
      images: [
        {
          url: 'https://demo.houseofvoi.com/og-image-tournament.png',
          width: 1200,
          height: 630,
          alt: `${tournamentData.name} - House of Voi Tournament`
        }
      ]
    },
    twitter: {
      cardType: 'summary_large_image',
      title: `${tournamentData.name} - House of Voi`,
      description: tournamentData.description,
      image: 'https://demo.houseofvoi.com/og-image-tournament.png',
      imageAlt: `${tournamentData.name} - House of Voi Tournament`
    },
    additionalMetaTags: [
      { name: 'keywords', content: 'tournament, house of voi, crypto gaming, blockchain tournament, voi network, slot tournament, gaming competition' },
      { name: 'author', content: 'House of Voi Team' },
      { name: 'robots', content: 'index, follow' },
      { name: 'theme-color', content: '#f59e0b' } // Golden color for tournament theme
    ]
  } satisfies MetaTagsProps;

  return {
    pageMetaTags,
    tournament: tournamentData
  };
};