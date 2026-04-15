/**
 * ALEX LP Helper
 * Standard Stacks contract calls — user pays STX gas via their wallet.
 * Gasless is not needed here: users already have STX (they got it via swap).
 */

const AMM_POOL = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.amm-swap-pool-v1-1';

export interface AddLiquidityParams {
  tokenXPrincipal: string;  // full contract principal e.g. SP3K8BC0...token-wstx
  tokenYPrincipal: string;
  factor: string;           // 1e8 units
  poolToken: string;        // LP token principal
  dx: string;               // tokenX in 1e8 units
  maxDy: string;            // max tokenY in 1e8 units
  onProgress?: (step: string) => void;
}

export interface RemoveLiquidityParams {
  tokenXPrincipal: string;
  tokenYPrincipal: string;
  factor: string;
  poolToken: string;
  percent: string;          // 1e8 = 100%
  onProgress?: (step: string) => void;
}

/** Add liquidity to ALEX pool via wallet (user pays STX gas) */
export async function executeAddLiquidity(params: AddLiquidityParams): Promise<void> {
  const { tokenXPrincipal, tokenYPrincipal, factor, poolToken, dx, maxDy, onProgress } = params;
  const { Cl, uintCV, someCV } = await import('@stacks/transactions');
  const { request } = await import('@stacks/connect');

  onProgress?.('Opening wallet...');

  const mkCV = (p: string) => {
    const [a, n] = p.split('.');
    return Cl.contractPrincipal(a, n);
  };

  await request('stx_callContract', {
    contract: AMM_POOL,
    functionName: 'add-to-position',
    functionArgs: [
      mkCV(tokenXPrincipal),
      mkCV(tokenYPrincipal),
      uintCV(BigInt(factor)),
      mkCV(poolToken),
      uintCV(BigInt(dx)),
      someCV(uintCV(BigInt(maxDy))),
    ],
    network: 'mainnet',
    postConditionMode: 'allow',
  } as any);
}

/** Remove liquidity from ALEX pool via wallet (user pays STX gas) */
export async function executeRemoveLiquidity(params: RemoveLiquidityParams): Promise<void> {
  const { tokenXPrincipal, tokenYPrincipal, factor, poolToken, percent, onProgress } = params;
  const { Cl, uintCV } = await import('@stacks/transactions');
  const { request } = await import('@stacks/connect');

  onProgress?.('Opening wallet...');

  const mkCV = (p: string) => {
    const [a, n] = p.split('.');
    return Cl.contractPrincipal(a, n);
  };

  await request('stx_callContract', {
    contract: AMM_POOL,
    functionName: 'reduce-position',
    functionArgs: [
      mkCV(tokenXPrincipal),
      mkCV(tokenYPrincipal),
      uintCV(BigInt(factor)),
      mkCV(poolToken),
      uintCV(BigInt(percent)),
    ],
    network: 'mainnet',
    postConditionMode: 'allow',
  } as any);
}

/** Resolve ALEX Currency ID → contract principal */
export async function resolveTokenPrincipal(tokenId: string): Promise<string> {
  if (tokenId === 'token-wstx') return 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-wstx';
  const { AlexSDK } = await import('alex-sdk');
  const alex = new AlexSDK();
  const tokens = await alex.fetchSwappableCurrency() as any[];
  const match = tokens.find(t => t.id === tokenId);
  if (!match) throw new Error(`Token not found in ALEX: ${tokenId}`);
  return (match.wrapToken || match.underlyingToken || '').split('::')[0];
}
