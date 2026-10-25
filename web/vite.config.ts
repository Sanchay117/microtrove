import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Deployment addresses live in ../deployments, shared with the keeper bot.
  server: { fs: { allow: [".."] } },
  base: "./",
  // viem and wagmi make up most of the single bundle.
  build: { chunkSizeWarningLimit: 800 },
});
