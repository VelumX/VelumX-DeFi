import { Metadata } from 'next';
import EarnPageContent from './EarnPageContent';

export const metadata: Metadata = {
  title: 'Earn',
  description:
    'Stack STX and earn real BTC yield via Proof of Transfer on Stacks. Stay liquid with stSTX — no lock-up required. Powered by VelumX.',
  keywords: ['stSTX', 'STX stacking', 'BTC yield', 'Proof of Transfer', 'PoX', 'liquid staking', 'Stacks earn'],
  alternates: {
    canonical: 'https://app.velumx.xyz/earn',
  },
  openGraph: {
    title: 'Earn BTC Yield — VelumX',
    description: 'Stack STX and earn real BTC yield via Proof of Transfer. Stay liquid with stSTX.',
    url: 'https://app.velumx.xyz/earn',
  },
};

export default function EarnPage() {
  return <EarnPageContent />;
}
