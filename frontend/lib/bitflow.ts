import { BitflowSDK } from '@bitflowlabs/core-sdk';

/**
 * Shared Bitflow SDK configuration
 */
export const BITFLOW_CONFIG = {
  BITFLOW_API_HOST: 'https://api.bitflowapis.finance',
  READONLY_CALL_API_HOST: 'https://node.bitflowapis.finance',
  BITFLOW_PROVIDER_ADDRESS: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE', // VelumX mainnet address
};

/**
 * Singleton Bitflow SDK instance
 */
let bitflowInstance: BitflowSDK | null = null;

export function getBitflowSDK(): BitflowSDK {
  if (!bitflowInstance) {
    bitflowInstance = new BitflowSDK(BITFLOW_CONFIG);
  }
  return bitflowInstance;
}
