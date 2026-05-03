/**
 * StacksWalletConnector
 * Stacks wallet modal — supports OKX, Xverse, and Leather.
 * OKX is detected via window.okxwallet.stacks; Xverse and Leather via the
 * standard @stacks/connect provider discovery.
 */

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useWallet, StacksWalletType } from '../lib/hooks/useWallet';
import { X, AlertCircle, CheckCircle, Loader2, ExternalLink } from 'lucide-react';

interface StacksWalletConnectorProps {
  onClose?: () => void;
}

// Inline SVG icons as data URIs — no external requests, no CORS failures, always visible.
const WALLET_ICONS: Record<string, string> = {
  okx: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%23000'/><rect x='10' y='10' width='35' height='35' rx='4' fill='white'/><rect x='55' y='10' width='35' height='35' rx='4' fill='white'/><rect x='10' y='55' width='35' height='35' rx='4' fill='white'/><rect x='55' y='55' width='35' height='35' rx='4' fill='white'/></svg>`,

  xverse: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%23EE7A30'/><text x='50' y='68' font-size='52' font-family='Arial Black,sans-serif' font-weight='900' text-anchor='middle' fill='white'>X</text></svg>`,

  leather: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%231A1A1A'/><rect x='20' y='38' width='60' height='8' rx='4' fill='%23C8A96E'/><rect x='20' y='54' width='45' height='8' rx='4' fill='%23C8A96E'/><rect x='20' y='22' width='60' height='8' rx='4' fill='%23C8A96E'/></svg>`,

  hiro: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%235546FF'/><text x='50' y='68' font-size='42' font-family='Arial,sans-serif' font-weight='700' text-anchor='middle' fill='white'>H</text></svg>`,
};

interface WalletOption {
  id: StacksWalletType;
  name: string;
  description: string;
  icon: string;
  installUrl: string;
  detected: boolean;
}

function useDetectedWallets(): WalletOption[] {
  const [wallets, setWallets] = useState<WalletOption[]>([]);

  useEffect(() => {
    const win = window as any;

    const options: WalletOption[] = [
      {
        id: 'okx',
        name: 'OKX Wallet',
        description: 'Multi-chain wallet by OKX',
        icon: WALLET_ICONS.okx,
        installUrl: 'https://www.okx.com/web3',
        detected: !!(win.okxwallet?.stacks || win.okxwallet?.bitcoin),
      },
      {
        id: 'xverse',
        name: 'Xverse',
        description: 'Bitcoin & Stacks wallet',
        icon: WALLET_ICONS.xverse,
        installUrl: 'https://www.xverse.app',
        detected: !!(win.XverseProviders?.StacksProvider || win.StacksProvider),
      },
      {
        id: 'leather',
        name: 'Leather',
        description: 'Bitcoin-native Stacks wallet',
        icon: WALLET_ICONS.leather,
        installUrl: 'https://leather.io',
        detected: !!(win.LeatherProvider || win.HiroWalletProvider),
      },
    ];

    setWallets(options);
  }, []);

  return wallets;
}

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
  const wallets = useDetectedWallets();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  const handleConnect = async (walletType: StacksWalletType) => {
    setError(null);
    try {
      if (onClose) onClose();
      await connectStacks(walletType);
    } catch (err) {
      setError((err as Error).message);
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
        style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(16px)' }}
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
            boxShadow: '0 32px 64px -12px rgba(0,0,0,0.6)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Connect Stacks Wallet
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Choose your Stacks wallet to continue
              </p>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: 'var(--text-secondary)' }}
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
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      Connected
                    </p>
                    <p className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>
                      {stacksWalletType}
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
                  {[
                    { label: 'Address', value: fmt(stacksAddress!) },
                    {
                      label: 'STX',
                      value: isFetchingBalances ? null : `${fmtBal(balances.stx)} STX`,
                    },
                    {
                      label: 'USDCx',
                      value: isFetchingBalances ? null : `${fmtBal(balances.usdcx, 2)} USDCx`,
                    },
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
                  style={{
                    backgroundColor: 'rgba(59,130,246,0.1)',
                    color: '#3B82F6',
                  }}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              /* ── Wallet list ── */
              wallets.map((wallet) => (
                <div key={wallet.id} className="relative">
                  <button
                    onClick={() => handleConnect(wallet.id)}
                    disabled={isConnecting}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.4)';
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(59,130,246,0.04)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)';
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-primary)';
                    }}
                  >
                    {/* Icon */}
                    <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                      <img
                        src={wallet.icon}
                        alt={wallet.name}
                        className="w-11 h-11 object-contain rounded-xl"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {wallet.name}
                        </p>
                        {wallet.detected && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{
                              backgroundColor: 'rgba(59,130,246,0.1)',
                              color: '#3B82F6',
                            }}
                          >
                            Detected
                          </span>
                        )}
                      </div>
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {wallet.description}
                      </p>
                    </div>

                    {isConnecting ? (
                      <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: '#3B82F6' }} />
                    ) : !wallet.detected ? (
                      <a
                        href={wallet.installUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs font-medium flex-shrink-0 hover:opacity-70 transition-opacity"
                        style={{ color: '#3B82F6' }}
                      >
                        Install <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : null}
                  </button>
                </div>
              ))
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
