import { Metadata } from 'next';
import SwapPageContent from './SwapPageContent';

export const metadata: Metadata = {
  title: 'Swap — VelumX',
  description:
    'Trade tokens instantly at the best market rates using our peer-to-peer liquidity protocol.',
};

export default function SwapPage() {
  return <SwapPageContent />;
}
