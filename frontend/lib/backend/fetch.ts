/**
 * Fetch Utility with Retry and Timeout
 */

import { logger } from './logger';

export async function fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retryOptions: { maxRetries?: number; timeout?: number } = {}
): Promise<Response> {
    const maxRetries = retryOptions.maxRetries ?? 3;
    const timeout = retryOptions.timeout ?? 30000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });

            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            const isLastAttempt = attempt === maxRetries;
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (isLastAttempt) {
                logger.error(`Fetch failed after ${attempt} attempts`, { url, error: errorMessage });
                throw error;
            }

            const backoff = 1000 * Math.pow(2, attempt - 1);
            logger.warn(`Fetch attempt ${attempt} failed, retrying in ${backoff}ms`, { url, error: errorMessage });
            await new Promise(resolve => setTimeout(resolve, backoff));
        }
    }

    throw new Error(`Failed to fetch ${url} after ${maxRetries} attempts`);
}
