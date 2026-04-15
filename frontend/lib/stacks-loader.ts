/**
 * Stacks Library Loader (ESM)
 * Centrally manages Stacks libraries to ensure they are only evaluated in the browser.
 */

// Global cache for loaded modules to prevent redundant work
const moduleCache: Record<string, any> = {};

/**
 * Safely extracts exports from a module, handling ESM and CJS wrapping.
 */
const getExport = (mod: any, key: string) => {
    if (!mod) return undefined;
    if (mod[key] !== undefined) return mod[key];
    if (mod.default && mod.default[key] !== undefined) return mod.default[key];
    return undefined;
};

/**
 * Normalizes a network candidate to ensure it's compatible with the 'new' keyword.
 */
const normalizeNetwork = (candidate: any) => {
    if (!candidate) return null;
    if (typeof candidate === 'function') return candidate;
    if (typeof candidate === 'object') {
        const instance = candidate;
        return class {
            constructor() { return instance; }
        };
    }
    return candidate;
};

// Helper to get @stacks/connect safely
export const getStacksConnect = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    if (moduleCache.connect) return moduleCache.connect;
    try {
        const mod = await import('@stacks/connect') as any;
        const base = mod.default || mod;
        moduleCache.connect = {
            ...base,
            request: getExport(mod, 'request'),
            showConnect: getExport(mod, 'showConnect'),
            openContractCall: getExport(mod, 'openContractCall'),
            openSignTransaction: getExport(mod, 'openSignTransaction'),
            showSignMessage: getExport(mod, 'showSignMessage'),
            openSignatureRequestPopup: getExport(mod, 'openSignatureRequestPopup'), // Alias/Fallback
        };
        return moduleCache.connect;
    } catch (e) {
        console.error('Failed to load @stacks/connect', e);
        return null;
    }
};

// Helper to get @stacks/transactions safely
export const getStacksTransactions = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    if (moduleCache.transactions) return moduleCache.transactions;
    try {
        const mod = await import('@stacks/transactions') as any;
        const base = mod.default || mod;

        // Robustly capture all exports
        const allExports: any = { ...base };

        // Explicitly walk prototype/keys if base is a Namespace object
        Object.keys(mod).forEach(key => {
            if (mod[key] !== undefined) allExports[key] = mod[key];
        });
        if (mod.default) {
            Object.keys(mod.default).forEach(key => {
                if (mod.default[key] !== undefined) allExports[key] = mod.default[key];
            });
        }

        moduleCache.transactions = allExports;
        return moduleCache.transactions;
    } catch (e) {
        console.error('Failed to load @stacks/transactions', e);
        return null;
    }
};

// Helper to get @stacks/network safely
export const getStacksNetwork = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    if (moduleCache.network) return moduleCache.network;
    try {
        const mod = await import('@stacks/network') as any;
        const testnet = getExport(mod, 'StacksTestnet') || getExport(mod, 'STACKS_TESTNET');
        const mainnet = getExport(mod, 'StacksMainnet') || getExport(mod, 'STACKS_MAINNET');

        const base = mod.default || mod;
        moduleCache.network = {
            ...base,
            StacksTestnet: normalizeNetwork(testnet),
            StacksMainnet: normalizeNetwork(mainnet),
        };
        return moduleCache.network;
    } catch (e) {
        console.error('Failed to load @stacks/network', e);
        return null;
    }
};

/**
 * Robustly instantiates a Stacks Network instance
 */
export const getNetworkInstance = async (isMainnetOverride?: boolean): Promise<any> => {
    const isMainnet = true; // Hardcoded for production
        
    const networkModule = await getStacksNetwork();
    if (!networkModule) return null;

    try {
        const NetworkClass = isMainnet ? networkModule.StacksMainnet : networkModule.StacksTestnet;
        const network = new NetworkClass();

        // Standard configuration for VelumX
        network.client = {
            baseUrl: isMainnet ? 'https://api.mainnet.hiro.so' : 'https://api.testnet.hiro.so',
            fetch: (url: any, init: any) => fetch(url, init),
        };
        network.bnsLookupUrl = isMainnet ? 'https://api.mainnet.hiro.so' : 'https://api.testnet.hiro.so';

        // Versioning: Mainnet = 0, Testnet = 128 (per @stacks/network TransactionVersion enum)
        const version = isMainnet ? 0 : 128;
        network.transactionVersion = version;
        network.version = version;

        return network;
    } catch (e) {
        console.warn('Failed to instantiate Stacks network, using fallback', e);
        // Minimal fallback object if class instantiation fails
        return {
            chainId: isMainnet ? 0x00000001 : 0x80000000,
            transactionVersion: isMainnet ? 0 : 128,
            isMainnet: () => isMainnet,
            client: {
                baseUrl: isMainnet ? 'https://api.mainnet.hiro.so' : 'https://api.testnet.hiro.so',
                fetch: (url: any, init: any) => fetch(url, init),
            }
        };
    }
};

// Helper to get @stacks/common safely
export const getStacksCommon = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    if (moduleCache.common) return moduleCache.common;
    try {
        const mod = await import('@stacks/common') as any;
        moduleCache.common = mod.default || mod;
        return moduleCache.common;
    } catch (e) {
        console.error('Failed to load @stacks/common', e);
        return null;
    }
};
