import type { NextConfig } from "next";

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8020")
  .trim()
  .replace(/^['"]|['"]$/g, "")
  .replace(/\s+/g, "");

const nextConfig: NextConfig = {
  devIndicators: false,
  // OpenAPI production environment: Frontend 3020, Backend 8020 by default.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
