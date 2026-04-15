/**
 * Sidebar Component
 * Persistent navigation for VelumX
 */

'use client';

import React from 'react';
import {
    ArrowLeftRight,
    Repeat,
    Droplets,
    TrendingUp,
    History,
    Sun,
    Moon,
    Github,
    Twitter,
    ExternalLink,
    Layers
} from 'lucide-react';
import dynamic from 'next/dynamic';

const WalletButton = dynamic(() => import('./WalletButton').then(mod => mod.WalletButton), { ssr: false });

interface SidebarProps {
    activeTab: 'bridge' | 'swap' | 'earn' | 'liquidity' | 'history';
    setActiveTab: (tab: 'bridge' | 'swap' | 'earn' | 'liquidity' | 'history') => void;
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    isOpen?: boolean;
    onClose?: () => void;
}

export function Sidebar({ activeTab, setActiveTab, isDarkMode, toggleDarkMode, isOpen = false, onClose }: SidebarProps) {
    const menuItems = [
        { id: 'bridge', label: 'Bridge', icon: ArrowLeftRight },
        { id: 'swap', label: 'Swap', icon: Repeat },
        { id: 'earn', label: 'Earn (stSTX)', icon: TrendingUp },
        { id: 'history', label: 'History', icon: History },
    ] as const;

    return (
        <aside
            className={`fixed left-0 top-0 h-screen w-64 z-50 flex flex-col transition-transform duration-300 backdrop-blur-2xl ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
                }`}
            style={{
                backgroundColor: 'rgba(var(--bg-surface-rgb), 0.8)',
                borderRight: '1px solid var(--border-color)'
            }}
        >
            {/* Brand */}
            <div className="p-8 flex items-center gap-3">
                <div className="relative glow-ring rounded-lg p-1.5 flex-shrink-0 animate-pulse-slow">
                    <img src="/velumx-icon.svg" alt="VelumX" className="h-6 w-6" />
                </div>
                <div className="flex flex-col">
                    <span className="text-xl font-bold text-purple-600 dark:text-purple-400">
                        VelumX
                    </span>
                    <span className="text-[10px] font-bold tracking-widest text-orange-500 opacity-80">
                        MAINNET
                    </span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => {
                                setActiveTab(item.id);
                                onClose?.();
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-300 group ${isActive
                                ? 'bg-gradient-to-r from-purple-600/10 to-blue-600/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shadow-lg shadow-purple-500/5'
                                : 'text-black hover:bg-gray-100/50 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800/50'
                                }`}
                        >
                            <div className={`p-1.5 rounded-lg transition-all duration-300 ${isActive
                                ? 'bg-purple-600 text-white shadow-md'
                                : `${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-slate-800 text-white border-slate-700'} border shadow-sm group-hover:scale-110`
                                }`}>
                                <Icon className="h-4 w-4" />
                            </div>
                            <span>{item.label}</span>
                            {isActive && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-500 shadow-glow animate-pulse" />
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Footer Area */}
            <div className="p-4 space-y-4">
                {/* Wallet Section */}
                <div className="px-2">
                    <WalletButton />
                </div>

                {/* Global Controls */}
                <div
                    className="p-3 rounded-2xl flex items-center justify-between"
                    style={{ backgroundColor: 'rgba(var(--bg-surface-rgb), 0.5)', border: '1px solid var(--border-color)' }}
                >
                    <button
                        onClick={toggleDarkMode}
                        className="p-2 rounded-xl hover:bg-white dark:hover:bg-gray-800 transition-colors group"
                        title={isDarkMode ? 'Switch to Light' : 'Switch to Dark'}
                    >
                        {isDarkMode ? (
                            <Sun className="h-5 w-5 text-yellow-500 group-hover:rotate-45 transition-transform" />
                        ) : (
                            <Moon className="h-5 w-5 text-purple-600" />
                        )}
                    </button>

                    <div className="flex gap-2">
                        <a href="#" className="p-2 rounded-xl hover:bg-white dark:hover:bg-gray-800 transition-colors text-gray-500 hover:text-purple-500">
                            <Github className="h-5 w-5" />
                        </a>
                        <a href="#" className="p-2 rounded-xl hover:bg-white dark:hover:bg-gray-800 transition-colors text-gray-500 hover:text-blue-400">
                            <Twitter className="h-5 w-5" />
                        </a>
                    </div>
                </div>



                {/* Version */}
                <div className="px-4 text-center">
                    <p className="text-[10px] text-gray-500 font-medium tracking-tight">
                        © 2024 VelumX Lab • v1.4.0
                    </p>
                </div>
            </div>
        </aside>
    );
}
