'use client';

import dynamic from 'next/dynamic';
import { Shield, Zap, Repeat } from 'lucide-react';
import { prefetchTokens } from '@/lib/hooks/useTokenStore';

// Kick off the Bitflow token fetch immediately when this module loads —
// before SwapInterface (which is lazy-loaded) even begins mounting.
prefetchTokens();

const SwapInterface = dynamic(
  () => import('@/components/SwapInterface').then((mod) => mod.SwapInterface),
  { ssr: false },
);

export default function SwapPageContent() {
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
            Swap
          </h1>
          <p
            className="text-lg font-light leading-relaxed max-w-2xl"
            style={{ color: 'var(--text-secondary)' }}
          >
            Trade tokens instantly at the best market rates using our peer-to-peer liquidity
            protocol.
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
          <SwapInterface />
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid md:grid-cols-3 gap-6 mb-16 opacity-80 hover:opacity-100 transition-opacity duration-500">
        <div
          className="rounded-2xl p-6 transition-all duration-300"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}
        >
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4">
            <Shield className="h-5 w-5 text-purple-600" />
          </div>
          <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Bank-Grade
          </h3>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Fully audited non-custodial smart contracts.
          </p>
        </div>

        <div
          className="rounded-2xl p-6 transition-all duration-300"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
            <Zap className="h-5 w-5 text-blue-600" />
          </div>
          <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Instant Finality
          </h3>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Fast transactions powered by Bitcoin L2.
          </p>
        </div>

        <div
          className="rounded-2xl p-6 transition-all duration-300"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}
        >
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mb-4">
            <Repeat className="h-5 w-5 text-green-600" />
          </div>
          <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Gasless UX
          </h3>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Pay network fees directly with stablecoins.
          </p>
        </div>
      </div>
    </>
  );
}
