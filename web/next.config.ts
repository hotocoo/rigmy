import type { NextConfig } from "next";

const API = process.env.RIGMY_API_URL ?? "http://localhost:8787";

const nextConfig: NextConfig = {
  // standalone: minimal server output for the Docker image (web/Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};

export default nextConfig;
