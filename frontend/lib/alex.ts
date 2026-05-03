/**
 * ALEX SDK singleton.
 *
 * alex-sdk v3 uses a branded string type for Currency.
 * Token IDs are resolved at runtime via fetchSwappableCurrency()
 * (see resolveAlexId in alex-swap.ts for the full resolution logic).
 */

import { AlexSDK } from 'alex-sdk';

let _instance: AlexSDK | null = null;

export function getAlexSDK(): AlexSDK {
  if (!_instance) _instance = new AlexSDK();
  return _instance;
}

/**
 * Resolve a contract principal or token ID to an ALEX token ID string.
 * Fetches the full supported token list from ALEX and matches by wrapToken
 * contract address or by token ID directly.
 * Returns null if the token is not supported by ALEX.
 */
export async function resolveAlexId(token: string): Promise<string | null> {
  if (token === 'token-wstx' || token === 'STX') return 'token-wstx';
  // If it's already a bare token ID (no dot, no SP/ST prefix), pass through
  if (!token.includes('.') && !token.startsWith('SP') && !token.startsWith('ST')) return token;

  try {
    const alex = getAlexSDK();
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

/**
 * Returns true if both tokens are supported by ALEX.
 * Async — fetches the token list on first call (cached by the SDK).
 */
export async function isAlexPairAsync(
  tokenInAddress: string,
  tokenOutAddress: string,
): Promise<boolean> {
  const [idIn, idOut] = await Promise.all([
    resolveAlexId(tokenInAddress),
    resolveAlexId(tokenOutAddress),
  ]);
  return idIn !== null && idOut !== null;
}

/**
 * Synchronous best-effort check using only the STX/ALEX hardcoded IDs.
 * Used to skip the ALEX quote attempt early without a network call.
 * Returns true only for the two tokens ALEX always supports.
 */
export function isAlexPair(tokenInAddress: string, tokenOutAddress: string): boolean {
  const ALWAYS_SUPPORTED = new Set([
    'STX',
    'token-wstx',
    'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx',
    'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex',
    'age000-governance-token',
  ]);
  // If either token is definitely not in the always-supported set,
  // we still return true to allow the async check — the quote will
  // simply return null if ALEX doesn't support it.
  // Return false only for tokens we know ALEX never handles.
  const NEVER_SUPPORTED = new Set([
    'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx', // USDCx — Bitflow only
  ]);
  return !NEVER_SUPPORTED.has(tokenInAddress) && !NEVER_SUPPORTED.has(tokenOutAddress);
}
