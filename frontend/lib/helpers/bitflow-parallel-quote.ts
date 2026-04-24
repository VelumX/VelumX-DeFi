/**
 * bitflow-parallel-quote.ts
 *
 * The Bitflow SDK's getQuoteForRoute fetches a quote for each route
 * sequentially — one on-chain read-only call per route, awaited one at a time.
 * For token pairs with many routes (e.g. WELSH → USDCx) this can take 2+ mins.
 *
 * Root cause: the SDK loops over routes and awaits each fetchCallReadOnlyFunction
 * call serially. There is no parallelism.
 *
 * Fix: create one lightweight SDK instance per route so each has its own
 * isolated context (no shared mutable state), then fire all getQuoteForRoute
 * calls concurrently via Promise.allSettled. Each instance only sees one route
 * so it makes exactly one on-chain call. Total time = slowest single call
 * instead of sum of all calls.
 */

import { BitflowSDK, type QuoteResult, type SelectedSwapRoute } from '@bitflowlabs/core-sdk';
import { BITFLOW_CONFIG, getBitflowSDK } from '@/lib/bitflow';

// ── Per-route quote using an isolated SDK instance ───────────────────────────

async function quoteOneRoute(
  tokenX: string,
  tokenY: string,
  amount: number,
  route: SelectedSwapRoute,
): Promise<QuoteResult> {
  // Fresh SDK instance — isolated context, no shared state with other calls
  const sdk = new BitflowSDK(BITFLOW_CONFIG);

  // Pre-populate the swapOptions cache so the SDK skips the API fetch and
  // goes straight to the read-only call for this single route.
  const ctx = (sdk as any).context;
  if (!ctx.swapOptions[tokenX]) ctx.swapOptions[tokenX] = {};
  ctx.swapOptions[tokenX][tokenY] = [route];

  return sdk.getQuoteForRoute(tokenX, tokenY, amount);
}

// ── Public: parallel quote ────────────────────────────────────────────────────

export async function getParallelQuote(
  tokenX: string,
  tokenY: string,
  amount: number,
): Promise<QuoteResult> {
  // 1. Get all routes via the shared singleton (single API call, cached)
  const routes = await getBitflowSDK().getAllPossibleTokenYRoutes(tokenX, tokenY);

  if (routes.length === 0) {
    return {
      bestRoute: null,
      allRoutes: [],
      inputData: { tokenX, tokenY, amountInput: amount },
    };
  }

  // 2. Fire all route quotes concurrently — each in its own SDK instance
  const results = await Promise.allSettled(
    routes.map(route => quoteOneRoute(tokenX, tokenY, amount, route)),
  );

  // 3. Flatten into a single allRoutes array, preserving failed routes as null-quote entries
  const allRoutes = results.flatMap((r, i) => {
    if (r.status === 'fulfilled') return r.value.allRoutes;
    // Include a null-quote entry so the UI can still show the route
    return [{
      route: routes[i],
      quote: null,
      params: routes[i].quoteData?.parameters ?? {},
      quoteData: routes[i].quoteData,
      swapData: routes[i].swapData,
      dexPath: routes[i].dex_path,
      tokenPath: routes[i].token_path,
      tokenXDecimals: routes[i].tokenXDecimals,
      tokenYDecimals: routes[i].tokenYDecimals,
      error: r.reason?.message ?? 'Quote failed',
    }];
  });

  allRoutes.sort((a, b) => (b.quote ?? 0) - (a.quote ?? 0));

  const bestRoute = allRoutes.find(r => r.quote !== null && r.quote !== undefined && r.quote > 0) ?? null;

  return {
    bestRoute,
    allRoutes,
    inputData: { tokenX, tokenY, amountInput: amount },
  };
}
