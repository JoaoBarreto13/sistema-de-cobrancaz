/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Required for Replit proxy (allows preview iframe and HMR)
  allowedDevOrigins: ['*.replit.dev', '*.replit.app', '127.0.0.1'],
}

export default nextConfig
