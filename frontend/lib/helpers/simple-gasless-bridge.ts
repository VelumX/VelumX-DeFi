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

  // Step 2: Build unsigned sponsored tx
  onProgress?.('Preparing transaction...');
  const txLib = await getStacksTransactions();
  const network = await getNetworkInstance();

  // Fetch public key if not provided
  let publicKey = params.userPublicKey || '';
  if (!publicKey) {
    try {
      const addrResult = await request('stx_getAddresses') as any;
      const stxEntry = (addrResult?.addresses || []).find((a: any) =>
        a.address === params.userAddress
      ) || (addrResult?.addresses || [])[0];
      publicKey = stxEntry?.publicKey || '';
    } catch (e) {
      console.warn('Could not fetch public key:', e);
    }
  }

  if (!publicKey) {
    throw new Error('Cannot build sponsored transaction: wallet public key not available.');
  }

  const recipientBytes = encodeEthereumAddress(recipientAddress);
  const [contractAddress, contractName] = config.stacksUsdcxProtocolAddress.split('.');
  const { Cl } = txLib;

  const transaction = await txLib.makeUnsignedContractCall({
    contractAddress,
    contractName,
    functionName: 'burn',
    functionArgs: [
      Cl.uint(amountInMicro.toString()),
      Cl.uint('0'),
      Cl.buffer(recipientBytes),
    ],
    network,
    sponsored: true,
    publicKey,
    fee: 0n,
    postConditionMode: PostConditionMode.Allow,
    validateWithAbi: false,
  });

  const txHex = Buffer.from(transaction.serialize()).toString('hex');

  // Step 3: Wallet signs WITHOUT broadcasting
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
      throw new Error('Bridge cancelled by user');
    }
    throw err;
  }

  // Step 4: Relayer sponsors and broadcasts
  onProgress?.('Broadcasting via VelumX...');
  const result = await velumx.sponsor(signedTxHex, {
    feeToken: isDeveloperSponsored ? undefined : config.stacksUsdcxAddress,
    feeAmount: isDeveloperSponsored ? '0' : feeAmount,
    network: config.stacksNetwork as 'mainnet' | 'testnet'
  });

  console.log('VelumX bridge result:', result);
  return result.txid;
}

function encodeEthereumAddress(address: string): Uint8Array {
  const hex = address.startsWith('0x') ? address.slice(2) : address;
  const paddedHex = hex.padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(paddedHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
