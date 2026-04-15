/**
 * Stacks Mint Service
 * Handles minting USDCx on Stacks after receiving attestations
 */

import {
    makeContractCall,
    makeSTXTokenTransfer,
    AnchorMode,
    PostConditionMode,
    bufferCV,
    uintCV,
} from '@stacks/transactions';
import { broadcastAndVerify } from '@/lib/backend/stacks';
import { STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';
import { getBackendConfig } from '@/lib/backend/config';
import { logger } from '@/lib/backend/logger';

export class StacksMintService {
    private config = getBackendConfig();
    private network = STACKS_MAINNET;

    async fundNewAccount(recipientAddress: string): Promise<string | null> {
        try {
            const response = await fetch(
                `${this.config.stacksRpcUrl}/v2/accounts/${recipientAddress}?proof=0`
            );

            if (!response.ok && response.status !== 404) {
                throw new Error(`Failed to check account balance: ${response.statusText}`);
            }

            const data = (response.ok ? await response.json() : { balance: '0' }) as { balance: string };
            const balance = BigInt(data.balance);
            const minBalance = BigInt(100000); // 0.1 STX

            if (balance >= minBalance) {
                logger.info('Account has sufficient STX, skipping gas drop', { address: recipientAddress });
                return null;
            }

            logger.info('Account needs funding, initiating gas drop', { address: recipientAddress });

            const txOptions = {
                recipient: recipientAddress,
                amount: BigInt(500000), // 0.5 STX
                senderKey: this.config.relayerPrivateKey,
                network: this.network,
                memo: 'VelumX Gas Drop',
                anchorMode: AnchorMode.Any,
                fee: BigInt(2000),
            };

            const transaction = await makeSTXTokenTransfer(txOptions);
            const txId = await broadcastAndVerify(transaction, this.network);
            logger.info('Gas drop successful', { address: recipientAddress, txId });
            return txId;
        } catch (error) {
            logger.error('Failed to process gas drop', { address: recipientAddress, error: (error as Error).message });
            return null;
        }
    }

    async mintUsdcx(
        recipientAddress: string,
        amount: string,
        attestation: string,
        messageHash: string
    ): Promise<string> {
        logger.info('Starting USDCx mint on Stacks', { recipient: recipientAddress, amount });

        try {
            const [contractAddress, contractName] = this.config.stacksUsdcxProtocolAddress.split('.');
            const attestationBuffer = Buffer.from(attestation.replace('0x', ''), 'hex');
            const messageHashBuffer = Buffer.from(messageHash.replace('0x', ''), 'hex');

            const txOptions = {
                contractAddress,
                contractName,
                functionName: 'mint',
                functionArgs: [
                    uintCV(amount),
                    bufferCV(attestationBuffer),
                    bufferCV(messageHashBuffer),
                ],
                senderKey: this.config.relayerPrivateKey,
                network: 'testnet' as const,
                anchorMode: AnchorMode.Any,
                postConditionMode: PostConditionMode.Allow,
                fee: BigInt(10000),
            };

            const transaction = await makeContractCall(txOptions);
            const txId = await broadcastAndVerify(transaction, this.network);
            logger.info('USDCx mint successful', { txId, recipient: recipientAddress });
            return txId;
        } catch (error) {
            logger.error('Failed to mint USDCx', { recipient: recipientAddress, error: (error as Error).message });
            throw error;
        }
    }

    async validateRelayerBalance(): Promise<boolean> {
        try {
            const response = await fetch(
                `${this.config.stacksRpcUrl}/v2/accounts/${this.config.relayerStacksAddress}?proof=0`
            );
            if (!response.ok) throw new Error(`Failed to fetch relayer balance`);
            const data: any = await response.json();
            const balance = BigInt(data.balance);
            return balance >= this.config.minStxBalance;
        } catch (error) {
            return false;
        }
    }
}

export const stacksMintService = new StacksMintService();
