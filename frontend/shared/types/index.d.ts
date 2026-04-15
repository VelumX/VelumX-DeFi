/**
 * Shared TypeScript types for USDC Bridge Platform
 * Used across frontend and backend
 */
export type TransactionStatus = 'pending' | 'confirming' | 'attesting' | 'minting' | 'complete' | 'failed';
export type BridgeStep = 'approval' | 'deposit' | 'burn' | 'attestation' | 'mint' | 'withdrawal';
export interface BridgeTransaction {
    id: string;
    type: 'deposit' | 'withdrawal' | 'swap' | 'add-liquidity' | 'remove-liquidity';
    amount: string;
    sourceChain: 'ethereum' | 'stacks';
    destinationChain: 'ethereum' | 'stacks';
    status: TransactionStatus;
    currentStep: BridgeStep | 'swap' | 'liquidity';
    sourceTxHash: string;
    destinationTxHash?: string;
    messageHash?: string;
    attestation?: string;
    attestationFetchedAt?: number;
    ethereumAddress?: string;
    stacksAddress: string;
    inputToken?: string;
    outputToken?: string;
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
    error?: string;
    retryCount: number;
    isGasless: boolean;
    gasFeeInUsdcx?: string;
}
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
export interface YieldPosition {
    protocol: string;
    protocolName: string;
    protocolType: 'lending' | 'liquidity' | 'staking';
    depositedAmount: bigint;
    earnedRewards: bigint;
    rewardToken: string;
    apy: number;
    tvl: bigint;
    depositedAt: number;
    lastClaimAt?: number;
    autoCompound: boolean;
    compoundFrequency?: number;
}
export interface YieldProtocol {
    address: string;
    name: string;
    type: 'lending' | 'liquidity' | 'staking';
    apy: number;
    tvl: bigint;
    minDeposit: bigint;
    lockPeriod?: number;
    supported: boolean;
}
export interface FeeEstimate {
    gasInStx: bigint;
    gasInUsdcx: bigint;
    stxToUsd: number;
    usdcToUsd: number;
    markup: number;
    estimatedAt: number;
    validUntil: number;
}
export interface ExchangeRates {
    stxToUsd: number;
    usdcToUsd: number;
    timestamp: number;
}
export interface AttestationData {
    attestation: string;
    messageHash: string;
    fetchedAt: number;
}
export interface SponsoredTxRequest {
    transaction: string;
    userAddress: string;
    estimatedFee: string;
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
export interface ApiError {
    error: string;
    message: string;
    statusCode: number;
    timestamp: number;
}
export interface BackendConfig {
    ethereumRpcUrl: string;
    stacksRpcUrl: string;
    ethereumUsdcAddress: string;
    ethereumXReserveAddress: string;
    stacksUsdcxAddress: string;
    stacksUsdcxProtocolAddress: string;
    stacksPaymasterAddress: string;
    stacksSwapContractAddress: string;
    stacksVexAddress: string;
    circleApiKey?: string;
    relayerPrivateKey: string;
    relayerSeedPhrase?: string;
    relayerStacksAddress: string;
    minStxBalance: bigint;
    attestationPollInterval: number;
    maxRetries: number;
    transactionTimeout: number;
    paymasterMarkup: number;
    maxRequestsPerMinute: number;
    port: number;
    corsOrigin: string;
}
export interface FrontendConfig {
    backendUrl: string;
    ethereumChainId: number;
    stacksNetwork: 'testnet' | 'mainnet';
    ethereumUsdcAddress: string;
    ethereumXReserveAddress: string;
    stacksUsdcxAddress: string;
    stacksUsdcxProtocolAddress: string;
    stacksPaymasterAddress: string;
    stacksSwapContractAddress: string;
    stacksVexAddress: string;
    ethereumDomainId: number;
    stacksDomainId: number;
    ethereumExplorerUrl: string;
    stacksExplorerUrl: string;
}
//# sourceMappingURL=index.d.ts.map