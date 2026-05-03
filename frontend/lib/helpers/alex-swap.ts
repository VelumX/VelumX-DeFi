/**
 * ALEX swap helpers — quote and gasless execution via simple-paymaster-v3.
 *
 * Uses the same token resolution and runSwap pattern as simple-gasless-swap.ts
 * which is proven to work with all ALEX pairs.
 *
 * Paymaster: SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.simple-paymaster-v3
 */

import { AlexSDK } from 'alex-sdk';
import { getVelumXClient } from '../velumx';
import { getConfig } from '../config';
import {
  makeUnsignedContractCall,
  PostConditionMode,
  Cl,
  principalCV,
  uintCV,
} from '@stacks/transactions';
import { request } from '@stacks/connect';

const ALEX_PAYMASTER_ADDRESS = 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW';
const ALEX_PAYMASTER_NAME    = 'simple-paymaster-v3';

// ── Token resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a contract principal or token ID to an ALEX token ID string.
 * Returns null if the token is not supported by ALEX.
 * Mirrors the resolveAlexId logic in simple-gasless-swap.ts.
 */
async function resolveAlexId(token: string, alex: AlexSDK): Promise<string | null> {
  if (token === 'token-wstx' || token === 'STX') return 'token-wstx';
  if (!token.includes('.') && !token.startsWith('SP') && !token.startsWith('ST')) return token;
  try {
    const allTokens = await alex.fetchSwappableCurrency();
    const match = allTokens.find((t: any) => {
      const contractAddr = t.wrapToken ? t.wrapToken.split('::')[0] : '';
      return (
        contractAddr?.toLowerCase() === token?.toLowerCase() ||
        t.id?.toLowerCase() === token?.toLowerCase()
      );
    });
    return match ? match.id : null;
  } catch {
    return null;
  }
}

// ── Quote ─────────────────────────────────────────────────────────────────────

export interface AlexQuoteResult {
  /** Human-readable output amount */
  amountOut: number;
  /** Raw output in ALEX 1e8 units */
  amountOutRaw: bigint;
  /** ALEX token IDs for input and output */
  alexTokenIn: string;
  alexTokenOut: string;
  /** The swap tx params from alex.runSwap — reused at execution time */
  swapTx: Awaited<ReturnType<AlexSDK['runSwap']>>;
}

/**
 * Get a quote from ALEX for the given token pair and input amount.
 * Returns null if the pair is not supported by ALEX or no liquidity exists.
 */
export async function getAlexQuote(
  tokenInAddress: string,
  tokenOutAddress: string,
  amountIn: number,
  tokenInDecimals: number,
  tokenOutDecimals: number,
  userAddress: string,
): Promise<AlexQuoteResult | null> {
  const alex = new AlexSDK();

  const [alexTokenIn, alexTokenOut] = await Promise.all([
    resolveAlexId(tokenInAddress, alex),
    resolveAlexId(tokenOutAddress, alex),
  ]);

  if (!alexTokenIn || !alexTokenOut) return null;

  try {
    // Convert to ALEX 1e8 units
    const amountInRaw = BigInt(Math.floor(amountIn * Math.pow(10, tokenInDecimals)));
    // ALEX always works in 1e8 internally — convert from token decimals to 1e8
    const alexAmountIn = BigInt(Math.floor(amountIn * 1e8));

    // Get output amount
    const amountOutRaw = await alex.getAmountTo(
      alexTokenIn as any,
      alexAmountIn,
      alexTokenOut as any,
    );

    if (!amountOutRaw || amountOutRaw <= 0n) return null;

    // Convert from ALEX 1e8 to human-readable using output token decimals
    const amountOut = Number(amountOutRaw) / Math.pow(10, tokenOutDecimals);

    // Pre-build the swap tx (reused at execution time — avoids double SDK call)
    // Use 0 as minDy for the quote — execution will apply slippage
    const swapTx = await alex.runSwap(
      userAddress,
      alexTokenIn as any,
      alexTokenOut as any,
      alexAmountIn,
      0n, // min-dy: 0 for quote only
    );

    return { amountOut, amountOutRaw, alexTokenIn, alexTokenOut, swapTx };
  } catch (err) {
    console.warn('[ALEX] Quote failed:', err);
    return null;
  }
}

// ── Gasless swap execution ────────────────────────────────────────────────────

export interface AlexGaslessSwapParams {
  userAddress: string;
  userPublicKey?: string;
  tokenInAddress: string;
  tokenOutAddress: string;
  amountIn: number;
  tokenInDecimals: number;
  tokenOutDecimals: number;
  feeToken: string;
  slippage?: number;           // fraction, e.g. 0.005 = 0.5%
  quote?: AlexQuoteResult;     // pre-fetched — skips re-fetch if provided
  feeEstimate?: any;
  onProgress?: (msg: string) => void;
}

/**
 * Execute a gasless ALEX swap via simple-paymaster-v3.
 * Mirrors the execution path in simple-gasless-swap.ts.
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

  const config  = getConfig();
  const velumx  = getVelumXClient();
  const selectedFeeToken = feeToken || config.stacksUsdcxAddress;

  onProgress?.('Estimating gasless fee...');
  const estimate = params.feeEstimate ?? await velumx.estimateFee({
    feeToken: selectedFeeToken,
    estimatedGas: 150_000,
  });

  const feeAmount = String(estimate.maxFee ?? '0');
  const relayerAddress: string = (estimate as any).relayerAddress ?? config.velumxRelayerAddress ?? '';
  if (!relayerAddress) throw new Error('Relayer address not available. Check VelumX configuration.');

  onProgress?.('Preparing ALEX transaction...');
  const alex = new AlexSDK();

  // Resolve token IDs
  const [alexTokenIn, alexTokenOut] = await Promise.all([
    resolveAlexId(tokenInAddress, alex),
    resolveAlexId(tokenOutAddress, alex),
  ]);
  if (!alexTokenIn || !alexTokenOut) {
    throw new Error('ALEX does not support this token pair.');
  }

  const alexAmountIn = BigInt(Math.floor(amountIn * 1e8));

  // Apply slippage to the quoted output
  let minDy = 0n;
  if (params.quote?.amountOutRaw) {
    minDy = BigInt(Math.floor(Number(params.quote.amountOutRaw) * (1 - slippage)));
  }

  // Get swap params from ALEX SDK (same as simple-gasless-swap.ts)
  const swapTx = params.quote?.swapTx ?? await alex.runSwap(
    userAddress,
    alexTokenIn as any,
    alexTokenOut as any,
    alexAmountIn,
    minDy,
  );

  // Get public key
  let publicKey = params.userPublicKey ?? '';
  if (!publicKey) {
    try {
      const addrResult = await request('stx_getAddresses') as any;
      const stxEntry = (addrResult?.addresses ?? []).find((a: any) => a.address === userAddress)
        ?? (addrResult?.addresses ?? [])[0];
      publicKey = stxEntry?.publicKey ?? '';
    } catch { /* ignore */ }
  }
  if (!publicKey) throw new Error('Wallet public key not available. Please reconnect your wallet.');

  // Fetch nonce
  let nonce = 0n;
  try {
    const nonceRes = await fetch(`/api/hiro/v2/accounts/${userAddress}?proof=0`);
    if (nonceRes.ok) {
      const data = await nonceRes.json();
      nonce = BigInt(data.nonce ?? 0);
    }
  } catch { /* use 0 */ }

  // Build paymaster function args — same mapping as simple-gasless-swap.ts
  const [feeTokenAddr, feeTokenName] = selectedFeeToken.split('.');
  const feeTokenCV  = Cl.contractPrincipal(feeTokenAddr, feeTokenName);
  const feeAmountCV = uintCV(BigInt(feeAmount));
  const relayerCV   = principalCV(relayerAddress);

  let functionName: string;
  let functionArgs: any[];

  if (swapTx.functionName === 'swap-helper') {
    functionName = 'swap-gasless';
    functionArgs = [
      swapTx.functionArgs[0], // token-x-trait
      swapTx.functionArgs[1], // token-y-trait
      swapTx.functionArgs[2], // factor
      swapTx.functionArgs[3], // dx
      swapTx.functionArgs[4], // min-dy
      feeAmountCV,
      relayerCV,
      feeTokenCV,
    ];
  } else if (swapTx.functionName === 'swap-helper-a') {
    functionName = 'swap-gasless-a';
    functionArgs = [
      swapTx.functionArgs[0], // token-x-trait
      swapTx.functionArgs[1], // token-y-trait
      swapTx.functionArgs[2], // token-z-trait
      swapTx.functionArgs[3], // factor-x
      swapTx.functionArgs[4], // factor-y
      swapTx.functionArgs[5], // dx
      swapTx.functionArgs[6], // min-dz
      feeAmountCV,
      relayerCV,
      feeTokenCV,
    ];
  } else if (swapTx.functionName === 'swap-helper-b') {
    functionName = 'swap-gasless-b';
    functionArgs = [
      swapTx.functionArgs[0], // token-x-trait
      swapTx.functionArgs[1], // token-y-trait
      swapTx.functionArgs[2], // token-z-trait
      swapTx.functionArgs[3], // token-w-trait
      swapTx.functionArgs[4], // factor-x
      swapTx.functionArgs[5], // factor-y
      swapTx.functionArgs[6], // factor-z
      swapTx.functionArgs[7], // dx
      swapTx.functionArgs[8], // min-dw
      feeAmountCV,
      relayerCV,
      feeTokenCV,
    ];
  } else {
    throw new Error(`Unsupported ALEX swap function: ${swapTx.functionName}`);
  }

  // Build unsigned sponsored tx
  const transaction = await makeUnsignedContractCall({
    contractAddress: ALEX_PAYMASTER_ADDRESS,
    contractName:    ALEX_PAYMASTER_NAME,
    functionName,
    functionArgs,
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
    network: 'mainnet',
    sponsored: true,
    publicKey,
    fee: 0n,
    nonce,
    validateWithAbi: false,
  });

  const txHex = transaction.serialize();

  // Wallet signs without broadcasting
  onProgress?.('Waiting for wallet approval...');
  let signedTxHex: string;
  try {
    const signResult = await request('stx_signTransaction', {
      transaction: txHex,
      broadcast: false,
    }) as any;
    signedTxHex = signResult.transaction ?? signResult.txHex;
    if (!signedTxHex) throw new Error('Wallet did not return signed transaction.');
  } catch (err: any) {
    const msg = (err?.message ?? '').toLowerCase();
    if (msg.includes('cancel') || err?.code === 4001) throw new Error('Swap cancelled by user.');
    throw err;
  }

  // Relayer co-signs + broadcasts
  onProgress?.('Broadcasting via VelumX...');
  const result = await velumx.sponsor(signedTxHex, {
    feeToken: selectedFeeToken,
    feeAmount,
    network: config.stacksNetwork as 'mainnet' | 'testnet',
  });

  return result.txid;
}
