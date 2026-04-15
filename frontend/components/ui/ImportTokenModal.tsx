/**
 * ImportTokenModal Component
 */

'use client';

import React from 'react';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import { Modal } from './Modal';

interface ImportTokenModalProps {
    isOpen: boolean;
    onClose: () => void;
    importAddress: string;
    setImportAddress: (val: string) => void;
    handleImportToken: () => void;
    isProcessing: boolean;
    error: string | null;
}

export function ImportTokenModal({
    isOpen,
    onClose,
    importAddress,
    setImportAddress,
    handleImportToken,
    isProcessing,
    error
}: ImportTokenModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Import Custom Token"
            maxWidth="max-w-md"
            isProcessing={isProcessing}
        >
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-bold mb-3 uppercase tracking-widest opacity-60" style={{ color: 'var(--text-secondary)' }}>
                        Contract Address
                    </label>
                    <input
                        type="text"
                        value={importAddress}
                        onChange={(e) => setImportAddress(e.target.value)}
                        placeholder="ST1PQ...token-name"
                        className="w-full px-5 py-4 rounded-2xl outline-none transition-all font-mono text-sm active:bg-white dark:active:bg-black/60 focus:ring-2 focus:ring-purple-500/50"
                        style={{
                            backgroundColor: 'var(--bg-primary)',
                            border: `2px solid var(--border-color)`,
                            color: 'var(--text-primary)'
                        }}
                        disabled={isProcessing}
                        autoFocus
                    />
                    <p className="text-[10px] mt-3 font-medium opacity-50 px-1" style={{ color: 'var(--text-secondary)' }}>
                        Format: PRINCIPAL.CONTRACT-NAME (e.g. ST1PQ...my-token)
                    </p>
                </div>

                <div className="rounded-2xl p-4 flex items-start gap-3 bg-amber-500/10 border border-amber-500/20">
                    <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                        Anyone can create a token. Always verify the contract address and project before importing. Tokens could be malicious or lose value.
                    </p>
                </div>

                {error && (
                    <div className="rounded-2xl p-4 flex items-start gap-3 bg-red-500/10 border border-red-500/20">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700 dark:text-red-400 font-medium">{error}</p>
                    </div>
                )}

                <div className="flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-4 rounded-2xl font-bold transition-all hover:bg-gray-100 dark:hover:bg-gray-800"
                        style={{ border: `1px solid var(--border-color)`, color: 'var(--text-secondary)' }}
                        disabled={isProcessing}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleImportToken}
                        disabled={isProcessing || !importAddress.trim()}
                        className="flex-[2] bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 shadow-xl shadow-purple-500/20 flex items-center justify-center gap-2"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Validating...
                            </>
                        ) : (
                            <>
                                <Search className="w-5 h-5" />
                                Import Asset
                            </>
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
