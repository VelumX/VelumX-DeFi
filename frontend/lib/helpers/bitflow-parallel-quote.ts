/**
 * bitflow-parallel-quote.ts
 *
 * The Bitflow SDK's getQuoteForRoute fetches a quote for each route
 * sequentially — one on-chain read-only call per route, awaited one at a time.
 * For token pairs with many routes (e.g. WELSH → USDCx) this can take 2+ mins.
 *
 * This module replaces that with a direct parallel implementation:
 *   1. Get routes from the SDK (single API call, cached)
 *   2. Fetch all unique contract ABIs in parallel (one fetch per contract)
 *   3. Call fetchCallReadOnlyFunction for all routes concurrently
 *   4. Apply decimal scaling and return the same QuoteResult shape
 *
 * Total time = max(ABI fetches) + max(read-only calls) instead of their sum.
 */

import { fetchCallReadOnlyFunction } from '@stacks/transactions';
import { type QuoteResult } from '@bitflowlabs/core-sdk';
import { getBitflowSDK, BITFLOW_CONFIG } from '@/lib/bitflow';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch a contract's ABI from the Stacks node */
async function fetchAbi(deployer: string, name: string): Promise<any> {
  const res = await fetch(
    `${BITFLOW_CONFIG.READONLY_CALL_API_HOST}/v2/contracts/interface/${deployer}/${name}`,
    { headers: { Accept: 'application/json', 'Content-Type': 'application/json' } },
  );
  if (!res.ok) throw new Error(`ABI fetch failed for ${deployer}.${name}: ${res.status}`);
  return res.json();
}

/** Extract function argument definitions from a contract ABI */
function getFunctionArgs(abi: any, functionName: string): Array<{ name: string; type: any }> {
  const fn = abi?.functions?.find((f: any) => f.name === functionName);
  return fn?.args ?? [];
}

/** Convert a JS value to a Clarity value based on the arg type definition */
function convertArg(value: any, type: any): any {
  const { Cl } = require('@stacks/transactions');

  if (value === null || value === undefined) return Cl.none();

  const typeName = typeof type === 'string' ? type : type?.type ?? '';

  if (typeName === 'uint128' || typeName === 'int128') {
    return typeName === 'uint128' ? Cl.uint(BigInt(Math.floor(Number(value)))) : Cl.int(BigInt(Math.floor(Number(value))));
  }
  if (typeName === 'bool') return value ? Cl.bool(true) : Cl.bool(false);
  if (typeName === 'principal' || typeName === 'trait_reference') {
    const s = String(value);
    if (s.includes('.')) {
      const [addr, cname] = s.split('.');
      return Cl.contractPrincipal(addr, cname);
    }
    return Cl.standardPrincipal(s);
  }
  if (typeName === 'optional' || type?.optional) {
    if (value === null || value === undefined) return Cl.none();
    return Cl.some(convertArg(value, type.optional ?? type.value));
  }
  if (typeName === 'tuple' || type?.tuple) {
    const fields = type.tuple ?? type.fields ?? [];
    const obj: Record<string, any> = {};
    for (const field of fields) {
      obj[field.name] = convertArg(value?.[field.name], field.type);
    }
    return Cl.tuple(obj);
  }
  if (typeName === 'list' || type?.list) {
    const items = Array.isArray(value) ? value : [];
    return Cl.list(items.map((item: any) => convertArg(item, type.list?.type ?? type.type)));
  }
  if (typeName === 'buffer' || type?.buffer) {
    if (value instanceof Uint8Array) return Cl.buffer(value);
    if (typeof value === 'string') return Cl.bufferFromHex(value);
    return Cl.buffer(new Uint8Array());
  }
  if (typeName === 'string-ascii' || type?.['string-ascii']) {
    return Cl.stringAscii(String(value));
  }
  if (typeName === 'string-utf8' || type?.['string-utf8']) {
    return Cl.stringUtf8(String(value));
  }
  // Fallback: try uint
  if (typeof value === 'bigint' || typeof value === 'number') {
    return Cl.uint(BigInt(Math.floor(Number(value))));
  }
  return Cl.none();
}

/** Unwrap a Clarity result value to a JS number */
function unwrapResult(result: any): number | null {
  if (!result) return null;
  const val = result.data !== undefined ? result.data : result.value;
  switch (result.type) {
    case 'ok': return unwrapResult(result.value);
    case 'some': return unwrapResult(result.value);
    case 'uint': case 'int': return Number(BigInt(val));
    case 'tuple': {
      // Take the last key (SDK convention)
      const keys = Object.keys(val ?? {}).sort((a, b) => b.localeCompare(a));
      return keys.length > 0 ? unwrapResult(val[keys[0]]) : null;
    }
    default: return null;
  }
}

// ── ABI cache (module-level, shared across calls) ─────────────────────────────
const _abiCache = new Map<string, Promise<any>>();

function getCachedAbi(deployer: string, name: string): Promise<any> {
  const key = `${deployer}.${name}`;
  if (!_abiCache.has(key)) {
    _abiCache.set(key, fetchAbi(deployer, name).catch(e => {
      _abiCache.delete(key); // allow retry on failure
      throw e;
    }));
  }
  return _abiCache.get(key)!;
}

// ── Public: parallel quote ────────────────────────────────────────────────────

export async function getParallelQuote(
  tokenX: string,
  tokenY: string,
  amount: number,
): Promise<QuoteResult> {
  const sdk = getBitflowSDK();

  // 1. Ensure token list is loaded (needed for decimal lookups)
  const ctx = (sdk as any).context;
  if (ctx.availableTokens.length === 0) {
    await sdk.getAvailableTokens();
  }

  // 2. Get all routes (single API call, cached by SDK)
  const routes = await sdk.getAllPossibleTokenYRoutes(tokenX, tokenY);

  if (routes.length === 0) {
    return { bestRoute: null, allRoutes: [], inputData: { tokenX, tokenY, amountInput: amount } };
  }

  // 3. Resolve token decimals from the SDK's token list
  const getDecimals = (tokenId: string): { tokenContract: string; tokenDecimals: number } | null => {
    const token = ctx.availableTokens.find((t: any) => t.tokenId === tokenId);
    if (!token?.tokenContract) return null;
    return { tokenContract: token.tokenContract, tokenDecimals: token.tokenDecimals ?? 6 };
  };

  const tokenXMeta = getDecimals(tokenX);
  const tokenYMeta = getDecimals(tokenY);

  // 4. Pre-fetch all unique contract ABIs in parallel
  const uniqueContracts = new Set<string>();
  for (const route of routes) {
    const contract = route.quoteData?.contract;
    if (contract?.includes('.')) uniqueContracts.add(contract);
  }
  await Promise.allSettled(
    Array.from(uniqueContracts).map(c => {
      const [d, n] = c.split('.');
      return getCachedAbi(d, n);
    }),
  );

  // 5. Fire all read-only calls in parallel
  const providerAddress = (sdk as any).context?.providerAddress
    ?? 'SP1HTSGV1BXVAAVWJZ3MZJCTH9P28Z52ENQPX6JWV';

  const results = await Promise.allSettled(
    routes.map(async (route) => {
      const qd = route.quoteData;
      if (!qd?.contract || !qd?.function || !qd?.parameters) {
        throw new Error('Route missing quoteData');
      }

      const [deployer, contractName] = qd.contract.split('.');
      const abi = await getCachedAbi(deployer, contractName);
      const argDefs = getFunctionArgs(abi, qd.function);

      // Build parameters with amount injected
      const params = { ...qd.parameters };
      const amountScaled = tokenXMeta
        ? BigInt(Math.floor(amount * Math.pow(10, tokenXMeta.tokenDecimals)))
        : BigInt(Math.floor(amount));

      if ('dx' in params && params.dx === null) params.dx = amountScaled;
      else if ('amount' in params && params.amount === null) params.amount = amountScaled;
      else if ('amt-in' in params && params['amt-in'] === null) params['amt-in'] = amountScaled;
      else if ('amt-in-max' in params && params['amt-in-max'] === null) params['amt-in-max'] = amountScaled;
      else if ('y-amount' in params && params['y-amount'] === null) { params['y-amount'] = amountScaled; params['x-amount'] = amountScaled; }
      else if ('x-amount' in params && params['x-amount'] === null) params['x-amount'] = amountScaled;
      else if ('dy' in params && params.dy === null) params.dy = amountScaled;
      else params.dx = amountScaled;

      // Inject provider if needed
      const needsProvider = argDefs.some((a: any) => a.name === 'provider');
      if (needsProvider && (params.provider === null || params.provider === undefined)) {
        params.provider = providerAddress;
      }

      // Build Clarity function args
      const functionArgs = argDefs.map((argDef: any) => convertArg(params[argDef.name], argDef.type));

      // Call the read-only function
      const result = await fetchCallReadOnlyFunction({
        contractAddress: deployer,
        contractName,
        functionName: qd.function,
        functionArgs,
        network: 'mainnet',
        client: {
          baseUrl: BITFLOW_CONFIG.READONLY_CALL_API_HOST,
          fetch: (url: string, init?: RequestInit) => {
            const headers = new Headers((init as any)?.headers);
            headers.set('Accept', 'application/json');
            headers.set('Content-Type', 'application/json');
            return fetch(url, { ...init, headers });
          },
        },
        senderAddress: deployer,
      });

      const rawResult = unwrapResult(result);
      if (rawResult === null || rawResult <= 0) throw new Error('Invalid quote result');

      // Scale output by tokenY decimals
      const convertedResult = tokenYMeta
        ? rawResult / Math.pow(10, tokenYMeta.tokenDecimals)
        : rawResult;

      // Build the same RouteQuote shape the SDK returns
      const updatedSwapData = {
        ...route.swapData,
        parameters: {
          ...route.swapData?.parameters,
          amount: params.dx ?? params.amount ?? params['amt-in'] ?? params['y-amount'] ?? params['x-amount'] ?? params.dy,
          dx: params.dx ?? params.amount ?? params['amt-in'],
          'amt-in': params['amt-in'] ?? params.dx ?? params.amount,
          'min-received': rawResult,
          'min-dy': rawResult,
          'min-dz': rawResult,
          'min-dw': rawResult,
          'amt-out': rawResult,
          'amt-out-min': rawResult,
          'min-x-amount': rawResult,
          'min-y-amount': rawResult,
          'min-dx': rawResult,
          provider: params.provider,
        },
      };

      return {
        route: { ...route, swapData: updatedSwapData },
        quote: convertedResult,
        params,
        quoteData: { ...qd, parameters: params },
        swapData: updatedSwapData,
        dexPath: route.dex_path,
        tokenPath: route.token_path,
        tokenXDecimals: tokenXMeta?.tokenDecimals ?? 0,
        tokenYDecimals: tokenYMeta?.tokenDecimals ?? 0,
      };
    }),
  );

  // 6. Flatten and sort
  const allRoutes: any[] = results.flatMap((r, i) => {
    if (r.status === 'fulfilled') return [r.value];
    return [{
      route: routes[i],
      quote: null,
      params: routes[i].quoteData?.parameters ?? {},
      quoteData: routes[i].quoteData,
      swapData: routes[i].swapData,
      dexPath: routes[i].dex_path,
      tokenPath: routes[i].token_path,
      tokenXDecimals: tokenXMeta?.tokenDecimals ?? 0,
      tokenYDecimals: tokenYMeta?.tokenDecimals ?? 0,
      error: (r as PromiseRejectedResult).reason?.message ?? 'Quote failed',
    }];
  });

  allRoutes.sort((a, b) => (b.quote ?? 0) - (a.quote ?? 0));
  const bestRoute = allRoutes.find(r => r.quote !== null && r.quote !== undefined && r.quote > 0) ?? null;

  return { bestRoute, allRoutes, inputData: { tokenX, tokenY, amountInput: amount } };
}
