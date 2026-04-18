import { 
  uintCV,
  someCV,
  noneCV,
  tupleCV,
  serializeCV,
  contractPrincipalCV,
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
    // SM1793... is the simnet XYK/router deployer. Most contracts under this address
    // belong at the Bitflow deployer on mainnet. ALEX-specific contracts are handled
    // explicitly in FULL_CONTRACT_OVERRIDES below.
    'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR': 'SPQC38PW542EQJ5M11CR25P7BS1CA6QT4TBXGB3M', // Bitflow deployer (default)
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
    // ── XYK contracts — deployed at ALEX address, NOT Bitflow deployer ───────
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.sip-010-trait-ft-standard-v-1-1`]: `SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.sip-010-trait-ft-standard-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-trait-v-1-1`]:            `SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.xyk-pool-trait-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-1`]:                 `SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-stx-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-core-v-1-1`]:                  `SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.xyk-core-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-stx-aeusdc-v-1-1`]:       `SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.xyk-pool-stx-aeusdc-v-1-1`,
    // ── Wrapper contracts — deployed at Bitflow deployer ─────────────────────
    // Note: the API may return v-1-2 but only v-1-1 is deployed on mainnet.
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.wrapper-velar-v-1-1`]:          `${BITFLOW_DEPLOYER}.wrapper-velar-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.wrapper-velar-v-1-2`]:          `${BITFLOW_DEPLOYER}.wrapper-velar-v-1-1`,   // v-1-2 not on mainnet → use v-1-1
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.wrapper-velar-multihop-v-1-1`]: `${BITFLOW_DEPLOYER}.wrapper-velar-multihop-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.wrapper-alex-v-2-1`]:           `${BITFLOW_DEPLOYER}.wrapper-alex-v-2-1`,    
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.wrapper-arkadiko-v-1-1`]:       `${BITFLOW_DEPLOYER}.wrapper-arkadiko-v-1-1`,
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.wrapper-arkadiko-v-1-2`]:       `${BITFLOW_DEPLOYER}.wrapper-arkadiko-v-1-1`, // v-1-2 not on mainnet → use v-1-1
    // wrapper-velar-path-v-1-2 (swap-univ2v2) — not yet deployed on mainnet, no mapping.
    // The ABI 404 check in the retry loop will skip this route automatically.
    // router-stableswap-xyk-v-1-3 — confirmed deployed at Bitflow deployer (verified via Hiro API)
    [`SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-stableswap-xyk-v-1-3`]:  `${BITFLOW_DEPLOYER}.router-stableswap-xyk-v-1-3`,
    // ── Velar deployer overrides (SM2* → SP1Y5*) — Velar-native contracts ────
    // wrapper-velar-v-1-2 is deployed at the Velar address per Bitflow docs
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.wrapper-velar-v-1-2`]:          `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.wrapper-velar-v-1-2`,
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.univ2-core`]:                   `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-core`,
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.univ2-router`]:                 `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-router`,
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.univ2-library`]:                `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-library`,
    [`SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT.univ2-share-fee-to`]:           `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-share-fee-to`,
  };

  const isValidMainnetContract = (contractStr: string): boolean => {
    if (!contractStr?.includes('.')) return false;
    const [addr] = contractStr.split('.');
    // Resolve simnet/testnet address to mainnet equivalent
    const resolved = MAINNET_CONTRACT_MAP[addr] || addr;
    // Only exclude if still a simnet/testnet address after mapping
    if (resolved.startsWith('SM') || resolved.startsWith('ST')) return false;
    // Allow all mainnet addresses — the ABI fetch in the retry loop will
    // verify the contract actually exists and has the right function.
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

        if (resolvedContractAddress.startsWith('SM') || resolvedContractAddress.startsWith('ST')) {
          throw new Error(`Non-mainnet contract after resolution: ${swapData.contract}`);
        }

        console.log('[Bitflow] Trying route:', `${resolvedContractAddress}.${resolvedContractName}`, swapData.function);

        // Verify the contract actually exists on mainnet before calling getSwapParams.
        // getSwapParams fetches the ABI from the Bitflow node (which serves simnet ABIs),
        // so it succeeds even for undeployed contracts. We must check mainnet directly.
        const abiCheck = await fetch(
          `https://api.mainnet.hiro.so/v2/contracts/interface/${resolvedContractAddress}/${resolvedContractName}`
        );
        if (!abiCheck.ok) {
          throw new Error(
            `Contract ${resolvedContractAddress}.${resolvedContractName} not found on mainnet (${abiCheck.status}). Route skipped.`
          );
        }

        // Use the SDK to build function args — it handles all Clarity type conversions,
        // ABI fetching, and slippage correctly. We just patch the contract address.
        const swapParams = await bitflow.getSwapParams(
          {
            route: (candidateRoute as any).route || candidateRoute,
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

  // serialize() returns Uint8Array in @stacks/transactions v7+.
  // stx_signTransaction accepts the raw Uint8Array directly (same as simple-gasless-swap.ts).
  const txHex = unsignedTx.serialize();
  console.log('[Bitflow] Built sponsored tx, length:', (txHex as any).length ?? (txHex as string).length);

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

