/**
 * TypeScript types for VelumX Frontend
 * Copied from shared types for Vercel deployment
 */

// ============ Configuration Types ============

export interface FrontendConfig {
  // API endpoint
  backendUrl: string;

  // Network configuration
  ethereumChainId: number;
  ethereumRpcUrl: string;
  stacksNetwork: 'testnet' | 'mainnet';

  // Contract addresses
  ethereumUsdcAddress: string;
  ethereumXReserveAddress: string;
  stacksUsdcxAddress: string;
  stacksUsdcxProtocolAddress: string;
  stacksPaymasterAddress: string;
  stacksSwapContractAddress: string;
  stacksVexAddress: string;

  // Domain IDs
  ethereumDomainId: number;
  stacksDomainId: number;

  // Explorer URLs
  ethereumExplorerUrl: string;
  stacksExplorerUrl: string;

  // VelumX Integration
  velumxRelayerAddress: string;
}

// ============ Transaction Types ============

export type TransactionStatus =
  | 'pending'
  | 'confirming'
  | 'attesting'
  | 'minting'
  | 'complete'
  | 'failed';

export type BridgeStep =
  | 'approval'
  | 'deposit'
  | 'burn'
  | 'attestation'
  | 'mint'
  | 'withdrawal';

export interface BridgeTransaction {
  id: string;
  type: 'deposit' | 'withdrawal';
  amount: string;
  sourceChain: 'ethereum' | 'stacks';
  destinationChain: 'ethereum' | 'stacks';
  status: TransactionStatus;
  currentStep: BridgeStep;
  sourceTxHash: string;
  destinationTxHash?: string;
  messageHash?: string;
  attestation?: string;
  attestationFetchedAt?: number;
  ethereumAddress: string;
  stacksAddress: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  retryCount: number;
  isGasless: boolean;
  gasFeeInUsdcx?: string;
}

// ============ Wallet Types ============

export interface WalletState {
  ethereum: EthereumWallet;
  stacks: StacksWallet;
  lastUpdated: number;
}

export interface EthereumWallet {
  address: string | null;
  connected: boolean;
  network: string;
  balances: {
    usdc: bigint;
    eth: bigint;
  };
}

export interface StacksWallet {
  address: string | null;
  connected: boolean;
  network: string;
  balances: {
    usdcx: bigint;
    stx: bigint;
  };
}

// ============ API Types ============

export interface AttestationData {
  attestation: string;
  messageHash: string;
  fetchedAt: number;
}

export interface TransactionHistoryResponse {
  transactions: BridgeTransaction[];
  total: number;
  hasMore: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  timestamp: number;
}
