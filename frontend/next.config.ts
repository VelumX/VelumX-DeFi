import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@stacks/connect', '@stacks/transactions', '@stacks/network', '@stacks/common', '@stacks/wallet-sdk', 'bip39'],

  // Proxy Bitflow API calls through Next.js to avoid CORS restrictions.
  // The Bitflow SDK is configured to use /api/bitflow as its host, and these
  // rewrites forward the requests server-side to the real Bitflow endpoints.
  async rewrites() {
    return [
      {
        source: '/api/bitflow/:path*',
        destination: 'https://api.bitflowapis.finance/:path*',
      },
      {
        source: '/api/bitflow-node/:path*',
        destination: 'https://node.bitflowapis.finance/:path*',
      },
    ];
  },
  
  // Allow external images from crypto logo providers
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cryptologos.cc',
        pathname: '/logos/**',
      },
      {
        protocol: 'https',
        hostname: 'assets.coingecko.com',
        pathname: '/coins/images/**',
      },
      {
        protocol: 'https',
        hostname: '**.githubusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
