# Developer's Guide: Integrating VelumX

Welcome to VelumX! This guide will help you integrate gasless transactions into your Stacks dApp using our Native Sponsorship infrastructure. 

> [!NOTE]
> **No Smart Wallets Required**: Unlike traditional Account Abstraction, VelumX uses Stacks' native sponsorship. Users don't need to deploy a smart wallet; they can use their existing Leather, Xverse, or OKX wallets immediately.

---

## 1. Setup & Configuration

### Get your API Key
Log in to the [VelumX Dashboard](https://dashboard.velumx.com) and create a new project to generate your `API_KEY`.

### Fund your Relayer Node
On your Dashboard, you will see a unique **Relayer Node Address** (Hot Wallet). 
1. This wallet is uniquely derived for you using our Master Key system.
2. **Action Required**: You must send a small amount of STX to this address to "fill your gas tank." This STX will be used to pay for your users' transactions.

---

## 2. Install the SDK

Add the VelumX SDK to your project:

```bash
npm install @velumx/sdk
```

---

## 3. Integration Patterns

### A. Secure Production Pattern (Recommended)
For production, initialize the SDK using a **Secure Proxy**. This ensures your `velumx_live_` API key is never exposed to the client.

```typescript
import { VelumXClient } from '@velumx/sdk';

const velumx = new VelumXClient({
  paymasterUrl: '/api/velumx/proxy', // Point to your backend route
  network: 'mainnet'
});

// Request sponsorship and report your dApp fee for revenue tracking
const result = await velumx.sponsor(signedTxHex, {
  feeAmount: '250000', // e.g. 0.25 USDCx fee collected by your dApp
  userId: 'user_A123'  // Link to your internal user for dashboard tracking
});

console.log(`Gas Sponsored! TXID: ${result.txid}`);
```

### B. Direct SDK Pattern (Development Only)
You can connect directly to the relayer during local development.

```typescript
const velumx = new VelumXClient({
  apiKey: 'vx_...',
  paymasterUrl: 'https://relayer.velumx.com/api/v1',
  network: 'testnet'
});
```

---

## 4. Sponsorship Policies

VelumX supports two primary sponsorship models managed via the **Project Settings** in your Dashboard.

### A. USER_PAYS Policy (Default)
In this model, the **user pays a fee** in a SIP-010 token (e.g., USDCx, ALEX, sBTC) to compensate the relayer for the gas fee.
- **UX**: User sees a small token fee in the confirmation UI.
- **Revenue**: You can collect a markup on top of the gas cost.
- **Requirement**: User must hold the selected `feeToken`.

### B. DEVELOPER_SPONSORS Policy (Zero-Gas UX)
In this model, the **developer pays 100% of the gas** using their Relayer's STX balance. The user pays nothing.
- **UX**: Pure "Gasless" experience—user pays $0.00 and 0 tokens.
- **Growth**: Ideal for onboarding new users who hold no assets yet.
- **Requirement**: Your Relayer Node must have sufficient STX balance.

---

## 5. 🔐 Security: The Proxy Architecture

**CRITICAL**: In production, your API key must stay on the server. Implement a Proxy Route in your backend (Next.js, Express, etc.) to securely communicate with VelumX.

#### Next.js Proxy Example (`/api/velumx/proxy/[...path]/route.ts`)
```typescript
export async function POST(req: Request, { params }) {
  const { path } = params;
  const apiKey = process.env.VELUMX_API_KEY; 
  const targetUrl = `https://relayer.velumx.com/api/v1/${path.join('/')}`;

  const body = await req.json();
  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return Response.json(await response.json());
}
```

---

## 6. Understanding Revenue & Fees

The transaction flow depends on your selected **Sponsorship Policy**:

### With USER_PAYS (Revenue Model)
1. **User Pays Fee**: The user pays your dApp's specific fee (e.g. 0.25 USDCx) as part of their transaction logic.
2. **SDK Reports Fee**: When you call `.sponsor(txHex, { feeAmount: '250000' })`, the SDK reports this volume to the Relayer.
3. **Dashboard Analytics**: The Relayer matches your API Key to the reported fee. Your **USDCx Revenue** chart on the dashboard will update in real-time.
4. **Relayer Pays Gas**: The relayer node uses its STX to broadcast the transaction.

### With DEVELOPER_SPONSORS (Growth Model)
1. **User Pays Nothing**: The `feeAmount` is automatically ignored or set to `0` by the Relayer logic.
2. **Zero-Token UX**: The user's wallet confirmation will show a total cost of 0 tokens and 0 STX.
3. **Gas Expenditure**: Each transaction consumes a small amount of STX (typically 0.005 STX) from your Relayer Node's balance.
4. **Volume Tracking**: Your Dashboard will track the **number of sponsored transactions** and total STX spent instead of token revenue.

---

## 7. Wallet Management

You can export your Relayer's **Private Key** from the Dashboard at any time. This gives you full custody of your sponsorship funds and allows you to sweep the wallet or use it in standard Stacks wallets like Leather or Xverse.
