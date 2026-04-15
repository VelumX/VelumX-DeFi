/**
 * WalletConnector Component
 * UI for connecting Ethereum (Rabby, MetaMask) and Stacks (Xverse, Leather, Hiro) wallets
 */

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useWallet, EthereumWalletType, StacksWalletType } from '../lib/hooks/useWallet';
import { Wallet, X, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface WalletConnectorProps {
  onClose?: () => void;
}

export function WalletConnector({ onClose }: WalletConnectorProps) {
  const {
    ethereumAddress,
    ethereumConnected,
    ethereumWalletType,
    stacksAddress,
    stacksConnected,
    stacksWalletType,
    balances,
    isConnecting,
    isFetchingBalances,
    connectEthereum,
    disconnectEthereum,
    connectStacks,
    disconnectStacks,
    getAvailableWallets,
  } = useWallet();

  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ethereum' | 'stacks'>('ethereum');
  const [mounted, setMounted] = useState(false);

  const availableWallets = getAvailableWallets();

  // Handle mounting for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, []);

  const handleConnectEthereum = async (walletType: EthereumWalletType) => {
    setError(null);
    try {
      await connectEthereum(walletType);
      // Close modal after successful connection
      if (onClose) {
        setTimeout(() => {
          onClose();
        }, 500); // Small delay to show success state
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleConnectStacks = async (walletType?: StacksWalletType) => {
    setError(null);
    try {
      // Close modal immediately when Stacks wallet popup opens
      if (onClose) {
        onClose();
      }
      await connectStacks(walletType);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatBalance = (balance: string, decimals: number = 4) => {
    const num = parseFloat(balance);
    return num.toFixed(decimals);
  };

  if (!mounted) return null;

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998]"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(12px)'
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div className="relative w-full max-w-md rounded-3xl pointer-events-auto vellum-shadow" style={{
          backgroundColor: 'var(--bg-surface)',
          border: `1px solid var(--border-color)`,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Connect Wallet</h2>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-gray-100 dark:hover:bg-gray-800"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 px-6 mb-4">
            <button
              onClick={() => setActiveTab('ethereum')}
              className={`flex-1 py-3 px-4 text-sm font-semibold rounded-xl transition-all ${activeTab === 'ethereum'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              style={{ color: activeTab === 'ethereum' ? '#FFFFFF' : 'var(--text-secondary)' }}
            >
              Ethereum
            </button>
            <button
              onClick={() => setActiveTab('stacks')}
              className={`flex-1 py-3 px-4 text-sm font-semibold rounded-xl transition-all ${activeTab === 'stacks'
                ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/30'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              style={{ color: activeTab === 'stacks' ? '#FFFFFF' : 'var(--text-secondary)' }}
            >
              Stacks
            </button>
          </div>

          {/* Content */}
          <div className="px-6 pb-6 space-y-4">
            {error && (
              <div className="flex items-start gap-3 rounded-xl p-4" style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}>
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</p>
              </div>
            )}

            {activeTab === 'ethereum' && (
              <div className="space-y-3">
                {ethereumConnected ? (
                  <div className="rounded-2xl p-5 space-y-4" style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.2)'
                  }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          Connected
                        </p>
                        <p className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>
                          {ethereumWalletType}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3 pt-3" style={{ borderTop: `1px solid var(--border-color)` }}>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Address</span>
                        <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{formatAddress(ethereumAddress!)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>ETH Balance</span>
                        <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {isFetchingBalances ? (
                            <Loader2 className="w-4 h-4 animate-spin inline" />
                          ) : (
                            `${formatBalance(balances.eth)} ETH`
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>USDC Balance</span>
                        <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {isFetchingBalances ? (
                            <Loader2 className="w-4 h-4 animate-spin inline" />
                          ) : (
                            `${formatBalance(balances.usdc, 2)} USDC`
                          )}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={disconnectEthereum}
                      className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-80"
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: '#EF4444'
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableWallets.ethereum.length === 0 ? (
                      <div className="rounded-xl p-4" style={{
                        backgroundColor: 'rgba(251, 191, 36, 0.1)',
                        border: '1px solid rgba(251, 191, 36, 0.3)'
                      }}>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                          No Ethereum wallet detected. Please install{' '}
                          <a
                            href="https://rabby.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline font-semibold hover:opacity-70"
                          >
                            Rabby
                          </a>{' '}
                          or{' '}
                          <a
                            href="https://metamask.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline font-semibold hover:opacity-70"
                          >
                            MetaMask
                          </a>
                          .
                        </p>
                      </div>
                    ) : (
                      (availableWallets.ethereum || []).map((wallet) => (
                        <button
                          key={wallet}
                          onClick={() => handleConnectEthereum(wallet)}
                          disabled={isConnecting}
                          className="w-full flex items-center justify-between p-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            border: `2px solid var(--border-color)`,
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                          }}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                              <Wallet className="w-6 h-6 text-white" />
                            </div>
                            <div className="text-left">
                              <p className="font-bold capitalize text-base" style={{ color: 'var(--text-primary)' }}>{wallet}</p>
                              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Ethereum Wallet</p>
                            </div>
                          </div>
                          {isConnecting && (
                            <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'stacks' && (
              <div className="space-y-3">
                {stacksConnected ? (
                  <div className="rounded-2xl p-5 space-y-4" style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.2)'
                  }}>
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
                    <div className="space-y-3 pt-3" style={{ borderTop: `1px solid var(--border-color)` }}>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Address</span>
                        <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{formatAddress(stacksAddress!)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>STX Balance</span>
                        <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {isFetchingBalances ? (
                            <Loader2 className="w-4 h-4 animate-spin inline" />
                          ) : (
                            `${formatBalance(balances.stx)} STX`
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>USDCx Balance</span>
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
                      onClick={disconnectStacks}
                      className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-80"
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: '#EF4444'
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(['xverse', 'leather', 'hiro'] as StacksWalletType[])?.map((wallet) => (
                      <button
                        key={wallet}
                        onClick={() => handleConnectStacks(wallet)}
                        disabled={isConnecting}
                        className="w-full flex items-center justify-between p-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          border: `2px solid var(--border-color)`,
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                            <Wallet className="w-6 h-6 text-white" />
                          </div>
                          <div className="text-left">
                            <p className="font-bold capitalize text-base" style={{ color: 'var(--text-primary)' }}>{wallet}</p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Stacks Wallet</p>
                          </div>
                        </div>
                        {isConnecting && (
                          <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 pt-2">
            <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              By connecting, you agree to our{' '}
              <span className="text-purple-600 dark:text-purple-400 font-medium">Terms of Service</span>
              {' '}and{' '}
              <span className="text-purple-600 dark:text-purple-400 font-medium">Privacy Policy</span>
            </p>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
