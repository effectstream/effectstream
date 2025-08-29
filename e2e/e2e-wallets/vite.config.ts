import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deno from "@deno/vite-plugin";
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import "react";
import "react-dom";
import { fromFileUrl } from "jsr:@std/path";
import { join, dirname } from "node:path";

const walletPath = join(dirname(fromFileUrl(import.meta.url)), "../../packages/paima-sdk/wallets/");
const cryptoPath = join(dirname(fromFileUrl(import.meta.url)), "../../packages/paima-sdk/crypto/");

export default defineConfig({
  resolve: {
    alias: {
      "@paima/wallets": walletPath + "src/mod.ts",
      "@paima/crypto": cryptoPath + "src/mod.ts",
    },
  },
  root: "./client",
  build: {
    target: "esnext",
    minify: false,
    // sourcemap: true,
  },
  server: {
    port: 4001,
    open: true,
  },
  plugins: [
    react(),
    deno(),
    nodePolyfills(),
  ],

  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
});
