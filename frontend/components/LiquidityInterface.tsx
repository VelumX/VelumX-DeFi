/**
 * LiquidityInterface Component
 * Add/remove liquidity on ALEX AMM pools.
 * Pools fetched dynamically from ALEX API + SDK.
 * User pays STX gas via their wallet (standard Stacks tx).
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';
import { AlexSDK } from 'alex-sdk';
import { Loader2, Plus, Minus, ChevronDown, ExternalLink, Info, Search } from 'lucide-react';
import { TransactionStatus } from './ui/TransactionStatus';

const AMM_POOL = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.amm-swap-pool-v1-1';
const ALEX_DEPLOYER = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';

interface Pool {
  pool_id: number;
  label: string;
  tokenX: string;       // ALEX currency ID
  tokenY: string;
  tokenXPrincipal: string;
  tokenYPrincipal: string;
  factor: string;
  poolToken: string | null; // null = display-only, no LP actions
  tvl: string;
  apy: string;
}

type Mode = 'add' | 'remove';

// Derive a readable label from two token principals
function tokenLabel(principal: string): string {
  if (principal === 'STX') return 'STX';
  const name = principal.split('.')[1] || principal;
  return name
    .replace('token-w', '')
    .replace('age000-governance-token', 'ALEX')
    .replace('token-', '')
    .replace(/-v\d+.*$/, '')
    .toUpperCase()
    .slice(0, 8);
}

export function LiquidityInterface() {
  const { stacksAddress, stacksConnected, balances, fetchBalances } = useWallet();

  const [pools, setPools] = useState<Pool[]>([]);
  const [loadingPools, setLoadingPools] = useState(true);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);
  const [poolSearch, setPoolSearch] = useState('');
  const [mode, setMode] = useState<Mode>('add');
  const [amountX, setAmountX] = useState('');
  const [amountY, setAmountY] = useState('');
  const [removePercent, setRemovePercent] = useState('100');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tokenInfos, setTokenInfos] = useState<any[]>([]);

  // Load ALEX token list + pool data
  useEffect(() => {
    let cancelled = false;
    const alex = new AlexSDK() as any;

    const load = async () => {
      try {
        // Fetch token infos and SDK pool data in parallel
        const [tokens, sdkData, apiStats] = await Promise.all([
          alex.fetchSwappableCurrency(),
          alex.getAlexSDKData ? alex.getAlexSDKData() : Promise.resolve(null),
          fetch('https://api.alexgo.io/v1/public/amm-pool-stats').then(r => r.json()).catch(() => ({ data: [] })),
        ]);

        if (cancelled) return;
        setTokenInfos(tokens);

        // Build principal → currency ID map
        const principalToId: Record<string, string> = {};
        const idToPrincipal: Record<string, string> = {};
        for (const t of tokens) {
          const p = (t.wrapToken || t.underlyingToken || '').split('::')[0];
          if (p) { principalToId[p.toLowerCase()] = t.id; idToPrincipal[t.id] = p; }
        }
        // STX special case
        idToPrincipal['token-wstx'] = 'STX';
        principalToId['stx'] = 'token-wstx';

        // Build pool token map from SDK data if available
        // SDK pools have: tokenX, tokenY, poolToken (the LP token contract)
        const poolTokenMap: Record<string, string> = {}; // "tokenX|tokenY" → poolToken principal
        if (sdkData?.pools) {
          for (const p of sdkData.pools) {
            const key = `${p.tokenX}|${p.tokenY}`;
            const keyRev = `${p.tokenY}|${p.tokenX}`;
            if (p.poolToken) {
              poolTokenMap[key] = p.poolToken.split('::')[0];
              poolTokenMap[keyRev] = p.poolToken.split('::')[0];
            }
          }
        }

        // Map API stats to Pool objects, filter TVL > 0
        const mapped: Pool[] = (apiStats.data || [])
          .filter((p: any) => parseFloat(p.tvl) > 0)
          .map((p: any): Pool | null => {
            const baseP = p.base_token === 'STX' ? 'STX' : p.base_token;
            const targetP = p.target_token === 'STX' ? 'STX' : p.target_token;
            const baseId = principalToId[baseP.toLowerCase()] || baseP;
            const targetId = principalToId[targetP.toLowerCase()] || targetP;
            const poolToken = poolTokenMap[`${baseId}|${targetId}`] || poolTokenMap[`${targetId}|${baseId}`] || null;
            const tvlNum = parseFloat(p.tvl);
            const apyNum = parseFloat(p.apy);
            return {
              pool_id: p.pool_id,
              label: `${tokenLabel(baseP)} / ${tokenLabel(targetP)}`,
              tokenX: baseId,
              tokenY: targetId,
              tokenXPrincipal: baseP,
              tokenYPrincipal: targetP,
              factor: '100000000',
              poolToken,
              tvl: tvlNum >= 1000 ? `$${(tvlNum / 1000).toFixed(1)}k` : `$${tvlNum.toFixed(0)}`,
              apy: apyNum > 0 ? `${(apyNum * 100).toFixed(2)}%` : '—',
            };
          })
          .filter(Boolean) as Pool[];

        // Sort by TVL descending
        mapped.sort((a, b) => parseFloat(b.tvl.replace(/[$k]/g, '')) - parseFloat(a.tvl.replace(/[$k]/g, '')));

        setPools(mapped);
        if (mapped.length > 0) setSelectedPool(mapped[0]);
      } catch (e) {
        console.error('Failed to load pools:', e);
      } finally {
        if (!cancelled) setLoadingPools(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  const getTokenBalance = (principal: string): number => {
    if (principal === 'STX') return parseFloat((balances as any).stx || '0');
    const raw = (balances as any)[principal] || '0';
    const dec = parseInt((balances as any)[`decimals:${principal}`] || '8');
    return Number(raw) / Math.pow(10, dec);
  };

  const mkCV = async (principal: string) => {
    const { Cl } = await import('@stacks/transactions');
    if (principal === 'STX') {
      // wSTX wrapper for ALEX pools
      return Cl.contractPrincipal(ALEX_DEPLOYER, 'token-wstx');
    }
    const [a, n] = principal.split('.');
    return Cl.contractPrincipal(a, n);
  };

  const handleAddLiquidity = async () => {
    if (!stacksAddress || !selectedPool) return;
    if (!selectedPool.poolToken) { setError('LP token contract unknown for this pool — use ALEX app directly'); return; }
    const dx = parseFloat(amountX);
    const dy = parseFloat(amountY);
    if (!dx || dx <= 0) { setError('Enter token X amount'); return; }
    if (!dy || dy <= 0) { setError('Enter token Y amount'); return; }

    setIsProcessing(true); setError(null); setSuccess(null);
    try {
      const { uintCV, someCV } = await import('@stacks/transactions');
      const { openContractCall } = await import('@stacks/connect');

      await openContractCall({
        contractAddress: AMM_POOL.split('.')[0],
        contractName: AMM_POOL.split('.')[1],
        functionName: 'add-to-position',
        functionArgs: [
          await mkCV(selectedPool.tokenXPrincipal),
          await mkCV(selectedPool.tokenYPrincipal),
          uintCV(BigInt(selectedPool.factor)),
          await mkCV(selectedPool.poolToken),
          uintCV(BigInt(Math.floor(dx * 1e8))),
          someCV(uintCV(BigInt(Math.floor(dy * 1e8 * 1.01)))),
        ],
        network: 'mainnet' as any,
        postConditionMode: 'allow' as any,
        onFinish: () => {
          setSuccess('Liquidity added! LP tokens will arrive after confirmation.');
          setAmountX(''); setAmountY('');
          setTimeout(() => fetchBalances?.(), 12000);
        },
        onCancel: () => setIsProcessing(false),
      });
    } catch (e: any) {
      if (!e?.message?.toLowerCase().includes('cancel')) setError(e.message || 'Transaction failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!stacksAddress || !selectedPool) return;
    if (!selectedPool.poolToken) { setError('LP token contract unknown for this pool — use ALEX app directly'); return; }
    const pct = parseFloat(removePercent);
    if (!pct || pct <= 0 || pct > 100) { setError('Enter a valid percentage (1-100)'); return; }

    setIsProcessing(true); setError(null); setSuccess(null);
    try {
      const { uintCV } = await import('@stacks/transactions');
      const { openContractCall } = await import('@stacks/connect');

      await openContractCall({
        contractAddress: AMM_POOL.split('.')[0],
        contractName: AMM_POOL.split('.')[1],
        functionName: 'reduce-position',
        functionArgs: [
          await mkCV(selectedPool.tokenXPrincipal),
          await mkCV(selectedPool.tokenYPrincipal),
          uintCV(BigInt(selectedPool.factor)),
          await mkCV(selectedPool.poolToken),
          uintCV(BigInt(Math.floor(pct * 1e6))),
        ],
        network: 'mainnet' as any,
        postConditionMode: 'allow' as any,
        onFinish: () => {
          setSuccess('Liquidity removed! Tokens will arrive after confirmation.');
          setTimeout(() => fetchBalances?.(), 12000);
        },
        onCancel: () => setIsProcessing(false),
      });
    } catch (e: any) {
      if (!e?.message?.toLowerCase().includes('cancel')) setError(e.message || 'Transaction failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredPools = pools.filter(p =>
    p.label.toLowerCase().includes(poolSearch.toLowerCase())
  );

  const balX = selectedPool ? getTokenBalance(selectedPool.tokenXPrincipal) : 0;
  const balY = selectedPool ? getTokenBalance(selectedPool.tokenYPrincipal) : 0;

  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-3xl vellum-shadow" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', padding: '2rem' }}>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Liquidity Pools</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {loadingPools ? 'Loading pools...' : `${pools.length} active pools on ALEX DEX`}
            </p>
          </div>
          <a href="https://app.alexlab.co/pool" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-400">
            ALEX App <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Pool selector */}
        <div className="relative mb-6">
          <button onClick={() => setPoolOpen(!poolOpen)} disabled={loadingPools}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm disabled:opacity-50"
            style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
            <div className="flex items-center gap-2">
              {loadingPools && <Loader2 className="w-4 h-4 animate-spin text-purple-500" />}
              <span>{selectedPool?.label || 'Select a pool'}</span>
              {selectedPool && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-green-500"
                  style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  TVL {selectedPool.tvl}
                </span>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${poolOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-secondary)' }} />
          </button>

          {poolOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPoolOpen(false)} />
              <div className="absolute top-full left-0 right-0 mt-1 rounded-xl shadow-2xl z-50 overflow-hidden"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                {/* Search */}
                <div className="p-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                    <input value={poolSearch} onChange={e => setPoolSearch(e.target.value)}
                      placeholder="Search pools..." autoFocus
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-lg outline-none"
                      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} />
                  </div>
                </div>
                <div className="overflow-y-auto max-h-56">
                  {filteredPools.length === 0 ? (
                    <div className="p-4 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>No pools found</div>
                  ) : filteredPools.map(p => (
                    <button key={p.pool_id} onClick={() => { setSelectedPool(p); setPoolOpen(false); setPoolSearch(''); setAmountX(''); setAmountY(''); }}
                      className="w-full px-4 py-2.5 flex items-center justify-between text-sm hover:bg-purple-500/10 transition-colors"
                      style={{ color: 'var(--text-primary)', backgroundColor: p.pool_id === selectedPool?.pool_id ? 'var(--bg-primary)' : 'transparent' }}>
                      <span className="font-medium">{p.label}</span>
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="text-blue-500">{p.tvl}</span>
                        {p.apy !== '—' && <span className="text-green-500">{p.apy}</span>}
                        {!p.poolToken && <span className="text-yellow-500">view only</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Pool stats */}
        {selectedPool && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
              <div className="text-sm font-bold font-mono text-blue-500">{selectedPool.tvl}</div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>TVL</div>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
              <div className="text-sm font-bold font-mono text-green-500">{selectedPool.apy}</div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>APY</div>
            </div>
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex rounded-xl overflow-hidden mb-6" style={{ border: '1px solid var(--border-color)' }}>
          {(['add', 'remove'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null); setSuccess(null); }}
              className={`flex-1 py-2.5 text-sm font-bold transition-all flex items-center justify-center gap-2 ${mode === m ? 'bg-purple-600 text-white' : ''}`}
              style={mode !== m ? { color: 'var(--text-secondary)' } : {}}>
              {m === 'add' ? <><Plus className="w-4 h-4" /> Add</> : <><Minus className="w-4 h-4" /> Remove</>}
            </button>
          ))}
        </div>

        {mode === 'add' ? (
          <>
            <div className="rounded-2xl p-5 mb-3" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
              <div className="flex justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                  {selectedPool ? tokenLabel(selectedPool.tokenXPrincipal) : 'Token X'}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Bal: <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{balX.toFixed(4)}</span>
                  <button onClick={() => setAmountX(balX.toFixed(6))} className="ml-2 text-purple-500 text-[10px] font-bold uppercase hover:text-purple-400">MAX</button>
                </span>
              </div>
              <input type="number" value={amountX} onChange={e => { setAmountX(e.target.value); setError(null); }}
                placeholder="0.00" className="w-full bg-transparent text-3xl font-mono outline-none placeholder:opacity-30"
                style={{ color: 'var(--text-primary)' }} disabled={isProcessing} />
            </div>

            <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
              <div className="flex justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                  {selectedPool ? tokenLabel(selectedPool.tokenYPrincipal) : 'Token Y'}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Bal: <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{balY.toFixed(4)}</span>
                  <button onClick={() => setAmountY(balY.toFixed(6))} className="ml-2 text-purple-500 text-[10px] font-bold uppercase hover:text-purple-400">MAX</button>
                </span>
              </div>
              <input type="number" value={amountY} onChange={e => { setAmountY(e.target.value); setError(null); }}
                placeholder="0.00" className="w-full bg-transparent text-3xl font-mono outline-none placeholder:opacity-30"
                style={{ color: 'var(--text-primary)' }} disabled={isProcessing} />
            </div>
          </>
        ) : (
          <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
            <div className="flex justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Remove %</span>
              <div className="flex gap-2">
                {['25', '50', '75', '100'].map(p => (
                  <button key={p} onClick={() => setRemovePercent(p)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${removePercent === p ? 'bg-purple-600 text-white' : 'text-purple-500 hover:bg-purple-500/10'}`}>
                    {p}%
                  </button>
                ))}
              </div>
            </div>
            <input type="number" value={removePercent} onChange={e => { setRemovePercent(e.target.value); setError(null); }}
              placeholder="100" min="1" max="100"
              className="w-full bg-transparent text-3xl font-mono outline-none placeholder:opacity-30"
              style={{ color: 'var(--text-primary)' }} disabled={isProcessing} />
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>% of your LP position to remove</div>
          </div>
        )}

        {selectedPool && !selectedPool.poolToken && (
          <div className="flex gap-2 p-3 rounded-xl mb-4 text-xs" style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: 'var(--text-secondary)' }}>
            <Info className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
            <span>LP token contract not yet indexed for this pool. Use the ALEX app to manage liquidity.</span>
          </div>
        )}

        <div className="flex items-center gap-2 p-3 rounded-xl mb-4 text-xs" style={{ backgroundColor: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', color: 'var(--text-secondary)' }}>
          <Info className="w-4 h-4 text-purple-500 flex-shrink-0" />
          <span>LP fees (0.3%) are earned automatically and compounded into your position.</span>
        </div>

        <TransactionStatus error={error} success={success} />

        {(() => {
          const dx = parseFloat(amountX) || 0;
          const dy = parseFloat(amountY) || 0;
          // Need a small STX buffer for gas (~0.1 STX)
          const STX_GAS_BUFFER = 0.1;
          const stxBal = getTokenBalance('STX');

          let insufficientReason = '';
          if (stacksConnected && mode === 'add') {
            if (dx > 0 && dx > balX) insufficientReason = `Insufficient ${tokenLabel(selectedPool?.tokenXPrincipal || 'STX')}`;
            else if (dy > 0 && dy > balY) insufficientReason = `Insufficient ${tokenLabel(selectedPool?.tokenYPrincipal || '')}`;
            else if (stxBal < STX_GAS_BUFFER) insufficientReason = 'Need ~0.1 STX for gas';
          } else if (stacksConnected && mode === 'remove') {
            if (stxBal < STX_GAS_BUFFER) insufficientReason = 'Need ~0.1 STX for gas';
          }

          const isDisabled = !stacksConnected || isProcessing || !selectedPool || !!insufficientReason ||
            (mode === 'add' && (!dx || !dy)) ;

          return (
            <button onClick={mode === 'add' ? handleAddLiquidity : handleRemoveLiquidity}
              disabled={isDisabled}
              className={`w-full mt-4 font-bold py-4 rounded-2xl transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl ${
                insufficientReason
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20 disabled:opacity-50'
              }`}>
              {isProcessing
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                : !stacksConnected ? 'Connect Wallet'
                : insufficientReason ? insufficientReason
                : mode === 'add' ? <><Plus className="w-5 h-5" /> Add Liquidity</>
                : <><Minus className="w-5 h-5" /> Remove Liquidity</>}
            </button>
          );
        })()}
      </div>
    </div>
  );
}
