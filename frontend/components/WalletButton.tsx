/**
 * WalletButton — Bridge page only
 * Shows RainbowKit ConnectButton (Ethereum) + StacksWalletButton (Stacks).
 * Both buttons are sized identically so they look like a matched pair.
 */

'use client';

import dynamic from 'next/dynamic';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const StacksWalletButton = dynamic(
  () => import('./StacksWalletButton').then((m) => m.StacksWalletButton),
  { ssr: false },
);

export function WalletButton() {
  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Ethereum — RainbowKit native modal, accent colour set to #2563EB in EthereumProvider */}
      <ConnectButton
        label="Connect Ethereum"
        accountStatus="address"
        chainStatus="none"
        showBalance={false}
      />

      {/* Stacks — styled to match RainbowKit button height/radius/weight */}
      <StacksWalletButton />
    </div>
  );
}
