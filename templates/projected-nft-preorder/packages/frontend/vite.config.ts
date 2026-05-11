import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  root: "client",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "esnext",
  },
  server: {
    port: 10598,
    proxy: {
      "/api": "http://localhost:9999",
      "/health": "http://localhost:9999",
      "/yaci": {
        target: "http://localhost:10000",
        rewrite: (path) => path.replace(/^\/yaci/, ""),
      },
      "/dolos": {
        target: "http://localhost:3000",
        rewrite: (path) => path.replace(/^\/dolos/, ""),
      },
    },
  },
  resolve: {
    alias: {
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    exclude: ["@anastasia-labs/cardano-multiplatform-lib-browser"],
    include: ["buffer"],
  },
});
