/**
 * ALEX SDK singleton and token-address ↔ Currency mapping helpers.
 *
 * ALEX uses a `Currency` enum (string values like "token-stx", "token-alex")
 * rather than contract principals. This module bridges the two worlds.
 */

import { AlexSDK, Currency } from 'alex-sdk';

let _instance: AlexSDK | null = null;

export function getAlexSDK(): AlexSDK {
  if (!_instance) _instance = new AlexSDK();
  return _instance;
}

// ── Well-known contract principal → Currency mappings ─────────────────────────
// ALEX only supports its own token set. We map the contract principals used
// everywhere else in the app to the Currency enum values ALEX expects.
const PRINCIPAL_TO_CURRENCY: Record<string, Currency> = {
  // STX — ALEX uses a wrapped STX token internally
  'STX':                                                          Currency.STX,
  'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx':       Currency.STX,
  // ALEX governance token
  'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex':       Currency.ALEX,
  // aeUSDC (Allbridge)
  'SP3Y2ZSH8P7D50B0JLZVGKMBC7PX3RVRGWJKWKY38.token-aeusdc':     Currency.AEUSDC,
  // sBTC
  'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token':       Currency.SBTC,
  // USDA (Arkadiko)
  'SP2C2YFP12AJZB1KD5M1DMR69R7H5PCSV927WKDE.arkadiko-token':    Currency.USDA,
  // xBTC
  'SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.Wrapped-Bitcoin':   Currency.XBTC,
  // WELSH
  'SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token': Currency.WELSH,
  // sUSDT
  'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt':       Currency.SUSDT,
  // stSTX (StackingDAO)
  'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token':       Currency.STSTX,
};

// Reverse map: Currency → contract principal (for building Clarity args)
const CURRENCY_TO_PRINCIPAL: Record<string, string> = Object.fromEntries(
  Object.entries(PRINCIPAL_TO_CURRENCY).map(([k, v]) => [v, k])
);

// Override with canonical mainnet principals for the reverse map
CURRENCY_TO_PRINCIPAL[Currency.STX]    = 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx';
CURRENCY_TO_PRINCIPAL[Currency.ALEX]   = 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex';
CURRENCY_TO_PRINCIPAL[Currency.AEUSDC] = 'SP3Y2ZSH8P7D50B0JLZVGKMBC7PX3RVRGWJKWKY38.token-aeusdc';
CURRENCY_TO_PRINCIPAL[Currency.SBTC]   = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
CURRENCY_TO_PRINCIPAL[Currency.USDA]   = 'SP2C2YFP12AJZB1KD5M1DMR69R7H5PCSV927WKDE.arkadiko-token';
CURRENCY_TO_PRINCIPAL[Currency.XBTC]   = 'SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.Wrapped-Bitcoin';
CURRENCY_TO_PRINCIPAL[Currency.WELSH]  = 'SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token';
CURRENCY_TO_PRINCIPAL[Currency.SUSDT]  = 'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt';
CURRENCY_TO_PRINCIPAL[Currency.STSTX]  = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token';

/**
 * Convert a contract principal (or "STX") to an ALEX Currency enum value.
 * Returns null if the token is not supported by ALEX.
 */
export function principalToCurrency(principal: string): Currency | null {
  return PRINCIPAL_TO_CURRENCY[principal] ?? null;
}

/**
 * Convert an ALEX Currency enum value to its canonical mainnet contract principal.
 */
export function currencyToPrincipal(currency: Currency): string {
  return CURRENCY_TO_PRINCIPAL[currency] ?? '';
}

/**
 * Returns true if both tokens are supported by ALEX.
 */
export function isAlexPair(tokenInAddress: string, tokenOutAddress: string): boolean {
  return (
    principalToCurrency(tokenInAddress) !== null &&
    principalToCurrency(tokenOutAddress) !== null
  );
}
