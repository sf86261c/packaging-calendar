import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: [
      '@base-ui/react',
      'recharts',
      'lucide-react',
      'date-fns',
    ],
  },
};

export default nextConfig;
