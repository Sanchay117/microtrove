import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Deployment addresses live in ../deployments, shared with the keeper bot.
  server: { fs: { allow: [".."] } },
  // Pre-bundle the lazily loaded Bitcoin wallet code too, so `vite dev` does not reload
  // the page the first time someone connects a Bitcoin wallet.
  optimizeDeps: {
    include: [
      "@mezo-org/orangekit",
      "buffer",
      "@mezo-org/orangekit/dist/src/wallet/unisat/icon.js",
      "@mezo-org/orangekit/dist/src/wallet/okx/icon.js",
      "@mezo-org/orangekit/dist/src/wallet/xverse/icon.js",
    ],
  },
  base: "./",
  // viem and wagmi make up most of the main bundle. Mezo Passport's Bitcoin wallet
  // support loads in its own chunk, only when someone uses a Bitcoin wallet.
  build: { chunkSizeWarningLimit: 800 },
});
