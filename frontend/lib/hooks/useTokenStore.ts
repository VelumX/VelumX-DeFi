/**
 * useTokenStore — Shared Bitflow token store
 *
 * Solves the token discovery latency problem by:
 * 1. Starting the API fetch at module load (before any component mounts)
 * 2. Sharing a single in-memory + localStorage cache across SwapInterface
 *    and BatchSwapInterface so the API is called at most once per TTL
 * 3. Providing a React hook that subscribes to the shared state
 */

import { getBitflowSDK } from '@/lib/bitflow';

// ── Shared token type ─────────────────────────────────────────────────────────

export interface DiscoveredToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
  assetName?: string;
  tokenId?: string;
}

// ── Cache config ──────────────────────────────────────────────────────────────

const CACHE_KEY = 'velumx_tokens_v5'; // bump to bust any stale HODLMM-era cache
const CACHE_TTL = 60 * 60 * 1000;    // 1 hour

// ── Module-level shared state ─────────────────────────────────────────────────
// These live outside React so they persist across component mounts/unmounts
// and are shared between SwapInterface and BatchSwapInterface.

let _tokens: DiscoveredToken[] = [];
let _isLoading = true;
let _fetchPromise: Promise<void> | null = null;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach(fn => fn());
}

// ── Token mapping ─────────────────────────────────────────────────────────────

function mapTokens(list: any[]): DiscoveredToken[] {
  return list
    .filter((t: any) => {
      const isStx = t['token-id'] === 'token-stx' || t.tokenId === 'token-stx';
      // Accept SP* and SM* — SM* are valid mainnet multisig deployers (sBTC, ALEX XYK)
      const contract: string = t.tokenContract || '';
      const hasStacksContract = contract.startsWith('SP') || contract.startsWith('SM');
      return isStx || hasStacksContract;
    })
    .map((t: any) => ({
      symbol: t.symbol || 'Unknown',
      name: t.name || t.symbol || 'Unknown Token',
      address: t.tokenContract || (t.tokenId === 'token-stx' ? 'STX' : ''),
      decimals: t.tokenDecimals || 6,
      logoUrl: t.logoUrl || t.icon || t.logo_url || '',
      tokenId: t.tokenId || t['token-id'] || '',
    }))
    .filter(t =>
      t.symbol !== 'Unknown' &&
      (t.address?.includes('.') || t.symbol === 'STX' || t.tokenId?.startsWith('token-'))
    );
}

// ── Core fetch logic ──────────────────────────────────────────────────────────

function applyTokens(mapped: DiscoveredToken[]) {
  if (mapped.length === 0) return;
  _tokens = mapped;
  _isLoading = false;
  notify();
}

async function fetchTokens(): Promise<void> {
  // 1. Serve from localStorage immediately (zero-latency for returning users)
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL && data?.length > 0) {
        applyTokens(mapTokens(data));
        // Refresh in background — don't await, don't block
        getBitflowSDK().getAvailableTokens().then(fresh => {
          if (fresh?.length > 0) {
            applyTokens(mapTokens(fresh));
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: fresh }));
            } catch (_) {}
          }
        }).catch(() => {});
        return;
      }
    }
  } catch (_) {}

  // 2. No valid cache — fetch fresh via SDK
  try {
    const fresh = await getBitflowSDK().getAvailableTokens();
    if (fresh?.length > 0) {
      applyTokens(mapTokens(fresh));
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: fresh }));
      } catch (_) {}
    }
  } catch (e) {
    console.error('[TokenStore] Fetch failed:', e);
  } finally {
    _isLoading = false;
    notify();
  }
}

/**
 * Kick off the token fetch. Safe to call multiple times — only runs once.
 * Called at module load AND from SwapPageContent so the fetch starts as
 * early as possible, before SwapInterface even mounts.
 */
export function prefetchTokens(): void {
  if (_fetchPromise) return;
  _fetchPromise = fetchTokens();
}

// ── Start immediately at module load ─────────────────────────────────────────
// This runs when the module is first imported (e.g. by SwapPageContent or
// the layout), giving us a head-start before any component mounts.
if (typeof window !== 'undefined') {
  prefetchTokens();
}

// ── React hook ────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

export function useTokenStore(): { tokens: DiscoveredToken[]; isLoading: boolean } {
  const [tokens, setTokens] = useState<DiscoveredToken[]>(_tokens);
  const [isLoading, setIsLoading] = useState(_isLoading);

  useEffect(() => {
    // Sync with current state in case it changed before this component mounted
    setTokens(_tokens);
    setIsLoading(_isLoading);

    const update = () => {
      setTokens([..._tokens]);
      setIsLoading(_isLoading);
    };

    _listeners.add(update);
    return () => { _listeners.delete(update); };
  }, []);

  return { tokens, isLoading };
}
