import { 
  uintCV,
  someCV,
  noneCV,
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

  const bestRoute = validRoutes[0];

  console.log('[Bitflow] Selected route:', {
    contract: (bestRoute as any).swapData?.contract,
    fn: (bestRoute as any).swapData?.function,
    quote: bestRoute.quote,
    dexPath: (bestRoute as any).dexPath,
  });

  const amountInRaw = Math.floor(Number(amountIn) * Math.pow(10, params.tokenInDecimals));
  const minAmountOutRaw = Math.floor((bestRoute.quote ?? 0) * 0.99 * Math.pow(10, params.tokenOutDecimals)); // 1% slippage

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
    // router contracts use swap-bitflow-router.
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

    // Determine if this is a stableswap pool or a router.
    // A contract is a stableswap POOL only if its name starts with "stableswap-".
    // Contracts like "router-stableswap-velar-v-1-5" contain "stableswap" but are routers.
    const contractName = resolvedPool.split('.')[1] || '';
    const isStableswap = contractName.startsWith('stableswap-');
    const isReverse = swapData.function === 'swap-y-for-x';

    const [paymasterAddr, paymasterName] = config.velumxPaymasterAddress.split('.');
    const [feeTokenAddr, feeTokenName] = feeToken.split('.');
    const [tokenInAddr, tokenInName] = params.tokenIn.split('.');
    const [tokenOutAddr, tokenOutName] = params.tokenOut.split('.');
    const [poolContractAddr, poolContractName] = resolvedPool.split('.');

    let functionName: string;
    if (isStableswap && isReverse) {
      functionName = 'swap-bitflow-stableswap-reverse';
    } else if (isStableswap) {
      functionName = 'swap-bitflow-stableswap';
    } else {
      functionName = 'swap-bitflow-router';
    }

    const functionArgs = [
      contractPrincipalCV(poolContractAddr, poolContractName),  // pool / router
      uintCV(poolId),                                            // id
      contractPrincipalCV(tokenInAddr, tokenInName),             // token-x
      contractPrincipalCV(tokenOutAddr, tokenOutName),           // token-y
      uintCV(amountInRaw),                                       // amount-in
      uintCV(minAmountOutRaw),                                   // min-amount-out
      uintCV(BigInt(feeAmount)),                                 // fee-amount
      principalCV(relayerAddress!),                              // relayer
      contractPrincipalCV(feeTokenAddr, feeTokenName),           // fee-token
    ];

    txOptions = { contractAddress: paymasterAddr, contractName: paymasterName, functionName, functionArgs };
    console.log('[Policy] Using USER_PAYS (velumx-defi-paymaster-v1)', { functionName, pool: resolvedPool });
  }

  // 5. Build unsigned sponsored tx, then request wallet signature (no broadcast)
  onProgress?.('Waiting for wallet signature...');

  const unsignedTx = await buildSponsoredContractCall({
    contractAddress: txOptions.contractAddress,
    contractName: txOptions.contractName,
    functionName: txOptions.functionName,
    functionArgs: txOptions.functionArgs,
    publicKey,
    nonce,
    network: 'mainnet',
  });

  console.log('[Bitflow] Built sponsored tx, length:', (unsignedTx as any).length ?? (unsignedTx as string).length);

  // stx_signTransaction expects a hex string — convert Uint8Array if needed
  const txForSigning = unsignedTx instanceof Uint8Array
    ? Buffer.from(unsignedTx).toString('hex')
    : unsignedTx as string;

  let signedTxHex: string;
  try {
    const signResult = await request('stx_signTransaction', {
      transaction: txForSigning,
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

