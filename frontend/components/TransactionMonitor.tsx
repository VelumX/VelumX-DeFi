/**
 * TransactionMonitor Component
 * Real-time transaction status display with progress tracking
 */

'use client';

import { useState, useEffect } from 'react';
import { useConfig } from '../lib/config';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  ArrowRight
} from 'lucide-react';

// Define BridgeTransaction type locally
interface BridgeTransaction {
  id: string;
  type: 'deposit' | 'withdrawal';
  sourceTxHash: string;
  destinationTxHash?: string;
  sourceChain: string;
  destinationChain: string;
  amount: string;
  sender: string;
  recipient: string;
  status: string;
  timestamp: number;
}

interface TransactionMonitorProps {
  txHash: string;
  onClose?: () => void;
}

const DEPOSIT_STEPS = [
  'Deposit USDC on Ethereum',
  'Circle Burns Tokens',
  'Fetch Circle Attestation',
  'Mint USDCx on Stacks',
  'Complete',
];

const WITHDRAWAL_STEPS = [
  'Burn USDCx on Stacks',
  'Fetch Stacks Attestation',
  'Submit to Ethereum',
  'Mint USDC on Ethereum',
  'Complete',
];

export function TransactionMonitor({ txHash, onClose }: TransactionMonitorProps) {
  const config = useConfig();
  const [transaction, setTransaction] = useState<BridgeTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch transaction status
  const fetchTransaction = async () => {
    try {
      const response = await fetch(`${config.backendUrl}/api/transactions/${txHash}`);
      const data = await response.json();

      if (data.success) {
        setTransaction(data.data);
        setError(null);
      } else {
        setError('Transaction not found');
      }
    } catch (err) {
      console.error('Failed to fetch transaction:', err);
      setError('Failed to fetch transaction status');
    } finally {
      setLoading(false);
    }
  };

  // Poll for updates
  useEffect(() => {
    fetchTransaction();

    // Poll every 10 seconds if transaction is not complete
    const interval = setInterval(() => {
      if (transaction?.status !== 'completed' && transaction?.status !== 'failed') {
        fetchTransaction();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [txHash]);

  // Get current step index based on status
  const getCurrentStep = (): number => {
    if (!transaction) return 0;

    const statusMap: Record<string, number> = {
      pending: 0,
      confirmed: 1,
      attestation_pending: 2,
      minting: 3,
      completed: 4,
      failed: 0,
    };

    return statusMap[transaction.status] || 0;
  };

  // Get explorer URL
  const getExplorerUrl = (chain: string, hash: string): string => {
    if (chain === 'ethereum') {
      return `${config.ethereumExplorerUrl}/tx/${hash}`;
    } else {
      return `${config.stacksExplorerUrl}/txid/${hash}`;
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl p-8" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-purple-600 dark:text-purple-400" />
          <span style={{ color: 'var(--text-secondary)' }}>Loading transaction...</span>
        </div>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-4">
          <XCircle className="w-6 h-6 text-red-500 dark:text-red-400" />
          <h3 className="text-lg font-bold text-red-700 dark:text-red-200">Error</h3>
        </div>
        <p className="text-red-600 dark:text-red-200/80">{error}</p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/30 rounded-lg text-sm text-red-700 dark:text-red-200 transition-colors"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  const steps = transaction.type === 'deposit' ? DEPOSIT_STEPS : WITHDRAWAL_STEPS;
  const currentStep = getCurrentStep();
  const isComplete = transaction.status === 'completed';
  const isFailed = transaction.status === 'failed';

  return (
    <div className="rounded-2xl p-8" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            {transaction.type === 'deposit' ? 'Bridge In' : 'Bridge Out'} Transaction
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {transaction.amount} {transaction.type === 'deposit' ? 'USDC → USDCx' : 'USDCx → USDC'}
          </p>
        </div>
        {isComplete && (
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-6 h-6" />
            <span className="font-medium">Complete</span>
          </div>
        )}
        {isFailed && (
          <div className="flex items-center gap-2 text-red-400">
            <XCircle className="w-6 h-6" />
            <span className="font-medium">Failed</span>
          </div>
        )}
      </div>

      {/* Progress Steps */}
      <div className="space-y-4 mb-6">
        {steps.map((step, index) => {
          const isActive = index === currentStep && !isComplete && !isFailed;
          const isCompleted = index < currentStep || isComplete;
          const isPending = index > currentStep && !isComplete && !isFailed;

          return (
            <div key={index} className="flex items-start gap-4">
              {/* Step Indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${isCompleted
                    ? 'bg-green-50 dark:bg-green-500/20 border-green-500'
                    : isActive
                      ? 'bg-purple-50 dark:bg-purple-500/20 border-purple-500'
                      : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700'
                    }`}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5 text-green-500 dark:text-green-400" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 text-purple-600 dark:text-purple-400 animate-spin" />
                  ) : (
                    <Clock className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-0.5 h-12 mt-2 transition-colors ${isCompleted ? 'bg-green-400 dark:bg-green-500/50' : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                  />
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 pt-2">
                <p
                  className={`font-medium ${isCompleted
                    ? 'text-green-600 dark:text-green-300'
                    : isActive
                      ? ''
                      : ''
                    }`}
                  style={{ color: isCompleted ? undefined : (isActive ? 'var(--text-primary)' : 'var(--text-secondary)') }}
                >
                  {step}
                </p>
                {isActive && (
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>In progress...</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Transaction Details */}
      <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: 'rgba(var(--bg-primary-rgb), 0.5)', border: '1px solid var(--border-color)' }}>
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
          <span className="font-medium capitalize" style={{ color: 'var(--text-primary)' }}>{transaction.status.replace('_', ' ')}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>From:</span>
          <span className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
            {transaction.sender.slice(0, 8)}...{transaction.sender.slice(-6)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>To:</span>
          <span className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
            {transaction.recipient.slice(0, 8)}...{transaction.recipient.slice(-6)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>Time:</span>
          <span style={{ color: 'var(--text-primary)' }}>{new Date(transaction.timestamp).toLocaleString()}</span>
        </div>
      </div>

      {/* Explorer Links */}
      <div className="mt-6 space-y-2">
        <a
          href={getExplorerUrl(transaction.sourceChain, transaction.sourceTxHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-3 rounded-lg transition-colors group hover:bg-gray-100 dark:hover:bg-gray-800"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}
        >
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>View on {transaction.sourceChain === 'ethereum' ? 'Etherscan' : 'Stacks Explorer'}</span>
          <ExternalLink className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        </a>
        {transaction.destinationTxHash && (
          <a
            href={getExplorerUrl(transaction.destinationChain, transaction.destinationTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-lg transition-colors group hover:bg-gray-100 dark:hover:bg-gray-800"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}
          >
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>View on {transaction.destinationChain === 'ethereum' ? 'Etherscan' : 'Stacks Explorer'}</span>
            <ExternalLink className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </a>
        )}
      </div>

      {/* Close Button */}
      {onClose && (
        <button
          onClick={onClose}
          className="mt-6 w-full py-3 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
        >
          Close
        </button>
      )}
    </div>
  );
}
