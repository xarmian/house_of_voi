import type { MetaTagsProps } from 'svelte-meta-tags';

export const load = () => {
  const pageMetaTags = {
    title: 'Play Now - House of Voi Slots',
    description: 'Spin to win on the blockchain! Connect your wallet and play provably fair slots with instant VOI payouts, transparent outcomes, and low fees.',
    openGraph: {
      title: 'Play Now - House of Voi Slots',
      description: 'Spin to win on the blockchain! Connect your wallet and play provably fair slots with instant VOI payouts, transparent outcomes, and low fees.',
      images: [
        {
          url: 'https://house-of-voi.vercel.app/og-image-app.png',
          width: 1200,
          height: 630,
          alt: 'House of Voi - Play Provably Fair Blockchain Slots'
        }
      ]
    },
    twitter: {
      title: 'Play Now - House of Voi Slots',
      description: 'Spin to win on the blockchain! Connect your wallet and play provably fair slots with instant VOI payouts, transparent outcomes, and low fees.',
      image: 'https://house-of-voi.vercel.app/og-image-app.png',
      imageAlt: 'House of Voi - Play Provably Fair Blockchain Slots'
    },
    additionalMetaTags: [
      { name: 'keywords', content: 'play slots, voi network slots, crypto gambling, blockchain gaming, slot machine game, VOI tokens, web3 slots, provably fair gaming' }
    ]
  } satisfies MetaTagsProps;

  return { pageMetaTags };
};