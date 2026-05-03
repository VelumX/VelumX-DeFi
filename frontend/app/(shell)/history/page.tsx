import { Metadata } from 'next';
import HistoryPageContent from './HistoryPageContent';

export const metadata: Metadata = {
  title: 'History',
  description: 'Track your recent swaps, bridges, and stacking activity on VelumX. Real-time transaction status and history.',
  alternates: {
    canonical: 'https://app.velumx.xyz/history',
  },
  robots: {
    index: false, // User-specific page — no value in indexing
    follow: false,
  },
};

export default function HistoryPage() {
  return <HistoryPageContent />;
}
