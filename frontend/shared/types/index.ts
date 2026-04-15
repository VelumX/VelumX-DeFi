/**
 * Shared TypeScript types for USDC Bridge Platform
 * Used across frontend and backend
 */

// ============ Transaction Types ============

export type TransactionStatus =
  | 'pending'       // Initial submission
  | 'confirming'    // Waiting for blockchain confirmation
  | 'attesting'     // Waiting for attestation
  | 'minting'       // Minting/withdrawing on destination chain
  | 'complete'      // Successfully completed
  | 'failed';       // Failed with error

export type BridgeStep =
  | 'approval'      // USDC approval (deposits only)
  | 'deposit'       // xReserve deposit
  | 'burn'          // USDCx burn
  | 'attestation'   // Waiting for attestation
  | 'mint'          // Minting USDCx
  | 'withdrawal';   // Withdrawing USDC

export interface BridgeTransaction {
  // Unique identifier
  id: string;

  // Transaction type
  type: 'deposit' | 'withdrawal' | 'swap' | 'add-liquidity' | 'remove-liquidity';

  // Amount in smallest unit (micro USDC/USDCx)
  amount: string;

  // Chain information
  sourceChain: 'ethereum' | 'stacks';
  destinationChain: 'ethereum' | 'stacks';

  // Status tracking
  status: TransactionStatus;
  currentStep: BridgeStep | 'swap' | 'liquidity';

  // Transaction hashes
  sourceTxHash: string;
  destinationTxHash?: string;

  // Attestation data
  messageHash?: string;
  attestation?: string;
  attestationFetchedAt?: number;

  // User addresses
  ethereumAddress?: string; // Optional for pure Stacks transactions
  stacksAddress: string;

  // Token info for swaps/liquidity
  inputToken?: string;
  outputToken?: string;

  // Timestamps
  createdAt: number;
  updatedAt: number;
  completedAt?: number;

  // Error handling
  error?: string;
  retryCount: number;

  // Gasless transaction info
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
  network: string;  // 'sepolia' for testnet
  balances: {
    usdc: bigint;   // in micro USDC (6 decimals)
    eth: bigint;    // in wei (18 decimals)
  };
}

export interface StacksWallet {
  address: string | null;
  connected: boolean;
  network: string;  // 'testnet'
  balances: {
    usdcx: bigint;  // in micro USDCx (6 decimals)
    stx: bigint;    // in micro STX (6 decimals)
  };
}

// ============ Yield Types ============

export interface YieldPosition {
  // Protocol information
  protocol: string;           // Contract address
  protocolName: string;       // Human-readable name
  protocolType: 'lending' | 'liquidity' | 'staking';

  // Position details
  depositedAmount: bigint;    // in micro USDCx
  earnedRewards: bigint;      // in micro USDCx or protocol token
  rewardToken: string;        // Token address for rewards

  // Performance metrics
  apy: number;                // Annual percentage yield
  tvl: bigint;                // Total value locked in protocol

  // Timestamps
  depositedAt: number;
  lastClaimAt?: number;

  // Auto-compound settings
  autoCompound: boolean;
  compoundFrequency?: number; // seconds between compounds
}

export interface YieldProtocol {
  address: string;
  name: string;
  type: 'lending' | 'liquidity' | 'staking';
  apy: number;
  tvl: bigint;
  minDeposit: bigint;
  lockPeriod?: number;        // seconds, if applicable
  supported: boolean;         // Whether we support this protocol
}

// ============ Fee Types ============

export interface FeeEstimate {
  // Gas cost in native token
  gasInStx: bigint;           // in micro STX

  // Equivalent cost in USDCx
  gasInUsdcx: bigint;         // in micro USDCx

  // Exchange rates used
  stxToUsd: number;
  usdcToUsd: number;          // Should be ~1.0

  // Markup applied
  markup: number;             // percentage

  // Timestamp
  estimatedAt: number;
  validUntil: number;         // Estimate expires after 60 seconds
}

export interface ExchangeRates {
  stxToUsd: number;
  usdcToUsd: number;
  timestamp: number;
}

// ============ API Request/Response Types ============

export interface AttestationData {
  attestation: string;
  messageHash: string;
  fetchedAt: number;
}

export interface SponsoredTxRequest {
  transaction: string;        // Serialized transaction
  userAddress: string;
  estimatedFee: string;       // in micro USDCx
}

export interface SponsoredTxResponse {
  txid: string;
  success: boolean;
  error?: string;
}

export interface TransactionHistoryRequest {
  address: string;
  limit?: number;
  offset?: number;
}

export interface TransactionHistoryResponse {
  transactions: BridgeTransaction[];
  total: number;
  hasMore: boolean;
}

// ============ API Error Types ============

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  timestamp: number;
}

// ============ Configuration Types ============

export interface BackendConfig {
  // Network configuration
  ethereumRpcUrl: string;
  stacksRpcUrl: string;

  // Contract addresses
  ethereumUsdcAddress: string;
  ethereumXReserveAddress: string;
  stacksUsdcxAddress: string;
  stacksUsdcxProtocolAddress: string;
  stacksPaymasterAddress: string;
  stacksSwapContractAddress: string;
  stacksVexAddress: string;

  // API keys
  circleApiKey?: string;

  // Relayer configuration
  relayerPrivateKey: string;
  relayerSeedPhrase?: string;
  relayerStacksAddress: string;
  minStxBalance: bigint;

  // Monitoring configuration
  attestationPollInterval: number;  // milliseconds
  maxRetries: number;
  transactionTimeout: number;       // milliseconds

  // Fee configuration
  paymasterMarkup: number;          // percentage (e.g., 5 for 5%)

  // Rate limiting
  maxRequestsPerMinute: number;

  // Server configuration
  port: number;
  corsOrigin: string;
}

export interface FrontendConfig {
  // API endpoint
  backendUrl: string;

  // Network configuration
  ethereumChainId: number;
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
}
