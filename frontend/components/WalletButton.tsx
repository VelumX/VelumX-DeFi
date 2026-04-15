/**
 * WalletButton Component
 * Compact wallet connection button for navbar
 */

'use client';

import { useState } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { WalletConnector } from './WalletConnector';
import { Wallet, ChevronDown } from 'lucide-react';

export function WalletButton() {
  const {
    ethereumAddress,
    ethereumConnected,
    stacksAddress,
    stacksConnected,
    balances,
    disconnectAll,
  } = useWallet();

  const [showConnector, setShowConnector] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const isConnected = ethereumConnected || stacksConnected;

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    return num.toFixed(2);
  };

  if (!isConnected) {
    return (
      <>
        <button
          onClick={() => setShowConnector(true)}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-full font-medium transition-all transform hover:scale-105 shadow-lg"
        >
          <Wallet size={18} />
          Connect Wallet
        </button>
        {showConnector && <WalletConnector onClose={() => setShowConnector(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-3 px-4 py-2.5 rounded-full transition-colors hover:opacity-80"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)'
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm font-medium">
              {ethereumConnected && stacksConnected
                ? 'Both Connected'
                : ethereumConnected
                  ? formatAddress(ethereumAddress!)
                  : formatAddress(stacksAddress!)}
            </span>
          </div>
          <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />
        </button>

        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute left-0 bottom-full mb-3 w-80 rounded-2xl shadow-2xl z-50 overflow-hidden origin-bottom transition-all duration-200" style={{
              backgroundColor: 'var(--bg-surface)',
              border: `1px solid var(--border-color)`
            }}>
              {/* Ethereum Section */}
              {ethereumConnected && (
                <div className="p-4" style={{ borderBottom: `1px solid var(--border-color)` }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs uppercase font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      Ethereum (Sepolia)
                    </span>
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text-secondary)' }}>Address:</span>
                      <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{formatAddress(ethereumAddress!)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text-secondary)' }}>ETH:</span>
                      <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{formatBalance(balances.eth)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text-secondary)' }}>USDC:</span>
                      <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{formatBalance(balances.usdc)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Stacks Section */}
              {stacksConnected && (
                <div className="p-4" style={{ borderBottom: `1px solid var(--border-color)` }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs uppercase font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      Stacks
                    </span>
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text-secondary)' }}>Address:</span>
                      <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{formatAddress(stacksAddress!)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text-secondary)' }}>STX:</span>
                      <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{formatBalance(balances.stx)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text-secondary)' }}>USDCx:</span>
                      <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{formatBalance(balances.usdcx)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="p-4 space-y-2">
                {(!ethereumConnected || !stacksConnected) && (
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      setShowConnector(true);
                    }}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Connect {!ethereumConnected ? 'Ethereum' : 'Stacks'}
                  </button>
                )}
                <button
                  onClick={() => {
                    disconnectAll();
                    setShowDropdown(false);
                  }}
                  className="w-full py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    color: '#EF4444'
                  }}
                >
                  Disconnect All
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showConnector && <WalletConnector onClose={() => setShowConnector(false)} />}
    </>
  );
}
