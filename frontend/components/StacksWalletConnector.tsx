/**
 * StacksWalletConnector
 * Stacks-only wallet connection modal — used on Swap, Earn, and History pages.
 * Bridge uses the full WalletConnector (Ethereum + Stacks).
 */

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useWallet, StacksWalletType } from '../lib/hooks/useWallet';
import { Wallet, X, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface StacksWalletConnectorProps {
  onClose?: () => void;
}

const STACKS_WALLETS: StacksWalletType[] = ['xverse', 'leather', 'hiro'];

export function StacksWalletConnector({ onClose }: StacksWalletConnectorProps) {
  const {
    stacksAddress,
    stacksConnected,
    stacksWalletType,
    balances,
    isConnecting,
    isFetchingBalances,
    connectStacks,
    disconnectStacks,
  } = useWallet();

  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, []);

  const handleConnect = async (walletType: StacksWalletType) => {
    setError(null);
    try {
      // Close modal immediately so the wallet popup isn't blocked
      if (onClose) onClose();
      await connectStacks(walletType);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const formatAddress = (address: string) =>
    `${address.slice(0, 6)}...${address.slice(-4)}`;

  const formatBalance = (balance: string, decimals = 4) =>
    parseFloat(balance).toFixed(decimals);

  if (!mounted) return null;

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998]"
        style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative w-full max-w-sm rounded-3xl pointer-events-auto vellum-shadow"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Connect Stacks Wallet
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Xverse · Leather · Hiro
                </p>
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-gray-100 dark:hover:bg-gray-800"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="px-6 pb-6 space-y-4">
            {error && (
              <div
                className="flex items-start gap-3 rounded-xl p-4"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                }}
              >
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
              </div>
            )}

            {stacksConnected ? (
              /* Connected state */
              <div
                className="rounded-2xl p-5 space-y-4"
                style={{
                  backgroundColor: 'rgba(16,185,129,0.08)',
                  border: '1px solid rgba(16,185,129,0.2)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      Connected
                    </p>
                    <p className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>
                      {stacksWalletType}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Address
                    </span>
                    <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {formatAddress(stacksAddress!)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      STX Balance
                    </span>
                    <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {isFetchingBalances ? (
                        <Loader2 className="w-4 h-4 animate-spin inline" />
                      ) : (
                        `${formatBalance(balances.stx)} STX`
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      USDCx Balance
                    </span>
                    <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {isFetchingBalances ? (
                        <Loader2 className="w-4 h-4 animate-spin inline" />
                      ) : (
                        `${formatBalance(balances.usdcx, 2)} USDCx`
                      )}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => { disconnectStacks(); onClose?.(); }}
                  className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-80"
                  style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444' }}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              /* Wallet selection */
              <div className="space-y-3">
                {STACKS_WALLETS.map((wallet) => (
                  <button
                    key={wallet}
                    onClick={() => handleConnect(wallet)}
                    disabled={isConnecting}
                    className="w-full flex items-center justify-between p-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '2px solid var(--border-color)',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                        <Wallet className="w-6 h-6 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold capitalize text-base" style={{ color: 'var(--text-primary)' }}>
                          {wallet}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          Stacks Wallet
                        </p>
                      </div>
                    </div>
                    {isConnecting && <Loader2 className="w-5 h-5 animate-spin text-orange-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 pt-2">
            <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              By connecting, you agree to our{' '}
              <span className="text-orange-500 font-medium">Terms of Service</span>
              {' '}and{' '}
              <span className="text-orange-500 font-medium">Privacy Policy</span>
            </p>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
