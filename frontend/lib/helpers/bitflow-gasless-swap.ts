import { 
  uintCV, 
  tupleCV,
  serializeCV,
  PostConditionMode,
  makeUnsignedContractCall,
  Cl
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
  const { userAddress, userPublicKey, tokenIn, tokenInId, tokenOut, tokenOutId, amountIn, feeToken, onProgress } = params;
  
  const velumx = getVelumXClient();
  const config = getConfig();

  // 1. Get Bitflow Route & Quote
  onProgress?.('Fetching quote from Bitflow...');
  const quoteResult: QuoteResult = await bitflow.getQuoteForRoute(tokenInId, tokenOutId, Number(amountIn));
  const bestRoute = quoteResult.bestRoute;
  if (!bestRoute || !bestRoute.quote) throw new Error('No swap route found on Bitflow');

  const swapParams = await bitflow.getSwapParams({
    route: bestRoute.route,
    amount: Number(amountIn),
    tokenXDecimals: params.tokenInDecimals,
    tokenYDecimals: params.tokenOutDecimals,
  }, userAddress, 0.01);

  const amountInRaw = Math.floor(Number(amountIn) * Math.pow(10, params.tokenInDecimals)); 
  const minAmountOutRaw = Math.floor(bestRoute.quote * 0.98 * Math.pow(10, params.tokenOutDecimals)); // 2% slippage

  // Extract pool details for Trait-Forwarding (v2 uses univ2-router logic)
  // Use 'any' to bypass SDK type mismatches and handle different route structures
  const routeData = bestRoute as any;
  const routeStep = routeData.route?.steps?.[0] || routeData.steps?.[0] || routeData;
  
  // Normalization helper for principals (handles STX -> wSTX mapping)
  const WSTX_MAINNET = 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx';
  const normalize = (p: string) => (p === 'STX' || p === 'token-stx' || !p.includes('.')) ? WSTX_MAINNET : p;

  const poolId = routeStep.poolId || routeStep.swapData?.parameters?.['id'] || 0;
  const token0 = normalize(routeStep.token0 || routeStep.tokenPath?.[0] || '');
  const token1 = normalize(routeStep.token1 || routeStep.tokenPath?.[1] || '');
  const tokenInPrincipal = normalize(routeStep.tokenIn || params.tokenIn);
  const tokenOutPrincipal = normalize(routeStep.tokenOut || params.tokenOut);

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

  // 3. Serialize payload for VelumX Executor (Bitflow v2)
  onProgress?.('Preparing transaction payload...');
  
  // Pack the arguments into a single tuple buffer that the executor expects
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
    // DEVELOPER_SPONSORS: User pays nothing. Call Bitflow directly using SDK-provided params.
    // The relayer will sponsor the STX gas via the /broadcast endpoint.
    // Use swapParams directly — functionArgs are already proper Clarity values from the SDK.
    const [contractAddress, contractName] = swapParams.contractAddress.split('.');
    txOptions = {
      contractAddress,
      contractName,
      functionName: swapParams.functionName,
      functionArgs: swapParams.functionArgs,
    };
    console.log('[Policy] Using DEVELOPER_SPONSORS (Direct Bitflow Call)', {
      contract: swapParams.contractAddress,
      fn: swapParams.functionName,
      argsCount: swapParams.functionArgs.length,
    });
  } else {
    // USER_PAYS: User pays SIP-010 fee. Call via Paymaster contract which then calls our Executor.
    txOptions = velumx.getExecuteGenericOptions({
      executor: config.bitflowExecutorAddress,
      payload: serializedPayload,
      feeAmount: feeAmount,
      feeToken: feeToken,
      relayer: relayerAddress,
      version: 'relayer-v1', // Maps to velumx-paymaster-1-1
      token1: tokenInPrincipal,
      token2: tokenOutPrincipal,
      token3: token0,
      token4: token1
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

