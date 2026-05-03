/**
 * Wagmi + RainbowKit configuration for Ethereum wallet connections.
 * Supports: MetaMask, OKX, Rabby, Coinbase, Rainbow, WalletConnect, and any
 * injected EIP-6963 wallet automatically.
 */

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  okxWallet,
  rabbyWallet,
  coinbaseWallet,
  rainbowWallet,
  walletConnectWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { mainnet } from 'wagmi/chains';

// WalletConnect Cloud project ID — free at https://cloud.walletconnect.com
// Falls back to a placeholder so the build never fails; WalletConnect modal
// simply won't work until a real ID is set in .env.local
const WC_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'velumx_placeholder_id';

export const wagmiConfig = getDefaultConfig({
  appName: 'VelumX',
  projectId: WC_PROJECT_ID,
  chains: [mainnet],
  ssr: true,
  wallets: [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        okxWallet,
        rabbyWallet,
        coinbaseWallet,
        rainbowWallet,
        walletConnectWallet,
        injectedWallet,
      ],
    },
  ],
});
