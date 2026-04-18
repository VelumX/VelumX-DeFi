import { BitflowSDK } from '@bitflowlabs/core-sdk';

/**
 * Shared Bitflow SDK configuration — mainnet endpoints
 */
export const BITFLOW_CONFIG = {
  BITFLOW_API_HOST: 'https://api.bitflowapis.finance',
  READONLY_CALL_API_HOST: 'https://node.bitflowapis.finance',
  BITFLOW_PROVIDER_ADDRESS: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE', // VelumX mainnet address
};

/**
 * Singleton Bitflow SDK instance
 * Always initialized with explicit mainnet config to prevent the SDK's
 * test-endpoint defaults from being used.
 */
let bitflowInstance: BitflowSDK | null = null;

export function getBitflowSDK(): BitflowSDK {
  if (!bitflowInstance) {
    bitflowInstance = new BitflowSDK(BITFLOW_CONFIG);
    console.log('[Bitflow] SDK initialized with config:', BITFLOW_CONFIG);
  }
  return bitflowInstance;
}

/**
 * Force a fresh SDK instance — call this if you suspect stale config
 */
export function resetBitflowSDK(): void {
  bitflowInstance = null;
}
