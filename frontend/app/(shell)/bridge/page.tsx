import { Metadata } from 'next';
import BridgePageContent from './BridgePageContent';

export const metadata: Metadata = {
  title: 'Bridge',
  description:
    "Bridge assets between Ethereum and Stacks (Bitcoin L2) securely with VelumX. Non-custodial, audited smart contracts with gasless UX.",
  keywords: ['crypto bridge', 'Ethereum to Stacks', 'Bitcoin L2 bridge', 'USDC bridge', 'cross-chain', 'gasless bridge'],
  alternates: {
    canonical: 'https://app.velumx.xyz/bridge',
  },
  openGraph: {
    title: 'Bridge Assets — VelumX',
    description: 'Move assets between Ethereum and Stacks securely. Non-custodial bridging with gasless UX.',
    url: 'https://app.velumx.xyz/bridge',
  },
};

export default function BridgePage() {
  return <BridgePageContent />;
}
