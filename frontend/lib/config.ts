/**
 * Frontend configuration
 * Loads environment variables and provides typed config
 */

import { FrontendConfig } from './types';

/**
 * Loads frontend configuration from environment variables
 */
/**
 * Loads frontend configuration from environment variables
 */
export function getConfig(): FrontendConfig {
  const isMainnet = true; // Hardcoded for production

  return {
    // API endpoint (empty string points to same origin in Next.js)
    backendUrl: '', // Always use relative paths for internal Next.js API routes

    // Network configuration
    ethereumChainId: parseInt(process.env.NEXT_PUBLIC_ETHEREUM_CHAIN_ID || (isMainnet ? '1' : '11155111')), // Ethereum Mainnet (1) or Sepolia (11155111)
    ethereumRpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://ethereum.publicnode.com',
    stacksNetwork: 'mainnet' as const,

    // Contract addresses
    ethereumUsdcAddress: process.env.NEXT_PUBLIC_ETHEREUM_USDC_ADDRESS || (isMainnet ? '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' : '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'),
    ethereumXReserveAddress: process.env.NEXT_PUBLIC_ETHEREUM_XRESERVE_ADDRESS || (isMainnet ? '0x8888888199b2Df864bf678259607d6D5EBb4e3Ce' : '0x008888878f94C0d87defdf0B07f46B93C1934442'),
    
    stacksUsdcxAddress: process.env.NEXT_PUBLIC_STACKS_USDCX_ADDRESS || (isMainnet ? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx' : 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx'),
    stacksUsdcxProtocolAddress: process.env.NEXT_PUBLIC_STACKS_USDCX_PROTOCOL_ADDRESS || (isMainnet ? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx-v1' : 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1'),
    
    // Universal Paymaster (Stacks-Native Sponsored Transactions)
    stacksPaymasterAddress: process.env.NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS || (isMainnet ? 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.simple-paymaster-v3' : 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.simple-paymaster-v3'),
    
    // DEX contracts
    stacksSwapContractAddress: process.env.NEXT_PUBLIC_STACKS_SWAP_CONTRACT_ADDRESS || (isMainnet ? 'SP102V3PRWF9674066V2FWAH0TGQEE5WQZ927S3X1.alex-vault' : 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.swap-v9-stx'), // Default to ALEX for mainnet
    stacksVexAddress: process.env.NEXT_PUBLIC_STACKS_VEX_ADDRESS || (isMainnet ? '' : 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.vextoken-v1'),

    // Domain IDs (Stacks USDCx bridging)
    ethereumDomainId: parseInt(process.env.NEXT_PUBLIC_ETHEREUM_DOMAIN_ID || '0'), // Ethereum
    stacksDomainId: parseInt(process.env.NEXT_PUBLIC_STACKS_DOMAIN_ID || (isMainnet ? '10003' : '10003')), // Stacks (typically 10003 for both if using the same protocol)

    // Explorer URLs
    ethereumExplorerUrl: process.env.NEXT_PUBLIC_ETHEREUM_EXPLORER_URL || (isMainnet ? 'https://etherscan.io' : 'https://sepolia.etherscan.io'),
    stacksExplorerUrl: process.env.NEXT_PUBLIC_STACKS_EXPLORER_URL || (isMainnet ? 'https://explorer.hiro.so' : 'https://explorer.hiro.so?chain=testnet'),

    // VelumX Integration
    velumxRelayerAddress: process.env.NEXT_PUBLIC_VELUMX_RELAYER_ADDRESS || '', // STRICT: No fallback
  };
}

/**
 * Singleton config instance
 */
let configInstance: FrontendConfig | null = null;

/**
 * Gets the frontend configuration
 * Safe to call on both server and client
 */
export function useConfig(): FrontendConfig {
  if (!configInstance) {
    configInstance = getConfig();
  }
  return configInstance;
}

/**
 * Network names for display
 */
export const NETWORK_NAMES = {
  ethereum: 'Ethereum Mainnet',
  stacks: 'Stacks Mainnet',
} as const;

/**
 * Token decimals
 */
export const TOKEN_DECIMALS = {
  usdc: 6,
  usdcx: 6,
  eth: 18,
  stx: 6,
} as const;

/**
 * Contract ABIs
 */
export const USDC_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: 'remaining', type: 'uint256' }],
  },
] as const;

export const XRESERVE_ABI = [
  {
    name: 'depositToRemote',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'value', type: 'uint256' },
      { name: 'remoteDomain', type: 'uint32' },
      { name: 'remoteRecipient', type: 'bytes32' },
      { name: 'localToken', type: 'address' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;
