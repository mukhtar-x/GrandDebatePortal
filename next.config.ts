import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  // Receipt OCR loads its worker script and WASM by path, so it must not be bundled,
  // and the files must be shipped with the API functions that run it.
  serverExternalPackages: ["tesseract.js"],
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/tesseract.js/src/**/*",
      "./node_modules/tesseract.js-core/*.{js,wasm}",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
