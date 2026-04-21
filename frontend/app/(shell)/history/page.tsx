import { Metadata } from 'next';
import HistoryPageContent from './HistoryPageContent';

export const metadata: Metadata = {
  title: 'History — VelumX',
  description: 'Track your recent activity and transaction status in real-time.',
};

export default function HistoryPage() {
  return <HistoryPageContent />;
}
