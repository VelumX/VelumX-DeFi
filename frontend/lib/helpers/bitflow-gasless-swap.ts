import { 
  principalCV, 
  uintCV, 
  contractPrincipalCV,
  ClarityValue,
  makeUnsignedContractCall,
  PostConditionMode
} from '@stacks/transactions';
import { getVelumXClient } from '../velumx';
import { getConfig } from '../config';
import { BitflowSDK, QuoteResult } from '@bitflowlabs/core-sdk';
import { getBitflowSDK } from '../bitflow';
import { request } from '@stacks/connect';

const bitflow = getBitflowSDK();
const PROJECT_ID_MAINNET = 'SP1HTSGV1BXVAAVWJZ3MZJCTH9P28Z52ENQPX6JWV';
const BITFLOW_EXECUTOR_MAINNET = 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.bitflow-executor-v1';

export interface BitflowGaslessSwapParams {
  userAddress: string;
  userPublicKey?: string;
  tokenIn: string;
  tokenInId: string;
  tokenOut: string;
  tokenOutId: string;
  amountIn: string | number;
  feeToken: string;
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
    route: bestRoute as any,
    amount: Number(amountIn),
    tokenXDecimals: 6, // Defaulting for now
    tokenYDecimals: 6,
  }, userAddress, 0.01);

  const amountInRaw = Math.floor(Number(amountIn) * Math.pow(10, 6)); 
  const minAmountOutRaw = Math.floor(bestRoute.quote * 0.98 * Math.pow(10, 6)); // 2% slippage

  // 2. Estimate Fee
  onProgress?.('Estimating gasless fee...');
  const estimate = await velumx.estimateFee({ feeToken, estimatedGas: 200000 });
  const feeAmount = estimate.maxFee;

  // 3. Build Direct Call to Executor (V5 Specialized Pattern)
  onProgress?.('Preparing transaction...');
  const [tokenInAddr, tokenInName] = tokenIn.split('.');
  const [tokenOutAddr, tokenOutName] = tokenOut.split('.');
  const [feeTokenAddr, feeTokenName] = feeToken.split('.');
  const [execAddr, execName] = BITFLOW_EXECUTOR_MAINNET.split('.');

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

  const transaction = await makeUnsignedContractCall({
    contractAddress: execAddr,
    contractName: execName,
    functionName: 'execute-swap',
    functionArgs: [
      principalCV(userAddress),
      principalCV(PROJECT_ID_MAINNET),
      principalCV(BITFLOW_EXECUTOR_MAINNET),
      contractPrincipalCV(tokenInAddr, tokenInName),
      contractPrincipalCV(tokenOutAddr, tokenOutName),
      contractPrincipalCV(swapParams.contractAddress, swapParams.contractName),
      uintCV(amountInRaw),
      uintCV(minAmountOutRaw),
      uintCV(feeAmount),
      contractPrincipalCV(feeTokenAddr, feeTokenName),
    ],
    network: 'mainnet',
    sponsored: true,
    publicKey,
    fee: 0n,
    nonce,
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
    validateWithAbi: false,
  });

  const txHex = transaction.serialize();

  // 4. Wallet signs WITHOUT broadcasting
  onProgress?.('Waiting for wallet signature...');
  let signedTxHex: string;
  try {
    const signResult = await request('stx_signTransaction', {
      transaction: txHex,
      broadcast: false,
    });
    signedTxHex = (signResult as any).transaction || (signResult as any).txHex;
    if (!signedTxHex) throw new Error('Wallet did not return signed tx hex');
  } catch (err: any) {
    if (err?.message?.toLowerCase().includes('cancel') || err?.code === 4001) {
      throw new Error('Swap cancelled by user');
    }
    throw err;
  }

  // 5. Relayer co-signs + broadcasts
  onProgress?.('Broadcasting via VelumX...');
  const result = await velumx.sponsor(signedTxHex, {
    feeToken: feeToken,
    feeAmount: feeAmount,
    network: 'mainnet'
  });

  console.log('VelumX Bitflow sponsor result:', result);
  return result.txid;
}
