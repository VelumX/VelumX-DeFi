'use client';

/**
 * EthereumProvider
 * Wraps the app with WagmiProvider + QueryClientProvider + RainbowKitProvider.
 * Only mounted client-side (ssr: true in wagmiConfig handles SSR hydration).
 */

import '@rainbow-me/rainbowkit/styles.css';

import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '@/lib/wagmi';
import { useEffect, useState } from 'react';

const queryClient = new QueryClient();

export function EthereumProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  // Mirror the app's dark mode state
  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  const rbkTheme = isDark
    ? darkTheme({
        accentColor: '#3B82F6',       // blue-500 — matches VelumX logo
        accentColorForeground: 'white',
        borderRadius: 'large',
        fontStack: 'system',
        overlayBlur: 'large',
      })
    : lightTheme({
        accentColor: '#2563EB',       // blue-600
        accentColorForeground: 'white',
        borderRadius: 'large',
        fontStack: 'system',
        overlayBlur: 'large',
      });

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rbkTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
