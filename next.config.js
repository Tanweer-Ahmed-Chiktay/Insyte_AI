/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
  // Only expose safe, non-sensitive environment variables to client-side
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable built-in WebSocket server since we're using custom server
  experimental: {
    serverComponentsExternalPackages: ['ws']
  },
  // Webpack configuration for WebSocket and Redis
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        dns: false,
        'node:timers/promises': false,
        'node:tls': false,
        'node:net': false,
        'node:dns': false,
        'node:fs': false,
      };
    }
    return config;
  },
}

module.exports = nextConfig