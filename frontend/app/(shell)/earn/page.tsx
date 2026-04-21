import { Metadata } from 'next';
import EarnPageContent from './EarnPageContent';

export const metadata: Metadata = {
  title: 'Earn — VelumX',
  description:
    'Deposit STX and earn BTC yield via Proof of Transfer — stay liquid with stSTX.',
};

export default function EarnPage() {
  return <EarnPageContent />;
}
