/**
 * Attestation Service
 * Handles fetching attestations from Circle's API and Stacks attestation service
 */

import { getBackendConfig } from '@/lib/backend/config';
import { logger } from '@/lib/backend/logger';
import { AttestationData } from '@/shared/types';

interface AttestationFetchOptions {
    maxRetries?: number;
    retryDelay?: number;
    timeout?: number;
}

export class AttestationService {
    private config = getBackendConfig();
    private readonly CIRCLE_ATTESTATION_API = 'https://iris-api-sandbox.circle.com/v1/attestations';
    private readonly STACKS_ATTESTATION_API = 'https://api.mainnet.hiro.so';

    async fetchCircleAttestation(
        messageHash: string,
        options: AttestationFetchOptions = {}
    ): Promise<AttestationData> {
        const {
            maxRetries = this.config.maxRetries,
            retryDelay = this.config.attestationPollInterval,
            timeout = this.config.transactionTimeout,
        } = options;

        const maxAttempts = this.validateMaxAttempts(maxRetries, 'fetchCircleAttestation');

        logger.info('Starting Circle attestation fetch', {
            messageHash,
            maxAttempts,
        });

        const operation = async (): Promise<AttestationData | null> => {
            const response = await this.fetchFromCircleAPI(messageHash);
            if (response.attestation) {
                return {
                    attestation: response.attestation,
                    messageHash,
                    fetchedAt: Date.now(),
                };
            }
            return null;
        };

        return this.retryWithAttempts(
            operation,
            maxAttempts,
            retryDelay,
            timeout,
            'Circle attestation',
            messageHash
        );
    }

    async fetchXReserveAttestation(
        txHash: string,
        recipientAddress: string,
        expectedAmount: string,
        options: AttestationFetchOptions = {}
    ): Promise<AttestationData> {
        const {
            maxRetries = this.config.maxRetries,
            retryDelay = this.config.attestationPollInterval,
            timeout = this.config.transactionTimeout,
        } = options;

        const maxAttempts = this.validateMaxAttempts(maxRetries, 'fetchXReserveAttestation');

        const operation = async (): Promise<AttestationData | null> => {
            const balance = await this.fetchStacksBalance(recipientAddress);
            const expected = BigInt(expectedAmount);

            if (balance >= expected) {
                return {
                    attestation: 'xreserve-automatic',
                    messageHash: txHash,
                    fetchedAt: Date.now(),
                };
            }
            return null;
        };

        return this.retryWithAttempts(
            operation,
            maxAttempts,
            retryDelay,
            timeout,
            'xReserve verification',
            txHash
        );
    }

    async fetchStacksAttestation(
        txHash: string,
        options: AttestationFetchOptions = {}
    ): Promise<AttestationData> {
        const {
            maxRetries = this.config.maxRetries,
            retryDelay = this.config.attestationPollInterval,
            timeout = this.config.transactionTimeout,
        } = options;

        const maxAttempts = this.validateMaxAttempts(maxRetries, 'fetchStacksAttestation');

        const operation = async (): Promise<AttestationData | null> => {
            const response = await this.fetchFromStacksAPI(txHash);
            if (response.attestation) {
                return {
                    attestation: response.attestation,
                    messageHash: response.messageHash,
                    fetchedAt: Date.now(),
                };
            }
            return null;
        };

        return this.retryWithAttempts(
            operation,
            maxAttempts,
            retryDelay,
            timeout,
            'Stacks attestation',
            txHash
        );
    }

    private async fetchStacksBalance(address: string): Promise<bigint> {
        const url = `${this.config.stacksRpcUrl}/extended/v1/address/${address}/balances`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 404) return 0n;
                throw new Error(`Stacks API error: ${response.status}`);
            }
            const data: any = await response.json();
            const fungibleTokens = data.fungible_tokens || {};
            const usdcxKey = Object.keys(fungibleTokens).find(key => key.includes('usdcx'));
            return usdcxKey ? BigInt(fungibleTokens[usdcxKey].balance) : 0n;
        } catch (error) {
            throw error;
        }
    }

    private async fetchFromCircleAPI(messageHash: string): Promise<any> {
        const url = `${this.CIRCLE_ATTESTATION_API}/${messageHash}`;
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (this.config.circleApiKey) headers['Authorization'] = `Bearer ${this.config.circleApiKey}`;

        const response = await fetch(url, { headers });
        if (!response.ok) {
            if (response.status === 404) return { attestation: null };
            throw new Error(`Circle API error: ${response.status}`);
        }
        return response.json();
    }

    private async fetchFromStacksAPI(txHash: string): Promise<any> {
        const url = `${this.config.stacksRpcUrl}/extended/v1/tx/${txHash}`;
        const response = await fetch(url);
        if (!response.ok) return { attestation: null, messageHash: '' };
        const data: any = await response.json();
        if (data.tx_status === 'success') {
            return {
                attestation: data.tx_result?.hex || null,
                messageHash: txHash,
            };
        }
        return { attestation: null, messageHash: '' };
    }

    private validateMaxAttempts(value: number, methodName: string): number {
        if (value == null || Number.isNaN(value) || value < 0) return 3;
        return Math.floor(value);
    }

    private async retryWithAttempts<T>(
        operation: () => Promise<T | null>,
        maxAttempts: number,
        retryDelay: number,
        timeout: number,
        operationName: string,
        identifier: string
    ): Promise<T> {
        const startTime = Date.now();
        let attempt = 0;
        let lastError: Error | null = null;

        while (attempt < maxAttempts) {
            if (Date.now() - startTime > timeout) throw new Error(`${operationName} timeout`);
            attempt++;
            try {
                const result = await operation();
                if (result !== null) return result;
                if (attempt < maxAttempts) await new Promise(r => setTimeout(r, retryDelay));
            } catch (error) {
                lastError = error as Error;
                if (attempt < maxAttempts) await new Promise(r => setTimeout(r, retryDelay));
                else throw error;
            }
        }
        throw new Error(`${operationName} exceeded max attempts${lastError ? `: ${lastError.message}` : ''}`);
    }
}

export const attestationService = new AttestationService();
