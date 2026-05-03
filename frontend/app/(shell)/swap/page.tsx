import { Metadata } from 'next';
import SwapPageContent from './SwapPageContent';

export const metadata: Metadata = {
  title: 'Swap',
  description:
    'Trade tokens instantly at the best market rates on Stacks (Bitcoin L2). Gas-free swaps powered by VelumX — pay fees in USDCx, not STX.',
  keywords: ['token swap', 'STX swap', 'USDCx', 'Stacks DeFi', 'gasless swap', 'Bitcoin L2 swap'],
  alternates: {
    canonical: 'https://app.velumx.xyz/swap',
  },
  openGraph: {
    title: 'Swap Tokens — VelumX',
    description: 'Trade tokens instantly at the best market rates on Stacks. Gas-free swaps — pay fees in USDCx.',
    url: 'https://app.velumx.xyz/swap',
  },
};

export default function SwapPage() {
  return <SwapPageContent />;
}
