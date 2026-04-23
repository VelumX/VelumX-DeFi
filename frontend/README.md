# VelumX DeFi

> A gasless DeFi frontend on Stacks — swap tokens and bridge assets without holding STX.

---

## Overview

VelumX DeFi is the reference implementation of the VelumX RaaS platform. It demonstrates how to build a production DeFi application where users never need STX for gas fees.

**What it showcases:**
- Gasless Bitflow swaps (stableswap pools + multi-hop routes) via `DEVELOPER_SPONSORS` and `USER_PAYS`
- Gasless USDCx bridge (Stacks → Ethereum) via Circle xReserve
- The `velumx-defi-paymaster-v1` contract as a reference for USER_PAYS fee collection
- Full integration with `@velumx/sdk` and the VelumX Relayer

This frontend is also a **developer reference** — the code shows exactly how to integrate VelumX into a real DeFi application.

---

## Features

| Feature | Policy | Description |
| :--- | :--- | :--- |
| Bitflow Swap | DEVELOPER_SPONSORS / USER_PAYS | Swap any Bitflow-listed token pair gaslessly |
| USDCx Bridge | USER_PAYS | Bridge USDCx back to Ethereum, fee paid in USDCx |
| Stacking | DEVELOPER_SPONSORS | Stake STX via StackingDAO gaslessly |
| Liquidity | DEVELOPER_SPONSORS | Add/remove Bitflow liquidity gaslessly |

---

## Tech Stack

- **Framework**: Next.js 16 + React 19
- **Stacks**: `@stacks/transactions`, `@stacks/connect`
- **DeFi**: `@bitflowlabs/core-sdk`, `alex-sdk`
- **Gasless**: `@velumx/sdk`
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
NEXT_PUBLIC_VELUMX_PAYMASTER_ADDRESS=SP...velumx-defi-paymaster-v1
NEXT_PUBLIC_STACKS_USDCX_ADDRESS=SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx-v1
```

### Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture

### Gasless Flow

```
User (no STX)
      ↓
VelumX DeFi Frontend
      ↓  build sponsored tx (Bitflow swap / USDCx bridge)
      ↓  user signs via stx_signTransaction
      ↓  POST /api/velumx/proxy/sponsor (secure proxy)
VelumX Relayer
      ↓  co-signs as fee-payer
      ↓  broadcasts to Stacks
Stacks Network
```

### Sponsorship Policies

**DEVELOPER_SPONSORS** (default for most actions):
- Relayer pays STX gas
- User pays nothing
- Transaction calls the protocol contract directly (Bitflow, StackingDAO, etc.)

**USER_PAYS** (for Bitflow swaps and USDCx bridge):
- User pays a small fee in aeUSDC or USDCx
- Transaction calls `velumx-defi-paymaster-v1` which atomically collects the fee and executes the action
- Relayer still pays STX gas

### Key Files

```
lib/
├── bitflow.ts                    — Bitflow SDK initialization
├── velumx.ts                     — VelumXClient initialization
├── config.ts                     — Environment config
├── helpers/
│   ├── bitflow-gasless-swap.ts   — Bitflow swap (both policies)
│   ├── simple-gasless-bridge.ts  — USDCx bridge (USER_PAYS)
│   ├── simple-gasless-swap.ts    — ALEX swap (DEVELOPER_SPONSORS)
│   ├── simple-gasless-stacking.ts — StackingDAO (DEVELOPER_SPONSORS)
│   └── simple-gasless-liquidity.ts — Bitflow LP (DEVELOPER_SPONSORS)
```

---

## Reference Paymaster Contract

The `velumx-defi-paymaster-v1` contract deployed by VelumX is the reference implementation for USER_PAYS. It supports:

- All Bitflow stableswap pools (STX/stSTX, aeUSDC/sUSDT, USDA/aeUSDC, aBTC/xBTC)
- All Bitflow multi-hop router contracts
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
