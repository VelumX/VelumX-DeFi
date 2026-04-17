/**
 * Simple Gasless Bridge Helper — Sponsored Transaction Flow
 *
 * Same fix as simple-gasless-swap.ts:
 * Use makeUnsignedContractCall({ sponsored: true }) + request('stx_signTransaction')
 * to guarantee AuthType.Sponsored before the relayer sees the tx.
 */

import { getNetworkInstance, getStacksTransactions } from '../stacks-loader';
import { PostConditionMode } from '@stacks/transactions';
import { getConfig } from '../config';
import { parseUnits } from 'viem';
import { getVelumXClient } from '../velumx';
import { request } from '@stacks/connect';

export interface SimpleGaslessBridgeParams {
  userAddress: string;
  userPublicKey?: string;
  amount: string;           // Human-readable e.g. "10.5"
  recipientAddress: string; // Ethereum address
  onProgress?: (step: string) => void;
}

export async function executeSimpleGaslessBridge(params: SimpleGaslessBridgeParams): Promise<string> {
  const { amount, recipientAddress, onProgress } = params;
  const config = getConfig();
  const velumx = getVelumXClient();

  const amountInMicro = parseUnits(amount, 6);

  // Step 1: Estimate fee
  onProgress?.('Calculating fees...');
  const estimate = await velumx.estimateFee({
    feeToken: config.stacksUsdcxAddress,
    estimatedGas: 150000
  });
  const feeAmount = estimate.maxFee || '0';
  const isDeveloperSponsored = estimate.policy === 'DEVELOPER_SPONSORS';

  if (!config.velumxRelayerAddress) {
    throw new Error('VelumX Configuration Error: NEXT_PUBLIC_VELUMX_RELAYER_ADDRESS is not set.');
  }

  // Step 2: Build v5 Universal Options (New SDK v3.1.0)
  onProgress?.('Preparing transaction...');
  const recipientBytes = recipientAddress.startsWith('0x') ? recipientAddress.slice(2) : recipientAddress;
  
  const txOptions = velumx.getBridgeOptions({
    projectId: 'SP1HTSGV1BXVAAVWJZ3MZJCTH9P28Z52ENQPX6JWV',
    executor: 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.usdcx-bridge-executor-v1',
    payload: encodeBridgePayload(Number(amountInMicro), recipientBytes),
    feeAmount: feeAmount,
    feeToken: config.stacksUsdcxAddress
  });

  // Step 3: Wallet signs WITHOUT broadcasting
  onProgress?.('Waiting for wallet signature...');
  const signResult = await request('stx_signTransaction', {
    transaction: (txOptions as any).serialize ? (txOptions as any).serialize() : JSON.stringify(txOptions),
    broadcast: false,
  });

  const signedTxHex = (signResult as any).transaction || (signResult as any).txHex;

  // Step 4: Relayer sponsors and broadcasts
  onProgress?.('Broadcasting via VelumX...');
  const result = await velumx.sponsor(signedTxHex, {
    feeToken: config.stacksUsdcxAddress,
    feeAmount: feeAmount,
    network: config.stacksNetwork as 'mainnet' | 'testnet'
  });

  console.log('VelumX bridge result:', result);
  return result.txid;
}

function encodeBridgePayload(amount: number, recipient: string): string {
  const buff = Buffer.alloc(48);
  buff.writeBigUInt64BE(BigInt(amount), 8); // amount at bytes 8-16
  const hexRecipient = recipient.startsWith('0x') ? recipient.slice(2) : recipient;
  buff.write(hexRecipient.padStart(64, '0'), 16, 'hex'); // recipient at bytes 16-48
  return '0x' + buff.toString('hex');
}
