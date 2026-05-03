/**
 * ALEX swap helpers — quote and gasless execution via simple-paymaster-v3.
 *
 * Paymaster contract: SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.simple-paymaster-v3
 *
 * Functions used:
 *   swap-gasless   — 1-hop  (token-x, token-y, factor, dx, min-dy, fee-amount, relayer, fee-token)
 *   swap-gasless-a — 2-hop  (token-x, token-y, token-z, factor-x, factor-y, dx, min-dz, ...)
 *   swap-gasless-b — 3-hop  (token-x, token-y, token-z, token-w, factor-x, factor-y, factor-z, dx, min-dw, ...)
 */

import {
  contractPrincipalCV,
  uintCV,
  someCV,
  noneCV,
  standardPrincipalCV,
} from '@stacks/transactions';
import { getAlexSDK, principalToCurrency, currencyToPrincipal } from '../alex';
import { getVelumXClient } from '../velumx';
import { Currency } from 'alex-sdk';

const ALEX_PAYMASTER = 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW';
const ALEX_PAYMASTER_NAME = 'simple-paymaster-v3';

// ALEX pool factor — always 1_000_000_00 (1e8) for standard pools
const DEFAULT_FACTOR = BigInt(100_000_000);

// ── Quote ─────────────────────────────────────────────────────────────────────

export interface AlexQuoteResult {
  /** Human-readable output amount */
  amountOut: number;
  /** Raw output in micro-units */
  amountOutRaw: bigint;
  /** Waypoints (token path) as contract principals */
  path: string[];
  /** ALEX Currency route */
  route: Currency[];
  /** Pool factors for each hop */
  factors: bigint[];
}

/**
 * Get a quote from ALEX for the given token pair and input amount.
 * Returns null if the pair is not supported by ALEX.
 */
export async function getAlexQuote(
  tokenInAddress: string,
  tokenOutAddress: string,
  amountIn: number,
  tokenInDecimals: number,
  tokenOutDecimals: number,
): Promise<AlexQuoteResult | null> {
  const currencyIn  = principalToCurrency(tokenInAddress);
  const currencyOut = principalToCurrency(tokenOutAddress);

  if (!currencyIn || !currencyOut) return null;

  const alex = getAlexSDK();
  const amountInRaw = BigInt(Math.floor(amountIn * Math.pow(10, tokenInDecimals)));

  try {
    // Get the best route
    const route = await alex.getRouter(currencyIn, currencyOut);
    if (!route || route.length < 2) return null;

    // Get the output amount for this route
    const amountOutRaw = await alex.getAmountTo(
      currencyIn,
      amountInRaw,
      currencyOut,
    );

    if (!amountOutRaw || amountOutRaw <= 0n) return null;

    const amountOut = Number(amountOutRaw) / Math.pow(10, tokenOutDecimals);

    // Build path as contract principals
    const path = route.map(currencyToPrincipal);

    // Factors: one per hop (route has N tokens → N-1 hops, each factor = DEFAULT_FACTOR)
    const factors = Array(route.length - 1).fill(DEFAULT_FACTOR) as bigint[];

    return { amountOut, amountOutRaw, path, route, factors };
  } catch (err) {
    console.warn('[ALEX] Quote failed:', err);
    return null;
  }
}

// ── Gasless swap execution ────────────────────────────────────────────────────

export interface AlexGaslessSwapParams {
  userAddress: string;
  tokenInAddress: string;
  tokenOutAddress: string;
  amountIn: number;
  tokenInDecimals: number;
  tokenOutDecimals: number;
  feeToken: string;
  slippage?: number;           // fraction, e.g. 0.005 = 0.5%
  quote?: AlexQuoteResult;     // pre-fetched quote — skips re-fetch if provided
  feeEstimate?: any;           // pre-fetched fee estimate
  onProgress?: (msg: string) => void;
}

/**
 * Execute a gasless ALEX swap via simple-paymaster-v3.
 * Builds the Clarity call, signs it via @stacks/connect, and submits.
 * Returns the transaction ID.
 */
export async function executeAlexGaslessSwap(
  params: AlexGaslessSwapParams,
): Promise<string> {
  const {
    userAddress,
    tokenInAddress,
    tokenOutAddress,
    amountIn,
    tokenInDecimals,
    tokenOutDecimals,
    feeToken,
    slippage = 0.005,
    onProgress,
  } = params;

  onProgress?.('Initialising ALEX swap...');

  // 1. Get quote (or use pre-fetched)
  const quote = params.quote ?? await getAlexQuote(
    tokenInAddress, tokenOutAddress, amountIn, tokenInDecimals, tokenOutDecimals,
  );
  if (!quote) throw new Error('ALEX does not support this token pair.');

  // 2. Get fee estimate (or use pre-fetched)
  onProgress?.('Estimating gasless fee...');
  const velumx = getVelumXClient();
  const estimate = params.feeEstimate ?? await velumx.estimateFee({
    feeToken,
    estimatedGas: 250_000,
  });

  const feeAmount = BigInt(estimate.maxFee ?? 0);
  const relayerAddress: string = estimate.relayerAddress ?? '';
  if (!relayerAddress) {
    throw new Error('Relayer address not available. Check VelumX configuration.');
  }

  // 3. Build Clarity args
  onProgress?.('Building transaction...');

  const amountInRaw = BigInt(Math.floor(amountIn * Math.pow(10, tokenInDecimals)));
  const minOut = BigInt(Math.floor(Number(quote.amountOutRaw) * (1 - slippage)));

  // Helper: contractPrincipalCV from "ADDR.name"
  const toContractCV = (principal: string) => {
    const [addr, name] = principal.split('.');
    return contractPrincipalCV(addr, name);
  };

  const [feeTokenAddr, feeTokenName] = feeToken.split('.');
  const feeTokenCV = contractPrincipalCV(feeTokenAddr, feeTokenName);
  const relayerCV  = standardPrincipalCV(relayerAddress);

  const hops = quote.route.length - 1; // number of swaps

  let functionName: string;
  let functionArgs: ReturnType<typeof uintCV>[];

  if (hops === 1) {
    // swap-gasless(token-x, token-y, factor, dx, min-dy, fee-amount, relayer, fee-token)
    functionName = 'swap-gasless';
    functionArgs = [
      toContractCV(quote.path[0]),
      toContractCV(quote.path[1]),
      uintCV(quote.factors[0]),
      uintCV(amountInRaw),
      someCV(uintCV(minOut)),
      uintCV(feeAmount),
      relayerCV,
      feeTokenCV,
    ] as any;
  } else if (hops === 2) {
    // swap-gasless-a(token-x, token-y, token-z, factor-x, factor-y, dx, min-dz, fee-amount, relayer, fee-token)
    functionName = 'swap-gasless-a';
    functionArgs = [
      toContractCV(quote.path[0]),
      toContractCV(quote.path[1]),
      toContractCV(quote.path[2]),
      uintCV(quote.factors[0]),
      uintCV(quote.factors[1]),
      uintCV(amountInRaw),
      someCV(uintCV(minOut)),
      uintCV(feeAmount),
      relayerCV,
      feeTokenCV,
    ] as any;
  } else if (hops === 3) {
    // swap-gasless-b(token-x, token-y, token-z, token-w, factor-x, factor-y, factor-z, dx, min-dw, fee-amount, relayer, fee-token)
    functionName = 'swap-gasless-b';
    functionArgs = [
      toContractCV(quote.path[0]),
      toContractCV(quote.path[1]),
      toContractCV(quote.path[2]),
      toContractCV(quote.path[3]),
      uintCV(quote.factors[0]),
      uintCV(quote.factors[1]),
      uintCV(quote.factors[2]),
      uintCV(amountInRaw),
      someCV(uintCV(minOut)),
      uintCV(feeAmount),
      relayerCV,
      feeTokenCV,
    ] as any;
  } else {
    throw new Error(`ALEX route has ${hops} hops — only 1–3 hops are supported by the paymaster.`);
  }

  // 4. Sign and submit via @stacks/connect
  onProgress?.('Waiting for wallet approval...');
  const { request: stacksRequest } = await import('@stacks/connect');

  const result = await stacksRequest('stx_callContract', {
    contract: `${ALEX_PAYMASTER}.${ALEX_PAYMASTER_NAME}`,
    functionName,
    functionArgs,
    network: 'mainnet',
    postConditionMode: 'allow',
    postConditions: [],
  }) as any;

  const txid: string = result?.txid ?? result?.result?.txid;
  if (!txid) throw new Error('No transaction ID returned from wallet.');

  onProgress?.(`ALEX swap submitted! TX: ${txid}`);
  return txid;
}
