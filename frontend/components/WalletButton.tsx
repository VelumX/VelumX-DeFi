/**
 * WalletButton — Bridge page only
 * Shows RainbowKit ConnectButton (Ethereum) + StacksWalletButton side by side.
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
      {/* Ethereum — RainbowKit native modal */}
      <ConnectButton
        label="Connect Ethereum"
        accountStatus="address"
        chainStatus="none"
        showBalance={false}
      />

      {/* Stacks */}
      <StacksWalletButton />
    </div>
  );
}
