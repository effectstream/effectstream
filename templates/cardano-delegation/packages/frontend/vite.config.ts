import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import nodePolyfills from "vite-plugin-node-stdlib-browser";

export default defineConfig({
  root: "./client",
  envDir: "..",
  resolve: {
    alias: {
      "npm:@sinclair/typebox@^0.34.41": "@sinclair/typebox",
      "npm:/@sinclair/typebox@^0.34.41/value": "@sinclair/typebox/value",
      "npm:@sinclair/typebox@^0.34.30": "@sinclair/typebox",
      "npm:viem": "viem",
      "npm:viem/accounts": "viem/accounts",
      "npm:viem@2.37.3": "viem",
    },
  },
  build: {
    target: "esnext",
    minify: false,
  },
  plugins: [
    nodePolyfills({
      overrides: {
        fs: "memfs",
        "node:fs": "memfs",
      },
    }),
    wasm(),
    react(),
  ],
});
