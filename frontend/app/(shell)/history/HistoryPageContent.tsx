'use client';

import dynamic from 'next/dynamic';

const TransactionHistory = dynamic(
  () => import('@/components/TransactionHistory').then((mod) => mod.TransactionHistory),
  { ssr: false },
);

export default function HistoryPageContent() {
  return (
    <>
      {/* Hero Section */}
      <div className="mb-12 relative">
        <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 opacity-20 dark:opacity-10 pointer-events-none">
          <div className="w-[500px] h-[500px] bg-purple-600 rounded-full blur-[120px] opacity-20" />
        </div>
        <div className="flex flex-col gap-2 relative z-10">
          <h1
            className="text-4xl font-bold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            History
          </h1>
          <p
            className="text-lg font-light leading-relaxed max-w-2xl"
            style={{ color: 'var(--text-secondary)' }}
          >
            Track your recent activity and transaction status in real-time.
          </p>
        </div>
      </div>

      {/* Interface Card */}
      <div className="relative z-10 mb-16">
        <div
          className="vellum-shadow-xl rounded-[2.5rem] overflow-hidden border"
          style={{
            backgroundColor: 'rgba(var(--bg-surface-rgb), 0.9)',
            borderColor: 'var(--border-color)',
            backdropFilter: 'blur(40px)',
          }}
        >
          <TransactionHistory />
        </div>
      </div>
    </>
  );
}
