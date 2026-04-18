import { BitflowSDK } from '@bitflowlabs/core-sdk';

/**
 * Bitflow SDK configuration.
 * BITFLOW_API_HOST is their single public gateway (the "test" in the name is
 * just the gateway identifier — it is the production endpoint per Bitflow docs).
 * Routes from this API may contain simnet contract addresses for some DEX
 * integrations; these are mapped to mainnet equivalents in bitflow-gasless-swap.ts.
 */
export const BITFLOW_CONFIG = {
  BITFLOW_API_HOST: 'https://bitflowsdk-api-test-7owjsmt8.uk.gateway.dev',
  READONLY_CALL_API_HOST: 'https://node.bitflowapis.finance',
  BITFLOW_PROVIDER_ADDRESS: 'SP1HTSGV1BXVAAVWJZ3MZJCTH9P28Z52ENQPX6JWV',
};

let bitflowInstance: BitflowSDK | null = null;

export function getBitflowSDK(): BitflowSDK {
  if (!bitflowInstance) {
    bitflowInstance = new BitflowSDK(BITFLOW_CONFIG);
  }
  return bitflowInstance;
}

export function resetBitflowSDK(): void {
  bitflowInstance = null;
}
