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
 */

import { fetchCallReadOnlyFunction, Cl } from '@stacks/transactions';
import { type QuoteResult } from '@bitflowlabs/core-sdk';
import { getBitflowSDK, BITFLOW_CONFIG } from '@/lib/bitflow';

// ── ABI cache ─────────────────────────────────────────────────────────────────
const _abiCache = new Map<string, Promise<any>>();

function getCachedAbi(deployer: string, name: string): Promise<any> {
  const key = `${deployer}.${name}`;
  if (!_abiCache.has(key)) {
    const p = fetch(
      `${BITFLOW_CONFIG.READONLY_CALL_API_HOST}/v2/contracts/interface/${deployer}/${name}`,
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

  // Get all routes (single API call, cached by SDK after first fetch)
  const routes = await sdk.getAllPossibleTokenYRoutes(tokenX, tokenY);

  if (routes.length === 0) {
    return { bestRoute: null, allRoutes: [], inputData: { tokenX, tokenY, amountInput: amount } };
  }

  // Resolve token decimals
  const findToken = (id: string) =>
    ctx.availableTokens.find((t: any) => t.tokenId === id);
  const txMeta = findToken(tokenX);
  const tyMeta = findToken(tokenY);
  const txDecimals: number = txMeta?.tokenDecimals ?? 6;
  const tyDecimals: number = tyMeta?.tokenDecimals ?? 6;
  const amountScaled = BigInt(Math.floor(amount * Math.pow(10, txDecimals)));

  const providerAddress = BITFLOW_CONFIG.BITFLOW_PROVIDER_ADDRESS;

  // Pre-fetch all unique ABIs in parallel
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

  // Fire all read-only calls in parallel
  const results = await Promise.allSettled(
    routes.map(async (route) => {
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
        client: {
          baseUrl: BITFLOW_CONFIG.READONLY_CALL_API_HOST,
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
    }),
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
