import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@encore/shared"],
  async redirects() {
    return [{ source: "/concerts/:path*", destination: "/live/:path*", permanent: true }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "static.tvmaze.com" },
      { protocol: "https", hostname: "*.dzcdn.net" },
    ],
  },
};

export default nextConfig;
