/**
 * Stacks Utility for Server-side
 */

import { broadcastTransaction } from '@stacks/transactions';
import { STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';
import { getBackendConfig } from './config';
import { fetchWithRetry } from './fetch';
import { logger } from './logger';

interface BroadcastOptions {
    maxBroadcastRetries?: number;
    verifyRetries?: number;
    verifyIntervalMs?: number;
}


export function getStacksNetwork(): any {
    return STACKS_TESTNET;
}

export async function broadcastAndVerify(
    transaction: any,
    network: any,
    options: BroadcastOptions = {}
): Promise<string> {
    const cfg = getBackendConfig();
    const maxBroadcastRetries = options.maxBroadcastRetries ?? 3;
    const verifyRetries = options.verifyRetries ?? 6;
    const verifyIntervalMs = options.verifyIntervalMs ?? 2000;

    let lastErr: any = null;

    for (let attempt = 1; attempt <= maxBroadcastRetries; attempt++) {
        try {
            logger.debug(`broadcastAndVerify: broadcasting attempt ${attempt}/${maxBroadcastRetries}`);
            const resp: any = await broadcastTransaction({ transaction, network });

            if (!resp || 'error' in resp) {
                lastErr = resp || new Error('Empty broadcast response');
                const reason = resp?.reason || resp?.error || '';
                const msg = `Broadcast failure: ${String(reason)}`;
                logger.warn(msg, { resp });

                if (attempt === maxBroadcastRetries) throw new Error(msg);
                await new Promise(r => setTimeout(r, 1500 * attempt));
                continue;
            }

            const txid: string | undefined = resp.txid;

            if (!txid) {
                lastErr = new Error('Broadcast returned no txid');
                logger.warn('broadcastAndVerify: no txid in broadcast response', { resp });
                if (attempt === maxBroadcastRetries) throw lastErr;
                await new Promise(r => setTimeout(r, 1000 * attempt));
                continue;
            }

            for (let v = 0; v < verifyRetries; v++) {
                try {
                    const url = `${cfg.stacksRpcUrl}/extended/v1/tx/${txid}`;
                    const r = await fetchWithRetry(url, {}, { maxRetries: 1, timeout: 5000 });
                    if (r.ok) {
                        logger.info('broadcastAndVerify: tx observed by node', { txid });
                        return txid;
                    }
                } catch (e) {
                    logger.debug('broadcastAndVerify: tx not yet observed', { txid, attempt: v });
                }
                await new Promise(r => setTimeout(r, verifyIntervalMs));
            }

            throw new Error(`Transaction ${txid} not observed by node after ${verifyRetries} checks`);

        } catch (err) {
            lastErr = err;
            if (attempt === maxBroadcastRetries) {
                logger.error('broadcastAndVerify: final broadcast error', { error: (err as Error).message });
                throw err;
            }
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }

    throw lastErr || new Error('Unknown broadcast failure');
}

export async function checkTransactionStatus(txid: string): Promise<'pending' | 'success' | 'failed'> {
    const cfg = getBackendConfig();
    try {
        const resp = await fetchWithRetry(`${cfg.stacksRpcUrl}/extended/v1/tx/${txid}`, {}, { maxRetries: 2, timeout: 5000 });
        if (!resp.ok) return 'pending';
        const data: any = await resp.json();
        if (data.tx_status === 'success') return 'success';
        if (data.tx_status && (data.tx_status.startsWith('abort') || data.tx_status === 'failed')) return 'failed';
        return 'pending';
    } catch (error) {
        return 'pending';
    }
}
