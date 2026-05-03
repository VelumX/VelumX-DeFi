/**
 * Simple Gasless Bridge Helper — Sponsored Transaction Flow
 *
 * Calls velumx-defi-paymaster-v1 bridge-usdcx directly using buildSponsoredContractCall.
 * The paymaster atomically:
 *   1. Collects fee-amount of fee-token from user → relayer
 *   2. Burns USDCx to initiate the cross-chain bridge to Ethereum
 *
 * The relayer co-signs and broadcasts via velumx.sponsor().
 */

import { contractPrincipalCV, principalCV, uintCV, bufferCV } from '@stacks/transactions';
import { buildSponsoredContractCall } from '@velumx/sdk';
import { getConfig } from '../config';
import { parseUnits } from 'viem';
import { getVelumXClient } from '../velumx';
import { request } from '@stacks/connect';

export interface SimpleGaslessBridgeParams {
  userAddress: string;
  userPublicKey?: string;
  amount: string;           // Human-readable e.g. "10.5"
  recipientAddress: string; // Ethereum address (0x...)
  onProgress?: (step: string) => void;
}

export async function executeSimpleGaslessBridge(params: SimpleGaslessBridgeParams): Promise<string> {
  const { userAddress, userPublicKey, amount, recipientAddress, onProgress } = params;
  const config = getConfig();
  const velumx = getVelumXClient();

  const amountInMicro = parseUnits(amount, 6); // USDCx has 6 decimals

  // Step 1: Estimate fee & get relayer address
  onProgress?.('Calculating fees...');
  const estimate = await velumx.estimateFee({
    feeToken: config.stacksUsdcxAddress,
    estimatedGas: 150_000,
  });
  const feeAmount = estimate.maxFee || '0';
  const relayerAddress = estimate.relayerAddress;
  const isDeveloperSponsored = estimate.policy === 'DEVELOPER_SPONSORS';

  if (!isDeveloperSponsored && !relayerAddress) {
    throw new Error('Relayer address not available from fee estimate.');
  }

  // Step 2: Get public key
  let publicKey = userPublicKey || '';
  if (!publicKey) {
    try {
      const addrResult = await request('stx_getAddresses') as any;
      const stxEntry = (addrResult?.addresses || []).find((a: any) => a.address === userAddress)
        || (addrResult?.addresses || [])[0];
      publicKey = stxEntry?.publicKey || '';
    } catch (e) { /* ignore */ }
  }
  if (!publicKey) throw new Error('Wallet public key not available. Please reconnect your wallet.');

  // Step 3: Fetch nonce
  let nonce = 0n;
  try {
    const nonceRes = await fetch(`/api/hiro/v2/accounts/${userAddress}?proof=0`);
    if (nonceRes.ok) {
      const accountData = await nonceRes.json();
      nonce = BigInt(accountData.nonce ?? 0);
    }
  } catch (e) { /* use 0 */ }

  // Step 4: Build the bridge-usdcx call on velumx-defi-paymaster-v1
  onProgress?.('Preparing transaction...');

  // Encode Ethereum recipient as 32-byte buffer (right-pad 20-byte address with 12 zero bytes)
  const hexAddr = recipientAddress.startsWith('0x') ? recipientAddress.slice(2) : recipientAddress;
  const recipientBuf = Buffer.alloc(32);
  Buffer.from(hexAddr.padStart(40, '0'), 'hex').copy(recipientBuf, 12); // right-aligned in 32 bytes

  const [paymasterAddr, paymasterName] = config.velumxPaymasterAddress.split('.');
  const [feeTokenAddr, feeTokenName] = config.stacksUsdcxAddress.split('.');

  // bridge-usdcx(amount, recipient, fee-amount, relayer, fee-token)
  const functionArgs = [
    uintCV(amountInMicro),                                    // amount
    bufferCV(recipientBuf),                                   // recipient (32-byte buffer)
    uintCV(BigInt(feeAmount)),                                // fee-amount
    principalCV(isDeveloperSponsored ? userAddress : relayerAddress!), // relayer (or user for dev-sponsors)
    contractPrincipalCV(feeTokenAddr, feeTokenName),          // fee-token (USDCx)
  ];

  // Step 5: Build unsigned sponsored tx
  const unsignedTx = await buildSponsoredContractCall({
    contractAddress: paymasterAddr,
    contractName: paymasterName,
    functionName: 'bridge-usdcx',
    functionArgs,
    publicKey,
    nonce,
    network: 'mainnet',
  });

  // Step 6: Wallet signs (no broadcast)
  onProgress?.('Waiting for wallet signature...');

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
      throw new Error('Bridge cancelled by user');
    }
    throw err;
  }

  // Step 7: Relayer co-signs + broadcasts
  onProgress?.('Broadcasting via VelumX...');
  const result = await velumx.sponsor(signedTxHex, {
    feeToken: isDeveloperSponsored ? undefined : config.stacksUsdcxAddress,
    feeAmount: isDeveloperSponsored ? '0' : feeAmount,
    network: 'mainnet',
  });

  return result.txid;
}
