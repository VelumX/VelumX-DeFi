import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "../lib/hooks/useWallet";
import { PolyfillProvider } from "@/components/providers/PolyfillProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://app.velumx.xyz'),
  title: "VelumX - Gas-Free DeFi on Bitcoin L2",
  description: "VelumX is a Gas-Abstraction protocol on Stacks (Bitcoin L2) that enables gasless transactions. Pay fees in USDCx instead of STX for seamless DeFi experiences including bridging, swaps, and more.",
  icons: {
    icon: "/velumx-icon.svg",
    shortcut: "/velumx-icon.svg",
    apple: "/velumx-icon.svg",
  },
  openGraph: {
    title: "VelumX - Gas-Free DeFi on Bitcoin L2",
    description: "Pay transaction fees in USDCx instead of STX. Experience truly gasless DeFi on Stacks.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VelumX - Gas-Free DeFi on Bitcoin L2",
    description: "Pay transaction fees in USDCx instead of STX. Experience truly gasless DeFi on Stacks.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/velumx-icon.svg" type="image/svg+xml" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PolyfillProvider>
          <WalletProvider>
            {children}
          </WalletProvider>
        </PolyfillProvider>
      </body>
    </html>
  );
}
