import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "../lib/hooks/useWallet";
import { PolyfillProvider } from "@/components/providers/PolyfillProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false, // Only preload the primary font
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

const APP_URL = 'https://app.velumx.xyz';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "VelumX — Gas-Free DeFi on Bitcoin L2",
    template: "%s | VelumX",
  },
  description: "VelumX is a gas-abstraction protocol on Stacks (Bitcoin L2). Swap tokens, bridge assets, and earn BTC yield — all without holding STX for gas. Pay fees in USDCx.",
  keywords: [
    "VelumX", "DeFi", "Bitcoin L2", "Stacks", "gasless", "gas-free",
    "USDCx", "STX", "swap", "bridge", "stSTX", "stacking", "BTC yield",
    "Proof of Transfer", "PoX", "Ethereum bridge", "crypto swap",
  ],
  authors: [{ name: "VelumX Lab", url: APP_URL }],
  creator: "VelumX Lab",
  publisher: "VelumX Lab",
  category: "Finance",
  applicationName: "VelumX",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/velumx-icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/velumx-icon.svg",
    apple: "/velumx-icon.svg",
  },
  openGraph: {
    title: "VelumX — Gas-Free DeFi on Bitcoin L2",
    description: "Swap, bridge, and earn on Stacks without paying gas in STX. VelumX lets you pay fees in USDCx for a seamless DeFi experience.",
    url: APP_URL,
    siteName: "VelumX",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "VelumX — Gas-Free DeFi on Bitcoin L2",
    description: "Swap, bridge, and earn on Stacks without paying gas in STX. Pay fees in USDCx.",
    creator: "@velumx",
    site: "@velumx",
  },
  alternates: {
    canonical: APP_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "VelumX",
    "url": APP_URL,
    "description": "Gas-free DeFi on Bitcoin L2. Swap tokens, bridge assets, and earn BTC yield on Stacks without paying gas in STX.",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
    },
    "creator": {
      "@type": "Organization",
      "name": "VelumX Lab",
      "url": APP_URL,
    },
  };

  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/velumx-icon.svg" type="image/svg+xml" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
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
