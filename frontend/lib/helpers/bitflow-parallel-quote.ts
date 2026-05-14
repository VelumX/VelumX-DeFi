/**
 * bitflow-parallel-quote.ts
 *
 * Ultra-fast quote engine that targets sub-2s latency for any token pair.
 *
 * Architecture:
 *  1. Route discovery calls the Bitflow API DIRECTLY (bypassing the Next.js
 *     rewrite proxy) to eliminate the extra server round-trip. Falls back to
 *     the proxy if the direct call fails (e.g. CORS blocked).
 *  2. Routes are cached in localStorage (5-min TTL) so returning users see
 *     instant results — no API call at all.
 *  3. Route discovery has a hard timeout (ROUTE_DISCOVERY_TIMEOUT_MS) so the
 *     UI never hangs even if the Bitflow API is slow.
 *  4. Token decimals are resolved from the shared useTokenStore cache first,
 *     then the SDK as a fallback — avoids a blocking getAvailableTokens() call.
 *  5. Read-only Clarity quote calls go directly to the Hiro public API in
 *     parallel with a hard deadline (QUOTE_TIMEOUT_MS).
 */

import { fetchCallReadOnlyFunction, Cl } from '@stacks/transactions';
import { type QuoteResult } from '@bitflowlabs/core-sdk';
import { getBitflowSDK, BITFLOW_CONFIG } from '@/lib/bitflow';

// ── Constants ─────────────────────────────────────────────────────────────────

// Direct endpoints — bypass the Next.js rewrite proxy for speed.
const DIRECT_NODE_URL = 'https://api.mainnet.hiro.so';
const DIRECT_BITFLOW_API = 'https://api.bitflowapis.finance';

// Server-side Hiro proxy — injects HIRO_API_KEY for 900 RPM.
// Falls back to direct Hiro if the proxy isn't available (e.g. local dev without the route).
const HIRO_PROXY_URL = '/api/hiro';

// Cap: only quote the top N routes.
const MAX_ROUTES = 5;

// Hard deadline for the parallel quote read-only calls.
const QUOTE_TIMEOUT_MS = 1500;

// Hard deadline for route discovery (the slow Bitflow API call).
const ROUTE_DISCOVERY_TIMEOUT_MS = 90000; // 90s timeout for heavy tokens like WELSH

// In-memory route cache TTL.
const ROUTES_CACHE_TTL_MS = 30 * 60_000; // 30 minutes

// localStorage route cache TTL (survives page reloads).
const LS_ROUTES_TTL_MS = 30 * 60_000; // 30 minutes

// Quote result cache TTL — amount-specific, shorter TTL since prices move.
const QUOTE_CACHE_TTL_MS = 60_000; // 1 minute

const LS_ROUTES_KEY = 'velumx_routes_v6'; // v6 — bust stale routes from HODLMM migration period

// ── In-memory route cache ─────────────────────────────────────────────────────
// The Bitflow getAllRoutes API returns a Record<tokenY, SelectedSwapRoute[]>.
const _routesCache = new Map<string, { ts: number; routes: Record<string, any[]> }>();

// In-flight route fetches — prevents duplicate concurrent requests for the same token
const _routesFetching = new Map<string, Promise<Record<string, any[]>>>();

// ── Quote result cache ────────────────────────────────────────────────────────
// Keyed by `${tokenX}:${tokenY}:${amount}` — avoids re-running on-chain calls
// when the user hasn't changed the pair or amount (e.g. switching tabs, re-renders).
const _quoteCache = new Map<string, { ts: number; result: QuoteResult }>();

// ── localStorage helpers ──────────────────────────────────────────────────────

function lsGetRoutes(tokenX: string): Record<string, any[]> | null {
  try {
    const raw = localStorage.getItem(LS_ROUTES_KEY);
    if (!raw) return null;
    const store: Record<string, { ts: number; data: Record<string, any[]> }> = JSON.parse(raw);
    const entry = store[tokenX];
    if (!entry || Date.now() - entry.ts > LS_ROUTES_TTL_MS) return null;
    return entry.data;
  } catch { return null; }
}

function lsSetRoutes(tokenX: string, data: any): void {
  try {
    let store: Record<string, { ts: number; data: any }> = {};
    const raw = localStorage.getItem(LS_ROUTES_KEY);
    if (raw) store = JSON.parse(raw);
    store[tokenX] = { ts: Date.now(), data };
    // Keep only the 20 most recent entries to avoid bloating localStorage
    const entries = Object.entries(store).sort((a, b) => b[1].ts - a[1].ts);
    if (entries.length > 20) {
      store = Object.fromEntries(entries.slice(0, 20));
    }
    localStorage.setItem(LS_ROUTES_KEY, JSON.stringify(store));
  } catch { /* localStorage full or unavailable */ }
}

// ── Route discovery (direct API call with proxy fallback) ─────────────────────

async function fetchRoutesFromAPI(tokenX: string): Promise<any> {
  const params = new URLSearchParams({ tokenX, depth: '2', maxRoutes: '3' });

  // Try direct call first (no proxy hop)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ROUTE_DISCOVERY_TIMEOUT_MS);
    const res = await fetch(`${DIRECT_BITFLOW_API}/getAllRoutes?${params}`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      throw e; // Don't try proxy if it's a timeout (backend is slow)
    }
    // CORS blocked — fall through to proxy
  }

  // Fallback: use the Next.js rewrite proxy
  try {
    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), ROUTE_DISCOVERY_TIMEOUT_MS);
    const res = await fetch(`/api/bitflow/getAllRoutes?${params}`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: controller2.signal,
    });
    clearTimeout(timer2);
    if (!res.ok) throw new Error(`Route discovery failed: ${res.status}`);
    return await res.json();
  } catch (e: any) {
    return {}; // Graceful degradation to empty routes instead of throwing
  }
}

async function getCachedRoutes(tokenX: string, tokenY: string): Promise<any[]> {
  const cacheKey = tokenX;

  // 1. In-memory cache (fastest)
  const mem = _routesCache.get(cacheKey);
  if (mem && Date.now() - mem.ts < ROUTES_CACHE_TTL_MS) {
    return mem.routes[tokenY] || [];
  }

  // 2. localStorage cache (survives reload)
  const lsData = lsGetRoutes(cacheKey);
  if (lsData) {
    _routesCache.set(cacheKey, { ts: Date.now(), routes: lsData });
    return lsData[tokenY] || [];
  }

  // 3. Check if there's already an in-flight fetch for this tokenX
  if (_routesFetching.has(cacheKey)) {
    const routes = await _routesFetching.get(cacheKey)!;
    return routes[tokenY] || [];
  }

  // 4. Fetch from API
  const fetchPromise = fetchRoutesFromAPI(tokenX).then(data => {
    if (data && Object.keys(data).length > 0) {
      _routesCache.set(cacheKey, { ts: Date.now(), routes: data });
      lsSetRoutes(cacheKey, data);
    }
    _routesFetching.delete(cacheKey);
    return data;
  }).catch(err => {
    _routesFetching.delete(cacheKey);
    throw err;
  });

  _routesFetching.set(cacheKey, fetchPromise);
  const routes = await fetchPromise;
  return routes[tokenY] || [];
}

// ── ABI cache ─────────────────────────────────────────────────────────────────
const _abiCache = new Map<string, Promise<any>>();

function getCachedAbi(deployer: string, name: string): Promise<any> {
  const key = `${deployer}.${name}`;
  if (!_abiCache.has(key)) {
    const p = fetch(
      `${HIRO_PROXY_URL}/v2/contracts/interface/${deployer}/${name}`,
      { headers: { Accept: 'application/json', 'Content-Type': 'application/json' } },
    )
      .then(r => {
        if (!r.ok) throw new Error(`ABI ${key}: ${r.status}`);
        return r.json();
      })
      .catch(() =>
        // Fallback: Bitflow node proxy (node.bitflowapis.finance)
        fetch(
          `/api/bitflow-node/v2/contracts/interface/${deployer}/${name}`,
          { headers: { Accept: 'application/json', 'Content-Type': 'application/json' } },
        ).then(r => { if (!r.ok) throw new Error(`ABI ${key}: ${r.status}`); return r.json(); })
      )
      .catch(e => { _abiCache.delete(key); throw e; });
    _abiCache.set(key, p);
  }
  return _abiCache.get(key)!;
}

// ── Clarity value builder ─────────────────────────────────────────────────────

function buildCv(value: any, type: any): ReturnType<typeof Cl.uint> {
  if (value === null || value === undefined) return Cl.none() as any;

  const t = typeof type === 'string' ? type : (type?.type ?? '');

  if (t === 'uint128') return Cl.uint(BigInt(Math.floor(Number(value)))) as any;
  if (t === 'int128')  return Cl.int(BigInt(Math.floor(Number(value)))) as any;
  if (t === 'bool')    return (value ? Cl.bool(true) : Cl.bool(false)) as any;

  if (t === 'principal' || t === 'trait_reference') {
    const s = String(value);
    if (s.includes('.')) {
      const [addr, cname] = s.split('.');
      return Cl.contractPrincipal(addr, cname) as any;
    }
    return Cl.standardPrincipal(s) as any;
  }

  if (t === 'optional' || type?.optional !== undefined) {
    if (value === null || value === undefined) return Cl.none() as any;
    return Cl.some(buildCv(value, type.optional ?? type.value)) as any;
  }

  if (t === 'tuple' || type?.tuple) {
    const fields: Array<{ name: string; type: any }> = type.tuple ?? type.fields ?? [];
    const obj: Record<string, any> = {};
    for (const f of fields) obj[f.name] = buildCv(value?.[f.name], f.type);
    return Cl.tuple(obj) as any;
  }

  if (t === 'list' || type?.list) {
    const items = Array.isArray(value) ? value : [];
    return Cl.list(items.map((item: any) => buildCv(item, type.list?.type ?? type.type))) as any;
  }

  if (t === 'buffer' || type?.buffer) {
    if (value instanceof Uint8Array) return Cl.buffer(value) as any;
    if (typeof value === 'string') return Cl.bufferFromHex(value) as any;
    return Cl.buffer(new Uint8Array()) as any;
  }

  if (t === 'string-ascii' || type?.['string-ascii']) return Cl.stringAscii(String(value)) as any;
  if (t === 'string-utf8'  || type?.['string-utf8'])  return Cl.stringUtf8(String(value)) as any;

  // Fallback for numeric bigints
  if (typeof value === 'bigint' || typeof value === 'number') {
    return Cl.uint(BigInt(Math.floor(Number(value)))) as any;
  }

  return Cl.none() as any;
}

// ── Result unwrapper ──────────────────────────────────────────────────────────

function unwrap(result: any): number | null {
  if (!result) return null;
  const val = result.data !== undefined ? result.data : result.value;
  switch (result.type) {
    case 'ok':   return unwrap(result.value);
    case 'some': return unwrap(result.value);
    case 'uint': case 'int': return Number(BigInt(val));
    case 'tuple': {
      const keys = Object.keys(val ?? {}).sort((a, b) => b.localeCompare(a));
      return keys.length > 0 ? unwrap(val[keys[0]]) : null;
    }
    default: return null;
  }
}

// ── Public: prefetch routes ───────────────────────────────────────────────────
// Call this as soon as the token pair is known (before the amount is entered)
// so the route list is warm in the cache when getParallelQuote runs.

export async function prefetchRoutes(tokenX: string, tokenY: string): Promise<void> {
  try {
    await getCachedRoutes(tokenX, tokenY);
  } catch (_) {}
}

// ── Public: get routable token IDs ────────────────────────────────────────────
// Returns the set of tokenY IDs that have at least one route from tokenX.
// Uses the in-memory / localStorage cache — instant if already loaded.
// Triggers a background fetch if not cached yet (non-blocking).

export function getRoutableTokenIds(tokenX: string): Set<string> {
  const cacheKey = tokenX;

  // Check in-memory cache first
  const mem = _routesCache.get(cacheKey);
  if (mem && Date.now() - mem.ts < ROUTES_CACHE_TTL_MS) {
    return new Set(Object.keys(mem.routes));
  }

  // Check localStorage
  const lsData = lsGetRoutes(cacheKey);
  if (lsData) {
    _routesCache.set(cacheKey, { ts: Date.now(), routes: lsData });
    return new Set(Object.keys(lsData));
  }

  // Not cached — trigger background fetch and return empty set for now
  if (!_routesFetching.has(cacheKey)) {
    const fetchPromise = fetchRoutesFromAPI(tokenX).then(data => {
      if (data && Object.keys(data).length > 0) {
        _routesCache.set(cacheKey, { ts: Date.now(), routes: data });
        lsSetRoutes(cacheKey, data);
      }
      _routesFetching.delete(cacheKey);
      return data;
    }).catch(err => {
      _routesFetching.delete(cacheKey);
      throw err;
    });
    _routesFetching.set(cacheKey, fetchPromise);
  }

  return new Set(); // empty until fetch completes
}

// ── Token decimal resolution ──────────────────────────────────────────────────
// Resolve token decimals without blocking on the SDK's getAvailableTokens().
// Try the shared useTokenStore cache first (already populated at module load),
// then the SDK context, then fall back to 6.

function resolveDecimals(tokenId: string): number {
  // 1. Try SDK context (already loaded if getAvailableTokens was called)
  const sdk = getBitflowSDK();
  const ctx = (sdk as any).context;
  if (ctx?.availableTokens?.length > 0) {
    const t = ctx.availableTokens.find((tok: any) => tok.tokenId === tokenId);
    if (t?.tokenDecimals !== undefined) return t.tokenDecimals;
  }

  // 2. Well-known decimals for common tokens
  const KNOWN_DECIMALS: Record<string, number> = {
    'token-stx': 6,
    'token-wstx': 6,
    'token-welsh': 6,
    'token-aeusdc': 6,
    'token-alex': 8,
    'token-usda': 6,
    'token-susdt': 8,
    'token-sbtc': 8,
    'token-usdcx': 6,
    'token-USDCx-auto': 6,
  };
  if (KNOWN_DECIMALS[tokenId] !== undefined) return KNOWN_DECIMALS[tokenId];

  return 6; // sensible default
}

// ── Public: parallel quote ────────────────────────────────────────────────────

export async function getParallelQuote(
  tokenX: string,
  tokenY: string,
  amount: number,
): Promise<QuoteResult> {
  const t0 = performance.now();
  const sdk = getBitflowSDK();
  const ctx = (sdk as any).context;

  // Check quote cache first — skip all on-chain calls if we have a fresh result
  const quoteKey = `${tokenX}:${tokenY}:${amount}`;
  const cachedQuote = _quoteCache.get(quoteKey);
  if (cachedQuote && Date.now() - cachedQuote.ts < QUOTE_CACHE_TTL_MS) {
    return cachedQuote.result;
  }

  // Kick off token load in background (non-blocking) if not already loaded.
  // Route discovery and quoting don't need to wait for this.
  if (ctx.availableTokens.length === 0) {
    sdk.getAvailableTokens().catch(() => {});
  }

  // Get all routes — multi-layer cache (memory → localStorage → API)
  const allPossibleRoutes = await getCachedRoutes(tokenX, tokenY);

  if (allPossibleRoutes.length === 0) {
    return { bestRoute: null, allRoutes: [], inputData: { tokenX, tokenY, amountInput: amount } };
  }

  // Cap to top N routes
  const routes = allPossibleRoutes.slice(0, MAX_ROUTES);

  // Resolve token decimals (non-blocking — uses cached values)
  const txDecimals = resolveDecimals(tokenX);
  const tyDecimals = resolveDecimals(tokenY);
  const amountScaled = BigInt(Math.floor(amount * Math.pow(10, txDecimals)));

  const providerAddress = BITFLOW_CONFIG.BITFLOW_PROVIDER_ADDRESS;

  // Pre-fetch all unique ABIs in parallel (direct to Hiro, no proxy)
  const uniqueContracts = new Set<string>();
  for (const r of routes) {
    if (r.quoteData?.contract?.includes('.')) uniqueContracts.add(r.quoteData.contract);
  }
  await Promise.allSettled(
    Array.from(uniqueContracts).map(c => {
      const [d, n] = c.split('.');
      return getCachedAbi(d, n);
    }),
  );

  // Build the parallel quote promises
  const quotePromises = routes.map(async (route) => {
    const qd = route.quoteData;
    if (!qd?.contract || !qd?.function || !qd?.parameters) throw new Error('Missing quoteData');

    const [deployer, contractName] = qd.contract.split('.');
    const abi = await getCachedAbi(deployer, contractName);
    const fnDef = abi?.functions?.find((f: any) => f.name === qd.function);
    if (!fnDef) throw new Error(`Function ${qd.function} not found in ABI`);

    // Build params with amount injected
    const p: Record<string, any> = { ...qd.parameters };
    if ('dx' in p && p.dx === null)                   p.dx = amountScaled;
    else if ('amount' in p && p.amount === null)       p.amount = amountScaled;
    else if ('amt-in' in p && p['amt-in'] === null)    p['amt-in'] = amountScaled;
    else if ('amt-in-max' in p && p['amt-in-max'] === null) p['amt-in-max'] = amountScaled;
    else if ('y-amount' in p && p['y-amount'] === null) { p['y-amount'] = amountScaled; p['x-amount'] = amountScaled; }
    else if ('x-amount' in p && p['x-amount'] === null) p['x-amount'] = amountScaled;
    else if ('dy' in p && p.dy === null)               p.dy = amountScaled;
    else                                               p.dx = amountScaled;

    // Inject provider if needed
    if (fnDef.args.some((a: any) => a.name === 'provider') &&
        (p.provider === null || p.provider === undefined)) {
      p.provider = providerAddress;
    }

    // Build Clarity args
    const functionArgs = fnDef.args.map((a: any) => buildCv(p[a.name], a.type));

    // Try Hiro proxy first (authenticated, 900 RPM), fall back to Bitflow node
    const hiroFetch = (url: string, init?: RequestInit) => {
      const h = new Headers((init as any)?.headers);
      h.set('Accept', 'application/json');
      h.set('Content-Type', 'application/json');
      return fetch(url, { ...init, headers: h });
    };

    const callReadOnly = async (baseUrl: string) =>
      fetchCallReadOnlyFunction({
        contractAddress: deployer,
        contractName,
        functionName: qd.function,
        functionArgs,
        network: 'mainnet',
        client: { baseUrl, fetch: hiroFetch },
        senderAddress: deployer,
      });

    let result: any;
    try {
      result = await callReadOnly(HIRO_PROXY_URL);
    } catch {
      result = await callReadOnly('/api/bitflow-node');
    }

    const raw = unwrap(result);
    if (raw === null || raw <= 0) throw new Error('Invalid quote result');

    const converted = raw / Math.pow(10, tyDecimals);

    const updatedSwapData = {
      ...route.swapData,
      parameters: {
        ...route.swapData?.parameters,
        amount: p.dx ?? p.amount ?? p['amt-in'] ?? p['y-amount'] ?? p['x-amount'] ?? p.dy,
        dx: p.dx ?? p.amount ?? p['amt-in'],
        'amt-in': p['amt-in'] ?? p.dx ?? p.amount,
        'min-received': raw, 'min-dy': raw, 'min-dz': raw, 'min-dw': raw,
        'amt-out': raw, 'amt-out-min': raw, 'min-x-amount': raw,
        'min-y-amount': raw, 'min-dx': raw,
        provider: p.provider,
      },
    };

    return {
      route: { ...route, swapData: updatedSwapData },
      quote: converted,
      params: p,
      quoteData: { ...qd, parameters: p },
      swapData: updatedSwapData,
      dexPath: route.dex_path,
      tokenPath: route.token_path,
      tokenXDecimals: txDecimals,
      tokenYDecimals: tyDecimals,
    };
  });

  // Race all quotes against a hard deadline so the UI never hangs
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), QUOTE_TIMEOUT_MS));

  const results = await Promise.allSettled(
    quotePromises.map(p => Promise.race([p, timeout.then(() => { throw new Error('timeout'); })]))
  );

  // Flatten, sort, return
  const allRoutes: any[] = (results as PromiseSettledResult<any>[]).flatMap((r, i) => {
    if (r.status === 'fulfilled') return [r.value];
    return [{
      route: routes[i], quote: null,
      params: routes[i].quoteData?.parameters ?? {},
      quoteData: routes[i].quoteData, swapData: routes[i].swapData,
      dexPath: routes[i].dex_path, tokenPath: routes[i].token_path,
      tokenXDecimals: txDecimals, tokenYDecimals: tyDecimals,
      error: r.reason?.message ?? 'Quote failed',
    }];
  });

  allRoutes.sort((a, b) => (b.quote ?? 0) - (a.quote ?? 0));
  const bestRoute = allRoutes.find(r => r.quote !== null && r.quote > 0) ?? null;

  const quoteResult: QuoteResult = { bestRoute, allRoutes, inputData: { tokenX, tokenY, amountInput: amount } };

  // Cache the result (only if we got a valid quote)
  if (bestRoute) {
    _quoteCache.set(quoteKey, { ts: Date.now(), result: quoteResult });
  }

  return quoteResult;
}
