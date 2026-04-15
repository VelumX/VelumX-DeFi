/**
 * Simple Logger for Server-side logic
 */

export const logger = {
    info: (message: string, context: any = {}) => {
        console.info(`[INFO] ${message}`, context);
    },
    warn: (message: string, context: any = {}) => {
        console.warn(`[WARN] ${message}`, context);
    },
    error: (message: string, context: any = {}) => {
        console.error(`[ERROR] ${message}`, context);
    },
    debug: (message: string, context: any = {}) => {
        if (process.env.NODE_ENV !== 'production') {
            console.debug(`[DEBUG] ${message}`, context);
        }
    },
};
