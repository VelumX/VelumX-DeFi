/**
 * HomePage Component
 * Professional DeFi Interface
 */

'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar } from './Sidebar';
import { NotificationContainer } from './NotificationContainer';
import { TransactionHistory } from './TransactionHistory';
import { Shield, Zap, Repeat } from 'lucide-react';
import React from 'react';

// Dynamically import interfaces to resolve Turbopack module factory issues with Stacks libraries
const BridgeInterface = dynamic(() => import('./BridgeInterface').then(mod => mod.BridgeInterface), { ssr: false });
const SwapInterface = dynamic(() => import('./SwapInterface').then(mod => mod.SwapInterface), { ssr: false });
const StackingInterface = dynamic(() => import('./StackingInterface').then(mod => mod.StackingInterface), { ssr: false });
const LiquidityInterface = dynamic(() => import('./LiquidityInterface').then(mod => mod.LiquidityInterface), { ssr: false });
// const BatchSwapInterface = dynamic(() => import('./BatchSwapInterface').then(mod => mod.BatchSwapInterface), { ssr: false });

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'bridge' | 'swap' | 'earn' | 'liquidity' | 'history'>('swap');
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Initialize dark mode from localStorage
  useState(() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('darkMode') === 'true';
      setIsDarkMode(savedMode);
      if (savedMode) {
        document.documentElement.classList.add('dark');
      }
    }
  });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className="min-h-screen flex mesh-gradient transition-colors duration-300" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <NotificationContainer />

      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col ml-0 md:ml-64 min-h-screen transition-all duration-300">
        {/* Top Header - Kept for mobile or simple layout */}
        <header className="sticky top-0 z-40 w-full backdrop-blur-2xl px-4 md:px-8 flex h-16 items-center justify-between md:justify-end" style={{ borderBottom: `1px solid var(--border-color)`, backgroundColor: 'rgba(var(--bg-surface-rgb), 0.7)' }}>
          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <div className="space-y-1.5">
              <span className={`block w-6 h-0.5 bg-current transition-transform duration-300 ${isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} style={{ backgroundColor: 'var(--text-primary)' }} />
              <span className={`block w-6 h-0.5 bg-current transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-0' : ''}`} style={{ backgroundColor: 'var(--text-primary)' }} />
              <span className={`block w-6 h-0.5 bg-current transition-transform duration-300 ${isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} style={{ backgroundColor: 'var(--text-primary)' }} />
            </div>
          </button>

          <div className="flex items-center gap-4">

            
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-bold text-green-500">Stacks Mainnet: Online</span>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-12 py-12 max-w-7xl mx-auto w-full">
          {/* Hero Section - Reduced for internal pages */}
          <div className="mb-12 relative">
            <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 opacity-20 dark:opacity-10 pointer-events-none">
              <div className="w-[500px] h-[500px] bg-purple-600 rounded-full blur-[120px] opacity-20"></div>
            </div>

            <div className="flex flex-col gap-2 relative z-10">
              <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </h1>
              <p className="text-lg font-light leading-relaxed max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
                {activeTab === 'bridge' && "Securely move your assets across ecosystems with VelumX's robust bridging protocol."}
                {activeTab === 'swap' && "Trade tokens instantly at the best market rates using our peer-to-peer liquidity protocol."}
                {/* {activeTab === ( 'batch-swap' as any) && "Execute multi-hop token routes atomically in a single transaction via ALEX AMM."} */}
                {activeTab === 'earn' && "Deposit STX and earn BTC yield via Proof of Transfer — stay liquid with stSTX."}
                {activeTab === 'liquidity' && "Provide liquidity to ALEX pools and earn trading fees, all gasless via VelumX."}
                {activeTab === 'history' && "Track your recent activity and transaction status in real-time."}
              </p>
            </div>
          </div>

          {/* Tab Content */}
          <div className="relative z-10 mb-16">
            <div className="vellum-shadow-xl rounded-[2.5rem] overflow-hidden border" style={{
              backgroundColor: 'rgba(var(--bg-surface-rgb), 0.9)',
              borderColor: 'var(--border-color)',
              backdropFilter: 'blur(40px)'
            }}>
              {activeTab === 'bridge' && <BridgeInterface />}
              {activeTab === 'swap' && <SwapInterface />}
              {/* {activeTab === ('batch-swap' as any) && <BatchSwapInterface />} */}
              {activeTab === 'earn' && <StackingInterface />}
              {activeTab === 'liquidity' && <LiquidityInterface />}
              {activeTab === 'history' && <TransactionHistory />}
            </div>
          </div>

          {/* Secondary Info Grid - Only shown on bridge/swap for focus */}
          {(activeTab === 'bridge' || activeTab === 'swap') && (
            <div className="grid md:grid-cols-3 gap-6 mb-16 opacity-80 hover:opacity-100 transition-opacity duration-500">
              <div className="rounded-2xl p-6 transition-all duration-300" style={{
                backgroundColor: 'var(--bg-surface)',
                border: `1px solid var(--border-color)`
              }}>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4">
                  <Shield className="h-5 w-5 text-purple-600" />
                </div>
                <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Bank-Grade</h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Fully audited non-custodial smart contracts.</p>
              </div>

              <div className="rounded-2xl p-6 transition-all duration-300" style={{
                backgroundColor: 'var(--bg-surface)',
                border: `1px solid var(--border-color)`
              }}>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
                  <Zap className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Instant Finality</h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Fast transactions powered by Bitcoin L2.</p>
              </div>

              <div className="rounded-2xl p-6 transition-all duration-300" style={{
                backgroundColor: 'var(--bg-surface)',
                border: `1px solid var(--border-color)`
              }}>
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mb-4">
                  <Repeat className="h-5 w-5 text-green-600" />
                </div>
                <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Gasless UX</h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Pay network fees directly with stablecoins.</p>
              </div>
            </div>
          )}
        </main>

        <footer className="mt-auto px-8 py-6 backdrop-blur-xl" style={{ borderTop: `1px solid var(--border-color)`, backgroundColor: 'var(--bg-surface)' }}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            <p>© 2024 VelumX Lab • Professional DeFi Infrastructure</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-purple-500 transition-colors">Documentation</a>
              <a href="#" className="hover:text-purple-500 transition-colors">Status</a>
              <a href="#" className="hover:text-purple-500 transition-colors">Privacy Policy</a>
            </div>
          </div>
        </footer>

    </div>
    </div>
  );
}
