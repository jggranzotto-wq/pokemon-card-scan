import type { NextConfig } from "next";

const exporting = process.env.NEXT_OUTPUT_EXPORT === "1";

const remotePatterns = [
  { protocol: "https" as const, hostname: "images.pokemontcg.io" },
  { protocol: "https" as const, hostname: "assets.tcgdex.net" },
  { protocol: "https" as const, hostname: "i.ebayimg.com" },
  { protocol: "https" as const, hostname: "ebayimg.com" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(exporting
    ? {
        output: "export" as const,
        distDir: "www",
        images: { unoptimized: true, remotePatterns },
      }
    : {
        serverExternalPackages: ["tesseract.js"],
        images: { remotePatterns },
        async headers() {
          return [
            {
              source: "/tesseract/:path*",
              headers: [
                { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
                { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
              ],
            },
            {
              source: "/api/:path*",
              headers: [
                { key: "Access-Control-Allow-Origin", value: "*" },
                { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
                { key: "Access-Control-Allow-Headers", value: "Content-Type" },
              ],
            },
          ];
        },
      }),
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
