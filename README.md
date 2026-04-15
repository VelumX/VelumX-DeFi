# VelumX

> Universal Gasless Infrastructure for Stacks — Pay fees in any SIP-010 token, not STX.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Stacks](https://img.shields.io/badge/Stacks-v4.0.0-5546FF)](https://www.stacks.co/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

## What is VelumX?

VelumX v4 is a production-ready "Gasless-as-a-Service" platform that eliminates the need for users to hold STX tokens. By allowing users to pay transaction fees in any SIP-010 token (USDCx, sBTC, ALEX, etc.), VelumX enables seamless onboarding for Bitcoin DeFi.

## New in v4 (Protocol Upgrade)

- 🌍 **Agnostic Universal Executor** — The new `execute-gasless` function is fully agnostic. Developers can register **Custom Adapters** to execute any dApp logic while the user pays gas in self-selected tokens.
- ⚡ **Native Protocol Support** — Built-in support for **Velar** (`swap-velar-gasless`) and **ALEX** (`swap-gasless`) provides lightning-fast swaps with zero gas config.
- 🛠️ **High-level Protocol Helpers** — A simplified developer experience. Use protocol-specific helpers to generate call-ready configurations without managing Clarity tuples.
- 🛡️ **Adapter Management** — Manage your project's custom gateways directly on the dashboard's new **Infrastructure Suite**.

## The Solution

VelumX uses a universal paymaster pattern with multi-tenant sponsorship:
- **USER_PAYS Policy**: Users pay fees in SIP-010 tokens; developers collect the markup.
- **DEVELOPER_SPONSORS Policy**: Developers pay gas for their users (0 gas UX).
- **Agnostic Logic**: Execute swaps, bridge actions, or NFT mints gaslessly.

## Quick Start (SDK v4)

```bash
npm install @velumx/sdk
```

**Direct Protocol Integration:**

```typescript
import { VelumXClient } from '@velumx/sdk';

const velumx = new VelumXClient({ apiKey: 'YOUR_PROJECT_KEY', network: 'mainnet' });

// 1. Get transaction options for a Velar Swap
const options = velumx.getVelarSwapOptions({
  poolId: 1,
  tokenIn: 'USDC',
  tokenOut: 'STX',
  dx: 1000000,
  minDy: 980000,
  feeToken: 'ALEX',
  feeAmount: 50,
  relayer: 'SP...relayer-address' // Get from velumx.estimateFee()
});

// 2. Open standard wallet popup
await openContractCall(options);
```

## Integrated Infrastructure (Dashboard)

Managing your gasless stack is now handled in the unified **Relayer Suite** at [dashboard.velumx.xyz](https://dashboard.velumx.xyz):

1.  **Fund your Gas Tank**: Deposit STX to cover network fees.
2.  **Register Adapters**: Use the **Universal Executor** by registering your dApp's contract principals. 
3.  **Track Revenue**: View multi-tenant fee collections from your users in real-time.

## Technology Stack

- **Contracts**: Clarity (Stacks Bitcoin L2)
- **Relayer**: Node.js/TypeScript Engine
- **SDK**: Modern `@velumx/sdk` with versioned payloads
- **Dashboard**: Next.js 16 (App Router), Prisma, Supabase

## Deployed Contracts

| Component | Network | Principal |
|-----------|---------|-----------|
| **Paymaster v4** | Mainnet | `SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.simple-paymaster-v4` |
| **Paymaster v4** | Testnet | `STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.simple-paymaster-v4` |

## Documentation

- **[Developer's Guide](./DEVELOPERS_GUIDE.md)** - Register your first Adapter
- **[Agnostic Executor Spec](./TECHNICAL_DOCUMENTATION.md)** - v4 Trait requirements `(buff 1024)`

---

Built with ❤️ for the Stacks ecosystem by the VelumX Core Team.
