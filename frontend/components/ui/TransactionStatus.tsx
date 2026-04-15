/**
 * TransactionStatus Component
 * Displays success and error messages
 */

'use client';

import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface TransactionStatusProps {
    error: string | null;
    success: string | null;
}

export function TransactionStatus({ error, success }: TransactionStatusProps) {
    if (!error && !success) return null;

    if (error) {
        return (
            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/10 border-2 border-red-200 dark:border-red-900/30 rounded-xl p-4 mb-6">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</p>
            </div>
        );
    }

    if (success) {
        return (
            <div className="flex items-start gap-3 rounded-xl p-4 mb-6 border transition-all animate-in fade-in slide-in-from-bottom-2"
                style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderColor: 'var(--success-color)',
                    color: 'var(--success-color)'
                }}
            >
                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--success-color)' }} />
                <p className="text-sm font-semibold">{success}</p>
            </div>
        );
    }

    return null;
}
