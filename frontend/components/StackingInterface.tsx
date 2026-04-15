/**
 * StackingInterface Component
 * STX liquid stacking via StackingDAO — deposit STX, receive stSTX.
 * User pays STX gas via their wallet (standard Stacks tx).
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';
import { Loader2, ArrowDownUp, Info, ExternalLink, TrendingUp } from 'lucide-react';
import { TransactionStatus } from './ui/TransactionStatus';

const STSTX_PRINCIPAL = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token';
const STACKING_DAO_CORE = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stacking-dao-core-v6';
const RESERVE_V1        = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.reserve-v1';
const COMMISSION_V2     = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.commission-v2';
const STAKING_V0        = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.staking-v0';
const DIRECT_HELPERS_V4 = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.direct-helpers-v4';

type Mode = 'deposit' | 'withdraw';

export function StackingInterface() {
  const { stacksAddress, stacksConnected, balances, fetchBalances } = useWallet();

  const [mode, setMode] = useState<Mode>('deposit');
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [stxPerStSTX, setStxPerStSTX] = useState(1.0);
  const [apy, setApy] = useState('~8-10%');

  const stxBalance = parseFloat((balances as any).stx || '0');
  const stSTXRaw = (balances as any)[STSTX_PRINCIPAL] || '0';
  const stSTXDecimals = parseInt((balances as any)[`decimals:${STSTX_PRINCIPAL}`] || '6');
  const stSTXBalance = Number(stSTXRaw) / Math.pow(10, stSTXDecimals);

  useEffect(() => {
    // api.stackingdao.com is no longer available — read ratio from on-chain contract
    const fetchStats = async () => {
      try {
        // get-stx-per-ststx returns the ratio as a uint (in 1e6 units)
        const ratioRes = await fetch(
          `https://api.mainnet.hiro.so/v2/contracts/call-read/${STACKING_DAO_CORE.split('.')[0]}/${STACKING_DAO_CORE.split('.')[1]}/get-stx-per-ststx`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: STACKING_DAO_CORE.split('.')[0], arguments: [] }),
          }
        );
        if (ratioRes.ok) {
          const data = await ratioRes.json();
          // result is a Clarity uint in hex — decode it
          const hex = data?.result?.replace('0x0c', '').replace('0x', '');
          if (hex) {
            const ratio = parseInt(hex, 16) / 1_000_000;
            if (ratio > 0) setStxPerStSTX(ratio);
          }
        }
      } catch {}
      // APY: use a static reasonable estimate since no public endpoint is available
      setApy('~8-10%');
    };
    fetchStats();
  }, []);

  const inputBalance = mode === 'deposit' ? stxBalance : stSTXBalance;
  const inputSymbol  = mode === 'deposit' ? 'STX' : 'stSTX';
  const outputSymbol = mode === 'deposit' ? 'stSTX' : 'STX';
  const estimatedOutput = (() => {
    const n = parseFloat(amount);
    if (!n) return '0';
    return mode === 'deposit' ? (n / stxPerStSTX).toFixed(6) : (n * stxPerStSTX).toFixed(6);
  })();

  const mkCV = async (principal: string) => {
    const { Cl } = await import('@stacks/transactions');
    const [a, n] = principal.split('.');
    return Cl.contractPrincipal(a, n);
  };

  const handleSubmit = async () => {
    if (!stacksAddress) { setError('Connect your Stacks wallet first'); return; }
    const n = parseFloat(amount);
    if (!n || n <= 0) { setError('Enter a valid amount'); return; }
    if (n > inputBalance) { setError(`Insufficient ${inputSymbol} balance`); return; }

    setIsProcessing(true); setError(null); setSuccess(null);
    try {
      const { uintCV, noneCV } = await import('@stacks/transactions');
      const { openContractCall } = await import('@stacks/connect');

      if (mode === 'deposit') {
        await openContractCall({
          contractAddress: STACKING_DAO_CORE.split('.')[0],
          contractName: STACKING_DAO_CORE.split('.')[1],
          functionName: 'deposit',
          functionArgs: [
            await mkCV(RESERVE_V1),
            await mkCV(COMMISSION_V2),
            await mkCV(STAKING_V0),
            await mkCV(DIRECT_HELPERS_V4),
            uintCV(BigInt(Math.floor(n * 1_000_000))),
            noneCV(),
            noneCV(),
          ],
          network: 'mainnet' as any,
          postConditionMode: 'allow' as any,
          onFinish: () => {
            setSuccess('Deposit submitted! Your stSTX will arrive after confirmation.');
            setAmount('');
            setTimeout(() => fetchBalances?.(), 12000);
          },
          onCancel: () => setIsProcessing(false),
        });
      } else {
        await openContractCall({
          contractAddress: STACKING_DAO_CORE.split('.')[0],
          contractName: STACKING_DAO_CORE.split('.')[1],
          functionName: 'withdraw-idle',
          functionArgs: [
            await mkCV(RESERVE_V1),
            await mkCV(DIRECT_HELPERS_V4),
            await mkCV(COMMISSION_V2),
            await mkCV(STAKING_V0),
            uintCV(BigInt(Math.floor(n * Math.pow(10, stSTXDecimals)))),
          ],
          network: 'mainnet' as any,
          postConditionMode: 'allow' as any,
          onFinish: () => {
            setSuccess('Unstacking submitted! STX will arrive after confirmation.');
            setAmount('');
            setTimeout(() => fetchBalances?.(), 12000);
          },
          onCancel: () => setIsProcessing(false),
        });
      }
    } catch (e: any) {
      if (!e?.message?.toLowerCase().includes('cancel')) setError(e.message || 'Transaction failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-3xl vellum-shadow" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', padding: '2rem' }}>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Liquid Stacking</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Powered by StackingDAO</p>
          </div>
          <a href="https://app.stackingdao.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-400">
            App <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'APY', value: apy, color: 'text-green-500' },
            { label: 'stSTX/STX', value: stxPerStSTX.toFixed(4), color: 'text-purple-500' },
            { label: 'Your stSTX', value: stSTXBalance.toFixed(4), color: 'text-blue-500' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
              <div className={`text-sm font-bold font-mono ${s.color}`}>{s.value}</div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl overflow-hidden mb-6" style={{ border: '1px solid var(--border-color)' }}>
          {(['deposit', 'withdraw'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setAmount(''); setError(null); setSuccess(null); }}
              className={`flex-1 py-2.5 text-sm font-bold transition-all ${mode === m ? 'bg-purple-600 text-white' : ''}`}
              style={mode !== m ? { color: 'var(--text-secondary)' } : {}}>
              {m === 'deposit' ? 'Deposit STX' : 'Instant Unstack'}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
          <div className="flex justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
              {mode === 'deposit' ? 'You deposit' : 'You unstack'}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Balance: <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{inputBalance.toFixed(4)}</span>
              <button onClick={() => setAmount(inputBalance.toFixed(6))} className="ml-2 text-purple-500 text-[10px] font-bold uppercase hover:text-purple-400">MAX</button>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setError(null); }}
              placeholder="0.00" className="flex-1 bg-transparent text-3xl font-mono outline-none placeholder:opacity-30"
              style={{ color: 'var(--text-primary)' }} disabled={isProcessing} />
            <div className="px-4 py-2 rounded-xl bg-purple-600 text-white font-bold text-sm">{inputSymbol}</div>
          </div>
        </div>

        <div className="flex justify-center my-3">
          <div className="p-2 rounded-full" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
            <ArrowDownUp className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </div>
        </div>

        {/* Output */}
        <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>You receive (est.)</span>
          <div className="flex items-center gap-3 mt-3">
            <span className="flex-1 text-3xl font-mono" style={{ color: 'var(--text-primary)', opacity: estimatedOutput === '0' ? 0.3 : 1 }}>
              {estimatedOutput}
            </span>
            <div className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm">{outputSymbol}</div>
          </div>
        </div>

        {mode === 'withdraw' && (
          <div className="flex gap-2 p-3 rounded-xl mb-4 text-xs" style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: 'var(--text-secondary)' }}>
            <Info className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
            <span>Instant unstack uses idle protocol liquidity (1% fee). If unavailable, use the StackingDAO app for standard withdrawal (~1 PoX cycle).</span>
          </div>
        )}

        <TransactionStatus error={error} success={success} />

        {(() => {
          const n = parseFloat(amount) || 0;
          const insufficient = stacksConnected && n > 0 && n > inputBalance;
          const buttonLabel = !stacksConnected
            ? 'Connect Wallet'
            : isProcessing
            ? null
            : insufficient
            ? `Insufficient ${inputSymbol}`
            : mode === 'deposit' ? 'Deposit & Stack' : 'Instant Unstack';

          return (
            <button onClick={handleSubmit}
              disabled={!stacksConnected || isProcessing || !amount || n <= 0 || insufficient}
              className={`w-full mt-6 font-bold py-4 rounded-2xl transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl ${
                insufficient
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20 disabled:opacity-50'
              }`}>
              {isProcessing
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                : <><TrendingUp className="w-5 h-5" /> {buttonLabel}</>}
            </button>
          );
        })()}

        <p className="text-center text-[10px] mt-4" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
          Stacking rewards are earned in BTC via Proof of Transfer
        </p>
      </div>
    </div>
  );
}
