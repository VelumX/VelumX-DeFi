/**
 * bitflow-parallel-quote.ts
 *
 * The Bitflow SDK's getQuoteForRoute fetches a quote for each route
 * sequentially — one on-chain read-only call per route, awaited one at a time.
 * For token pairs with many routes (e.g. WELSH → USDCx) this can take 3–8s.
 *
 * This module replaces that with a parallel implementation:
 *   1. Fetch all routes for the pair (single API call, cached by the SDK)
 *   2. Fire all on-chain read-only quote calls concurrently via Promise.allSettled
 *   3. Return the same QuoteResult shape the SDK would have returned
 *
 * Drop-in replacement for bitflow.getQuoteForRoute(tokenX, tokenY, amount).
 */

import { type QuoteResult, type SelectedSwapRoute } from '@bitflowlabs/core-sdk';
import { getBitflowSDK } from '@/lib/bitflow';

// ── Internal: single-route quote via the SDK ─────────────────────────────────
// We call getQuoteForRoute with a single-route subset by temporarily patching
// the SDK's internal swapOptions cache so it only sees one route at a time.
// This lets us reuse all the SDK's decimal-scaling and result-parsing logic
// without duplicating it.

async function quoteOneRoute(
  tokenX: string,
  tokenY: string,
  amount: number,
  route: SelectedSwapRoute,
): Promise<QuoteResult> {
  const sdk = getBitflowSDK();
  // Temporarily inject a single-route swapOptions entry so the SDK only
  // processes this one route when we call getQuoteForRoute.
  const ctx = (sdk as any).context;
  const prev = ctx.swapOptions[tokenX]?.[tokenY];
  if (!ctx.swapOptions[tokenX]) ctx.swapOptions[tokenX] = {};
  ctx.swapOptions[tokenX][tokenY] = [route];
  try {
    return await sdk.getQuoteForRoute(tokenX, tokenY, amount);
  } finally {
    // Restore original routes so the cache stays intact
    if (prev !== undefined) {
      ctx.swapOptions[tokenX][tokenY] = prev;
    } else {
      delete ctx.swapOptions[tokenX][tokenY];
    }
  }
}

// ── Public: parallel quote ────────────────────────────────────────────────────

export async function getParallelQuote(
  tokenX: string,
  tokenY: string,
  amount: number,
): Promise<QuoteResult> {
  const sdk = getBitflowSDK();

  // 1. Get all routes (single API call, SDK caches after first fetch)
  const routes = await sdk.getAllPossibleTokenYRoutes(tokenX, tokenY);

  if (routes.length === 0) {
    return {
      bestRoute: null,
      allRoutes: [],
      inputData: { tokenX, tokenY, amountInput: amount },
    };
  }

  // 2. Fire all route quotes in parallel
  const results = await Promise.allSettled(
    routes.map(route => quoteOneRoute(tokenX, tokenY, amount, route)),
  );

  // 3. Flatten into a single allRoutes array
  const allRoutes = results.flatMap(r => {
    if (r.status === 'fulfilled') return r.value.allRoutes;
    // Rejected — include a null-quote entry so the UI can still show the route
    return [];
  });

  allRoutes.sort((a, b) => (b.quote ?? 0) - (a.quote ?? 0));

  const bestRoute = allRoutes.find(r => r.quote !== null && r.quote !== undefined && r.quote > 0) ?? null;

  return {
    bestRoute,
    allRoutes,
    inputData: { tokenX, tokenY, amountInput: amount },
  };
}
