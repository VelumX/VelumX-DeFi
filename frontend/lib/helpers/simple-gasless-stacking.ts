/**
 * StackingDAO Helper
 * Standard Stacks contract calls — user pays STX gas via their wallet.
 * Gasless is not needed here: users already have STX (they got it via swap).
 */

export const STSTX_TOKEN = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token';

const STACKING_DAO_CORE = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stacking-dao-core-v6';
const RESERVE_V1        = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.reserve-v1';
const COMMISSION_V2     = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.commission-v2';
const STAKING_V0        = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.staking-v0';
const DIRECT_HELPERS_V4 = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.direct-helpers-v4';

export interface StackingDepositParams {
  userAddress: string;
  stxAmountMicro: string;
  onProgress?: (step: string) => void;
}

export interface StackingWithdrawParams {
  userAddress: string;
  stSTXAmountMicro: string;
  onProgress?: (step: string) => void;
}

function cv(principal: string) {
  const { Cl } = require('@stacks/transactions');
  const [addr, name] = principal.split('.');
  return Cl.contractPrincipal(addr, name);
}

/** Deposit STX → stSTX via wallet (user pays STX gas) */
export async function executeDeposit(params: StackingDepositParams): Promise<void> {
  const { userAddress, stxAmountMicro, onProgress } = params;
  const { Cl, uintCV, noneCV } = await import('@stacks/transactions');
  const { request } = await import('@stacks/connect');

  onProgress?.('Opening wallet...');

  const [contractAddress, contractName] = STACKING_DAO_CORE.split('.');

  const mkCV = (p: string) => {
    const [a, n] = p.split('.');
    return Cl.contractPrincipal(a, n);
  };

  await request('stx_callContract', {
    contract: STACKING_DAO_CORE,
    functionName: 'deposit',
    functionArgs: [
      mkCV(RESERVE_V1),
      mkCV(COMMISSION_V2),
      mkCV(STAKING_V0),
      mkCV(DIRECT_HELPERS_V4),
      uintCV(BigInt(stxAmountMicro)),
      noneCV(),
      noneCV(),
    ],
    network: 'mainnet',
    postConditionMode: 'allow',
  } as any);
}

/** Instant unstack stSTX → STX via wallet (user pays STX gas) */
export async function executeInstantUnstack(params: StackingWithdrawParams): Promise<void> {
  const { stSTXAmountMicro, onProgress } = params;
  const { Cl, uintCV } = await import('@stacks/transactions');
  const { request } = await import('@stacks/connect');

  onProgress?.('Opening wallet...');

  const mkCV = (p: string) => {
    const [a, n] = p.split('.');
    return Cl.contractPrincipal(a, n);
  };

  await request('stx_callContract', {
    contract: STACKING_DAO_CORE,
    functionName: 'withdraw-idle',
    functionArgs: [
      mkCV(RESERVE_V1),
      mkCV(DIRECT_HELPERS_V4),
      mkCV(COMMISSION_V2),
      mkCV(STAKING_V0),
      uintCV(BigInt(stSTXAmountMicro)),
    ],
    network: 'mainnet',
    postConditionMode: 'allow',
  } as any);
}
