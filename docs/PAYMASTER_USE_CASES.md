# VelumX Paymaster - Universal Use Cases

## Overview

The VelumX paymaster pattern can be used for **ANY transaction on Stacks**. Any smart contract can be made gasless-compatible by accepting a fee in USDCx and using Stacks' native `sponsored` transaction flag.

## How It Works

### The Pattern

```clarity
(define-public (your-gasless-function
    ;; Your function parameters
    (param1 uint)
    (param2 principal)
    ;; Paymaster parameters
    (fee-usdcx uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    ;; 1. Transfer fee from user to relayer (user pays in USDCx)
    (try! (contract-call? fee-token transfer 
      fee-usdcx tx-sender relayer none))
    
    ;; 2. Your contract logic
    (try! (your-business-logic param1 param2))
    
    (ok true)
  )
)
```

### Key Requirements

1. **Accept fee parameter**: `fee-usdcx uint`
2. **Accept relayer address**: `relayer principal`
3. **Accept fee token trait**: `fee-token <sip-010-trait>`
4. **Transfer fee first**: Before executing logic
5. **Use sponsored flag**: When calling from frontend

---

## Supported Use Cases

### ✅ Currently Implemented

#### 1. Bridge (Ethereum ↔ Stacks)
```clarity
(define-public (bridge-gasless 
    (amount uint) 
    (recipient (buff 32))
    (fee-usdcx uint)
    (relayer principal)
    (token-trait <sip-010-trait>))
  (begin
    (try! (contract-call? token-trait transfer fee-usdcx tx-sender relayer none))
    (try! (contract-call? .usdcx-v1 burn amount u0 recipient))
    (ok true)
  )
)
```

**Use Case**: Withdraw USDCx from Stacks to Ethereum without needing STX

#### 2. Token Swaps
```clarity
(define-public (swap-gasless
    (token-in-principal principal)
    (token-out-principal principal)
    (amount-in uint)
    (min-out uint)
    (fee-usdcx uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    (try! (contract-call? fee-token transfer fee-usdcx tx-sender relayer none))
    ;; Execute swap logic
    (ok true)
  )
)
```

**Use Case**: Swap tokens without holding STX

---

### 🚀 Can Be Implemented

#### 3. Token Transfers (Send/Receive)
```clarity
(define-public (transfer-gasless
    (amount uint)
    (sender principal)
    (recipient principal)
    (token <sip-010-trait>)
    (fee-usdcx uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    ;; Pay fee
    (try! (contract-call? fee-token transfer fee-usdcx tx-sender relayer none))
    
    ;; Transfer tokens
    (try! (contract-call? token transfer amount sender recipient none))
    
    (ok true)
  )
)
```

**Use Case**: Send any SIP-010 token without needing STX

**Frontend Integration**:
```typescript
const result = await openContractCall({
  contractAddress: 'YOUR_CONTRACT',
  contractName: 'token-transfer',
  functionName: 'transfer-gasless',
  functionArgs: [
    Cl.uint(1000000),  // 1 token
    Cl.principal(senderAddress),
    Cl.principal(recipientAddress),
    Cl.principal(tokenAddress),
    Cl.uint(estimate.maxFeeUSDCx),
    Cl.principal(relayerAddress),
    Cl.principal(usdcxAddress)
  ],
  sponsored: true,
  network: 'testnet'
});
```

#### 4. NFT Minting
```clarity
(define-public (mint-nft-gasless
    (recipient principal)
    (token-id uint)
    (fee-usdcx uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    ;; Pay fee
    (try! (contract-call? fee-token transfer fee-usdcx tx-sender relayer none))
    
    ;; Mint NFT
    (try! (nft-mint? my-nft token-id recipient))
    
    (ok true)
  )
)
```

**Use Case**: Mint NFTs without needing STX

**Frontend Integration**:
```typescript
const result = await openContractCall({
  contractAddress: 'YOUR_NFT_CONTRACT',
  contractName: 'my-nft',
  functionName: 'mint-nft-gasless',
  functionArgs: [
    Cl.principal(recipientAddress),
    Cl.uint(tokenId),
    Cl.uint(estimate.maxFeeUSDCx),
    Cl.principal(relayerAddress),
    Cl.principal(usdcxAddress)
  ],
  sponsored: true,
  network: 'testnet'
});
```

#### 5. NFT Transfers
```clarity
(define-public (transfer-nft-gasless
    (token-id uint)
    (sender principal)
    (recipient principal)
    (fee-usdcx uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    ;; Pay fee
    (try! (contract-call? fee-token transfer fee-usdcx tx-sender relayer none))
    
    ;; Transfer NFT
    (try! (nft-transfer? my-nft token-id sender recipient))
    
    (ok true)
  )
)
```

**Use Case**: Transfer NFTs without needing STX

#### 6. Staking
```clarity
(define-public (stake-gasless
    (amount uint)
    (fee-usdcx uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    ;; Pay fee
    (try! (contract-call? fee-token transfer fee-usdcx tx-sender relayer none))
    
    ;; Stake tokens
    (try! (stake-tokens amount tx-sender))
    
    (ok true)
  )
)
```

**Use Case**: Stake tokens without needing STX

#### 7. Governance Voting
```clarity
(define-public (vote-gasless
    (proposal-id uint)
    (vote bool)
    (fee-usdcx uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    ;; Pay fee
    (try! (contract-call? fee-token transfer fee-usdcx tx-sender relayer none))
    
    ;; Cast vote
    (try! (cast-vote proposal-id vote tx-sender))
    
    (ok true)
  )
)
```

**Use Case**: Vote on proposals without needing STX

#### 8. DeFi Operations

**Lending/Borrowing**:
```clarity
(define-public (borrow-gasless
    (amount uint)
    (collateral uint)
    (fee-usdcx uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    (try! (contract-call? fee-token transfer fee-usdcx tx-sender relayer none))
    (try! (borrow-with-collateral amount collateral tx-sender))
    (ok true)
  )
)
```

**Yield Farming**:
```clarity
(define-public (farm-gasless
    (pool-id uint)
    (amount uint)
    (fee-usdcx uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    (try! (contract-call? fee-token transfer fee-usdcx tx-sender relayer none))
    (try! (deposit-to-farm pool-id amount tx-sender))
    (ok true)
  )
)
```

---

## Implementation Guide

### For Contract Developers

#### Step 1: Add Paymaster Parameters

Add these parameters to your public functions:
```clarity
(fee-usdcx uint)
(relayer principal)
(fee-token <sip-010-trait>)
```

#### Step 2: Transfer Fee First

Always transfer the fee before executing your logic:
```clarity
(try! (contract-call? fee-token transfer 
  fee-usdcx tx-sender relayer none))
```

#### Step 3: Execute Your Logic

Continue with your normal contract logic:
```clarity
(try! (your-function-logic ...))
```

### For Frontend Developers

#### Step 1: Estimate Fee

```typescript
import { getVelumXClient } from '@velumx/sdk';

const velumx = getVelumXClient();
const estimate = await velumx.estimateFee({
  estimatedGas: 100000  // Adjust based on your function
});
```

#### Step 2: Call Contract with sponsored=true

```typescript
import { openContractCall } from '@stacks/connect';
import { Cl } from '@stacks/transactions';

const result = await openContractCall({
  contractAddress: 'YOUR_CONTRACT_ADDRESS',
  contractName: 'your-contract',
  functionName: 'your-gasless-function',
  functionArgs: [
    // Your function args
    Cl.uint(yourParam),
    // Paymaster args
    Cl.uint(estimate.maxFeeUSDCx),
    Cl.principal('STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P'),  // Relayer
    Cl.principal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx')  // Fee token
  ],
  sponsored: true,  // Enable gasless mode
  network: 'testnet',
  onFinish: async (data) => {
    const tx = await velumx.submitRawTransaction(data.txRaw);
    console.log(`Transaction: ${tx.txid}`);
  }
});
```

---

## Benefits by Use Case

### For Users
- ✅ No need to acquire STX
- ✅ Pay fees in the token they already have (USDCx)
- ✅ Simplified onboarding
- ✅ Better UX

### For Developers
- ✅ Increase user adoption
- ✅ Reduce onboarding friction
- ✅ Competitive advantage
- ✅ Easy integration (3 lines of code)

### For the Ecosystem
- ✅ Lower barrier to entry
- ✅ More DeFi activity
- ✅ Better user retention
- ✅ Mainstream adoption

---

## Limitations

### Current Limitations

1. **Fee Token**: Currently only supports USDCx
   - **Future**: Support any SIP-010 token

2. **Network**: Currently testnet only
   - **Future**: Mainnet deployment after audit

3. **Relayer Capacity**: Limited by relayer STX balance
   - **Future**: Multiple relayers, auto-funding

### Technical Limitations

1. **Contract Modification Required**: Existing contracts need to add paymaster support
   - **Workaround**: Create wrapper contracts

2. **Fee Estimation**: Requires accurate gas estimation
   - **Solution**: SDK provides estimation helper

---

## Real-World Examples

### Example 1: NFT Marketplace

```typescript
// Mint NFT without STX
async function mintNFT(tokenId: number) {
  const velumx = getVelumXClient();
  const estimate = await velumx.estimateFee({ estimatedGas: 120000 });
  
  await openContractCall({
    contractAddress: 'SP2X0TZ59D5SZ8ACQ6YMCHHNR2ZN51Z32E2CJ173.nft-marketplace',
    contractName: 'my-nft',
    functionName: 'mint-nft-gasless',
    functionArgs: [
      Cl.principal(userAddress),
      Cl.uint(tokenId),
      Cl.uint(estimate.maxFeeUSDCx),
      Cl.principal(relayerAddress),
      Cl.principal(usdcxAddress)
    ],
    sponsored: true,
    network: 'testnet'
  });
}
```

### Example 2: Token Transfer

```typescript
// Send tokens without STX
async function sendTokens(recipient: string, amount: string) {
  const velumx = getVelumXClient();
  const estimate = await velumx.estimateFee({ estimatedGas: 80000 });
  
  await openContractCall({
    contractAddress: 'SP2X0TZ59D5SZ8ACQ6YMCHHNR2ZN51Z32E2CJ173.token-transfer',
    contractName: 'transfer-helper',
    functionName: 'transfer-gasless',
    functionArgs: [
      Cl.uint(parseUnits(amount, 6)),
      Cl.principal(userAddress),
      Cl.principal(recipient),
      Cl.principal(tokenAddress),
      Cl.uint(estimate.maxFeeUSDCx),
      Cl.principal(relayerAddress),
      Cl.principal(usdcxAddress)
    ],
    sponsored: true,
    network: 'testnet'
  });
}
```

### Example 3: Governance Voting

```typescript
// Vote without STX
async function vote(proposalId: number, support: boolean) {
  const velumx = getVelumXClient();
  const estimate = await velumx.estimateFee({ estimatedGas: 90000 });
  
  await openContractCall({
    contractAddress: 'SP2X0TZ59D5SZ8ACQ6YMCHHNR2ZN51Z32E2CJ173.dao',
    contractName: 'governance',
    functionName: 'vote-gasless',
    functionArgs: [
      Cl.uint(proposalId),
      Cl.bool(support),
      Cl.uint(estimate.maxFeeUSDCx),
      Cl.principal(relayerAddress),
      Cl.principal(usdcxAddress)
    ],
    sponsored: true,
    network: 'testnet'
  });
}
```

---

## FAQ

### Q: Can I use this for my existing contract?
**A:** Yes! Either modify your contract to add paymaster support, or create a wrapper contract.

### Q: What if my contract is already deployed?
**A:** Create a new wrapper contract that calls your existing contract and adds paymaster support.

### Q: Can users pay fees in tokens other than USDCx?
**A:** Currently only USDCx is supported. Future versions will support any SIP-010 token including:
- **sBTC** (Bitcoin on Stacks) - High priority
- **STX** (Native token)
- **ALEX** (DeFi token)
- **Any SIP-010 token**

The paymaster pattern is token-agnostic - any SIP-010 token can be used for fees.

### Q: How much does it cost?
**A:** Fees are calculated in real-time based on STX/USD rates with an 8% markup. Typically 0.001-0.01 USDCx per transaction.

### Q: Is there a limit on transaction types?
**A:** No! Any Stacks transaction can be made gasless using this pattern.

---

## Conclusion

The VelumX paymaster pattern is **universal** and can be applied to:
- ✅ Token transfers
- ✅ Token swaps
- ✅ NFT minting
- ✅ NFT transfers
- ✅ Bridge operations
- ✅ Staking
- ✅ Governance
- ✅ DeFi operations
- ✅ Any custom contract logic

The key is using Stacks' native `sponsored` transaction flag and having contracts accept fees in USDCx instead of requiring users to hold STX.

---

**Ready to make your dApp gasless?**

1. Visit [https://velum-x-ssum.vercel.app](https://velum-x-ssum.vercel.app)
2. Generate an API key
3. Install `@velumx/sdk`
4. Start building!
