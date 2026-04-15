/**
 * Modal Component
 * Reusable modal wrapper with backdrop
 */

'use client';

import React, { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    maxWidth?: string;
    isProcessing?: boolean;
}

export function Modal({
    isOpen,
    onClose,
    title,
    children,
    maxWidth = 'max-w-2xl',
    isProcessing = false
}: ModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-all animate-in fade-in duration-300 px-4">
            <div
                className={`w-full ${maxWidth} rounded-[2.5rem] shadow-2xl overflow-hidden scale-in-center animate-in zoom-in-95 duration-300`}
                style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: `1px solid var(--border-color)`
                }}
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between p-8 border-b" style={{ borderColor: 'var(--border-color)' }}>
                    <h3 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                        {title}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-3 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95"
                        disabled={isProcessing}
                    >
                        <X className="w-6 h-6" style={{ color: 'var(--text-secondary)' }} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>
    );
}
