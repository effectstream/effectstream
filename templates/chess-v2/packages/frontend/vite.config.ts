import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import wasm from "vite-plugin-wasm";
import path from "node:path";

export default defineConfig({
  root: "./client",
  envDir: "..",
  resolve: {
    alias: {
      "@assets": path.resolve(__dirname, "./client/assets"),
      "npm:@sinclair/typebox@^0.34.41": "@sinclair/typebox",
      "npm:/@sinclair/typebox@^0.34.41/value": "@sinclair/typebox/value",
      "npm:@sinclair/typebox@^0.34.41/value": "@sinclair/typebox/value",
      "npm:/@sinclair/typebox@~0.34.41/value": "@sinclair/typebox/value",
      "npm:@sinclair/typebox@^0.34.30": "@sinclair/typebox",
      "npm:/@sinclair/typebox@^0.34.30/value": "@sinclair/typebox/value",
      "npm:@sinclair/typebox@^0.34.30/value": "@sinclair/typebox/value",
      "npm:/@sinclair/typebox@~0.34.30/value": "@sinclair/typebox/value",
      "npm:viem": "viem",
      "npm:viem/accounts": "viem/accounts",
      "npm:viem@2.37.3": "viem",
      "npm:viem@2.37.3/accounts": "viem/accounts",
      "npm:/viem@2.37.3/accounts": "viem/accounts",
      "npm:@foxglove/crc@^1.0.1": "@foxglove/crc",
    },
  },
  build: {
    target: "esnext",
    minify: false,
  },
  server: {
    port: 4001,
    open: true,
  },
  plugins: [
    react(),
    nodePolyfills(),
    wasm(),
  ],
});
