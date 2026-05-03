/**
 * StacksWalletButton
 * Compact Stacks-only wallet button for the sidebar.
 * Used on Swap, Earn, and History pages.
 * Bridge uses WalletButton (RainbowKit Ethereum + this).
 */

'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '../lib/hooks/useWallet';
import { Wallet, ChevronDown } from 'lucide-react';

const StacksWalletConnector = dynamic(
  () => import('./StacksWalletConnector').then((m) => m.StacksWalletConnector),
  { ssr: false },
);

export function StacksWalletButton() {
  const { stacksAddress, stacksConnected, balances, disconnectStacks } = useWallet();

  const [showConnector, setShowConnector] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const fmt = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  const fmtBal = (b: string) => parseFloat(b).toFixed(2);

  if (!stacksConnected) {
    return (
      <>
        <button
          onClick={() => setShowConnector(true)}
          className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-full font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
          }}
        >
          <Wallet size={16} />
          Connect Wallet
        </button>
        {showConnector && (
          <StacksWalletConnector onClose={() => setShowConnector(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="relative w-full">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full transition-colors hover:opacity-80 w-full"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
          }}
        >
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: '#3B82F6', boxShadow: '0 0 6px rgba(59,130,246,0.6)' }}
          />
          <span className="text-sm font-medium flex-1 truncate text-left">
            {fmt(stacksAddress!)}
          </span>
          <ChevronDown size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        </button>

        {showDropdown && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
            <div
              className="absolute left-0 bottom-full mb-2 w-72 rounded-2xl shadow-2xl z-50 overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div className="p-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Stacks
                  </span>
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: '#3B82F6', boxShadow: '0 0 6px rgba(59,130,246,0.5)' }}
                  />
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'Address', value: fmt(stacksAddress!) },
                    { label: 'STX', value: fmtBal(balances.stx) },
                    { label: 'USDCx', value: fmtBal(balances.usdcx) },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                      <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3">
                <button
                  onClick={() => { disconnectStacks(); setShowDropdown(false); }}
                  className="w-full py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-70"
                  style={{
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    color: '#3B82F6',
                  }}
                >
                  Disconnect
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showConnector && (
        <StacksWalletConnector onClose={() => setShowConnector(false)} />
      )}
    </>
  );
}
