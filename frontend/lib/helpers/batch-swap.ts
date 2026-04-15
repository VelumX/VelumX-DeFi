/**
 * Sweep-to-STX Helper v6 — Bitflow SDK only
 *
 * Routes all token→STX swaps through Bitflow's wrapper contracts
 * (wrapper-alex-v-2-1, wrapper-velar-v-1-1, wrapper-arkadiko-v-1-1).
 * All tokens use Bitflow's unified SIP-010 trait, eliminating the
 * trait incompatibility that caused wallet rejection in v1.
 *
 * Single execution path: always calls velumx-sweep-v2 in one tx.
 */

import { BitflowSDK, type Token, type QuoteResult, type SelectedSwapRoute, type RouteQuote } from '@bitflowlabs/core-sdk';
import { Cl } from '@stacks/transactions';
import { request } from '@stacks/connect';

// ── Constants ────────────────────────────────────────────────────────────────

// Update this after deploying velumx-sweep-v2 to mainnet
export const SWEEP_CONTRACT = 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.velumx-sweep-v2';

export const WSTX_PRINCIPAL = 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx';
// Velar uses its own wSTX contract
export const WSTX_VELAR = 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.wstx';
export const VELAR_SHARE_FEE_TO = 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-share-fee-to';

// Bitflow token ID for STX
const STX_TOKEN_ID = 'token-stx';

// Default ALEX factor (1e8) — used when Bitflow route is via ALEX wrapper
export const DEFAULT_ALEX_FACTOR = 100000000;

// ── SDK instance ─────────────────────────────────────────────────────────────

const bitflow = new BitflowSDK({
  BITFLOW_API_HOST: 'https://api.bitflowapis.finance',
  READONLY_CALL_API_HOST: 'https://node.bitflowapis.finance',
});

// ── Types ────────────────────────────────────────────────────────────────────

export type DexType = 'alex' | 'velar' | 'arkadiko' | 'bitflow';

export interface SweepToken {
  principal: string;   // SIP-010 contract principal
  tokenId: string;     // Bitflow token ID (e.g., 'token-welsh')
  amount: string;      // raw micro-units as string
  decimals: number;
  dex?: DexType;       // populated after quoting
  // Bitflow route data — populated by executeSweep
  route?: RouteQuote;
}

export interface SweepQuote {
  stxOut: string;      // net STX after 0.1% fee, human-readable
  stxOutRaw: bigint;   // net in micro-STX
  fee: string;         // protocol fee, human-readable
  perToken: {
    principal: string;
    stxOut: string;
    dex: DexType;
    noLiquidity?: boolean;
  }[];
}

// ── Token list ───────────────────────────────────────────────────────────────

let availableTokensCache: Token[] | null = null;
let availableTokensPromise: Promise<Token[]> | null = null;

export async function getAvailableTokens(): Promise<Token[]> {
  if (availableTokensCache) return availableTokensCache;
  if (availableTokensPromise) return availableTokensPromise;
  availableTokensPromise = bitflow.getAvailableTokens().then(tokens => {
    availableTokensCache = tokens;
    return tokens;
  }).catch(e => {
    console.warn('[sweep] getAvailableTokens failed:', e);
    availableTokensPromise = null;
    return [];
  });
  return availableTokensPromise;
}

// Pre-warm at module load
getAvailableTokens();

// ── DEX label from Bitflow route ─────────────────────────────────────────────

function dexFromRoute(route: RouteQuote | null | undefined): DexType {
  if (!route) return 'bitflow';
  const path = route.dexPath?.[0]?.toLowerCase() ?? route.route?.dex_path?.[0]?.toLowerCase() ?? '';
  if (path.includes('alex')) return 'alex';
  if (path.includes('velar')) return 'velar';
  if (path.includes('arkadiko')) return 'arkadiko';
  return 'bitflow';
}

// ── Clarity arg helpers ───────────────────────────────────────────────────────

function makeContract(principal: string) {
  if (!principal || typeof principal !== 'string') return makeContract(WSTX_PRINCIPAL);
  const dot = principal.indexOf('.');
  if (dot === -1) {
    // If it's just "STX" or "stx", use the canonical wSTX principal as fallback
    if (principal.toLowerCase() === 'stx') return makeContract(WSTX_PRINCIPAL);
    throw new Error(`makeContract: invalid principal "${principal}" (no dot and not "STX")`);
  }
  return Cl.contractPrincipal(principal.slice(0, dot), principal.slice(dot + 1));
}

function makeUint(n: number | bigint) {
  return Cl.uint(n);
}

const [feeAddr, feeName] = VELAR_SHARE_FEE_TO.split('.');
const FEE_TO_ARG = Cl.contractPrincipal(feeAddr, feeName);

// Build the per-token args for velumx-sweep-v2.
// New signature per slot:
//   token-alex <ft-alex>, token-velar <ft-velar>, token-ark <ft-arkadiko>,
//   dex uint, factor uint, pool-id uint,
//   t0 <ft-velar>, t1 <ft-velar>,
//   fee-to <share-fee-to-trait>,
//   ty <ft-arkadiko>,
//   amount uint
// The contract uses only the token matching the selected dex.
function tokenArgs(t: SweepToken & { dex: DexType; route: RouteQuote }): ReturnType<typeof Cl.uint>[] {
  const dexNum = t.dex === 'alex' ? 0 : t.dex === 'velar' ? 1 : 2;
  const params = t.route.swapData?.parameters ?? t.route.route?.swapData?.parameters ?? {};

  const factor = dexNum === 0 ? (params['factor'] ?? DEFAULT_ALEX_FACTOR) : 0;
  const poolId = dexNum === 1 ? (params['id'] ?? params['pool-id'] ?? 0) : 0;

  // Known valid tokens on Mainnet that implement the respective DEX SIP-010 traits
  // This prevents the node typechecker from throwing BadTraitReference during batch swaps
  const DUMMY_ARK_TOKEN = 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token';

  // token0/token1 for Velar — from route token_path
  const tokenPath = t.route.tokenPath ?? t.route.route?.token_path ?? [];
  const t0Principal = dexNum === 1 ? (tokenPath[0] ?? t.principal) : WSTX_VELAR;
  const t1Principal = dexNum === 1 ? (tokenPath[1] ?? WSTX_VELAR) : WSTX_VELAR;

  // ty for Arkadiko — the output token
  const tyPrincipal = dexNum === 2 ? WSTX_PRINCIPAL : DUMMY_ARK_TOKEN;

  // The actual token contract being swept
  const targetToken = makeContract(t.principal);

  const t0Contract = makeContract(t0Principal && t0Principal.includes('.') ? t0Principal : WSTX_VELAR);
  const t1Contract = makeContract(t1Principal && t1Principal.includes('.') ? t1Principal : WSTX_VELAR);
  const tyContract = makeContract(tyPrincipal && tyPrincipal.includes('.') ? tyPrincipal : DUMMY_ARK_TOKEN);

  return [
    dexNum === 0 ? targetToken : makeContract(WSTX_PRINCIPAL),                        // token-alex 
    dexNum === 1 ? targetToken : makeContract(WSTX_VELAR),                            // token-velar
    dexNum === 2 ? targetToken : makeContract(DUMMY_ARK_TOKEN),                       // token-ark  
    makeUint(dexNum),                                                                 // dex
    makeUint(factor),                                                                 // factor
    makeUint(poolId),                                                                 // pool-id
    t0Contract,                                                                       // t0
    t1Contract,                                                                       // t1
    FEE_TO_ARG,                                                                       // fee-to
    tyContract,                                                                       // ty
    makeUint(BigInt(t.amount)),                                                       // amount
  ] as any;
}

// ── Quote ─────────────────────────────────────────────────────────────────────

export async function quoteSweep(
  tokens: Pick<SweepToken, 'principal' | 'tokenId' | 'amount' | 'decimals'>[]
): Promise<SweepQuote> {
  if (tokens.length < 1 || tokens.length > 6) throw new Error('Sweep supports 1–6 tokens');

  const perToken: SweepQuote['perToken'] = [];
  let totalRaw = 0n;

  await Promise.all(tokens.map(async (t) => {
    try {
      const humanAmount = Number(BigInt(t.amount)) / Math.pow(10, t.decimals);
      const result: QuoteResult = await bitflow.getQuoteForRoute(t.tokenId, STX_TOKEN_ID, humanAmount);
      const best = result.bestRoute;

      if (!best || best.quote == null || best.quote <= 0) {
        perToken.push({ principal: t.principal, stxOut: '0', dex: 'bitflow', noLiquidity: true });
        return;
      }

      // best.quote is in human STX units — convert to micro-STX
      const stxRaw = BigInt(Math.floor(best.quote * 1e6));
      totalRaw += stxRaw;
      perToken.push({
        principal: t.principal,
        stxOut: (Number(stxRaw) / 1e6).toFixed(6),
        dex: dexFromRoute(best),
      });
    } catch (e) {
      console.warn('[sweep] quoteSweep failed for', t.principal, e);
      perToken.push({ principal: t.principal, stxOut: '0', dex: 'bitflow', noLiquidity: true });
    }
  }));

  const feeRaw = totalRaw / 1000n;
  const netRaw = totalRaw - feeRaw;

  return {
    stxOut: (Number(netRaw) / 1e6).toFixed(6),
    stxOutRaw: netRaw,
    fee: (Number(feeRaw) / 1e6).toFixed(6),
    perToken,
  };
}

// ── Execute ───────────────────────────────────────────────────────────────────

export async function executeSweep(params: {
  tokens: SweepToken[];
  minStxOut: string;
  onProgress?: (msg: string) => void;
}): Promise<string> {
  const { tokens, minStxOut, onProgress } = params;
  if (tokens.length < 1 || tokens.length > 6) throw new Error('Sweep supports 1–6 tokens');

  onProgress?.('Getting swap routes...');

  // Fetch swap params from Bitflow for each token
  const enriched: (SweepToken & { dex: DexType; route: RouteQuote })[] = [];

  for (const t of tokens) {
    try {
      const humanAmount = Number(BigInt(t.amount)) / Math.pow(10, t.decimals);
      const result: QuoteResult = await bitflow.getQuoteForRoute(t.tokenId, STX_TOKEN_ID, humanAmount);
      const best = result.bestRoute;

      if (!best || best.quote == null || best.quote <= 0) {
        console.warn('[sweep] No route for', t.principal, '— skipping');
        continue;
      }

      enriched.push({
        ...t,
        dex: dexFromRoute(best),
        route: best,
      });
    } catch (e) {
      console.warn('[sweep] getQuoteForRoute failed for', t.principal, e);
    }
  }

  if (enriched.length === 0) throw new Error('No valid routes found for any token');

  onProgress?.('Building transaction...');

  const functionArgs = [
    ...enriched.flatMap(tokenArgs),
    makeUint(BigInt(minStxOut)),
  ];

  console.log('[sweep] Calling', SWEEP_CONTRACT, `sweep-to-stx-${enriched.length}`, 'with', enriched.length, 'tokens');

  onProgress?.('Waiting for wallet signature...');

  return new Promise((resolve, reject) => {
    request('stx_callContract', {
      contract: SWEEP_CONTRACT,
      functionName: `sweep-to-stx-${enriched.length}`,
      functionArgs,
      network: 'mainnet',
      postConditionMode: 'allow',
      onFinish: (data: any) => { onProgress?.('Submitted!'); resolve(data.txid); },
      onCancel: () => reject(new Error('Cancelled by user')),
    } as any).catch((e: any) => { console.error('[sweep] request failed:', e); reject(e); });
  });
}
