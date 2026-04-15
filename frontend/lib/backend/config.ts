/**
 * Server-side Backend Configuration
 * This file should ONLY be imported in server-side contexts (API Routes, Server actions)
 */

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
    maxRequestsPerMinute: number;
    velumxRelayerUrl: string;
    velumxApiKey: string;
}

const REQUIRED_ENV_VARS = [
    'STACKS_RPC_URL',
] as const;

function validateEnvironment(): boolean {
    const isBuild = process.env.NEXT_PHASE === 'phase-production-build' || (process.env.NODE_ENV === 'production' && !process.env.RELAYER_PRIVATE_KEY);
    const missing: string[] = [];
    for (const varName of REQUIRED_ENV_VARS) {
        if (!process.env[varName]) {
            missing.push(varName);
        }
    }
    if (missing.length > 0) {
        if (isBuild) {
            return true; // isBuild = true
        }
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    return false;
}

function parseBigInt(value: string | undefined, defaultValue: bigint): bigint {
    if (!value) return defaultValue;
    try {
        return BigInt(value);
    } catch {
        return defaultValue;
    }
}

function parseNumber(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

export function getBackendConfig(): BackendConfig {
    const isBuild = validateEnvironment();
    const placeholder = 'http://placeholder-during-build';

    return {
        ethereumRpcUrl: process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia.publicnode.com',
        stacksRpcUrl: process.env.STACKS_RPC_URL || 'https://api.mainnet.hiro.so',
        ethereumUsdcAddress: process.env.ETHEREUM_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        ethereumXReserveAddress: process.env.ETHEREUM_XRESERVE_ADDRESS || '0x008888878f94C0d87defdf0B07f46B93C1934442',
        stacksUsdcxAddress: process.env.STACKS_USDCX_ADDRESS || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
        stacksUsdcxProtocolAddress: process.env.STACKS_USDCX_PROTOCOL_ADDRESS || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1',
        stacksPaymasterAddress: process.env.STACKS_PAYMASTER_ADDRESS || 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.simple-paymaster-v2',
        stacksSwapContractAddress: process.env.STACKS_SWAP_CONTRACT_ADDRESS || 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.swap-v9-stx',
        stacksVexAddress: process.env.STACKS_VEX_ADDRESS || 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.vextoken-v1',
        circleApiKey: process.env.CIRCLE_API_KEY,
        relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY || '0'.repeat(64),
        relayerSeedPhrase: process.env.RELAYER_SEED_PHRASE,
        relayerStacksAddress: process.env.RELAYER_STACKS_ADDRESS || 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P',
        minStxBalance: parseBigInt(process.env.MIN_STX_BALANCE, BigInt(1_000_000)),
        attestationPollInterval: parseNumber(process.env.ATTESTATION_POLL_INTERVAL, 30000),
        maxRetries: parseNumber(process.env.MAX_RETRIES, 3),
        transactionTimeout: parseNumber(process.env.TRANSACTION_TIMEOUT, 3600000),
        maxRequestsPerMinute: parseNumber(process.env.MAX_REQUESTS_PER_MINUTE, 100),
        velumxRelayerUrl: process.env.VELUMX_RELAYER_URL || 'https://sgal-relayer.onrender.com',
        velumxApiKey: process.env.VELUMX_API_KEY || '',
    };
}
