import { 
  uintCV,
  someCV,
  noneCV,
  tupleCV,
  serializeCV,
  contractPrincipalCV,
  standardPrincipalCV,
  PostConditionMode,
  makeUnsignedContractCall,
} from '@stacks/transactions';
import { getVelumXClient } from '../velumx';
import { getConfig } from '../config';
import { QuoteResult } from '@bitflowlabs/core-sdk';
import { getBitflowSDK } from '../bitflow';
import { request } from '@stacks/connect';

const bitflow = getBitflowSDK();

export interface BitflowGaslessSwapParams {
  userAddress: string;
  userPublicKey?: string;
  tokenIn: string;
  tokenInId: string;
  tokenOut: string;
  tokenOutId: string;
  amountIn: string | number;
  tokenInDecimals: number;
  tokenOutDecimals: number;
  feeToken: string;
  sponsorshipPolicy?: string;
  onProgress?: (status: string) => void;
}

export async function executeBitflowGaslessSwap(params: BitflowGaslessSwapParams): Promise<string> {
  const { userAddress, userPublicKey, tokenInId, tokenOutId, amountIn, feeToken, onProgress } = params;
  
  const velumx = getVelumXClient();
  const config = getConfig();

  // 1. Get Bitflow Route & Quote
  onProgress?.('Fetching quote from Bitflow...');
  const quoteResult: QuoteResult = await bitflow.getQuoteForRoute(tokenInId, tokenOutId, Number(amountIn));

  // ─── Bitflow Mainnet Contract Resolution ────────────────────────────────────
  //
  // The Bitflow API/SDK returns simnet (SM*) or testnet (ST*) deployer addresses
  // for several DEX integrations. We must map these to their correct mainnet
  // equivalents before building a sponsored transaction.
  //
  // Deployer address mappings (simnet/testnet → mainnet):
  //   SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR → SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM  (ALEX AMM / XYK)
  //   SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT → SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1  (Velar)
  //
  // IMPORTANT — contract-level overrides:
  //   Some contracts returned by the API use the XYK simnet deployer address
  //   (SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR) but are actually deployed
  //   under the main Bitflow deployer (SPQC38PW542EQJ5M11CR25P7BS1CA6QT4TBXGB3M).
  //   These include all router-*, wrapper-*, stableswap-*, earn-*, and lp-token-*
  //   contracts. The FULL_CONTRACT_OVERRIDES map handles these cases explicitly.
  //
  // Source: https://docs.bitflow.finance/bitflow-documentation/developers/deployed-contracts/stacks

  // Step 1 — deployer-level address remapping (catches XYK core contracts)
  const MAINNET_CONTRACT_MAP: Record<string, string> = {
    'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR': 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM', // ALEX AMM / XYK deployer
    'SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT': 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1', // Velar deployer
  };

  // Step 2 — full contract overrides: "simnetAddr.contractName" → "mainnetAddr.contractName"
  // These take priority over the deployer-level map above.
  // All Bitflow-native contracts (stableswap, earn, lp-token, router, wrapper) live at
  // SPQC38PW542EQJ5M11CR25P7BS1CA6QT4TBXGB3M regardless of what deployer the API returns.
  const BITFLOW_DEPLOYER = 'SPQC38PW542EQJ5M11CR25P7BS1CA6QT4TBXGB3M';
  const FULL_CONTRACT_OVERRIDES: Record<string, string> = {
    // ── StableSwap contracts ──────────────────────────────────────────────────
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.stableswap-stx-ststx-v-1-2`]:   `${BITFLOW_DEPLOYER}.stableswap-stx-ststx-v-1-2`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.stableswap-usda-susdt-v-1-2`]:  `${BITFLOW_DEPLOYER}.stableswap-usda-susdt-v-1-2`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.stableswap-aeusdc-susdt-v-1-2`]:`${BITFLOW_DEPLOYER}.stableswap-aeusdc-susdt-v-1-2`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.stableswap-usda-aeusdc-v-1-2`]: `${BITFLOW_DEPLOYER}.stableswap-usda-aeusdc-v-1-2`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.stableswap-usda-aeusdc-v-1-4`]: `${BITFLOW_DEPLOYER}.stableswap-usda-aeusdc-v-1-4`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.stableswap-abtc-xbtc-v-1-2`]:   `${BITFLOW_DEPLOYER}.stableswap-abtc-xbtc-v-1-2`,
    // ── Router contracts ──────────────────────────────────────────────────────
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-stx-ststx-bitflow-arkadiko-v-1-1`]: `${BITFLOW_DEPLOYER}.router-stx-ststx-bitflow-arkadiko-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-stx-ststx-bitflow-velar-v-1-2`]:   `${BITFLOW_DEPLOYER}.router-stx-ststx-bitflow-velar-v-1-2`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-stx-ststx-bitflow-alex-v-1-1`]:    `${BITFLOW_DEPLOYER}.router-stx-ststx-bitflow-alex-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-stx-ststx-bitflow-alex-v-1-2`]:    `${BITFLOW_DEPLOYER}.router-stx-ststx-bitflow-alex-v-1-2`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-stx-ststx-bitflow-alex-v-2-1`]:    `${BITFLOW_DEPLOYER}.router-stx-ststx-bitflow-alex-v-2-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-stx-ststx-bitflow-xyk-v-1-1`]:     `${BITFLOW_DEPLOYER}.router-stx-ststx-bitflow-xyk-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-stx-usda-arkadiko-alex-v-1-1`]:    `${BITFLOW_DEPLOYER}.router-stx-usda-arkadiko-alex-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-xyk-arkadiko-v-1-1`]:              `${BITFLOW_DEPLOYER}.router-xyk-arkadiko-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-xyk-velar-v-1-1`]:                 `${BITFLOW_DEPLOYER}.router-xyk-velar-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-xyk-alex-v-1-1`]:                  `${BITFLOW_DEPLOYER}.router-xyk-alex-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-xyk-alex-v-1-2`]:                  `${BITFLOW_DEPLOYER}.router-xyk-alex-v-1-2`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-velar-alex-v-1-1`]:                `${BITFLOW_DEPLOYER}.router-velar-alex-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-velar-alex-v-1-2`]:                `${BITFLOW_DEPLOYER}.router-velar-alex-v-1-2`,
    // ── Wrapper contracts ─────────────────────────────────────────────────────
    // Note: the API may return v-1-2 but only v-1-1 is deployed on mainnet.
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.wrapper-velar-v-1-1`]:          `${BITFLOW_DEPLOYER}.wrapper-velar-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.wrapper-velar-v-1-2`]:          `${BITFLOW_DEPLOYER}.wrapper-velar-v-1-1`,   // v-1-2 not on mainnet → use v-1-1
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.wrapper-velar-multihop-v-1-1`]: `${BITFLOW_DEPLOYER}.wrapper-velar-multihop-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.wrapper-alex-v-2-1`]:           `${BITFLOW_DEPLOYER}.wrapper-alex-v-2-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.wrapper-arkadiko-v-1-1`]:       `${BITFLOW_DEPLOYER}.wrapper-arkadiko-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.wrapper-arkadiko-v-1-2`]:       `${BITFLOW_DEPLOYER}.wrapper-arkadiko-v-1-1`, // v-1-2 not on mainnet → use v-1-1
    // ── Velar deployer overrides (SM2* → SP1Y5*) — Velar-native contracts ────
    // wrapper-velar-v-1-2 is deployed at the Velar address per Bitflow docs
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.wrapper-velar-v-1-2`]:          `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.wrapper-velar-v-1-2`,
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.univ2-core`]:                   `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-core`,
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.univ2-router`]:                 `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-router`,
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.univ2-library`]:                `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-library`,
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.univ2-share-fee-to`]:           `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-share-fee-to`,
  };

  // Known mainnet contract names per deployer — used to validate a route is executable on mainnet.
  // If a simnet address maps to a mainnet deployer but the contract name doesn't exist there,
  // the route is skipped.
  const KNOWN_MAINNET_CONTRACTS: Record<string, Set<string>> = {
    'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM': new Set([
      // ALEX AMM
      'amm-pool-v2-01', 'amm-vault-v2-01', 'amm-registry-v2-01',
      'swap-helper', 'swap-helper-a', 'swap-helper-b', 'swap-helper-c',
      // XYK (also at this address per Bitflow docs)
      'sip-010-trait-ft-standard-v-1-1', 'xyk-pool-trait-v-1-1',
      'token-stx-v-1-1', 'xyk-core-v-1-1', 'xyk-pool-stx-aeusdc-v-1-1',
    ]),
    'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1': new Set([
      'univ2-core', 'univ2-router', 'univ2-library', 'univ2-share-fee-to',
      'wrapper-velar-v-1-2',
    ]),
    [BITFLOW_DEPLOYER]: new Set([
      // StableSwap
      'stableswap-stx-ststx-v-1-2', 'stableswap-usda-susdt-v-1-2',
      'stableswap-aeusdc-susdt-v-1-2', 'stableswap-usda-aeusdc-v-1-2',
      'stableswap-usda-aeusdc-v-1-4', 'stableswap-abtc-xbtc-v-1-2',
      // Earn
      'earn-stx-ststx-v-1-2', 'earn-usda-susdt-v-1-3', 'earn-aeusdc-susdt-v-1-3',
      'earn-usda-aeusdc-v-1-3', 'earn-usda-aeusdc-v-1-5', 'earn-abtc-xbtc-v-1-3',
      // LP Tokens
      'stx-ststx-lp-token-v-1-2', 'usda-susdt-lp-token-v-1-2',
      'aeusdc-susdt-lp-token-v-1-2', 'usda-aeusdc-lp-token-v-1-2',
      'usda-aeusdc-lp-token-v-1-4', 'abtc-xbtc-lp-token-v-1-2',
      // Routers
      'router-stx-ststx-bitflow-arkadiko-v-1-1', 'router-stx-ststx-bitflow-velar-v-1-2',
      'router-stx-ststx-bitflow-alex-v-1-1', 'router-stx-ststx-bitflow-alex-v-1-2',
      'router-stx-ststx-bitflow-alex-v-2-1', 'router-stx-ststx-bitflow-xyk-v-1-1',
      'router-stx-usda-arkadiko-alex-v-1-1', 'router-xyk-arkadiko-v-1-1',
      'router-xyk-velar-v-1-1', 'router-xyk-alex-v-1-1', 'router-xyk-alex-v-1-2',
      'router-velar-alex-v-1-1', 'router-velar-alex-v-1-2',
      // Wrappers
      'wrapper-velar-v-1-1', 'wrapper-velar-multihop-v-1-1',
      'wrapper-alex-v-2-1', 'wrapper-arkadiko-v-1-1',
      // Additional
      'sip-010-trait-ft-standard', 'lp-trait',
      'arkadiko-swap-quotes-v-1-1', 'usda-aeusdc-cycle-rewards-helper-v-1-4',
      'usda-aeusdc-migration-helper-v-1-1', 'usda-aeusdc-migration-setup-v-1-1',
      'usda-aeusdc-migration-setup-v-1-2',
    ]),
  };

  const isValidMainnetContract = (contractStr: string): boolean => {
    if (!contractStr?.includes('.')) return false;
    // Full contract override takes priority
    if (FULL_CONTRACT_OVERRIDES[contractStr]) return true;
    const [addr, name] = contractStr.split('.');
    const resolved = MAINNET_CONTRACT_MAP[addr] || addr;
    // If it's still a simnet/testnet address after mapping, it's invalid
    if (resolved.startsWith('SM') || resolved.startsWith('ST')) return false;
    // If we have a known contract list for this deployer, validate the name
    const known = KNOWN_MAINNET_CONTRACTS[resolved];
    if (known) return known.has(name);
    // Unknown deployer but mainnet address — allow it
    return true;
  };

  // Pick the best route whose swapData contract resolves to a known mainnet contract.
  // Fall back through allRoutes sorted by quote descending.
  const sortedRoutes = [...(quoteResult.allRoutes || [])]
    .filter(r => r.quote !== null && r.quote !== undefined)
    .sort((a, b) => (b.quote as number) - (a.quote as number));

  const bestRoute = sortedRoutes.find(r => {
    const contract = (r as any).swapData?.contract || '';
    return isValidMainnetContract(contract);
  }) || quoteResult.bestRoute;

  if (!bestRoute || !bestRoute.quote) throw new Error('No swap route found on Bitflow');

  console.log('[Bitflow] Selected route:', {
    contract: (bestRoute as any).swapData?.contract,
    fn: (bestRoute as any).swapData?.function,
    quote: bestRoute.quote,
    dexPath: (bestRoute as any).dexPath,
  });

  const amountInRaw = Math.floor(Number(amountIn) * Math.pow(10, params.tokenInDecimals));
  const minAmountOutRaw = Math.floor(bestRoute.quote * 0.99 * Math.pow(10, params.tokenOutDecimals)); // 1% slippage

  // Helper: build a contractPrincipalCV from a "ADDR.name" string
  const toContractCV = (principal: string | undefined) => {
    if (!principal || !principal.includes('.')) {
      throw new Error(`Invalid contract principal: "${principal}". Expected "ADDRESS.name" format.`);
    }
    const [addr, name] = principal.split('.');
    return contractPrincipalCV(addr, name);
  };

  // Helper: optional uint — someCV(uintCV(n)) if n is defined, else noneCV()
  const toOptUint = (n: bigint | number | string | undefined) =>
    n !== undefined && n !== null ? someCV(uintCV(n)) : noneCV();

  // 2. Estimate Fee & Get Relayer Address
  onProgress?.('Estimating gasless fee...');
  const estimate = await velumx.estimateFee({ feeToken, estimatedGas: 250000 });
  const feeAmount = estimate.maxFee;
  
  // Use relayer address from estimate, or fallback to config
  const relayerAddress = estimate.relayerAddress || config.velumxRelayerAddress;

  // Get public key
  let publicKey = userPublicKey || '';
  if (!publicKey) {
    try {
      const addrResult = await request('stx_getAddresses') as any;
      const stxEntry = (addrResult?.addresses || []).find((a: any) => a.address === userAddress)
        || (addrResult?.addresses || [])[0];
      publicKey = stxEntry?.publicKey || '';
    } catch (e) { console.warn('stx_getAddresses failed:', e); }
  }
  if (!publicKey) throw new Error('Wallet public key not available. Please reconnect your wallet.');

  // Fetch nonce
  let nonce = 0n;
  try {
    const nonceRes = await fetch(`https://api.mainnet.hiro.so/v2/accounts/${userAddress}?proof=0`);
    if (nonceRes.ok) {
      const accountData = await nonceRes.json();
      nonce = BigInt(accountData.nonce ?? 0);
    }
  } catch (e) { console.warn('Failed to fetch nonce:', e); }

  // 3. Serialize payload for VelumX Executor (Bitflow v2) — used by USER_PAYS path only
  onProgress?.('Preparing transaction payload...');

  // Pool ID and amounts come from the route's swapData parameters
  const routeSwapData = (bestRoute as any).swapData as { contract: string; function: string; parameters: Record<string, any> };
  const routeParams = routeSwapData?.parameters || {};
  const poolId: number = routeParams['id'] || routeParams['pool-id'] || 0;

  const payloadCv = tupleCV({
    'pool-id': uintCV(poolId),
    'amount-in': uintCV(amountInRaw),
    'min-amount-out': uintCV(minAmountOutRaw)
  });
  
  const serializedPayload = serializeCV(payloadCv);

  // 4. Build VelumX Contract Call based on Policy
  onProgress?.('Preparing VelumX transaction...');
  
  const isDeveloperSponsoring = (estimate.policy === 'DEVELOPER_SPONSORS' || params.sponsorshipPolicy === 'DEVELOPER_SPONSORS');

  // Guard: USER_PAYS requires a valid relayer address to receive the fee token
  if (!isDeveloperSponsoring && !relayerAddress) {
    throw new Error('Relayer address not available. Set NEXT_PUBLIC_VELUMX_RELAYER_ADDRESS or ensure the relayer returns relayerAddress in the fee estimate.');
  }
  
  let txOptions: any;
  
  if (isDeveloperSponsoring) {
    // DEVELOPER_SPONSORS: Build the Bitflow contract call directly from bestRoute.swapData.
    // We do NOT call getSwapParams() because it fetches the contract interface from the
    // Bitflow node which may return simnet addresses for some token pairs.
    console.log('[Bitflow] bestRoute:', JSON.stringify(bestRoute, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

    const swapData = (bestRoute as any).swapData as {
      contract: string;
      function: string;
      parameters: Record<string, any>;
    };

    if (!swapData?.contract || !swapData?.function) {
      throw new Error(`Bitflow route is missing swapData contract/function. swapData: ${JSON.stringify(swapData)}`);
    }

    const [contractAddress, contractName] = swapData.contract.split('.');

    // Step 1: check full contract override (e.g. wrapper-arkadiko-v-1-2 → wrapper-arkadiko-v-1-1 at Bitflow deployer)
    const fullKey = `${contractAddress}.${contractName}`;
    let resolvedContractAddress: string;
    let resolvedContractName: string;

    if (FULL_CONTRACT_OVERRIDES[fullKey]) {
      const [overrideAddr, overrideName] = FULL_CONTRACT_OVERRIDES[fullKey].split('.');
      resolvedContractAddress = overrideAddr;
      resolvedContractName = overrideName;
    } else {
      // Step 2: fall back to deployer-level address remap
      resolvedContractAddress = MAINNET_CONTRACT_MAP[contractAddress] || contractAddress;
      resolvedContractName = contractName;
    }

    // Guard: if still SM*/ST* after both mappings, we don't have a mainnet equivalent yet
    if (resolvedContractAddress.startsWith('SM') || resolvedContractAddress.startsWith('ST')) {
      throw new Error(
        `Bitflow returned a non-mainnet contract: ${swapData.contract}. ` +
        `Verify the token IDs passed to the SDK are valid mainnet Bitflow token IDs.`
      );
    }

    const p = swapData.parameters;
    const fn = swapData.function;
    const order: string[] = p['order'] || [];

    // Resolve any simnet token addresses to mainnet equivalents
    const resolveTokenAddr = (addr: string): string => MAINNET_CONTRACT_MAP[addr] || addr;
    const resolveTokenPrincipal = (principal: string): string => {
      if (!principal?.includes('.')) return principal;
      const [addr, name] = principal.split('.');
      return `${resolveTokenAddr(addr)}.${name}`;
    };

    // Min-out keys — apply 1% slippage to whichever is present
    const MIN_OUT_KEYS = new Set(['min-dy', 'min-dz', 'min-dw', 'min-dv', 'min-received', 'amt-out-min', 'min-x-amount', 'min-y-amount']);
    // Keys that are uint amounts (not principals)
    const UINT_KEYS = new Set(['id', 'factor', 'factor-x', 'factor-y', 'factor-z', 'factor-w',
      'dx', 'dy', 'amt-in', 'amt-out', 'amount', 'x-amount', 'y-amount',
      'min-dy', 'min-dz', 'min-dw', 'min-dv', 'min-received', 'amt-out-min',
      'min-x-amount', 'min-y-amount', 'min-dx']);

    // Stacks address prefixes — SP/ST = standard principal, SM = simnet
    const isStacksAddress = (v: string) => /^S[MPT][A-Z0-9]{30,}$/.test(v);

    // Build args from the order array
    const functionArgs: any[] = order.map((key: string) => {
      const val = p[key];

      // Contract principal: "ADDR.name"
      if (typeof val === 'string' && val.includes('.')) {
        return toContractCV(resolveTokenPrincipal(val));
      }

      // Standard principal: bare Stacks address (e.g. provider field)
      if (typeof val === 'string' && isStacksAddress(val)) {
        const resolved = resolveTokenAddr(val);
        return standardPrincipalCV(resolved);
      }

      // Uint fields
      if (UINT_KEYS.has(key)) {
        if (val === undefined || val === null) {
          return uintCV(0n);
        }
        // Apply slippage to min-out values
        if (MIN_OUT_KEYS.has(key)) {
          return uintCV(BigInt(Math.floor(Number(val) * 0.99)));
        }
        return uintCV(BigInt(val));
      }

      // Fallback: if it looks like a number, treat as uint
      if (val !== undefined && val !== null && !isNaN(Number(val))) {
        return uintCV(BigInt(val));
      }

      throw new Error(`Cannot convert parameter "${key}" = "${val}" to Clarity value`);
    });

    console.log('[Policy] Using DEVELOPER_SPONSORS (Direct Bitflow Call)', {
      originalContract: swapData.contract,
      resolvedContract: `${resolvedContractAddress}.${resolvedContractName}`,
      fn,
      order,
      argsCount: functionArgs.length,
    });

    txOptions = {
      contractAddress: resolvedContractAddress,
      contractName: resolvedContractName,
      functionName: fn,
      functionArgs,
    };
  } else {
    // USER_PAYS: User pays SIP-010 fee. Call via Paymaster contract which then calls our Executor.
    // Extract token principals from the route for the executor trait-forwarding args.
    const swapData = (bestRoute as any).swapData as { contract: string; function: string; parameters: Record<string, any> };
    const p = swapData?.parameters || {};
    const WSTX = 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx';
    const resolveToken = (val: string | undefined) => (!val || !val.includes('.')) ? WSTX : val;

    const tokenInPrincipal = resolveToken(p['token-x-trait'] || p['token-x'] || params.tokenIn);
    const tokenOutPrincipal = resolveToken(p['token-y-trait'] || p['token-y'] || params.tokenOut);
    const token2 = resolveToken(p['token-z-trait'] || p['token-z']);
    const token3 = resolveToken(p['token-w-trait'] || p['token-w']);

    txOptions = velumx.getExecuteGenericOptions({
      executor: config.bitflowExecutorAddress,
      payload: serializedPayload,
      feeAmount: feeAmount,
      feeToken: feeToken,
      relayer: relayerAddress,
      version: 'relayer-v1', // Maps to velumx-paymaster-1-1
      token1: tokenInPrincipal,
      token2: tokenOutPrincipal,
      token3: token2,
      token4: token3,
    });
    console.log('[Policy] Using USER_PAYS (Paymaster + Executor Call)');
  }

  // 5. Build unsigned sponsored tx, then request wallet signature (no broadcast)
  onProgress?.('Waiting for wallet signature...');

  const unsignedTx = await makeUnsignedContractCall({
    contractAddress: txOptions.contractAddress,
    contractName: txOptions.contractName,
    functionName: txOptions.functionName,
    functionArgs: txOptions.functionArgs,
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
    network: 'mainnet',
    sponsored: true,
    publicKey,
    fee: 0n,
    nonce,
    validateWithAbi: false,
  });

  const txHex = unsignedTx.serialize();

  let signedTxHex: string;
  try {
    const signResult = await request('stx_signTransaction', {
      transaction: txHex,
      broadcast: false,
    });
    signedTxHex = (signResult as any).transaction ?? (signResult as any).txHex;
    if (!signedTxHex) throw new Error('Wallet did not return signed tx hex');
  } catch (err: any) {
    if (err?.message?.toLowerCase().includes('cancel') || err?.code === 4001) {
      throw new Error('Swap cancelled by user');
    }
    throw err;
  }

  // 6. Relayer co-signs + broadcasts
  onProgress?.('Broadcasting via VelumX...');
  const result = await velumx.sponsor(signedTxHex, {
    feeToken: isDeveloperSponsoring ? undefined : feeToken,
    feeAmount: isDeveloperSponsoring ? '0' : feeAmount,
    network: 'mainnet'
  });

  console.log('VelumX Bitflow sponsor result:', result);
  return result.txid;
}

