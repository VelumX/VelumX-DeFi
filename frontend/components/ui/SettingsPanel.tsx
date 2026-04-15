/**
 * SettingsPanel Component
 * Slippage and other DeFi settings
 */

'use client';

import React from 'react';

interface SettingsPanelProps {
    slippage: number;
    setSlippage: (val: number) => void;
    isOpen: boolean;
}

export function SettingsPanel({ slippage, setSlippage, isOpen }: SettingsPanelProps) {
    if (!isOpen) return null;

    return (
        <div className="rounded-3xl p-6 mb-8 animate-in fade-in slide-in-from-top-4 duration-300" style={{
            border: `1px solid var(--border-color)`,
            backgroundColor: 'var(--bg-primary)',
        }}>
            <div className="space-y-6">
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                            Slippage Tolerance
                        </label>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
                            Auto
                        </span>
                    </div>
                    <div className="flex gap-3">
                        {[0.1, 0.5, 1.0].map(value => (
                            <button
                                key={value}
                                onClick={() => setSlippage(value)}
                                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${slippage === value
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                                    : 'bg-gray-100 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50'
                                    }`}
                                style={slippage !== value ? { color: 'var(--text-secondary)' } : {}}
                            >
                                {value}%
                            </button>
                        ))}
                        <div className="flex-1 relative">
                            <input
                                type="number"
                                value={slippage}
                                onChange={(e) => setSlippage(parseFloat(e.target.value) || 0.5)}
                                className="w-full px-5 py-2.5 rounded-xl text-sm font-bold bg-gray-100 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 outline-none focus:border-purple-500/50 transition-all text-right pr-8"
                                style={{ color: 'var(--text-primary)' }}
                                step="0.1"
                                min="0.1"
                                max="50"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold opacity-40">%</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-200/10 dark:border-gray-800/50">
                    <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Transaction Deadline</span>
                    <span className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }}>20m</span>
                </div>
            </div>
        </div>
    );
}
