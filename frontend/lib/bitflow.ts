import { BitflowSDK } from '@bitflowlabs/core-sdk';

/**
 * Bitflow SDK configuration.
 * API calls are routed through Next.js rewrites (/api/bitflow → api.bitflowapis.finance)
 * to avoid CORS restrictions when running in the browser. The rewrites are
 * defined in next.config.ts and execute server-side on Vercel.
 */
export const BITFLOW_CONFIG = {
  BITFLOW_API_HOST: '/api/bitflow',
  READONLY_CALL_API_HOST: '/api/bitflow-node',
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
