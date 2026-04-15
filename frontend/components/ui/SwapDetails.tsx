/**
 * SwapDetails Component
 * Displays rate, price impact, and fees for a swap
 */

'use client';

import React from 'react';

interface SwapQuote {
    amountOut: string;
    priceImpact: string;
    fee: string;
    rate: string;
}

interface SwapDetailsProps {
    quote: SwapQuote | null;
    inputSymbol: string;
    outputSymbol: string;
    outputAmount: string;
    slippage: number;
}

export function SwapDetails({ quote, inputSymbol, outputSymbol, outputAmount, slippage }: SwapDetailsProps) {
    if (!quote) return null;

    const impactValue = parseFloat(quote.priceImpact);
    const impactColor = impactValue > 2 ? 'text-red-500' : impactValue > 1 ? 'text-yellow-500' : 'text-green-500';

    return (
        <div className="rounded-2xl p-6 mb-8 space-y-4" style={{
            border: `1px solid var(--border-color)`,
            backgroundColor: 'var(--bg-primary)',
        }}>
            <div className="flex justify-between items-center group">
                <span className="text-xs font-bold uppercase tracking-wider opacity-60" style={{ color: 'var(--text-secondary)' }}>Rate</span>
                <span className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 transition-colors group-hover:bg-purple-500/10" style={{ color: 'var(--text-primary)' }}>
                    1 {inputSymbol} ≈{' '}
                    <span className="text-purple-600 dark:text-purple-400">{quote.rate}</span>{' '}
                    {outputSymbol}
                </span>
            </div>

            <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider opacity-60" style={{ color: 'var(--text-secondary)' }}>Price Impact</span>
                <div className={`flex items-center gap-1.5 font-bold text-xs px-3 py-1 rounded-lg ${impactValue > 2 ? 'bg-red-500/10 text-red-500' :
                    impactValue > 1 ? 'bg-amber-500/10 text-amber-500' :
                        'bg-emerald-500/10 text-emerald-500'
                    }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    {quote.priceImpact}%
                </div>
            </div>

            <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider opacity-60" style={{ color: 'var(--text-secondary)' }}>Trading Fee</span>
                <span className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{quote.fee} {inputSymbol}</span>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center group">
                <span className="text-xs font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">Minimum Received</span>
                <span className="text-sm font-mono font-black" style={{ color: 'var(--text-primary)' }}>
                    {(parseFloat(outputAmount) * (1 - slippage / 100)).toFixed(6)} {outputSymbol}
                </span>
            </div>
        </div>
    );
}
