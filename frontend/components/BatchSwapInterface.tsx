/**
 * BatchSwapInterface — Sweep to STX
 * Select 1–6 tokens, all swap to STX atomically in one signed transaction.
 */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';
import { Plus, Trash2, Loader2, AlertTriangle, Layers, Info, ChevronDown, CheckCircle2, Zap } from 'lucide-react';
import { quoteSweep, executeSweep, getAvailableTokens, type DexType, type SweepToken, WSTX_PRINCIPAL } from '@/lib/helpers/batch-swap';

interface Token {
  tokenId: string;
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  source: 'bitflow';
}

interface SwapRow {
  id: string;
  token: Token | null;
  amount: string;
  quote: { stxOut: string; dex: DexType; savings?: string; noLiquidity?: boolean } | null;
}

const DEX_STYLE: Record<DexType, { bg: string; text: string; label: string }> = {
  alex:     { bg: 'rgba(59,130,246,0.12)',  text: '#3b82f6', label: 'ALEX' },
  velar:    { bg: 'rgba(234,88,12,0.12)',   text: '#ea580c', label: 'Velar' },
  arkadiko: { bg: 'rgba(16,185,129,0.12)',  text: '#10b981', label: 'Arkadiko' },
  bitflow:  { bg: 'rgba(124,58,237,0.12)',  text: '#7c3aed', label: 'Bitflow' },
};

// ---- Token Dropdown ----
function TokenDropdown({ tokens, value, onChange, getBalance, disabled, usedAddresses }: {
  tokens: Token[];
  value: Token | null;
  onChange: (t: Token) => void;
  getBalance: (t: Token) => string;
  disabled?: boolean;
  usedAddresses: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = tokens
    .filter(t => !usedAddresses.includes(t.address) || t.address === value?.address)
    .filter(t =>
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (parseFloat(getBalance(b)) || 0) - (parseFloat(getBalance(a)) || 0));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all min-w-[140px]"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
      >
        {value ? (
          <>
            <span className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] font-bold text-purple-600 flex-shrink-0">
              {value.symbol[0]}
            </span>
            <div className="text-left min-w-0">
              <div className="font-bold text-xs">{value.symbol}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{getBalance(value)} bal</div>
            </div>
          </>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>Select token</span>
        )}
        <ChevronDown className="h-3 w-3 ml-auto flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
          <div className="p-2">
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search token..." className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.map(t => {
              const bal = getBalance(t);
              const hasBalance = parseFloat(bal) > 0;
              return (
                <button key={t.address} onClick={() => { onChange(t); setOpen(false); setSearch(''); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-purple-500/10 transition-colors text-left"
                  style={{ color: 'var(--text-primary)' }}>
                  <span className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] font-bold text-purple-600 flex-shrink-0">
                    {t.symbol[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs">{t.symbol}</div>
                    <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{t.name}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-bold" style={{ color: hasBalance ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {hasBalance ? bal : '0'}
                    </div>
                    <div className="text-[9px]" style={{ color: '#7c3aed' }}>
                      Bitflow
                    </div>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-secondary)' }}>No tokens found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main Component ----
export function BatchSwapInterface() {
  const { stacksAddress, stacksConnected, balances } = useWallet();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  const [rows, setRows] = useState<SwapRow[]>([{ id: '1', token: null, amount: '', quote: null }]);
  const [slippage, setSlippage] = useState(0.5);
  const [totalStxOut, setTotalStxOut] = useState<string | null>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  const getBalance = (token: Token): string => {
    if (!token) return '0';

    // Primary: exact principal match
    const byPrincipal = (balances as any)[token.address];
    if (byPrincipal !== undefined && byPrincipal !== null && byPrincipal !== '0') {
      const storedDecimals = (balances as any)[`decimals:${token.address}`];
      const decimals = storedDecimals !== undefined ? parseInt(storedDecimals) : token.decimals;
      const num = Number(byPrincipal) / Math.pow(10, decimals);
      return isNaN(num) ? '0' : num.toFixed(6);
    }

    // Secondary: fuzzy match on principal only (not symbol — avoids false positives)
    if (token.address.includes('.')) {
      const allKeys = Object.keys(balances as any).filter(k =>
        k.includes('.') &&
        !k.startsWith('decimals:') &&
        !k.startsWith('name:') &&
        !k.startsWith('symbol:')
      );
      const fuzzyKey = allKeys.find(k =>
        k.startsWith(token.address) || token.address.startsWith(k)
      );
      if (fuzzyKey) {
        const raw = (balances as any)[fuzzyKey];
        if (raw && raw !== '0') {
          const storedDecimals = (balances as any)[`decimals:${fuzzyKey}`];
          const decimals = storedDecimals !== undefined ? parseInt(storedDecimals) : token.decimals;
          const num = Number(raw) / Math.pow(10, decimals);
          return isNaN(num) ? '0' : num.toFixed(6);
        }
      }
    }

    return '0';
  };

  // Load tokens from Bitflow SDK
  useEffect(() => {
    let cancelled = false;
    const CACHE_KEY = 'velumx_sweep_tokens_v8';
    const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

    const load = async () => {
      setIsLoadingTokens(true);
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { ts, data } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL && data?.length > 0 && !cancelled) {
            setTokens(data); setIsLoadingTokens(false);
          }
        }
      } catch {}

      try {
        const bitflowTokens = await getAvailableTokens();
        if (cancelled) return;

        const mapped: Token[] = bitflowTokens
          .filter(t => t.tokenContract && t.tokenContract.includes('.') && t.tokenContract !== WSTX_PRINCIPAL)
          .map(t => ({
            tokenId: t.tokenId,
            symbol: t.symbol,
            name: t.name || t.symbol,
            address: t.tokenContract!,
            decimals: t.tokenDecimals ?? 6,
            source: 'bitflow' as const,
          }));

        if (!cancelled && mapped.length > 0) {
          setTokens(mapped);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: mapped })); } catch {}
        }
      } catch (e) {
        console.warn('[sweep] Failed to load Bitflow tokens:', e);
      }

      if (!cancelled) setIsLoadingTokens(false);
    };

    load().catch(() => { if (!cancelled) setIsLoadingTokens(false); });
    return () => { cancelled = true; };
  }, []);

  // Quote all rows — use a stable key to avoid re-triggering on quote updates
  const rowInputKey = rows.map(r => `${r.token?.address}:${r.amount}`).join('|');
  const lastKeyRef = useRef('');

  useEffect(() => {
    if (rowInputKey === lastKeyRef.current) return;
    lastKeyRef.current = rowInputKey;

    const validRows = rows.filter(r => r.token && r.amount && parseFloat(r.amount) > 0);
    if (validRows.length === 0) { setTotalStxOut(null); return; }

    const run = async () => {
      setIsFetchingQuote(true);
      setError(null);
      try {
        const inputs = validRows.map(r => {
          const storedDecimals = (balances as any)[`decimals:${r.token!.address}`];
          const decimals = storedDecimals !== undefined ? parseInt(storedDecimals) : r.token!.decimals;
          return {
            principal: r.token!.address,
            tokenId: r.token!.tokenId,
            amount: BigInt(Math.floor(parseFloat(r.amount) * Math.pow(10, decimals))).toString(),
            decimals,
          };
        });

        const result = await quoteSweep(inputs);

        setRows(prev => prev.map(r => {
          const match = result.perToken.find(p => p.principal === r.token?.address);
          return match
            ? { ...r, quote: { stxOut: match.stxOut, dex: match.dex, noLiquidity: match.noLiquidity } }
            : { ...r, quote: r.quote }; // preserve existing quote, don't null it
        }));
        setTotalStxOut(result.stxOut);
      } catch (e: any) {
        setError(e.message || 'Quote failed');
      } finally {
        setIsFetchingQuote(false);
      }
    };

    const t = setTimeout(run, 600);
    return () => clearTimeout(t);
  }, [rowInputKey]);

  const addRow = () => {
    if (rows.length >= 6) return;
    setRows(prev => [...prev, { id: Date.now().toString(), token: null, amount: '', quote: null }]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const updateRow = (id: string, patch: Partial<SwapRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch, quote: null } : r));
    setTotalStxOut(null);
  };

  const setMax = (id: string, token: Token) => {
    const bal = getBalance(token);
    if (parseFloat(bal) > 0) updateRow(id, { amount: bal });
  };

  const handleSwap = async () => {
    if (!stacksAddress) { setError('Connect your wallet first'); return; }
    const validRows = rows.filter(r => r.token && r.amount && parseFloat(r.amount) > 0 && r.quote && !r.quote.noLiquidity);
    if (validRows.length === 0) { setError('Add at least one token with an amount'); return; }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const sweepTokens: SweepToken[] = validRows.map(r => {
        const storedDecimals = (balances as any)[`decimals:${r.token!.address}`];
        const decimals = storedDecimals !== undefined ? parseInt(storedDecimals) : r.token!.decimals;
        return {
          principal: r.token!.address,
          tokenId: r.token!.tokenId,
          amount: BigInt(Math.floor(parseFloat(r.amount) * Math.pow(10, decimals))).toString(),
          decimals,
          dex: r.quote!.dex,
        };
      });

      // minStxOut in micro-STX (1e6), apply slippage to totalStxOut
      const minStxOut = BigInt(Math.floor(parseFloat(totalStxOut!) * (1 - slippage / 100) * 1e6)).toString();

      const txid = await executeSweep({ tokens: sweepTokens, minStxOut, onProgress: setProgress });
      setSuccess(`Sweep submitted! txid: ${txid}`);
      setRows([{ id: '1', token: null, amount: '', quote: null }]);
      setTotalStxOut(null);
    } catch (e: any) {
      setError(e.message || 'Swap failed');
    } finally {
      setIsProcessing(false);
      setProgress('');
    }
  };

  const usedAddresses = rows.map(r => r.token?.address).filter(Boolean) as string[];
  const validCount = rows.filter(r => r.token && r.amount && parseFloat(r.amount) > 0).length;

  return (
    <div className="max-w-xl mx-auto p-6">
      <div className="rounded-3xl" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', padding: '2rem' }}>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-purple-500/10"><Layers className="h-5 w-5 text-purple-600" /></div>
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Sweep to STX</h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Select up to 6 tokens — all swap to STX in one transaction
            </p>
          </div>
          {isLoadingTokens && <Loader2 className="h-4 w-4 animate-spin ml-auto text-purple-500" />}
        </div>

        <div className="space-y-3 mb-4">
          {rows.map((row, idx) => (
            <div key={row.id} className="rounded-2xl p-3"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}>
                  #{idx + 1}
                </span>
                {row.quote && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: DEX_STYLE[row.quote.dex].bg, color: DEX_STYLE[row.quote.dex].text }}>
                    via {DEX_STYLE[row.quote.dex].label}
                  </span>
                )}
                {rows.length > 1 && (
                  <button onClick={() => removeRow(row.id)}
                    className="p-1 rounded-lg hover:bg-red-500/10 transition-colors ml-auto">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <TokenDropdown
                  tokens={tokens}
                  value={row.token}
                  onChange={t => updateRow(row.id, { token: t })}
                  getBalance={getBalance}
                  disabled={isLoadingTokens}
                  usedAddresses={usedAddresses}
                />
                <div className="flex-1 relative">
                  <input
                    type="number"
                    value={row.amount}
                    onChange={e => updateRow(row.id, { amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl text-sm font-semibold outline-none pr-12"
                    style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  {row.token && (
                    <button onClick={() => setMax(row.id, row.token!)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-purple-500 hover:text-purple-400">
                      MAX
                    </button>
                  )}
                </div>
              </div>

              {/* Balance + quote row */}
              <div className="mt-2 flex items-center justify-between text-[11px]">
                {/* Left: wallet balance */}
                {row.token && (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Balance: <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{getBalance(row.token)} {row.token.symbol}</span>
                  </span>
                )}

                {/* Right: quote output + savings */}
                {row.quote && !row.quote.noLiquidity && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      ≈ <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{row.quote.stxOut} STX</span>
                    </span>
                    {row.quote.savings && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#16a34a' }}>
                        {row.quote.savings}
                      </span>
                    )}
                  </div>
                )}

                {/* No liquidity warning */}
                {row.quote?.noLiquidity && (
                  <div className="flex items-center gap-1 ml-auto text-amber-500">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="text-[10px] font-semibold">No liquidity found</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {rows.length < 6 && (
          <button onClick={addRow}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-purple-500/10 mb-4"
            style={{ border: '1px dashed var(--border-color)', color: 'var(--text-secondary)' }}>
            <Plus className="h-4 w-4" />
            Add token ({rows.length}/6)
          </button>
        )}

        {totalStxOut && (
          <div className="flex items-center justify-between p-4 rounded-2xl mb-4"
            style={{ backgroundColor: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)' }}>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Total STX received</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {totalStxOut} <span className="text-sm font-normal">STX</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Min received ({slippage}%)</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {(parseFloat(totalStxOut) * (1 - slippage / 100)).toFixed(6)} STX
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Slippage</span>
          <div className="flex gap-1">
            {[0.5, 1, 2].map(s => (
              <button key={s} onClick={() => setSlippage(s)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                style={{ backgroundColor: slippage === s ? '#7c3aed' : 'var(--bg-primary)', color: slippage === s ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                {s}%
              </button>
            ))}
          </div>
        </div>

        {isFetchingQuote && (
          <div className="flex items-center gap-2 py-2 mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding best routes...
          </div>
        )}

        <div className="flex items-start gap-2 p-3 rounded-xl mb-4 text-xs"
          style={{ backgroundColor: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)' }}>
          <Info className="h-3.5 w-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
          <span style={{ color: 'var(--text-secondary)' }}>
            All tokens swap to STX atomically in one transaction via{' '}
            <span style={{ color: '#7c3aed', fontWeight: 600 }}>Bitflow</span>. 0.1% protocol fee on total output.
          </span>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm text-red-500 bg-red-500/10">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 p-3 rounded-xl mb-4 text-sm text-green-600 bg-green-500/10 break-all">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />{success}
          </div>
        )}

        <button onClick={handleSwap}
          disabled={isProcessing || !stacksConnected || validCount === 0 || !totalStxOut}
          className="w-full py-4 rounded-2xl font-bold text-base transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: '#fff' }}>
          {!stacksConnected ? 'Connect Wallet' :
           isProcessing ? (
             <><Loader2 className="h-4 w-4 animate-spin" />{progress || 'Processing...'}</>
           ) : (
             <><Zap className="h-4 w-4" />Sweep {validCount} Token{validCount !== 1 ? 's' : ''} to STX</>
           )}
        </button>
      </div>
    </div>
  );
}
