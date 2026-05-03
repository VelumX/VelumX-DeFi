/**
 * StacksWalletConnector
 *
 * Two connection paths:
 *  1. OKX Wallet  — direct provider injection (window.okxwallet.stacks)
 *  2. Bitcoin Wallets (Xverse / Leather / any @stacks/connect wallet) —
 *     delegates entirely to @stacks/connect's native picker, which has
 *     the correct wallet icons and handles all edge cases.
 *
 * This keeps our modal minimal and avoids duplicating wallet icon assets.
 */

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useWallet } from '../lib/hooks/useWallet';
import { X, AlertCircle, CheckCircle, Loader2, ExternalLink } from 'lucide-react';

interface StacksWalletConnectorProps {
  onClose?: () => void;
}

// OKX icon — extracted from @rainbow-me/rainbowkit bundle (official OKX SVG)
const OKX_ICON = `data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2028%2028%22%3E%3Cpath%20fill%3D%22%23000%22%20d%3D%22M0%200h28v28H0z%22%2F%3E%3Cpath%20fill%3D%22%23fff%22%20fill-rule%3D%22evenodd%22%20d%3D%22M10.819%205.556H5.93a.376.376%200%200%200-.375.375v4.888c0%20.207.168.375.375.375h4.888a.376.376%200%200%200%20.375-.376V5.932a.376.376%200%200%200-.376-.375Zm5.64%205.638h-4.886a.376.376%200%200%200-.376.376v4.887c0%20.208.168.376.376.376h4.887a.376.376%200%200%200%20.376-.375V11.57a.376.376%200%200%200-.376-.377Zm.75-5.638h4.887c.208%200%20.376.168.376.375v4.888a.376.376%200%200%201-.376.375H17.21a.376.376%200%200%201-.376-.376V5.933c0-.208.169-.376.376-.376Zm-6.39%2011.277H5.93a.376.376%200%200%200-.375.376v4.887c0%20.208.168.376.375.376h4.888a.376.376%200%200%200%20.375-.376V17.21a.376.376%200%200%200-.376-.376Zm6.39%200h4.887c.208%200%20.376.169.376.376v4.887a.376.376%200%200%201-.376.376H17.21a.376.376%200%200%201-.376-.376V17.21c0-.207.169-.376.376-.376Z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E`;

// Bitcoin/Stacks wallets icon — generic Bitcoin "₿" mark on orange
const BITCOIN_WALLETS_ICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'%3E%3Crect width='28' height='28' rx='6' fill='%23F7931A'/%3E%3Ctext x='14' y='20' font-size='16' font-family='Arial,sans-serif' font-weight='900' text-anchor='middle' fill='white'%3E%E2%82%BF%3C/text%3E%3C/svg%3E`;

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
  const [okxDetected, setOkxDetected] = useState(false);

  useEffect(() => {
    setMounted(true);
    const win = window as any;
    setOkxDetected(!!(win.okxwallet?.stacks || win.okxwallet?.bitcoin));
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  const handleOKX = async () => {
    setError(null);
    try {
      if (onClose) onClose();
      await connectStacks('okx');
    } catch (err: any) {
      if (err?.message !== 'Cancelled') setError(err.message);
    }
  };

  const handleBitcoinWallets = async () => {
    // Close our modal first, then let @stacks/connect show its native picker
    // which has correct Xverse/Leather icons and handles all wallet edge cases.
    setError(null);
    if (onClose) onClose();
    try {
      await connectStacks('xverse'); // 'xverse' triggers the @stacks/connect native picker
    } catch (err: any) {
      if (err?.message !== 'Cancelled') setError(err.message);
    }
  };

  const fmt = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const fmtBal = (b: string, d = 4) => parseFloat(b).toFixed(d);

  if (!mounted) return null;

  const content = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998]"
        style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative w-full max-w-sm rounded-3xl pointer-events-auto"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 32px 64px -12px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-5">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Connect Stacks Wallet
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Choose how to connect
              </p>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="px-6 pb-6 space-y-3">
            {error && (
              <div
                className="flex items-start gap-3 rounded-2xl p-3"
                style={{
                  backgroundColor: 'rgba(59,130,246,0.08)',
                  border: '1px solid rgba(59,130,246,0.2)',
                }}
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#3B82F6' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{error}</p>
              </div>
            )}

            {stacksConnected ? (
              /* ── Connected state ── */
              <div
                className="rounded-2xl p-5 space-y-4"
                style={{
                  backgroundColor: 'rgba(59,130,246,0.06)',
                  border: '1px solid rgba(59,130,246,0.15)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(59,130,246,0.12)' }}
                  >
                    <CheckCircle className="w-5 h-5" style={{ color: '#3B82F6' }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Connected</p>
                    <p className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>
                      {stacksWalletType}
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
                  {[
                    { label: 'Address', value: fmt(stacksAddress!) },
                    { label: 'STX', value: isFetchingBalances ? null : `${fmtBal(balances.stx)} STX` },
                    { label: 'USDCx', value: isFetchingBalances ? null : `${fmtBal(balances.usdcx, 2)} USDCx` },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                      <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {value ?? <Loader2 className="w-3.5 h-3.5 animate-spin inline" />}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => { disconnectStacks(); onClose?.(); }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-70"
                  style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              /* ── Wallet options ── */
              <>
                {/* Bitcoin Wallets (Xverse, Leather, etc.) — native @stacks/connect picker */}
                <button
                  onClick={handleBitcoinWallets}
                  disabled={isConnecting}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.4)';
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(59,130,246,0.04)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)';
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-primary)';
                  }}
                >
                  <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0">
                    <img src={BITCOIN_WALLETS_ICON} alt="Bitcoin Wallets" className="w-11 h-11" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Bitcoin Wallets
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Xverse, Leather &amp; more
                    </p>
                  </div>
                  {isConnecting
                    ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: '#3B82F6' }} />
                    : null}
                </button>

                {/* OKX Wallet */}
                <button
                  onClick={handleOKX}
                  disabled={isConnecting}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.4)';
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(59,130,246,0.04)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)';
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-primary)';
                  }}
                >
                  <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0">
                    <img src={OKX_ICON} alt="OKX Wallet" className="w-11 h-11" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        OKX Wallet
                      </p>
                      {okxDetected && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}
                        >
                          Detected
                        </span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {okxDetected ? 'Multi-chain wallet by OKX' : 'Not installed'}
                    </p>
                  </div>
                  {isConnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: '#3B82F6' }} />
                  ) : !okxDetected ? (
                    <a
                      href="https://www.okx.com/web3"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs font-medium flex-shrink-0 hover:opacity-70 transition-opacity"
                      style={{ color: '#3B82F6' }}
                    >
                      Install <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : null}
                </button>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-5">
            <p className="text-[11px] text-center" style={{ color: 'var(--text-secondary)' }}>
              By connecting you agree to our{' '}
              <span className="font-medium" style={{ color: '#3B82F6' }}>Terms</span>
              {' '}and{' '}
              <span className="font-medium" style={{ color: '#3B82F6' }}>Privacy Policy</span>
            </p>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
