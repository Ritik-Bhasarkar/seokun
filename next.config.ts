import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lighthouse and Playwright pull in native + dynamic-require modules that
  // can't be bundled by Turbopack/webpack. Mark them as server-side externals
  // so they're loaded at runtime via Node's require().
  serverExternalPackages: ["lighthouse", "playwright", "chromium-bidi"],
};

export default nextConfig;
