# VelumX Future Roadmap

> Strategic vision and development roadmap for VelumX gasless infrastructure

**Last Updated**: March 2026  
**Version**: 1.0

---

## Table of Contents

1. [Vision](#vision)
2. [Phase 1: Foundation (Q2 2026)](#phase-1-foundation-q2-2026)
3. [Phase 2: Embedded Wallets (Q3 2026)](#phase-2-embedded-wallets-q3-2026)
4. [Phase 3: Ecosystem Expansion (Q4 2026)](#phase-3-ecosystem-expansion-q4-2026)
5. [Phase 4: Enterprise & Scale (Q1 2027)](#phase-4-enterprise--scale-q1-2027)
6. [Long-Term Vision (2027+)](#long-term-vision-2027)

---

## Vision

**Make Stacks DeFi as easy as using a traditional app**

VelumX aims to eliminate all blockchain complexity for end users while providing powerful infrastructure for developers. Our vision includes:

- 🎯 **Zero Friction Onboarding** - Users sign in with email, no wallet installation needed
- ⚡ **Gasless Everything** - Pay fees in any token, not just native tokens
- 🔐 **Enterprise Security** - Bank-grade key management and recovery
- 🌍 **Universal Access** - Works on web, mobile, and any platform
- 🛠️ **Developer First** - Simple APIs, comprehensive docs, great DX

---

## Phase 1: Foundation (Q2 2026)

### Status: ✅ COMPLETED

#### Achievements

- ✅ Simple paymaster contract deployed
- ✅ VelumX SDK published to npm (`@velumx/sdk@2.0.0`)
- ✅ Relayer service operational
- ✅ Developer dashboard with API keys
- ✅ DeFi reference app (bridge, swap, liquidity)
- ✅ 150+ successful transactions on testnet
- ✅ 98.5% success rate

#### Technical Stack

- Smart Contracts: Clarity (Stacks)
- SDK: TypeScript
- Backend: Node.js + Express
- Frontend: Next.js 16 + React 19
- Database: PostgreSQL (Supabase)
- Auth: Supabase Auth

---

## Phase 2: Embedded Wallets (Q3 2026)

### Status: 🚧 PLANNED

### Overview

**Goal**: Enable users to access Stacks dApps with just an email - no wallet installation required.

Inspired by [Privy](https://privy.io), we'll implement embedded wallet generation where users sign in with email/social and automatically get a Stacks wallet generated from their Supabase UUID.

### Key Features

#### 2.1 Email-to-Wallet Generation

**User Flow**:
```
1. User visits dApp
2. Clicks "Sign in with Email"
3. Enters email → Receives verification code
4. Verifies email
5. ✨ Stacks wallet automatically created
6. User can immediately use dApp (no STX needed!)
```

**Technical Implementation**:
```typescript
// Generate deterministic wallet from Supabase UUID
async function generateWalletFromUUID(userId: string): Promise<Wallet> {
  // 1. Derive seed from Supabase UUID + app secret
  const seed = await deriveSeed(userId, APP_SECRET);
  
  // 2. Generate Stacks wallet
  const wallet = await generateWallet({
    secretKey: seed,
    network: 'mainnet'
  });
  
  // 3. Encrypt private key with user password (optional)
  const encryptedKey = await encrypt(wallet.privateKey, userPassword);
  
  // 4. Store encrypted key in Supabase
  await supabase.from('wallets').insert({
    user_id: userId,
    address: wallet.address,
    encrypted_key: encryptedKey,
    created_at: new Date()
  });
  
  return wallet;
}
```

#### 2.2 Social Login Integration

Support multiple authentication methods:
- ✅ Email (magic link)
- ✅ Google OAuth
- ✅ GitHub OAuth
- 🔜 Twitter OAuth
- 🔜 Discord OAuth
- 🔜 Apple Sign In

#### 2.3 Key Management

**Security Architecture**:
```
┌─────────────────────────────────────────────┐
│         User Authentication                  │
│  (Email, Google, GitHub, etc.)              │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│      Supabase Auth (User ID)                │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│   Deterministic Key Derivation              │
│   • HKDF (HMAC-based KDF)                   │
│   • Input: User ID + App Secret             │
│   • Output: Wallet Seed                     │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│      Stacks Wallet Generation               │
│   • Private Key                             │
│   • Public Key                              │
│   • Stacks Address                          │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│    Encrypted Storage (Supabase)             │
│   • AES-256-GCM encryption                  │
│   • User-specific encryption key            │
│   • Secure key rotation                     │
└─────────────────────────────────────────────┘
```

**Key Features**:
- 🔐 **Deterministic Generation**: Same user ID always generates same wallet
- 🔒 **Encrypted Storage**: Private keys encrypted at rest
- 🔑 **User Control**: Optional password for additional security
- 🔄 **Key Recovery**: Email-based recovery flow
- 📱 **Multi-Device**: Access wallet from any device

#### 2.4 Recovery Mechanisms

**Email Recovery**:
```
1. User forgets password
2. Clicks "Recover Wallet"
3. Receives recovery email
4. Verifies identity
5. Sets new password
6. Wallet access restored
```

**Social Recovery** (Future):
```
1. User designates 3 trusted contacts
2. If locked out, contacts receive recovery requests
3. 2 of 3 must approve
4. Wallet access restored
```

#### 2.5 SDK Integration

**For Developers**:
```typescript
import { VelumXAuth } from '@velumx/sdk';

// Initialize embedded wallet auth
const auth = new VelumXAuth({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  network: 'mainnet'
});

// Sign in with email
const { user, wallet } = await auth.signInWithEmail('user@example.com');

console.log(`User: ${user.email}`);
console.log(`Wallet: ${wallet.address}`);

// Use wallet for transactions
const tx = await wallet.signTransaction(unsignedTx);
```

**For Users**:
```typescript
// In your dApp
<VelumXAuthButton
  onSuccess={(user, wallet) => {
    console.log('Signed in!');
    console.log('Wallet:', wallet.address);
  }}
  providers={['email', 'google', 'github']}
/>
```

### Benefits

#### For Users
- ✅ **No Wallet Installation** - Just sign in with email
- ✅ **No Seed Phrases** - No need to write down 12 words
- ✅ **Familiar UX** - Like signing into any app
- ✅ **Multi-Device** - Access from anywhere
- ✅ **Gasless** - Combined with paymaster, zero friction

#### For Developers
- ✅ **Higher Conversion** - 10x more users complete onboarding
- ✅ **Simple Integration** - 5 lines of code
- ✅ **Better Retention** - Users don't lose access
- ✅ **Mobile Ready** - Works on iOS/Android

#### For Ecosystem
- ✅ **Mass Adoption** - Mainstream users can access Stacks
- ✅ **Competitive Edge** - Best UX in crypto
- ✅ **Developer Growth** - More dApps built on Stacks

### Timeline

**Q3 2026**:
- Month 1: Core wallet generation + encryption
- Month 2: Email auth + social login
- Month 3: Recovery mechanisms + SDK

### Success Metrics

- 🎯 1,000+ embedded wallets created
- 🎯 50+ dApps integrated
- 🎯 <30 seconds onboarding time
- 🎯 95%+ user retention

---

## Phase 3: Ecosystem Expansion (Q4 2026)

### 3.1 Multi-Token Fee Support

**Current**: Fees only in USDCx  
**Future**: Fees in any SIP-010 token

**Supported Tokens**:
- ✅ **USDCx** - Stablecoin (current)
- 🔜 **sBTC** - Bitcoin on Stacks (high priority)
- 🔜 **STX** - Native Stacks token
- 🔜 **ALEX** - DeFi token
- 🔜 **Any SIP-010** - Custom tokens

```typescript
// Pay fees in sBTC
const estimate = await velumx.estimateFee({
  estimatedGas: 100000,
  feeToken: 'sBTC'
});

console.log(`Fee: ${estimate.maxFeeSBTC} satoshis`);
// Example: Fee: 1200 satoshis (0.000012 BTC)

// Execute transaction
await openContractCall({
  functionArgs: [
    // ... your args
    Cl.uint(estimate.maxFeeSBTC),
    Cl.principal(relayerAddress),
    Cl.principal('SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929N0V.sbtc')
  ],
  sponsored: true
});
```

**Why sBTC?**
- Bitcoin-native (Stacks is Bitcoin L2)
- High liquidity
- User preference for BTC holdings
- No stablecoin risk

### 3.2 Additional DEX Integrations

- ✅ Velar (current)
- 🔜 ALEX
- 🔜 Arkadiko
- 🔜 StackSwap
- 🔜 Bitflow

### 3.3 Cross-Chain Expansion

**Target Chains**:
- Bitcoin L2s (Stacks, RSK, Liquid)
- Ethereum L2s (Arbitrum, Optimism, Base)
- Other chains (Solana, Polygon)

**Vision**: Universal gasless infrastructure across all chains

### 3.4 Mobile SDK

```typescript
// React Native SDK
import { VelumXMobile } from '@velumx/mobile-sdk';

const velumx = new VelumXMobile({
  platform: 'ios', // or 'android'
  network: 'mainnet'
});

// Biometric authentication
const wallet = await velumx.authenticateWithBiometrics();
```

### 3.5 Advanced Features

**Transaction Batching**:
```typescript
// Execute multiple transactions with one signature
const batch = await velumx.createBatch([
  { type: 'swap', params: {...} },
  { type: 'stake', params: {...} },
  { type: 'vote', params: {...} }
]);

await batch.execute(); // One signature, three transactions
```

**Scheduled Transactions**:
```typescript
// Schedule transaction for future execution
await velumx.scheduleTransaction({
  transaction: swapTx,
  executeAt: new Date('2026-12-31'),
  conditions: {
    minPrice: 100,
    maxSlippage: 0.5
  }
});
```

---

## Phase 4: Enterprise & Scale (Q1 2027)

### 4.1 Enterprise Features

**White-Label Solution**:
```typescript
// Custom branding for enterprises
const velumx = new VelumXEnterprise({
  branding: {
    logo: 'your-logo.png',
    colors: { primary: '#FF0000' },
    domain: 'wallet.yourcompany.com'
  }
});
```

**Compliance Tools**:
- KYC/AML integration
- Transaction monitoring
- Regulatory reporting
- Audit trails

**SLA Guarantees**:
- 99.99% uptime
- <100ms response time
- 24/7 support
- Dedicated relayers

### 4.2 Governance Token

**$VELUM Token**:
- Governance voting
- Fee discounts
- Staking rewards
- Protocol revenue sharing

**Use Cases**:
- Vote on protocol upgrades
- Propose new features
- Stake for reduced fees
- Earn from protocol revenue

### 4.3 Decentralized Relayer Network

**Current**: Single relayer  
**Future**: Decentralized network of relayers

```
┌─────────────────────────────────────────────┐
│      Decentralized Relayer Network          │
├─────────────────────────────────────────────┤
│                                              │
│  Relayer 1 (US-East)    ◄──┐               │
│  Relayer 2 (EU-West)    ◄──┼── Load        │
│  Relayer 3 (Asia-Pacific) ◄┘   Balancer    │
│                                              │
│  • Geographic distribution                   │
│  • Automatic failover                        │
│  • Stake-based selection                     │
│  • Slashing for misbehavior                  │
└─────────────────────────────────────────────┘
```

### 4.4 Advanced Analytics

**Developer Dashboard**:
- Real-time transaction monitoring
- Cost analysis and optimization
- User behavior analytics
- Performance metrics
- Custom alerts

**User Dashboard**:
- Transaction history
- Fee tracking
- Portfolio analytics
- Tax reporting

---

## Phase 5: Long-Term Vision (2027+)

### 5.1 AI-Powered Features

**Smart Fee Optimization**:
```typescript
// AI predicts optimal fee based on network conditions
const optimalFee = await velumx.ai.optimizeFee({
  urgency: 'medium',
  budget: 'low'
});
```

**Transaction Intent**:
```typescript
// Natural language transaction execution
await velumx.ai.execute("Swap 100 USDC for STX at best price");
```

### 5.2 Account Abstraction 2.0

**Programmable Accounts**:
- Spending limits
- Multi-sig support
- Session keys
- Automated strategies

**Social Recovery**:
- Guardian-based recovery
- Time-locked operations
- Emergency contacts

### 5.3 Institutional Infrastructure

**Custody Solutions**:
- MPC (Multi-Party Computation)
- Hardware security modules
- Insurance coverage
- Regulatory compliance

**High-Volume Support**:
- Dedicated infrastructure
- Priority processing
- Custom SLAs
- White-glove support

### 5.4 Interoperability

**Universal Wallet**:
- One wallet for all chains
- Cross-chain transactions
- Unified balance view
- Chain abstraction

**Bridge Aggregation**:
- Best route selection
- Lowest fees
- Fastest execution
- Maximum security

---

## Development Priorities

### High Priority (Next 6 Months)

1. ✅ **Embedded Wallets** - Email-to-wallet generation
2. ✅ **Social Login** - Google, GitHub, Twitter
3. ✅ **Mobile SDK** - React Native support
4. ✅ **Multi-Token Fees** - Pay in any token
5. ✅ **Security Audit** - Professional audit

### Medium Priority (6-12 Months)

1. 🔜 **Governance Token** - $VELUM launch
2. 🔜 **Decentralized Relayers** - Network of relayers
3. 🔜 **Cross-Chain** - Expand to other chains
4. 🔜 **Enterprise Features** - White-label, compliance
5. 🔜 **Advanced Analytics** - Better dashboards

### Low Priority (12+ Months)

1. 🔮 **AI Features** - Smart optimization
2. 🔮 **Account Abstraction 2.0** - Programmable accounts
3. 🔮 **Institutional** - Custody, high-volume
4. 🔮 **Interoperability** - Universal wallet

---

## Success Metrics

### 2026 Goals

- 📈 **10,000+ Embedded Wallets** created
- 📈 **100+ dApps** integrated
- 📈 **$10M+ Volume** processed
- 📈 **99.9% Uptime** maintained
- 📈 **50+ Developers** contributing

### 2027 Goals

- 📈 **100,000+ Wallets** created
- 📈 **1,000+ dApps** integrated
- 📈 **$100M+ Volume** processed
- 📈 **99.99% Uptime** maintained
- 📈 **Multi-chain** support

---

## Community & Ecosystem

### Developer Community

- 📚 **Documentation** - Comprehensive guides
- 🎓 **Tutorials** - Video courses
- 💬 **Discord** - Active community
- 🏆 **Hackathons** - Regular events
- 💰 **Grants** - Developer funding

### Partnerships

**Target Partners**:
- Wallet providers (Xverse, Leather, Hiro)
- DEXs (Velar, ALEX, Arkadiko)
- NFT marketplaces
- DeFi protocols
- Infrastructure providers

### Marketing

- 🎯 **Developer Outreach** - Conferences, workshops
- 📱 **Social Media** - Twitter, Discord, Telegram
- 📝 **Content** - Blog posts, case studies
- 🎬 **Video** - Tutorials, demos
- 🎤 **Podcasts** - Interviews, discussions

---

## Conclusion

VelumX is building the future of blockchain UX. By combining gasless transactions with embedded wallets, we're creating an experience that's:

- ✅ **As easy as Web2** - Sign in with email
- ✅ **As powerful as Web3** - Full blockchain capabilities
- ✅ **As secure as banks** - Enterprise-grade security
- ✅ **As fast as possible** - Optimized performance

**Our mission**: Make Stacks DeFi accessible to everyone, everywhere.

---

## Get Involved

### For Developers
- 📦 Install SDK: `npm install @velumx/sdk`
- 📚 Read docs: [docs.velumx.com](https://docs.velumx.com)
- 🔑 Get API key: [https://velum-x-ssum.vercel.app](https://velum-x-ssum.vercel.app)

### For Users
- 🌐 Try the app: [app.velumx.com](https://app.velumx.com)
- 💬 Join Discord: [discord.gg/velumx](https://discord.gg/velumx)
- 🐦 Follow Twitter: [@VelumX](https://twitter.com/velumx)

### For Investors
- 📧 Contact: partnerships@velumx.com
- 📊 Pitch deck: [Available on request]

---

**Last Updated**: March 2026  
**Next Review**: June 2026  
**Version**: 1.0
