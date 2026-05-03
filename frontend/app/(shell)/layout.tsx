'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { NotificationContainer } from '@/components/NotificationContainer';

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Read dark mode preference from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('darkMode') === 'true';
      setIsDarkMode(saved);
      if (saved) {
        document.documentElement.classList.add('dark');
      }
    } catch (error) {
      console.warn('Failed to read dark mode preference:', error);
      setIsDarkMode(false);
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
    document.documentElement.classList.toggle('dark', newMode);
  };

  return (
    <div
      className="min-h-screen flex mesh-gradient transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <NotificationContainer />

      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <Sidebar
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col ml-0 md:ml-64 min-h-screen transition-all duration-300">
        {/* Top Header */}
        <header
          className="sticky top-0 z-40 w-full backdrop-blur-2xl px-4 md:px-8 flex h-16 items-center justify-between md:justify-end"
          style={{
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'rgba(var(--bg-surface-rgb), 0.7)',
          }}
        >
          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle mobile menu"
          >
            <div className="space-y-1.5">
              <span
                className={`block w-6 h-0.5 bg-current transition-transform duration-300 ${isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`}
                style={{ backgroundColor: 'var(--text-primary)' }}
              />
              <span
                className={`block w-6 h-0.5 bg-current transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-0' : ''}`}
                style={{ backgroundColor: 'var(--text-primary)' }}
              />
              <span
                className={`block w-6 h-0.5 bg-current transition-transform duration-300 ${isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}
                style={{ backgroundColor: 'var(--text-primary)' }}
              />
            </div>
          </button>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{
                backgroundColor: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.2)',
              }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3B82F6' }} />
              <span className="text-[10px] font-bold" style={{ color: '#3B82F6' }}>Stacks Mainnet: Online</span>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-12 py-12 max-w-7xl mx-auto w-full">
          {children}
        </main>

        <footer
          className="mt-auto px-8 py-6 backdrop-blur-xl"
          style={{
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <div
            className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            <p>© 2024 VelumX Lab • Professional DeFi Infrastructure</p>
            <div className="flex gap-6">
              <a href="#" className="transition-colors hover:opacity-70">Documentation</a>
              <a href="#" className="transition-colors hover:opacity-70">Status</a>
              <a href="#" className="transition-colors hover:opacity-70">Privacy Policy</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
