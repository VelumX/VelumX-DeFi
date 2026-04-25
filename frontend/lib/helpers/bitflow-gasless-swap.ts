import { 
  uintCV,
  someCV,
  noneCV,
  trueCV,
  falseCV,
  contractPrincipalCV,
  principalCV,
  bufferCV,
  PostConditionMode,
  makeUnsignedContractCall,
} from '@stacks/transactions';
import { buildSponsoredContractCall } from '@velumx/sdk';
import { getVelumXClient } from '../velumx';
import { getConfig } from '../config';
import { QuoteResult } from '@bitflowlabs/core-sdk';
import { getBitflowSDK } from '../bitflow';
import { getParallelQuote } from './bitflow-parallel-quote';
import { bytesToHex } from '../utils/address-encoding';

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
  /** Pre-fetched quote from the UI — skips the re-fetch if provided */
  quoteResult?: QuoteResult;
  onProgress?: (status: string) => void;
}

export async function executeBitflowGaslessSwap(params: BitflowGaslessSwapParams): Promise<string> {
  const { userAddress, userPublicKey, tokenInId, tokenOutId, amountIn, feeToken, onProgress } = params;
  
  const velumx = getVelumXClient();
  const config = getConfig();

  // 1. Get Bitflow Route & Quote
  // Use the pre-fetched quote from the UI if available (avoids a redundant
  // serial getQuoteForRoute call that can take 2+ minutes for some pairs).
  onProgress?.('Fetching quote from Bitflow...');
  const quoteResult: QuoteResult = params.quoteResult
    ?? await getParallelQuote(tokenInId, tokenOutId, Number(amountIn));

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

  // Step 1 — deployer-level address remapping
  // SM1793... is a real mainnet multisig deployer used by Bitflow for XYK/router contracts.
  // SM2MARAVW... is the Velar multisig deployer.
  // These addresses are valid on mainnet — no remapping needed for SM* addresses.
  // Only ST* (testnet) addresses need remapping.
  const MAINNET_CONTRACT_MAP: Record<string, string> = {
    'SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT': 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1', // Velar deployer (SM2 → SP1Y5)
  };

  // Step 2 — full contract overrides: "simnetAddr.contractName" → "mainnetAddr.contractName"
  // Only needed for contracts that the API returns under SM1793... but actually live at
  // a different mainnet deployer. Contracts that exist at SM1793... on mainnet are used as-is.
  //
  // Verified via Hiro API — contracts at SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR on mainnet:
  //   EXISTS:  wrapper-velar-v-1-2, wrapper-arkadiko-v-1-2, xyk-core-v-1-1, xyk-pool-stx-aeusdc-v-1-1
  //            router-xyk-velar-v-1-2, router-xyk-velar-v-1-4, xyk-swap-helper-v-1-3, router-stableswap-velar-v-1-5
  //   MISSING: stableswap-*, router-stx-ststx-*, router-xyk-arkadiko-*, router-xyk-alex-*,
  //            router-velar-alex-*, wrapper-velar-v-1-1, wrapper-velar-multihop-v-1-1,
  //            wrapper-alex-v-2-1, wrapper-arkadiko-v-1-1
  const BITFLOW_DEPLOYER = 'SPQC38PW542EQJ5M11CR25P7BS1CA6QT4TBXGB3M';
  const ALEX_DEPLOYER   = 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM';
  const VELAR_DEPLOYER  = 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1';
  const SM_DEPLOYER     = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR';

  const FULL_CONTRACT_OVERRIDES: Record<string, string> = {
    // ── StableSwap contracts — at Bitflow deployer, NOT SM1793 ───────────────
    [`${SM_DEPLOYER}.stableswap-stx-ststx-v-1-2`]:    `${BITFLOW_DEPLOYER}.stableswap-stx-ststx-v-1-2`,
    [`${SM_DEPLOYER}.stableswap-usda-susdt-v-1-2`]:   `${BITFLOW_DEPLOYER}.stableswap-usda-susdt-v-1-2`,
    [`${SM_DEPLOYER}.stableswap-aeusdc-susdt-v-1-2`]: `${BITFLOW_DEPLOYER}.stableswap-aeusdc-susdt-v-1-2`,
    [`${SM_DEPLOYER}.stableswap-usda-aeusdc-v-1-2`]:  `${BITFLOW_DEPLOYER}.stableswap-usda-aeusdc-v-1-2`,
    [`${SM_DEPLOYER}.stableswap-usda-aeusdc-v-1-4`]:  `${BITFLOW_DEPLOYER}.stableswap-usda-aeusdc-v-1-4`,
    [`${SM_DEPLOYER}.stableswap-abtc-xbtc-v-1-2`]:    `${BITFLOW_DEPLOYER}.stableswap-abtc-xbtc-v-1-2`,
    // ── Router contracts — at Bitflow deployer, NOT SM1793 ───────────────────
    [`${SM_DEPLOYER}.router-stx-ststx-bitflow-arkadiko-v-1-1`]: `${BITFLOW_DEPLOYER}.router-stx-ststx-bitflow-arkadiko-v-1-1`,
    [`${SM_DEPLOYER}.router-stx-ststx-bitflow-velar-v-1-2`]:   `${BITFLOW_DEPLOYER}.router-stx-ststx-bitflow-velar-v-1-2`,
    [`${SM_DEPLOYER}.router-stx-ststx-bitflow-alex-v-1-1`]:    `${BITFLOW_DEPLOYER}.router-stx-ststx-bitflow-alex-v-1-1`,
    [`${SM_DEPLOYER}.router-stx-ststx-bitflow-alex-v-1-2`]:    `${BITFLOW_DEPLOYER}.router-stx-ststx-bitflow-alex-v-1-2`,
    [`${SM_DEPLOYER}.router-stx-ststx-bitflow-alex-v-2-1`]:    `${BITFLOW_DEPLOYER}.router-stx-ststx-bitflow-alex-v-2-1`,
    [`${SM_DEPLOYER}.router-stx-ststx-bitflow-xyk-v-1-1`]:     `${BITFLOW_DEPLOYER}.router-stx-ststx-bitflow-xyk-v-1-1`,
    [`${SM_DEPLOYER}.router-stx-usda-arkadiko-alex-v-1-1`]:    `${BITFLOW_DEPLOYER}.router-stx-usda-arkadiko-alex-v-1-1`,
    [`${SM_DEPLOYER}.router-xyk-arkadiko-v-1-1`]:              `${BITFLOW_DEPLOYER}.router-xyk-arkadiko-v-1-1`,
    [`${SM_DEPLOYER}.router-xyk-alex-v-1-1`]:                  `${BITFLOW_DEPLOYER}.router-xyk-alex-v-1-1`,
    [`${SM_DEPLOYER}.router-xyk-alex-v-1-2`]:                  `${BITFLOW_DEPLOYER}.router-xyk-alex-v-1-2`,
    [`${SM_DEPLOYER}.router-velar-alex-v-1-1`]:                `${BITFLOW_DEPLOYER}.router-velar-alex-v-1-1`,
    [`${SM_DEPLOYER}.router-velar-alex-v-1-2`]:                `${BITFLOW_DEPLOYER}.router-velar-alex-v-1-2`,
    [`${SM_DEPLOYER}.router-stableswap-xyk-v-1-3`]:            `${BITFLOW_DEPLOYER}.router-stableswap-xyk-v-1-3`,
    // ── Wrapper contracts — at Bitflow deployer, NOT SM1793 ──────────────────
    [`${SM_DEPLOYER}.wrapper-velar-v-1-1`]:          `${BITFLOW_DEPLOYER}.wrapper-velar-v-1-1`,
    [`${SM_DEPLOYER}.wrapper-velar-multihop-v-1-1`]: `${BITFLOW_DEPLOYER}.wrapper-velar-multihop-v-1-1`,
    [`${SM_DEPLOYER}.wrapper-alex-v-2-1`]:           `${BITFLOW_DEPLOYER}.wrapper-alex-v-2-1`,
    [`${SM_DEPLOYER}.wrapper-arkadiko-v-1-1`]:       `${BITFLOW_DEPLOYER}.wrapper-arkadiko-v-1-1`,
    // ── XYK contracts — at ALEX deployer ─────────────────────────────────────
    [`${SM_DEPLOYER}.sip-010-trait-ft-standard-v-1-1`]: `${ALEX_DEPLOYER}.sip-010-trait-ft-standard-v-1-1`,
    [`${SM_DEPLOYER}.xyk-pool-trait-v-1-1`]:            `${ALEX_DEPLOYER}.xyk-pool-trait-v-1-1`,
    [`${SM_DEPLOYER}.token-stx-v-1-1`]:                 `${ALEX_DEPLOYER}.token-stx-v-1-1`,
    // ── Velar deployer overrides (SM2* → SP1Y5*) ─────────────────────────────
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.wrapper-velar-v-1-2`]:    `${VELAR_DEPLOYER}.wrapper-velar-v-1-2`,
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.univ2-core`]:             `${VELAR_DEPLOYER}.univ2-core`,
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.univ2-router`]:           `${VELAR_DEPLOYER}.univ2-router`,
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.univ2-library`]:          `${VELAR_DEPLOYER}.univ2-library`,
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.univ2-share-fee-to`]:     `${VELAR_DEPLOYER}.univ2-share-fee-to`,
  };

  const isValidMainnetContract = (contractStr: string): boolean => {
    if (!contractStr?.includes('.')) return false;
    const [addr] = contractStr.split('.');
    const resolved = MAINNET_CONTRACT_MAP[addr] || addr;
    // Only exclude testnet (ST*) addresses — SM* are valid mainnet multisig addresses
    if (resolved.startsWith('ST')) return false;
    return true;
  };

  // Contracts that implement bitflow-router-trait (swap-x-for-y) and are
  // callable by the paymaster's swap-bitflow-router function.
  const PAYMASTER_COMPATIBLE_ROUTERS = new Set([
    'router-stx-ststx-bitflow-alex-v-2-1',
    'router-stx-ststx-bitflow-alex-v-1-2',
    'router-stx-ststx-bitflow-alex-v-1-1',
    'router-stx-ststx-bitflow-velar-v-1-2',
    'router-stx-ststx-bitflow-arkadiko-v-1-1',
    'router-stx-ststx-bitflow-xyk-v-1-1',
    'router-stx-usda-arkadiko-alex-v-1-1',
    'router-stableswap-xyk-v-1-3',
    'router-xyk-arkadiko-v-1-1',
    'router-xyk-alex-v-1-1',
    'router-xyk-alex-v-1-2',
    'router-velar-alex-v-1-1',
    'router-velar-alex-v-1-2',
  ]);

  // Velar routers use swap-helper-a/b/c/d with tuple trait args — not compatible
  // with bitflow-router-trait, but the paymaster has dedicated hardcoded functions
  // for them (swap-velar-xyk-router-* and swap-velar-stableswap-router-*).
  const VELAR_XYK_ROUTER = 'router-xyk-velar-v-1-4';
  const VELAR_SS_ROUTER  = 'router-stableswap-velar-v-1-5';

  const isPaymasterCompatible = (contractStr: string): boolean => {
    if (!contractStr?.includes('.')) return false;
    const [addr, name] = contractStr.split('.');
    const fullKey = `${addr}.${name}`;
    // Resolve to mainnet address first
    const resolved = FULL_CONTRACT_OVERRIDES[fullKey] || `${MAINNET_CONTRACT_MAP[addr] || addr}.${name}`;
    const resolvedName = resolved.split('.')[1] || '';
    // Stableswap pools always implement the trait
    if (resolvedName.startsWith('stableswap-')) return true;
    // Velar routers have dedicated paymaster wrapper functions
    if (resolvedName === VELAR_XYK_ROUTER || resolvedName === VELAR_SS_ROUTER) return true;
    // Only allow known-compatible routers
    if (PAYMASTER_COMPATIBLE_ROUTERS.has(resolvedName)) return true;
    return false;
  };

  // Collect all routes with a valid quote, sorted best-first.
  // The retry loop will attempt each one and skip via ABI 404 if not deployed.
  const sortedRoutes = [...(quoteResult.allRoutes || [])]
    .filter(r => r.quote !== null && r.quote !== undefined)
    .sort((a, b) => (b.quote as number) - (a.quote as number));

  const validRoutes = sortedRoutes.filter(r => {
    const contract = (r as any).swapData?.contract || '';
    return isValidMainnetContract(contract);
  });

  if (validRoutes.length === 0 && quoteResult.bestRoute) validRoutes.push(quoteResult.bestRoute);
  if (validRoutes.length === 0) throw new Error('No swap route found on Bitflow');

  // For USER_PAYS, prefer paymaster-compatible routes. Fall back to all valid
  // routes only if no compatible route exists (will use DEVELOPER_SPONSORS path).
  const paymasterRoutes = validRoutes.filter(r => {
    const contract = (r as any).swapData?.contract || '';
    return isPaymasterCompatible(contract);
  });

  const bestRoute = paymasterRoutes.length > 0 ? paymasterRoutes[0] : validRoutes[0];

  console.log('[Bitflow] Selected route:', {
    contract: (bestRoute as any).swapData?.contract,
    fn: (bestRoute as any).swapData?.function,
    quote: bestRoute.quote,
    dexPath: (bestRoute as any).dexPath,
    paymasterCompatible: paymasterRoutes.length > 0,
  });

  const amountInRaw = Math.floor(Number(amountIn) * Math.pow(10, params.tokenInDecimals));

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

  // 3. Build VelumX Contract Call based on Policy
  onProgress?.('Preparing VelumX transaction...');
  
  const isDeveloperSponsoring = (estimate.policy === 'DEVELOPER_SPONSORS' || params.sponsorshipPolicy === 'DEVELOPER_SPONSORS');

  // Guard: USER_PAYS requires a valid relayer address to receive the fee token
  if (!isDeveloperSponsoring && !relayerAddress) {
    throw new Error('Relayer address not available. Set NEXT_PUBLIC_VELUMX_RELAYER_ADDRESS or ensure the relayer returns relayerAddress in the fee estimate.');
  }
  
  let txOptions: any;
  
  if (isDeveloperSponsoring) {
    // DEVELOPER_SPONSORS: Use the Bitflow SDK's getSwapParams to build function args correctly,
    // then override the contract address with the resolved mainnet deployer.
    // This eliminates all manual arg-building and is always correct regardless of
    // what contracts Bitflow adds in the future.
    let lastError: Error | null = null;

    for (const candidateRoute of validRoutes) {
      try {
        const swapData = (candidateRoute as any).swapData as {
          contract: string;
          function: string;
          parameters: Record<string, any>;
        };

        if (!swapData?.contract || !swapData?.function) {
          throw new Error(`Route missing swapData contract/function`);
        }

        const [contractAddress, contractName] = swapData.contract.split('.');

        // Resolve simnet/testnet deployer to mainnet equivalent
        const fullKey = `${contractAddress}.${contractName}`;
        let resolvedContractAddress: string;
        let resolvedContractName: string;

        if (FULL_CONTRACT_OVERRIDES[fullKey]) {
          [resolvedContractAddress, resolvedContractName] = FULL_CONTRACT_OVERRIDES[fullKey].split('.');
        } else {
          resolvedContractAddress = MAINNET_CONTRACT_MAP[contractAddress] || contractAddress;
          resolvedContractName = contractName;
        }

        if (resolvedContractAddress.startsWith('ST')) {
          throw new Error(`Testnet contract after resolution: ${swapData.contract}`);
        }

        console.log('[Bitflow] Trying route:', `${resolvedContractAddress}.${resolvedContractName}`, swapData.function);

        // Verify the contract actually exists on mainnet before calling getSwapParams.
        const abiCheck = await fetch(
          `https://api.mainnet.hiro.so/v2/contracts/interface/${resolvedContractAddress}/${resolvedContractName}`
        );
        if (!abiCheck.ok) {
          throw new Error(
            `Contract ${resolvedContractAddress}.${resolvedContractName} not found on mainnet (${abiCheck.status}). Route skipped.`
          );
        }

        // Use the SDK to build function args — patch the route's swapData.contract
        // with the resolved mainnet address so getSwapParams fetches the correct ABI.
        const patchedRoute = {
          ...(candidateRoute as any).route || candidateRoute,
          swapData: {
            ...(candidateRoute as any).swapData,
            contract: `${resolvedContractAddress}.${resolvedContractName}`,
          },
        };

        const swapParams = await bitflow.getSwapParams(
          {
            route: patchedRoute,
            amount: Number(amountIn),
            tokenXDecimals: params.tokenInDecimals,
            tokenYDecimals: params.tokenOutDecimals,
          },
          userAddress,
          0.01 // 1% slippage
        );

        console.log('[Policy] Using DEVELOPER_SPONSORS (SDK getSwapParams)', {
          originalContract: swapData.contract,
          resolvedContract: `${resolvedContractAddress}.${resolvedContractName}`,
          fn: swapParams.functionName,
          argsCount: swapParams.functionArgs.length,
        });

        txOptions = {
          contractAddress: resolvedContractAddress,
          contractName: resolvedContractName,
          functionName: swapParams.functionName,
          functionArgs: swapParams.functionArgs,
        };

        break;
      } catch (routeErr: any) {
        console.warn('[Bitflow] Route failed, trying next:', routeErr.message);
        lastError = routeErr;
        txOptions = null;
      }
    }

    if (!txOptions) {
      throw new Error(
        `No executable route found for this swap. The liquidity pool contracts may not be deployed yet. ` +
        `Please try again later or try a different token pair.`
      );
    }
  } else {
    // USER_PAYS: User pays SIP-010 fee via velumx-defi-paymaster-v1.
    //
    // The paymaster contract atomically:
    //   1. Collects fee-amount of fee-token from user → relayer
    //   2. Calls the Bitflow pool/router directly
    //
    // We determine which paymaster function to call based on the Bitflow route's
    // swapData.contract — stableswap pools use swap-bitflow-stableswap[/reverse],
    // standard routers use swap-bitflow-router, and Velar routers use the dedicated
    // swap-velar-xyk-router-* / swap-velar-stableswap-router-* functions.
    const swapData = (bestRoute as any).swapData as { contract: string; function: string; parameters: Record<string, any> };
    const routeParams = swapData?.parameters || {};
    const poolId: number = routeParams['id'] || routeParams['pool-id'] || 1;

    // Resolve the pool/router contract to its mainnet address
    const [poolAddr, poolName] = swapData.contract.split('.');
    const fullKey = `${poolAddr}.${poolName}`;
    let resolvedPool: string;
    if (FULL_CONTRACT_OVERRIDES[fullKey]) {
      resolvedPool = FULL_CONTRACT_OVERRIDES[fullKey];
    } else {
      const resolvedAddr = MAINNET_CONTRACT_MAP[poolAddr] || poolAddr;
      resolvedPool = `${resolvedAddr}.${poolName}`;
    }

    const contractName = resolvedPool.split('.')[1] || '';
    const isStableswap = contractName.startsWith('stableswap-');
    const isVelarXyk = contractName === VELAR_XYK_ROUTER;
    const isVelarSS  = contractName === VELAR_SS_ROUTER;
    const isReverse  = swapData.function === 'swap-y-for-x';

    const [paymasterAddr, paymasterName] = config.velumxPaymasterAddress.split('.');
    const [feeTokenAddr, feeTokenName] = feeToken.split('.');

    if (isVelarXyk || isVelarSS) {
      // Velar routers use tuple trait args internally, but the paymaster wrapper
      // functions take FLAT positional args. We must build them manually from
      // swapData.parameters — the SDK's getSwapParams returns Clarity tuples
      // which are incompatible with the paymaster's flat function signatures.
      //
      // Paymaster swap-velar-{xyk,stableswap}-router-{a,b,c,d} signature:
      //   amount-in, min-amount-out, provider, swaps-reversed,
      //   xyk/ss-token-a, xyk/ss-token-b, xyk/ss-pool-a,
      //   velar-token-a, velar-token-b [, velar-token-c [, velar-token-d [, velar-token-e]]],
      //   velar-share-fee-to,
      //   fee-amount, relayer, fee-token

      // token-path and pool-path are sometimes missing from swapData.parameters
      // (Bitflow API returns empty arrays for certain Velar stableswap multi-hop routes).
      // Fall back through all available sources before giving up:
      //   1. swapData.parameters (primary — usually populated)
      //   2. quoteData.parameters (alternate parameter bag on the same route)
      //   3. route.token_path / route.pool_path (SelectedSwapRoute fields)
      //   4. top-level RouteQuote.tokenPath (SDK-normalised field)
      //   5. Derive from postConditions token contracts + known tokenIn/tokenOut principals
      const quoteParams = (bestRoute as any).quoteData?.parameters || {};

      // ── Comprehensive token-ID → contract principal map ─────────────────────
      // Covers tokenIn/tokenOut from params, well-known tokens, AND all tokens
      // from the SDK's availableTokens list. This ensures intermediate tokens
      // in multi-hop paths (e.g. "token-aeusdc") resolve to principals.
      const WELL_KNOWN_TOKENS: Record<string, string> = {
        'token-stx':    'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx',
        'token-wstx':   'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx',
        'STX':          'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx',
        'token-aeusdc': 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc',
        'token-alex':   'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex',
        'token-welsh':  'SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token',
        'token-usda':   'SP2C2YFP12AJZB1KD5M1DMR69R7H5PCSV927WKDE.arkadiko-token',
        'token-susdt':  'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt',
        'token-sbtc':   'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
        'token-usdcx':      'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
        'token-USDCx-auto': 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
      };

      const earlyTokenIdMap: Record<string, string> = { ...WELL_KNOWN_TOKENS };
      if (params.tokenInId && params.tokenIn?.includes('.'))   earlyTokenIdMap[params.tokenInId]  = params.tokenIn;
      if (params.tokenOutId && params.tokenOut?.includes('.')) earlyTokenIdMap[params.tokenOutId] = params.tokenOut;
      if (params.tokenIn?.includes('.'))  earlyTokenIdMap[params.tokenIn]  = params.tokenIn;
      if (params.tokenOut?.includes('.')) earlyTokenIdMap[params.tokenOut] = params.tokenOut;
      // Handle STX special cases: address may be 'STX', 'null', or empty
      const isStxIn  = params.tokenInId === 'token-stx'  || params.tokenIn === 'STX';
      const isStxOut = params.tokenOutId === 'token-stx' || params.tokenOut === 'STX' || params.tokenOut === 'null' || !params.tokenOut;
      if (isStxIn)  earlyTokenIdMap[params.tokenInId]  = WELL_KNOWN_TOKENS['token-stx'];
      if (isStxOut) earlyTokenIdMap[params.tokenOutId] = WELL_KNOWN_TOKENS['token-stx'];

      // Populate from SDK's available tokens (covers all intermediates)
      const sdkCtxEarly = (bitflow as any).context;
      if (sdkCtxEarly?.availableTokens?.length > 0) {
        for (const tok of sdkCtxEarly.availableTokens) {
          if (tok.tokenId && tok.tokenContract?.includes('.')) {
            earlyTokenIdMap[tok.tokenId] = tok.tokenContract;
            earlyTokenIdMap[tok.tokenId.toLowerCase()] = tok.tokenContract;
          }
        }
      }

      // Normalize a token path entry: if it's a Bitflow token ID (no dot), resolve
      // it to a contract principal using the comprehensive map above.
      const normalizeTokenPathEntry = (entry: string): string =>
        entry.includes('.') ? entry : (earlyTokenIdMap[entry] || earlyTokenIdMap[entry.toLowerCase()] || entry);

      let tokenPath: string[] = (
        (routeParams['token-path']?.length  ? routeParams['token-path']  : null) ||
        (routeParams['tokenPath']?.length   ? routeParams['tokenPath']   : null) ||
        (quoteParams['token-path']?.length  ? quoteParams['token-path']  : null) ||
        ((bestRoute as any).route?.token_path?.length ? (bestRoute as any).route.token_path : null) ||
        ((bestRoute as any).tokenPath?.length         ? (bestRoute as any).tokenPath         : null) ||
        [] as string[]
      ).map(normalizeTokenPathEntry);

      // Remove consecutive duplicates immediately — the Bitflow API often returns
      // paths like [welsh, aeusdc, aeusdc, usdcx] where the same token is both
      // the output of one pool and the input of the next. The Velar router
      // expects deduplicated paths (e.g. [welsh, aeusdc, usdcx] for swap-helper-b).
      if (tokenPath.length > 0) {
        const before = tokenPath.length;
        tokenPath = tokenPath.filter((t, i) => i === 0 || t !== tokenPath[i - 1]);
        if (tokenPath.length !== before) {
          console.log(`[Velar] Deduped token-path: ${before} → ${tokenPath.length}`, tokenPath);
        }
      }

      // Last resort: derive token path from postConditions + SDK token list.
      // Also trigger this path if the token-path was populated but still contains
      // unresolved token IDs (no dot in any entry after normalization).
      const tokenPathHasUnresolved = tokenPath.length > 0 && tokenPath.some(e => !e.includes('.'));
      if (tokenPath.length === 0 || tokenPathHasUnresolved) {
        console.warn('[Velar] token-path empty/unresolved, attempting derivation. Available data:', {
          tokenInId: params.tokenInId,
          tokenIn: params.tokenIn,
          tokenOutId: params.tokenOutId,
          tokenOut: params.tokenOut,
          routeTokenPath: (bestRoute as any).route?.token_path,
          routePostConditionKeys: Object.keys((bestRoute as any).route?.postConditions || {}),
          routePostConditionValues: Object.values((bestRoute as any).route?.postConditions || {}).map((pc: any) => pc?.tokenContract),
          sdkTokensCount: (bitflow as any).context?.availableTokens?.length,
        });

        // Ensure SDK token list is loaded
        const sdkCtx = (bitflow as any).context;
        if (!sdkCtx?.availableTokens?.length) {
          try { await bitflow.getAvailableTokens(); } catch (_) {}
        }
        // Re-populate earlyTokenIdMap with freshly-loaded SDK tokens
        if (sdkCtx?.availableTokens?.length > 0) {
          for (const tok of sdkCtx.availableTokens) {
            if (tok.tokenId && tok.tokenContract?.includes('.')) {
              earlyTokenIdMap[tok.tokenId] = tok.tokenContract;
            }
          }
        }

        const findContract = (tokenId: string, tokenAddress: string): string => {
          // Check comprehensive map first (covers well-known + SDK + params)
          if (earlyTokenIdMap[tokenId]?.includes('.')) return earlyTokenIdMap[tokenId];
          if (earlyTokenIdMap[tokenAddress]?.includes('.')) return earlyTokenIdMap[tokenAddress];
          // STX special cases
          if (tokenId === 'token-stx' || tokenAddress === 'STX' || tokenAddress === 'null' || !tokenAddress) {
            return WELL_KNOWN_TOKENS['token-stx'];
          }
          if (tokenAddress?.includes('.')) return tokenAddress;
          return '';
        };

        const tokenInContract  = findContract(params.tokenInId,  params.tokenIn);
        const tokenOutContract = findContract(params.tokenOutId, params.tokenOut);

        // Resolve to mainnet
        const resolveForCompare = (p: string) => {
          if (!p?.includes('.')) return p;
          const [a, n] = p.split('.');
          const full = `${a}.${n}`;
          if (FULL_CONTRACT_OVERRIDES[full]) return FULL_CONTRACT_OVERRIDES[full];
          return `${MAINNET_CONTRACT_MAP[a] || a}.${n}`;
        };
        const resolvedTokenIn  = resolveForCompare(tokenInContract);
        const resolvedTokenOut = resolveForCompare(tokenOutContract);

        // Extract intermediate tokens from postConditions
        const postConds: Record<string, any> =
          (bestRoute as any).route?.postConditions || (bestRoute as any).postConditions || {};
        const pcContracts = Object.values(postConds)
          .map((pc: any) => pc?.tokenContract)
          .filter((c): c is string => !!c && c.includes('.'))
          .map(resolveForCompare);

        // Deduplicate intermediates — postConditions can list the same token twice
        const intermediates = [...new Set(
          pcContracts.filter(c => c !== resolvedTokenIn && c !== resolvedTokenOut)
        )];

        console.warn('[Velar] Derivation result:', { tokenInContract, tokenOutContract, resolvedTokenIn, resolvedTokenOut, pcContracts, intermediates });

        if (resolvedTokenIn && resolvedTokenOut) {
          tokenPath = [resolvedTokenIn, ...intermediates, resolvedTokenOut];
          // Final dedup: remove consecutive duplicates (e.g. [A, B, B, C] → [A, B, C])
          tokenPath = tokenPath.filter((t, i) => i === 0 || t !== tokenPath[i - 1]);
          console.log('[Velar] Derived token-path:', tokenPath);
        }
      }

      let poolPath: string[] =
        (routeParams['pool-path']?.length  ? routeParams['pool-path']  : null) ||
        (routeParams['poolPath']?.length   ? routeParams['poolPath']   : null) ||
        (quoteParams['pool-path']?.length  ? quoteParams['pool-path']  : null) ||
        ((bestRoute as any).route?.pool_path?.length ? (bestRoute as any).route.pool_path : null) ||
        [];
      const swapsReversed: boolean = routeParams['swaps-reversed'] ?? false;

      // provider must be a valid Stacks address (starts with 'S') — ignore anything else
      const rawProvider: string | null = routeParams['provider'] || null;
      const provider: string | null = (rawProvider && rawProvider.startsWith('S') && !rawProvider.includes('.'))
        ? rawProvider
        : null;

      // Reuse the comprehensive earlyTokenIdMap (which includes well-known tokens,
      // SDK availableTokens, and params) instead of a minimal map. This ensures
      // intermediates like 'token-aeusdc' resolve correctly in toCV().
      const tokenIdToContract: Record<string, string> = { ...earlyTokenIdMap };

      // Resolve each token/pool principal to mainnet.
      // If the entry is a Bitflow token ID (no '.'), look it up in our map first.
      const resolveP = (p: string): string | null => {
        if (!p) return null;
        // If it's a token ID (no dot), try to resolve via our known map
        if (!p.includes('.')) {
          const contract = tokenIdToContract[p];
          if (!contract) return null;
          p = contract; // fall through to mainnet resolution below
        }
        const [a, n] = p.split('.');
        const full = `${a}.${n}`;
        if (FULL_CONTRACT_OVERRIDES[full]) return FULL_CONTRACT_OVERRIDES[full];
        return `${MAINNET_CONTRACT_MAP[a] || a}.${n}`;
      };
      const toCV = (p: string) => {
        const resolved = resolveP(p);
        if (!resolved) throw new Error(`Cannot convert non-principal token ID to CV: "${p}". Ensure token-path contains contract principals.`);
        const [a, n] = resolved.split('.');
        return contractPrincipalCV(a, n);
      };

      // Determine hop suffix from function name (swap-helper-a/b/c/d)
      const hopSuffix = swapData.function.replace('swap-helper-', ''); // 'a','b','c','d'
      const prefix = isVelarXyk ? 'swap-velar-xyk-router' : 'swap-velar-stableswap-router';
      const functionName = `${prefix}-${hopSuffix}`;

      // Validate token path length matches hop count.
      // swap-helper-a = 1 hop = 2 tokens, -b = 2 hops = 3 tokens, etc.
      const EXPECTED_TOKENS: Record<string, number> = { a: 2, b: 3, c: 4, d: 5 };
      const expectedLen = EXPECTED_TOKENS[hopSuffix];
      let velarTokenPath = tokenPath;
      if (expectedLen && tokenPath.length > expectedLen) {
        console.warn(`[Velar] Token path has ${tokenPath.length} entries but ${functionName} expects ${expectedLen}. Extracting last ${expectedLen} tokens for Velar portion.`);
        velarTokenPath = tokenPath.slice(-expectedLen);
      } else if (expectedLen && tokenPath.length < expectedLen) {
        console.warn(`[Velar] Token path has ${tokenPath.length} entries but ${functionName} expects ${expectedLen}. Path may be incomplete.`);
      }

      // Velar share-fee-to contract (always the same)
      const VELAR_SHARE_FEE_TO = 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-share-fee-to';
      const [sfAddr, sfName] = VELAR_SHARE_FEE_TO.split('.');

      // Build flat args matching the paymaster signature exactly.
      // token-path has N+1 tokens for N hops; pool-path has N pools.
      // For hop-a: xyk-token-a/b = tokenPath[0]/[1], xyk-pool-a = poolPath[0]
      //            velar-token-a/b = tokenPath[0]/[1]
      // For hop-b: same xyk section, velar-token-a/b/c = tokenPath[0]/[1]/[2]
      // etc.
      const minOut = Math.floor((bestRoute.quote ?? 0) * 0.99 * Math.pow(10, params.tokenOutDecimals));

      // tokenPath must contain contract principals (e.g. "SP...token-welsh").
      // If still empty after all fallbacks including postConditions derivation, log and throw.
      if (tokenPath.length === 0) {
        console.error('[Velar] token-path empty after all fallbacks. Route data:', JSON.stringify({
          swapDataParams: routeParams,
          quoteDataParams: quoteParams,
          routeTokenPath: (bestRoute as any).route?.token_path,
          topLevelTokenPath: (bestRoute as any).tokenPath,
          postConditions: (bestRoute as any).route?.postConditions || (bestRoute as any).postConditions,
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
        }));
        throw new Error(
          `Velar ${isVelarSS ? 'stableswap' : 'XYK'} router route (${swapData.function}) requires a token-path ` +
          `but none was found in the route data. Cannot build paymaster args safely.`
        );
      }

      // ── Argument Reconstruction ───────────────────────────────────────────
      // We must match the Paymaster's positional signature exactly.
      // Current suspect: Missing pool arguments for Velar multihops.
      
      // Attempt to recover poolPath if missing (Bitflow API sometimes omits it from parameters)
      if (poolPath.length === 0) {
        const recoveredPools = (bestRoute as any).route?.pool_path || (bestRoute as any).poolPath || [];
        if (recoveredPools.length > 0) {
          console.log('[Velar] Recovered poolPath from route data:', recoveredPools);
          poolPath = recoveredPools;
        }
      }

      const baseArgs = [
        uintCV(amountInRaw),
        uintCV(minOut),
        provider ? someCV(principalCV(provider)) : noneCV(),
        swapsReversed ? trueCV() : falseCV(),
        // ss/xyk token-a, token-b (first two tokens in path)
        // If poolPath is empty (pure Velar), we MUST set ss-token-a = velar-token-a
        // to trigger the paymaster's skip logic for the Bitflow hop.
        toCV(poolPath.length > 0 ? tokenPath[0] : velarTokenPath[0]),
        toCV(poolPath.length > 0 ? (tokenPath[1] ?? tokenPath[0]) : velarTokenPath[0]),
        // ss/xyk pool-a
        toCV(poolPath[0] || (isVelarXyk 
          ? 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.xyk-pool-stx-aeusdc-v-1-1'
          : 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.stableswap-stx-ststx-v-1-2')),
        // velar tokens (last N tokens in path)
        ...velarTokenPath.map(toCV),
        // velar-share-fee-to
        contractPrincipalCV(sfAddr, sfName),
        // fee args
        uintCV(BigInt(feeAmount)),
        principalCV(relayerAddress!),
        contractPrincipalCV(feeTokenAddr, feeTokenName),
      ];

      txOptions = { contractAddress: paymasterAddr, contractName: paymasterName, functionName, functionArgs: baseArgs };
      console.log(`[Policy] Using USER_PAYS (${paymasterName} Velar)`, {
        functionName,
        router: resolvedPool,
        tokenPath,
        velarTokenPath,
        poolPath,
        argsCount: baseArgs.length,
        argsSummary: baseArgs.map((a, i) => `[${i}] ${a.type}`).join(', '),
      });
    } else {
      // For stableswap and standard router routes, use getSwapParams to get the
      // correct SDK-built args, then determine the paymaster function name and
      // append the 3 fee args. This is always correct regardless of pool ID or
      // route shape — avoids the manual poolId/amountIn/minOut calculation bugs.
      const patchedRoute = {
        ...((bestRoute as any).route || bestRoute),
        swapData: { ...(bestRoute as any).swapData, contract: resolvedPool },
      };
      const swapParams = await bitflow.getSwapParams(
        { route: patchedRoute, amount: Number(amountIn), tokenXDecimals: params.tokenInDecimals, tokenYDecimals: params.tokenOutDecimals },
        userAddress,
        0.01
      );

      let functionName: string;
      if (isStableswap && isReverse) {
        functionName = 'swap-bitflow-stableswap-reverse';
      } else if (isStableswap) {
        functionName = 'swap-bitflow-stableswap';
      } else {
        functionName = 'swap-bitflow-router';
      }

      // SDK args cover: pool/router, id, token-x, token-y, amount-in, min-amount-out
      // Paymaster appends: fee-amount, relayer, fee-token
      const functionArgs = [
        ...swapParams.functionArgs,
        uintCV(BigInt(feeAmount)),
        principalCV(relayerAddress!),
        contractPrincipalCV(feeTokenAddr, feeTokenName),
      ];

      txOptions = { contractAddress: paymasterAddr, contractName: paymasterName, functionName, functionArgs };
      console.log('[Policy] Using USER_PAYS (velumx-defi-paymaster-v1)', {
        functionName,
        pool: resolvedPool,
        sdkArgsCount: swapParams.functionArgs.length,
        totalArgsCount: functionArgs.length,
      });
    }
  }

  // 5. Request wallet signature via openContractCall (UI-based, more robust)
  onProgress?.('Waiting for wallet signature...');

  return new Promise(async (resolve, reject) => {
    try {
      const { getStacksConnect } = await import('../stacks-loader');
      const connect = await getStacksConnect();

      if (!connect) {
        throw new Error('Stacks Connect not available');
      }

      await connect.openContractCall({
        contractAddress: txOptions.contractAddress,
        contractName: txOptions.contractName,
        functionName: txOptions.functionName,
        functionArgs: txOptions.functionArgs,
        sponsored: true,
        network: 'mainnet',
        anchorMode: 'any',
        postConditionMode: PostConditionMode.Allow,
        postConditions: [],
        onFinish: async (data: any) => {
          try {
            const signedTxHex = data.txHex;
            if (!signedTxHex) {
              throw new Error('Wallet did not return signed transaction');
            }

            // 6. Relayer co-signs + broadcasts
            onProgress?.('Broadcasting via VelumX...');
            const result = await velumx.sponsor(signedTxHex, {
              feeToken: isDeveloperSponsoring ? undefined : feeToken,
              feeAmount: isDeveloperSponsoring ? '0' : feeAmount,
              network: 'mainnet'
            });

            console.log('VelumX Bitflow sponsor result:', result);
            resolve(result.txid);
          } catch (err: any) {
            console.error('Relayer error:', err);
            reject(err);
          }
        },
        onCancel: () => {
          reject(new Error('Swap cancelled by user'));
        }
      });
    } catch (err: any) {
      console.error('Wallet connection error:', err);
      reject(err);
    }
  });
}

