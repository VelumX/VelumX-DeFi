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

// ── HODLMM BFF token fetcher ──────────────────────────────────────────────────
// Bitflow migrated from api.bitflowapis.finance/getAllTokensAndPools (now 502)
// to bff.bitflowapis.finance/api/quotes/v1/tokens. The new schema uses
// contract_address / decimals / image instead of tokenContract / tokenDecimals / icon.
// We proxy through /api/bitflow-bff to avoid CORS.

interface BffToken {
  contract_address: string;
  symbol: string;
  name: string;
  decimals: number;
  asset_name: string;
  image?: string;
}

async function fetchTokensFromBff(): Promise<any[]> {
  const res = await fetch('/api/bitflow-bff/quotes/v1/tokens', {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`BFF tokens: ${res.status}`);
  const data = await res.json();
  const tokens: BffToken[] = data?.tokens ?? [];
  // Map new BFF schema → old SDK schema so the rest of the app works unchanged
  return tokens.map((t) => {
    // Derive a stable token-id. STX is a special case: the BFF returns
    // "SM1793....token-stx-v-1-2" as the contract address but the rest of the
    // app identifies it as "token-stx". For all other tokens we use the
    // contract name (last segment after '.') prefixed with "token-".
    const contractName = t.contract_address?.split('.')?.pop() ?? '';
    let tokenId: string;
    if (t.symbol === 'STX' || contractName.startsWith('token-stx')) {
      tokenId = 'token-stx';
    } else {
      tokenId = contractName ? `token-${contractName}` : `token-${(t.symbol || '').toLowerCase()}`;
    }

    // For STX, use the canonical wSTX contract that the rest of the app expects
    const tokenContract = (t.symbol === 'STX' || contractName.startsWith('token-stx'))
      ? 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx'
      : (t.contract_address || null);

    return {
      symbol: t.symbol || 'Unknown',
      name: t.name || t.symbol || 'Unknown Token',
      tokenContract,
      tokenDecimals: t.decimals ?? 6,
      icon: t.image || '',
      'token-id': tokenId,
      tokenId,
      tokenName: t.asset_name || null,
      status: 'active',
      base: 'Stacks',
      type: '',
      isKeeperToken: false,
      bridge: 'FALSE',
      layerOneAsset: null,
      priceData: {
        '1h_change': null, '1yr_change': null, '24h_change': null,
        '30d_change': null, '7d_change': null, last_price: null, last_updated: null,
      },
    };
  });
}

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

const CACHE_KEY = 'velumx_tokens_v3'; // v3 — invalidates stale data from old api.bitflowapis.finance
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
      const hasStacksContract = t.tokenContract && t.tokenContract.startsWith('SP');
      return isStx || hasStacksContract;
    })
    .map((t: any) => ({
      symbol: t.symbol || 'Unknown',
      name: t.name || t.symbol || 'Unknown Token',
      address: t.tokenContract || (t.tokenId === 'token-stx' ? 'STX' : ''),
      decimals: t.tokenDecimals || 6,
      logoUrl: t.logoUrl || t.icon || t.logo_url || '',
      tokenId: t.tokenId,
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
        // Refresh in background from BFF, fall back to legacy SDK
        fetchTokensFromBff().then(fresh => {
          if (fresh?.length > 0) {
            applyTokens(mapTokens(fresh));
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: fresh }));
            } catch (_) {}
          }
        }).catch(() => {
          getBitflowSDK().getAvailableTokens().then(fresh => {
            if (fresh?.length > 0) {
              applyTokens(mapTokens(fresh));
              try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: fresh }));
              } catch (_) {}
            }
          }).catch(() => {});
        });
        return;
      }
    }
  } catch (_) {}

  // 2. No valid cache — fetch fresh from BFF, fall back to legacy SDK
  try {
    const fresh = await fetchTokensFromBff();
    if (fresh?.length > 0) {
      applyTokens(mapTokens(fresh));
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: fresh }));
      } catch (_) {}
      _isLoading = false;
      notify();
      return;
    }
  } catch (bffErr) {
    console.warn('[TokenStore] BFF fetch failed, falling back to legacy SDK:', bffErr);
  }

  // 3. Legacy SDK fallback (api.bitflowapis.finance — may be down)
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
