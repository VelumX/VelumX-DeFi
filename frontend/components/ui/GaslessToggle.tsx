/**
 * GaslessToggle Component
 * Toggle for gasless transaction mode
 */

'use client';

import React from 'react';
import { Zap } from 'lucide-react';

interface GaslessToggleProps {
    enabled: boolean;
    setEnabled: (val: boolean) => void;
    disabled?: boolean;
}

export function GaslessToggle({ enabled, setEnabled, disabled = false }: GaslessToggleProps) {
    return (
        <div className="rounded-3xl p-5 mb-8 transition-all duration-300 border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-emerald-500/20 shadow-inner group transition-transform hover:scale-105">
                        <Zap className="w-6 h-6 text-emerald-600 dark:text-emerald-400 drop-shadow-md animate-pulse" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-black text-xs uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Gasless Mode</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">v2</span>
                        </div>
                        <p className="text-xs font-medium opacity-60" style={{ color: 'var(--text-secondary)' }}>Zero STX required for transaction</p>
                    </div>
                </div>
                <button
                    onClick={() => setEnabled(!enabled)}
                    className={`relative w-16 h-8 rounded-full transition-all duration-500 p-1.5 ${enabled ? 'bg-emerald-500 shadow-lg shadow-emerald-500/40' : 'bg-gray-200 dark:bg-gray-800'
                        }`}
                    disabled={disabled}
                >
                    <div
                        className={`w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-500 transform ${enabled ? 'translate-x-8' : 'translate-x-0'
                            }`}
                    />
                </button>
            </div>
        </div>
    );
}
