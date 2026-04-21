import { Metadata } from 'next';
import BridgePageContent from './BridgePageContent';

export const metadata: Metadata = {
  title: 'Bridge — VelumX',
  description:
    "Securely move your assets across ecosystems with VelumX's robust bridging protocol.",
};

export default function BridgePage() {
  return <BridgePageContent />;
}
