import { 
  principalCV, 
  uintCV, 
  contractPrincipalCV,
  ClarityValue
} from '@stacks/transactions';
import { getVelumXClient } from '../velumx';
import { getConfig } from '../config';
import { BitflowSDK, QuoteResult } from '@bitflowlabs/core-sdk';

const bitflow = new BitflowSDK();
const PROJECT_ID_MAINNET = 'SP1HTSGV1BXVAAVWJZ3MZJCTH9P28Z52ENQPX6JWV';
const BITFLOW_EXECUTOR_MAINNET = 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.bitflow-executor-v1';

export interface BitflowGaslessSwapParams {
  userAddress: string;
  tokenIn: string;
  tokenInId: string;
  tokenOut: string;
  tokenOutId: string;
  amountIn: string | number;
  feeToken: string;
  onProgress?: (status: string) => void;
}

export async function executeBitflowGaslessSwap(params: BitflowGaslessSwapParams) {
  const { userAddress, tokenIn, tokenInId, tokenOut, tokenOutId, amountIn, feeToken, onProgress } = params;
  
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

  const txOptions = {
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
  };

  onProgress?.('Finalizing gasless transaction...');
  return txOptions;
}
