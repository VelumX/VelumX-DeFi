/**
 * TransactionHistory Component
 * Fetches and classifies on-chain activity: bridge, swap, stacking, liquidity.
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../lib/hooks/useWallet';
import { useConfig } from '../lib/config';
import {
  Loader2, CheckCircle, XCircle, Clock,
  ArrowDownUp, Filter, RefreshCw, ExternalLink,
  ArrowLeftRight, TrendingUp, Droplets,
} from 'lucide-react';

type TxType = 'bridge' | 'swap' | 'stacking' | 'liquidity' | 'other';
type FilterType = 'all' | TxType;
type SortType = 'newest' | 'oldest';

interface Transaction {
  id: string;
  type: TxType;
  txHash: string;
  chain: 'ethereum' | 'stacks';
  functionName: string;
  contractName: string;
  status: 'success' | 'pending' | 'failed';
  timestamp: number;
  from: string;
}

// Classify a Stacks tx by contract + function name
function classifyTx(contractId: string, functionName: string): TxType {
  const contract = (contractId?.split('.')?.[1] || '').toLowerCase();
  const fn = (functionName || '').toLowerCase();

  // Stacking DAO
  if (contractId?.includes('SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG') ||
      contract.includes('stacking-dao') || fn === 'deposit' && contract.includes('core') ||
      fn === 'withdraw-idle' || fn === 'init-withdraw' || fn === 'withdraw') {
    if (contractId?.includes('stacking-dao') || contractId?.includes('SP4SZE494')) return 'stacking';
  }

  // LP / liquidity
  if (fn === 'add-to-position' || fn === 'reduce-position' ||
      fn.includes('add-liquidity') || fn.includes('remove-liquidity') ||
      contract.includes('fwp-') || contract.includes('amm-swap-pool') ||
      contract.includes('liquidity')) return 'liquidity';

  // Swap
  if (fn.includes('swap') || contract.includes('amm') ||
      contract.includes('alex') || contract.includes('swap-pool') ||
      contract.includes('simple-paymaster') && fn.includes('swap')) return 'swap';

  // Bridge
  if (fn.includes('bridge') || fn.includes('burn') || fn.includes('mint') ||
      contract.includes('usdcx') || contract.includes('bridge') ||
      contract.includes('xreserve') || contract.includes('simple-paymaster') && fn.includes('bridge')) return 'bridge';

  return 'other';
}

const TYPE_META: Record<TxType, { label: string; icon: React.ReactNode; color: string }> = {
  swap:      { label: 'Swap',      icon: <ArrowDownUp className="w-4 h-4" />,   color: 'text-purple-500' },
  bridge:    { label: 'Bridge',    icon: <ArrowLeftRight className="w-4 h-4" />, color: 'text-blue-500' },
  stacking:  { label: 'Stacking',  icon: <TrendingUp className="w-4 h-4" />,    color: 'text-green-500' },
  liquidity: { label: 'Liquidity', icon: <Droplets className="w-4 h-4" />,      color: 'text-orange-500' },
  other:     { label: 'Other',     icon: <ArrowDownUp className="w-4 h-4" />,   color: 'text-gray-400' },
};

const FILTERS: FilterType[] = ['all', 'swap', 'bridge', 'stacking', 'liquidity'];

export function TransactionHistory() {
  const { ethereumAddress, stacksAddress } = useWallet();
  const config = useConfig();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('newest');

  const fetchTransactions = async (refresh = false) => {
    if (!ethereumAddress && !stacksAddress) { setLoading(false); return; }
    if (refresh) setLoading(true);

    try {
      const all: Transaction[] = [];

      if (stacksAddress) {
        const res = await fetch(
          `https://api.mainnet.hiro.so/extended/v1/address/${stacksAddress}/transactions?limit=30`
        );
        const data = await res.json();
        if (data.results) {
          for (const tx of data.results) {
            const contractId: string = tx.contract_call?.contract_id || '';
            const fn: string = tx.contract_call?.function_name || '';
            const type = classifyTx(contractId, fn);
            all.push({
              id: tx.tx_id,
              type,
              txHash: tx.tx_id,
              chain: 'stacks',
              functionName: fn || tx.tx_type,
              contractName: contractId?.split('.')?.[1] || tx.tx_type,
              status: tx.tx_status === 'success' ? 'success' : tx.tx_status === 'pending' ? 'pending' : 'failed',
              timestamp: tx.burn_block_time,
              from: tx.sender_address,
            });
          }
        }
      }

      setTransactions(all);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setError('Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTransactions(); }, [ethereumAddress, stacksAddress]);

  const filtered = transactions.filter(tx => filter === 'all' || tx.type === filter);
  const sorted = [...filtered].sort((a, b) =>
    sort === 'newest' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
  );

  const getStatusIcon = (status: string) => {
    if (status === 'success') return <CheckCircle className="w-5 h-5 text-green-400" />;
    if (status === 'failed')  return <XCircle className="w-5 h-5 text-red-400" />;
    return <Clock className="w-5 h-5 text-yellow-400" />;
  };

  const getStatusColor = (status: string) =>
    status === 'success' ? 'text-green-400' : status === 'failed' ? 'text-red-400' : 'text-yellow-400';

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const getExplorerUrl = (chain: string, hash: string) =>
    chain === 'ethereum'
      ? `${config.ethereumExplorerUrl}/tx/${hash}`
      : `${config.stacksExplorerUrl}/txid/${hash}`;

  // Count per type for filter badges
  const counts = transactions.reduce((acc, tx) => {
    acc[tx.type] = (acc[tx.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="rounded-3xl vellum-shadow transition-all duration-300" style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        padding: '2rem',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Activity</h2>
          <button onClick={() => fetchTransactions(true)} disabled={loading}
            className="p-2 rounded-lg transition-colors disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-800">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${filter === f ? 'bg-purple-600 text-white' : ''}`}
                style={filter !== f ? { backgroundColor: 'rgba(var(--bg-primary-rgb), 0.5)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' } : {}}>
                {f !== 'all' && <span className={TYPE_META[f as TxType]?.color}>{TYPE_META[f as TxType]?.icon}</span>}
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && counts[f] ? (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-white/20">{counts[f]}</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select value={sort} onChange={e => setSort(e.target.value as SortType)}
              className="rounded-lg px-3 py-1.5 text-xs outline-none font-medium"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>

        {/* Loading */}
        {loading && transactions.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4">
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && sorted.length === 0 && (
          <div className="text-center py-12">
            <ArrowDownUp className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
            <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>No transactions yet</p>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
              Swap, bridge, stack, or provide liquidity to get started
            </p>
          </div>
        )}

        {/* List */}
        {sorted.length > 0 && (
          <div className="space-y-3">
            {sorted.map(tx => {
              const meta = TYPE_META[tx.type];
              return (
                <div key={tx.id}
                  className="rounded-xl p-4 transition-all hover:-translate-y-0.5"
                  style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Type icon */}
                      <div className={`p-2 rounded-lg ${meta.color}`}
                        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                        {meta.icon}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{meta.label}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                            {tx.functionName || tx.contractName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <span className="font-mono">{formatAddress(tx.from)}</span>
                          <span style={{ opacity: 0.4 }}>•</span>
                          <span>{new Date(tx.timestamp * 1000).toLocaleDateString()}</span>
                          <span style={{ opacity: 0.4 }}>•</span>
                          <span>{new Date(tx.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        {getStatusIcon(tx.status)}
                        <span className={`text-xs font-semibold capitalize ${getStatusColor(tx.status)}`}>{tx.status}</span>
                      </div>
                      <a href={getExplorerUrl(tx.chain, tx.txHash)} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg transition-colors hover:bg-purple-500/10 text-purple-500">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
