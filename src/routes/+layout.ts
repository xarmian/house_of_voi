import type { MetaTagsProps } from 'svelte-meta-tags';

export const load = ({ url }) => {
  const baseMetaTags = {
    title: 'House of Voi - Provably Fair Blockchain Slot Machine',
    titleTemplate: '%s | House of Voi',
    description: 'Experience transparent, provably fair slot gaming on Voi Network. Connect your wallet for instant payouts, low fees, and verifiable on-chain outcomes.',
    canonical: new URL(url.pathname, url.origin).href,
    openGraph: {
      type: 'website',
      title: 'House of Voi - Provably Fair Blockchain Slot Machine',
      description: 'Experience transparent, provably fair slot gaming on Voi Network. Connect your wallet for instant payouts, low fees, and verifiable on-chain outcomes.',
      url: new URL(url.pathname, url.origin).href,
      siteName: 'House of Voi',
      images: [
        {
          url: 'https://house-of-voi.vercel.app/og-image-home.png',
          width: 1200,
          height: 630,
          alt: 'House of Voi - Provably Fair Blockchain Slots'
        }
      ]
    },
    twitter: {
      cardType: 'summary_large_image',
      title: 'House of Voi - Provably Fair Blockchain Slot Machine',
      description: 'Experience transparent, provably fair slot gaming on Voi Network. Connect your wallet for instant payouts, low fees, and verifiable on-chain outcomes.',
      image: 'https://house-of-voi.vercel.app/og-image-home.png',
      imageAlt: 'House of Voi - Provably Fair Blockchain Slots'
    },
    additionalMetaTags: [
      { name: 'keywords', content: 'voi network, blockchain slots, crypto gaming, provably fair, defi gaming, slot machine, VOI, cryptocurrency, web3 gaming' },
      { name: 'author', content: 'House of Voi Team' },
      { name: 'robots', content: 'index, follow' },
      { name: 'theme-color', content: '#10b981' }
    ]
  } satisfies MetaTagsProps;

  return { baseMetaTags };
};