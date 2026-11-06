import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // All sign-in happens through the Google button on the landing page.
    return ["/sign-in", "/forgot-password", "/reset-password"].map((source) => ({
      source,
      destination: "/",
      permanent: true,
    }));
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.crackd.ai",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.almostcrackd.ai",
        port: "",
        pathname: "/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
