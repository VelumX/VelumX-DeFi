import type { Metadata } from "next";
import { Inter, Bungee } from "next/font/google";
import "./globals.css";

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
});

const bungee = Bungee({ 
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bungee",
});

export const metadata: Metadata = {
  metadataBase: new URL('https://velumx.xyz'),
  title: "VELUMX :: GASLESS BITCOIN DEFI",
  description: "VelumX is the high-performance gas abstraction layer for Stacks (Bitcoin L2). Experience seamless, gasless DeFi on the world's most secure network.",
  icons: {
    icon: "/velumx-icon.svg",
  },
  other: {
    "talentapp:project_verification": "2b263e85119495a047aec439e752251c6e186bb2f9d6fb57cd65c9880bcb99cc33ea0f63d85cc30d1f36bea175232d0110e575d5613a0ee4eb1d3f459aa30cab"
  },
  openGraph: {
    title: "VELUMX // GASLESS BITCOIN DEFI",
    description: "Launch gasless apps and experience the future of Bitcoin L2 DeFi.",
    url: "https://velumx.xyz",
    siteName: "VelumX",
    type: "website",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${bungee.variable}`}>
      <head>
        {/* Wallet Extension Conflict Defense: Ensures StacksProvider is configurable to prevent Leather/Xverse injection errors */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (!window.StacksProvider) {
                  Object.defineProperty(window, 'StacksProvider', {
                    value: {},
                    configurable: true,
                    enumerable: true,
                    writable: true
                  });
                }
              } catch (e) {
                console.warn("VelumX Wallet Defense: Handled provider injection conflict.");
              }
            `,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
