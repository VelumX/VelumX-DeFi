/**
 * StacksWalletButton
 * Compact Stacks-only wallet button for the sidebar.
 * Used on Swap, Earn, and History pages.
 * Bridge uses the full WalletButton (Ethereum + Stacks).
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

  const formatAddress = (address: string) =>
    `${address.slice(0, 4)}...${address.slice(-4)}`;

  const formatBalance = (balance: string) =>
    parseFloat(balance).toFixed(2);

  if (!stacksConnected) {
    return (
      <>
        <button
          onClick={() => setShowConnector(true)}
          className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-full font-medium transition-all transform hover:scale-105 shadow-lg w-full justify-center"
        >
          <Wallet size={18} />
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
          className="flex items-center gap-3 px-4 py-2.5 rounded-full transition-colors hover:opacity-80 w-full"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
          }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse flex-shrink-0" />
            <span className="text-sm font-medium truncate">
              {formatAddress(stacksAddress!)}
            </span>
          </div>
          <ChevronDown size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        </button>

        {showDropdown && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
            <div
              className="absolute left-0 bottom-full mb-3 w-72 rounded-2xl shadow-2xl z-50 overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
              }}
            >
              {/* Stacks info */}
              <div className="p-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-xs uppercase font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Stacks
                  </span>
                  <div className="w-2 h-2 bg-orange-400 rounded-full" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>Address:</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                      {formatAddress(stacksAddress!)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>STX:</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                      {formatBalance(balances.stx)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>USDCx:</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                      {formatBalance(balances.usdcx)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-4">
                <button
                  onClick={() => {
                    disconnectStacks();
                    setShowDropdown(false);
                  }}
                  className="w-full py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: 'rgba(239,68,68,0.15)',
                    color: '#EF4444',
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
