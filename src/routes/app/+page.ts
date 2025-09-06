import type { MetaTagsProps } from 'svelte-meta-tags';
import { MULTI_CONTRACT_CONFIG } from '$lib/constants/network';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
  // Get contracts directly from config (server-side safe)
  const allContracts = MULTI_CONTRACT_CONFIG?.contracts || [];
  
  // Filter for gameplay-enabled contracts
  const playableContracts = allContracts.filter(contract => 
    contract.features.gameplayEnabled && 
    contract.features.playerSelectionEnabled
  );
  
  // Sort by display order and then by name
  playableContracts.sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }
    return a.name.localeCompare(b.name);
  });

  const pageMetaTags = {
    title: 'Choose Your Machine - House of Voi Slots',
    description: 'Choose from our selection of provably fair blockchain slot machines. Each machine offers unique gameplay, themes, and rewards on the VOI network.',
    openGraph: {
      title: 'Choose Your Machine - House of Voi Slots',
      description: 'Choose from our selection of provably fair blockchain slot machines. Each machine offers unique gameplay, themes, and rewards on the VOI network.',
      images: [
        {
          url: 'https://house-of-voi.vercel.app/og-image-app.png',
          width: 1200,
          height: 630,
          alt: 'House of Voi - Choose Your Slot Machine'
        }
      ]
    },
    twitter: {
      title: 'Choose Your Machine - House of Voi Slots',
      description: 'Choose from our selection of provably fair blockchain slot machines. Each machine offers unique gameplay, themes, and rewards on the VOI network.',
      image: 'https://house-of-voi.vercel.app/og-image-app.png',
      imageAlt: 'House of Voi - Choose Your Slot Machine'
    },
    additionalMetaTags: [
      { name: 'keywords', content: 'slot machines, voi network slots, crypto gambling, blockchain gaming, machine selection, VOI tokens, web3 slots, provably fair gaming' }
    ]
  } satisfies MetaTagsProps;
  
  return {
    contracts: playableContracts,
    totalContracts: allContracts.length,
    playableCount: playableContracts.length,
    pageMetaTags
  };
};