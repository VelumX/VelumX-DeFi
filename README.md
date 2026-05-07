# VelumX DeFi

> A gasless DeFi frontend on Stacks — swap tokens and bridge assets without holding STX.

---

## Overview

VelumX DeFi is the reference implementation of the VelumX RaaS platform. It demonstrates how to build a production DeFi application where users never need STX for gas fees.

**What it showcases:**
- Gasless Bitflow swaps (stableswap pools + multi-hop routes) via `DEVELOPER_SPONSORS` and `USER_PAYS`
- Gasless USDCx bridge (Stacks → Ethereum) via Circle xReserve
- The `velumx-defi-paymaster-v1-1` contract as a reference for USER_PAYS fee collection
- Full integration with `@velumx/sdk` and the VelumX Relayer

This frontend is also a **developer reference** — the code shows exactly how to integrate VelumX into a real DeFi application.

---

## Features

| Feature | Policy | Description |
| :--- | :--- | :--- |
| Bitflow Swap | DEVELOPER_SPONSORS / USER_PAYS | Swap any Bitflow-listed token pair gaslessly |
| USDCx Bridge | USER_PAYS | Bridge USDCx back to Ethereum, fee paid in USDCx |
| Stacking | DEVELOPER_SPONSORS | Stake STX via StackingDAO gaslessly |

---

## Tech Stack

- **Framework**: Next.js 16 + React 19
- **Stacks**: `@stacks/transactions`, `@stacks/connect`
- **DeFi**: `@bitflowlabs/core-sdk`, `alex-sdk`
- **Gasless**: `@velumx/sdk@^3.1.2`
- **Wallets**: Leather, Xverse (via `@stacks/connect`)
- **Ethereum**: Wagmi + Viem (for bridge source chain)

---

## Getting Started

### Prerequisites

- Node.js 18+
- A VelumX API key from [dashboard.velumx.xyz](https://dashboard.velumx.xyz)

### Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
# VelumX
NEXT_PUBLIC_VELUMX_API_URL=https://api.velumx.xyz
VELUMX_API_KEY=vx_...                          # server-side only
NEXT_PUBLIC_VELUMX_RELAYER_ADDRESS=SP...       # your project's relayer address

# Stacks
NEXT_PUBLIC_STACKS_NETWORK=mainnet
NEXT_PUBLIC_STACKS_API_URL=https://api.mainnet.hiro.so

# Contracts
NEXT_PUBLIC_VELUMX_PAYMASTER_ADDRESS=SP...velumx-defi-paymaster-v1-1
NEXT_PUBLIC_STACKS_USDCX_ADDRESS=SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx-v1
```

### Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## VelumX SDK Integration

This project uses `@velumx/sdk@^3.1.2`. The two exports used throughout the codebase are:

```ts
import { VelumXClient, buildSponsoredContractCall } from '@velumx/sdk';
```

### Client Initialization

`VelumXClient` is instantiated once as a singleton and reused across all helpers. The `paymasterUrl` points to a Next.js API route that proxies requests to the VelumX Relayer, keeping the API key server-side.

```ts
// lib/velumx.ts
import { VelumXClient } from '@velumx/sdk';

let clientInstance: VelumXClient | null = null;

export function getVelumXClient(): VelumXClient {
  if (!clientInstance) {
    clientInstance = new VelumXClient({
      network: 'mainnet',
      paymasterUrl: '/api/velumx/proxy',
    });
  }
  return clientInstance;
}
```

### Sponsorship Policies

**DEVELOPER_SPONSORS** — relayer pays STX gas, user pays nothing. The transaction calls the protocol contract directly (Bitflow, ALEX, etc.).

**USER_PAYS** — user pays a small fee in a SIP-010 token (aeUSDC or USDCx). The transaction calls `velumx-defi-paymaster-v1` which atomically collects the fee and executes the action. The relayer still pays STX gas.

The active policy is returned by `velumx.estimateFee()` and the helpers branch on it at runtime:

```ts
const estimate = await velumx.estimateFee({
  feeToken: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.aeusdc',
  estimatedGas: 250_000,
});

const isDeveloperSponsoring = estimate.policy === 'DEVELOPER_SPONSORS';
```

### DEVELOPER_SPONSORS Flow (Bitflow / ALEX swaps)

For `DEVELOPER_SPONSORS`, the transaction is built directly against the protocol contract using `makeUnsignedContractCall` from `@stacks/transactions` (or `buildSponsoredContractCall` for Bitflow routes). The wallet signs without broadcasting, then the relayer co-signs and broadcasts.

```ts
import { buildSponsoredContractCall } from '@velumx/sdk';
import { request } from '@stacks/connect';

// 1. Build the unsigned sponsored tx
const unsignedTx = await buildSponsoredContractCall({
  contractAddress: resolvedContractAddress,
  contractName: resolvedContractName,
  functionName: swapParams.functionName,
  functionArgs: swapParams.functionArgs,
  publicKey,
  nonce,
  network: 'mainnet',
});

// 2. Wallet signs — no broadcast
const signResult = await request('stx_signTransaction', {
  transaction: unsignedTx,
  broadcast: false,
});

// 3. Relayer co-signs + broadcasts (pays STX gas)
const { txid } = await velumx.sponsor(signResult.transaction);
```

See `lib/helpers/bitflow-gasless-swap.ts` for the full Bitflow implementation, including mainnet contract address resolution for the Bitflow SDK's simnet/testnet deployer addresses.

### USER_PAYS Flow (Bitflow swaps + USDCx bridge)

For `USER_PAYS`, the transaction targets `velumx-defi-paymaster-v1`. The paymaster atomically collects the fee token from the user and executes the underlying action. The fee amount and relayer address come from `estimateFee`.

```ts
import { buildSponsoredContractCall } from '@velumx/sdk';
import { uintCV, principalCV, contractPrincipalCV, bufferCV } from '@stacks/transactions';
import { request } from '@stacks/connect';

const estimate = await velumx.estimateFee({
  feeToken: config.stacksUsdcxAddress,
  estimatedGas: 150_000,
});

// 1. Build call to the paymaster contract
const unsignedTx = await buildSponsoredContractCall({
  contractAddress: paymasterAddr,
  contractName: paymasterName,
  functionName: 'bridge-usdcx',
  functionArgs: [
    uintCV(amountInMicro),                          // amount to bridge
    bufferCV(recipientBuf),                         // 32-byte Ethereum recipient
    uintCV(BigInt(estimate.maxFee)),                // fee-amount
    principalCV(estimate.relayerAddress!),          // relayer receives the fee
    contractPrincipalCV(feeTokenAddr, feeTokenName),// fee-token (USDCx)
  ],
  publicKey,
  nonce,
  network: 'mainnet',
});

// 2. Wallet signs — no broadcast
const signResult = await request('stx_signTransaction', {
  transaction: unsignedTx,
  broadcast: false,
});

// 3. Relayer co-signs + broadcasts
const { txid } = await velumx.sponsor(signResult.transaction, {
  feeToken: config.stacksUsdcxAddress,
  feeAmount: estimate.maxFee,
  network: 'mainnet',
});
```

See `lib/helpers/simple-gasless-bridge.ts` for the bridge and `lib/helpers/bitflow-gasless-swap.ts` for the USER_PAYS Bitflow swap path.

### Secure API Proxy

The `VelumXClient` never calls the VelumX Relayer directly from the browser. All relayer requests go through `/api/velumx/proxy`, a Next.js route handler that injects the `VELUMX_API_KEY` server-side. This keeps the key out of the client bundle.

---

## Architecture

### Gasless Flow

```
User (no STX)
      ↓
VelumX DeFi Frontend
      ↓  build sponsored tx (Bitflow swap / USDCx bridge)
      ↓  user signs via stx_signTransaction (broadcast: false)
      ↓  POST /api/velumx/proxy/sponsor (secure proxy)
VelumX Relayer
      ↓  co-signs as fee-payer
      ↓  broadcasts to Stacks
Stacks Network
```

### Key Files

```
lib/
├── velumx.ts                     — VelumXClient singleton initialization
├── bitflow.ts                    — Bitflow SDK initialization
├── config.ts                     — Environment config
├── helpers/
│   ├── bitflow-gasless-swap.ts   — Bitflow swap (DEVELOPER_SPONSORS + USER_PAYS)
│   ├── simple-gasless-bridge.ts  — USDCx bridge (USER_PAYS via paymaster)
│   ├── simple-gasless-swap.ts    — ALEX swap (DEVELOPER_SPONSORS + USER_PAYS)
│   ├── simple-gasless-stacking.ts — StackingDAO (standard wallet tx)
│   └── simple-gasless-liquidity.ts — Bitflow LP (DEVELOPER_SPONSORS)
```

---

## Reference Paymaster Contract

The `velumx-defi-paymaster-v1-1` contract deployed by VelumX is the reference implementation for USER_PAYS. It supports:

- All Bitflow stableswap pools (STX/stSTX, aeUSDC/sUSDT, USDA/aeUSDC, aBTC/xBTC)
- All Bitflow multi-hop router contracts
- Velar XYK and stableswap routers (via dedicated wrapper functions)
- USDCx bridge (burn for cross-chain withdrawal)

Developers building their own USER_PAYS integration should copy this contract as a template. See [VelumX Contracts](https://github.com/velumx/contracts) for the source.

---

## Deployment

The frontend is deployed on Vercel. See `vercel.json` for configuration.

```bash
npm run build
vercel deploy
```

---

Built with ❤️ by the VelumX team
