# VelumX Business Model

## 1. Overview
The VelumX business model is centered on providing value through gas abstraction and sponsorship on the Stacks blockchain. We operate a "Relayer-as-a-Service" model that charges a small fee for managing the complexity of transaction sponsorship.

## 2. Value Propositions
*   **For Users**: Pay zero STX for transactions; use native stablecoins (USDCx) for gas; seamless onboarding.
*   **For Developers**: Higher conversion and retention rates; 5-minute SDK integration; deep analytics on user behavior.
*   **For Ecosystem**: Faster adoption of Stacks DeFi and bridge infrastructure.

## 3. Revenue Streams

### 3.1 Paymaster Fee Markup
The primary revenue stream comes from an 8% markup on the gas cost calculated in USDCx.
*   **How it works**: When a user pays for a transaction in USDCx, VelumX calculates the equivalent STX gas cost, adds an 8% margin, and collects the total in USDCx.
*   **Value justification**: Covers the risk of STX price volatility, relayer infrastructure costs, and platform development.

### 3.2 Premium Sponsorship Tiers (Future)
Subscription-based model for dApps that want to offer 100% sponsored (zero-fee) transactions to their users.
*   **Tier 1 (Pro)**: Fixed monthly fee + cost of gas. Includes priority processing and increased rate limits.
*   **Tier 2 (Enterprise)**: Custom pricing for high-volume dApps, dedicated relayer nodes, and white-label SDKs.

### 3.3 Institutional API Access
Fees for providing low-latency, high-reliability API access to institutional players who need to execute large volumes of gasless transactions.

## 4. Cost Structure
*   **Gas Inventory**: Maintaining a reserve of STX to pay for sponsored transactions.
*   **Relayer Infrastructure**: Servers, monitoring, and security for the Node.js/Express relayer fleet.
*   **Data Services**: Costs for blockchain indexing and real-time price feeds (CoinGecko API).
*   **Development**: Continued R&D for SDK improvements and smart contract audits.

## 5. Key Metrics (KPIs)
*   **Total Relayed Transactions (TRT)**: The total volume of gasless transactions processed.
*   **Active Developer Keys (ADK)**: Number of unique dApps actively using the SDK.
*   **Fee Efficiency**: The spread between STX paid and USDCx collected.
*   **User Retention**: Comparing the retention of users on dApps with gasless vs. gas-required flows.

## 6. Strategic Partners
*   **Wallets**: Partnering with Xverse and Leather to provide native gasless options in the user's wallet UI.
*   **Bridges**: Integrating with cross-chain bridges to offer gasless entry points to Stacks.
*   **Stablecoin Issuers**: Collaborating with USDC issuers to ensure deep liquidity for USDCx.

## 7. Scaling Strategy
*   **Automation**: Shifting from manual STX rebalancing to automated liquidity management for relayers.
*   **Multi-Token Support**: Expanding fee payments to sBTC, ALEX, and other popular SIP-010 tokens.
*   **Decentralization**: Eventually allowing third-party relayer nodes to join the network and earn a share of the markup fee.
