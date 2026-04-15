'use client';

import { useEffect } from 'react';
import { Buffer } from 'buffer';

export function PolyfillProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.Buffer = window.Buffer || Buffer;
    }
  }, []);

  return <>{children}</>;
}
