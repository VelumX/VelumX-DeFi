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
  const bestRoute = quoteResult.bestRoute;
  if (!bestRoute || !bestRoute.quote) throw new Error('No swap route found on Bitflow');

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

    // Map known simnet/testnet DEX addresses to their mainnet equivalents.
    // The Bitflow API returns test addresses for some DEX integrations.
    const MAINNET_CONTRACT_MAP: Record<string, string> = {
      // ALEX AMM
      'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR': 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM',
      // Velar
      'SM2MARAVW6BEJCD13YV2RHGYHQWT7TDDNMNRB1MVT': 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1',
      // Add more mappings as needed
    };

    const resolvedContractAddress = MAINNET_CONTRACT_MAP[contractAddress] || contractAddress;

    // Guard: if still SM*/ST* after mapping, we don't have a mainnet equivalent yet
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

    // Build args from the order array
    const functionArgs: any[] = order.map((key: string) => {
      const val = p[key];

      // Principal fields
      if (typeof val === 'string' && val.includes('.')) {
        return toContractCV(resolveTokenPrincipal(val));
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
      resolvedContract: `${resolvedContractAddress}.${contractName}`,
      fn,
      order,
      argsCount: functionArgs.length,
    });

    txOptions = {
      contractAddress: resolvedContractAddress,
      contractName,
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
    feeToken: feeToken,
    feeAmount: feeAmount,
    network: 'mainnet'
  });

  console.log('VelumX Bitflow sponsor result:', result);
  return result.txid;
}

