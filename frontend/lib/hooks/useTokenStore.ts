/**
 * useTokenStore — Shared Bitflow token store
 *
 * Solves the token discovery latency problem by:
 * 1. Starting the API fetch at module load (before any component mounts)
 * 2. Sharing a single in-memory + localStorage cache across SwapInterface
 *    and BatchSwapInterface so the API is called at most once per TTL
 * 3. Providing a React hook that subscribes to the shared state
 *
 * Token source priority:
 *   1. Old Bitflow API (api.bitflowapis.finance/getAllTokensAndPools) via SDK
 *      — 202 tokens, the full routing universe, used by getAllRoutes
 *   2. HODLMM BFF (bff.bitflowapis.finance/api/quotes/v1/tokens)
 *      — 5 HODLMM-only tokens, used as fallback if old API is down
 */

import { getBitflowSDK } from '@/lib/bitflow';

// ── HODLMM BFF token fetcher (fallback only) ──────────────────────────────────
// The BFF only exposes the 5 HODLMM pool tokens. We use it as a fallback when
// the old API is temporarily unavailable (e.g. transient 502s).
// Schema: contract_address / decimals / image / asset_name (no token-id field).

interface BffToken {
  contract_address: string;
  symbol: string;
  name: string;
  decimals: number;
  asset_name: string;
  image?: string;
}

// SM* deployer addresses that are valid on Stacks mainnet.
// These are multisig deployers used by Bitflow, ALEX, and sBTC — not testnet.
const SM_TO_SP: Record<string, string> = {
  'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR': 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR', // Bitflow/ALEX XYK — valid mainnet SM
  'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4': 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4', // sBTC — valid mainnet SM
};

async function fetchTokensFromBff(): Promise<any[]> {
  const res = await fetch('/api/bitflow-bff/quotes/v1/tokens', {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`BFF tokens: ${res.status}`);
  const data = await res.json();
  const tokens: BffToken[] = data?.tokens ?? [];

  return tokens.map((t) => {
    const contractName = t.contract_address?.split('.')?.pop() ?? '';

    // STX special case: BFF returns "SM1793....token-stx-v-1-2" but the routing
    // API uses "token-stx" as the token-id and expects the wSTX contract.
    const isStx = t.symbol === 'STX' || contractName.startsWith('token-stx');
    const tokenId = isStx
      ? 'token-stx'
      : contractName
        ? `token-${contractName}`
        : `token-${(t.symbol || '').toLowerCase()}`;

    const tokenContract = isStx
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

const CACHE_KEY = 'velumx_tokens_v4'; // v4 — bust BFF-only cache from previous broken deploy
const CACHE_TTL = 60 * 60 * 1000;    // 1 hour

// ── Module-level shared state ─────────────────────────────────────────────────

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
      // Accept STX by token-id
      if (t['token-id'] === 'token-stx' || t.tokenId === 'token-stx') return true;
      // Accept any token with a Stacks contract (SP* or SM* — both are valid mainnet)
      const contract: string = t.tokenContract || '';
      return contract.startsWith('SP') || contract.startsWith('SM');
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
        // Refresh in background — old API (202 tokens) first, BFF fallback
        getBitflowSDK().getAvailableTokens()
          .catch(() => fetchTokensFromBff())
          .then(fresh => {
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

  // 2. No valid cache — fetch fresh.
  //    Old API (via SDK) has the full 202-token universe used by getAllRoutes.
  //    BFF is fallback-only (5 HODLMM tokens).
  let fresh: any[] | null = null;

  try {
    fresh = await getBitflowSDK().getAvailableTokens();
  } catch (oldErr) {
    console.warn('[TokenStore] Old API failed, trying BFF fallback:', oldErr);
    try {
      fresh = await fetchTokensFromBff();
    } catch (bffErr) {
      console.error('[TokenStore] Both token APIs failed:', bffErr);
    }
  }

  if (fresh && fresh.length > 0) {
    applyTokens(mapTokens(fresh));
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: fresh }));
    } catch (_) {}
  }

  _isLoading = false;
  notify();
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
if (typeof window !== 'undefined') {
  prefetchTokens();
}

// ── React hook ────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

export function useTokenStore(): { tokens: DiscoveredToken[]; isLoading: boolean } {
  const [tokens, setTokens] = useState<DiscoveredToken[]>(_tokens);
  const [isLoading, setIsLoading] = useState(_isLoading);

  useEffect(() => {
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
