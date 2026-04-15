# Buidl Battle 2 - Project Submission: VelumX

## 1. Project Information
**Project Name**: VelumX  
**Tagline**: Gasless Transaction Infrastructure for the Stacks/Bitcoin Ecosystem.  
**Category**: All Buidls / Bitcoin Builders  
**Bounty Tracks**: Best Use of USDCx (Circle), Most Innovative Use of sBTC (Stacks - Roadmap)

## 2. One-Line Pitch
VelumX eliminates the "Gas Fee" friction on Stacks by allowing users to pay transaction fees in USDCx or through developer-sponsored transactions.

## 3. Project Description
VelumX is a high-performance Relayer-as-a-Service and SDK designed for the Stacks layer 2. We address the primary barrier to user onboarding in the Bitcoin ecosystem: the requirement to hold native STX tokens for every on-chain interaction.

By implementing a **Stacks-native Paymaster pattern**, VelumX decouples the transaction originator from the fee payer. This allows new users (e.g., those who just bridged USDC from Ethereum) to interact with DeFi protocols, NFT marketplaces, and bridges without needing to acquire STX first.

### Key Features:
*   **Paymaster Model**: Users pay for fees in USDCx, Alexandria (ALEX), or other SIP-010 tokens.
*   **100% Sponsorship**: Developers can choose to sponsor user transactions for a pure "Web2-like" login and use experience.
*   **VelumX SDK**: A simple, powerful integration for developers to enable gasless flows in minutes.
*   **Deterministic Relayer Nodes**: Secure multi-tenancy using HMAC-SHA256 sub-key derivation for data isolation.

## 4. Problem & Solution
**The Problem**: New users entering the Stacks/Bitcoin ecosystem often arrive with external assets (like USDC) but no native STX. They are unable to perform their first swap or bridge without first going to a centralized exchange to buy STX, creating a massive drop-off in the conversion funnel.

**The Solution**: VelumX provides the "plumbing" for gasless interactions. Our relayer pays the STX gas on behalf of the user, while our smart contract (simple-paymaster-v1) collects a small, equivalent fee in USDCx from the user atomically.

## 5. Technical Architecture
*   **Smart Contracts**: Written in Clarity, utilizing Stacks' native `sponsored` transaction flag (Auth Type 0x04).
*   **Relayer Service**: A robust Node.js/Express service built with **Stacks.js**, responsible for fee calculation (using real-time STX/USD rates), transaction signing, and broadcasting.
*   **SDK**: A TypeScript library built on top of **Stacks.js** that abstracts the complexity of SIP-018 signing and sponsorship submission.
*   **Security Model**: Inherits the security of Bitcoin through Stacks' **Proof of Transfer (PoX)** consensus mechanism, ensuring all sponsored transactions are settled with Bitcoin finality.

## 6. How it uses Stacks / Bitcoin
VelumX is built exclusively for the Stacks network to scale the Bitcoin economy. We leverage the unique "Sponsored Transaction" capability of the Stacks protocol, which is more efficient than the "Smart Wallet" abstraction (ERC-4337) required on other chains. Our roadmap includes integrating **sBTC** as a primary gas sponsorship asset, further deepening our alignment with the Bitcoin L2 vision.

## 7. Working Demo
**Live Dashboard**: [https://velum-x-ssum.vercel.app](https://velum-x-ssum.vercel.app)  
**Relayer API**: [https://sgal-relayer.onrender.com](https://sgal-relayer.onrender.com)  

## 8. Code Repository
**GitHub**: [https://github.com/leprofcode/VelumX](https://github.com/leprofcode/VelumX) (Update with your actual repo link)

## 9. Pitch Video
**Watch on YouTube**: [Your Video Link Here]  
*(Refer to `video/VIDEO_SCRIPT.md` for the production script used for this submission.)*

## 10. Future Roadmap
*   **Mainnet Launch**: Moving beyond the 150+ successful testnet transactions.
*   **sBTC Integration**: Powering the sBTC ecosystem with native gas sponsorship.
*   **Multi-Currency Support**: Expanding fee payment options to include all major SIP-010 tokens.
*   **Decentralized Relayer Network**: Transitioning to a permissionless relayer fleet.
