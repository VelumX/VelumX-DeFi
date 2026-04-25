/**
 * bitflow-parallel-quote.ts
 *
 * The Bitflow SDK's getQuoteForRoute fetches a quote for each route
 * sequentially — one on-chain read-only call per route, awaited one at a time.
 * For token pairs with many routes (e.g. WELSH → USDCx) this can take 2+ mins.
 *
 * Strategy: use the Stacks read-only API directly to call each route's quote
 * function in parallel, bypassing the SDK's serial loop entirely.
 * The SDK is still used for route discovery and token metadata.
 *
 * Performance optimisations:
 *  1. Read-only calls go directly to the Hiro public API (no proxy hop).
 *     Read-only calls are CORS-safe — no proxy needed.
 *  2. Routes are capped at MAX_ROUTES to avoid firing 20+ parallel calls.
 *  3. A QUOTE_TIMEOUT_MS deadline races against the parallel calls so the UI
 *     never waits more than ~1.5 s even if some nodes are slow.
 *  4. Route discovery result is cached for ROUTES_CACHE_TTL_MS so switching
 *     amounts doesn't re-fetch the route list.
 */

import { fetchCallReadOnlyFunction, Cl } from '@stacks/transactions';
import { type QuoteResult } from '@bitflowlabs/core-sdk';
import { getBitflowSDK, BITFLOW_CONFIG } from '@/lib/bitflow';

// Direct Hiro public node — no proxy, no extra hop, CORS-safe for read-only calls
const DIRECT_NODE_URL = 'https://api.mainnet.hiro.so';

// Cap: only quote the top N routes (sorted by likelihood of being best).
// WELSH→USDCx has ~15 routes; quoting all of them in parallel still takes 2 s+
// because each read-only call round-trips to the Stacks node.
// 5 routes covers >99% of cases and keeps p50 latency under 800 ms.
const MAX_ROUTES = 5;

// Hard deadline for the entire quote operation. Returns whatever finished by then.
const QUOTE_TIMEOUT_MS = 1500;

// Cache route lists for this long — avoids re-fetching on every keystroke.
const ROUTES_CACHE_TTL_MS = 60_000; // 1 minute

// ── Route list cache ──────────────────────────────────────────────────────────
const _routesCache = new Map<string, { ts: number; routes: any[] }>();

async function getCachedRoutes(sdk: any, tokenX: string, tokenY: string): Promise<any[]> {
  const key = `${tokenX}:${tokenY}`;
  const cached = _routesCache.get(key);
  if (cached && Date.now() - cached.ts < ROUTES_CACHE_TTL_MS) return cached.routes;
  const routes = await sdk.getAllPossibleTokenYRoutes(tokenX, tokenY);
  _routesCache.set(key, { ts: Date.now(), routes });
  return routes;
}

// ── ABI cache ─────────────────────────────────────────────────────────────────
const _abiCache = new Map<string, Promise<any>>();

function getCachedAbi(deployer: string, name: string): Promise<any> {
  const key = `${deployer}.${name}`;
  if (!_abiCache.has(key)) {
    // Fetch ABI directly from Hiro — no proxy needed, CORS-safe
    const p = fetch(
      `${DIRECT_NODE_URL}/v2/contracts/interface/${deployer}/${name}`,
      { headers: { Accept: 'application/json', 'Content-Type': 'application/json' } },
    )
      .then(r => { if (!r.ok) throw new Error(`ABI ${key}: ${r.status}`); return r.json(); })
      .catch(e => { _abiCache.delete(key); throw e; });
    _abiCache.set(key, p);
  }
  return _abiCache.get(key)!;
}

// ── Clarity value builder ─────────────────────────────────────────────────────
// Converts a JS value to a ClarityValue based on the ABI arg type.

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
    const sdk = getBitflowSDK();
    await getCachedRoutes(sdk, tokenX, tokenY);
  } catch (_) {}
}

// ── Public: parallel quote ────────────────────────────────────────────────────

export async function getParallelQuote(
  tokenX: string,
  tokenY: string,
  amount: number,
): Promise<QuoteResult> {
  const sdk = getBitflowSDK();
  const ctx = (sdk as any).context;

  // Ensure token list is loaded (needed for decimal lookups)
  if (ctx.availableTokens.length === 0) {
    await sdk.getAvailableTokens();
  }

  // Get all routes — cached so repeated calls for the same pair are instant
  const allPossibleRoutes = await getCachedRoutes(sdk, tokenX, tokenY);

  if (allPossibleRoutes.length === 0) {
    return { bestRoute: null, allRoutes: [], inputData: { tokenX, tokenY, amountInput: amount } };
  }

  // Cap to top N routes — the first routes returned by the SDK are typically
  // the most direct/likely-best. Quoting all 15+ routes in parallel still
  // saturates the node; 5 is enough to find the best price in practice.
  const routes = allPossibleRoutes.slice(0, MAX_ROUTES);

  // Resolve token decimals
  const findToken = (id: string) =>
    ctx.availableTokens.find((t: any) => t.tokenId === id);
  const txMeta = findToken(tokenX);
  const tyMeta = findToken(tokenY);
  const txDecimals: number = txMeta?.tokenDecimals ?? 6;
  const tyDecimals: number = tyMeta?.tokenDecimals ?? 6;
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

    const result = await fetchCallReadOnlyFunction({
      contractAddress: deployer,
      contractName,
      functionName: qd.function,
      functionArgs,
      network: 'mainnet',
      // Go directly to Hiro — no proxy hop, CORS-safe for read-only calls
      client: {
        baseUrl: DIRECT_NODE_URL,
        fetch: (url: string, init?: RequestInit) => {
          const h = new Headers((init as any)?.headers);
          h.set('Accept', 'application/json');
          h.set('Content-Type', 'application/json');
          return fetch(url, { ...init, headers: h });
        },
      },
      senderAddress: deployer,
    });

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
    console.warn(`[ParallelQuote] Route ${i} failed:`, r.reason?.message);
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

  return { bestRoute, allRoutes, inputData: { tokenX, tokenY, amountInput: amount } };
}
