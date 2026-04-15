import { VelumXClient } from '@velumx/sdk';
import { getConfig } from './config';

let clientInstance: VelumXClient | null = null;

export function getVelumXClient(): VelumXClient {
    if (!clientInstance) {
        const config = getConfig();
        clientInstance = new VelumXClient({
            network: config.stacksNetwork as 'mainnet' | 'testnet',
            paymasterUrl: '/api/velumx/proxy'
        });
    }
    return clientInstance;
}
