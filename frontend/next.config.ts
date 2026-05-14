import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@stacks/connect', '@stacks/transactions', '@stacks/network', '@stacks/common', '@stacks/wallet-sdk', 'bip39'],

  // Enable React strict mode for better development warnings
  reactStrictMode: true,

  // Compress responses with gzip
  compress: true,

  // Proxy Bitflow API calls through Next.js to avoid CORS restrictions.
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

  // Security and caching headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Aggressively cache static assets
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Cache SVG icons and public assets
        source: '/(.*\\.svg|.*\\.ico|.*\\.png|.*\\.webp)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
    ];
  },

  // Allow external images from crypto logo providers
  images: {
    // Use modern formats for better compression
    formats: ['image/avif', 'image/webp'],
    // Minimise layout shift with sensible device sizes
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
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

  // Empty turbopack config — satisfies Next.js 16's Turbopack-first build
  // and silences the "webpack config with no turbopack config" error.
  turbopack: {},
};

export default nextConfig;
