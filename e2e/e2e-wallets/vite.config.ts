import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deno from "@deno/vite-plugin";
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import "react";
import "react-dom";
import { fromFileUrl } from "jsr:@std/path";
import { join, dirname } from "node:path";

// This is a workaround to make the workspace imports work.
const walletPath = join(dirname(fromFileUrl(import.meta.url)), "../../packages/paima-sdk/wallets/");
const cryptoPath = join(dirname(fromFileUrl(import.meta.url)), "../../packages/paima-sdk/crypto/");
const dataTypesPath = join(dirname(fromFileUrl(import.meta.url)), "../shared/data-types/");
const concisePath = join(dirname(fromFileUrl(import.meta.url)), "../../packages/paima-sdk/concise/");
const configPath = join(dirname(fromFileUrl(import.meta.url)), "../../packages/paima-sdk/config/");
const utilsPath = join(dirname(fromFileUrl(import.meta.url)), "../../packages/paima-sdk/utils/");

// This is a mock for @paima/db so it doesn't get loaded in the browser.
const dbEmptyPath = join(dirname(fromFileUrl(import.meta.url)), "paima-db-empty.ts");

export default defineConfig({
  define: {
    "Deno": undefined,
  },
  resolve: {
    alias: {
      "@paima/utils": utilsPath + "src/mod.ts",
      "@paima/config": configPath + "src/mod.ts",
      "@paima/concise": concisePath + "src/mod.ts",
      "@paimaexample/crypto": cryptoPath + "src/mod.ts",
      "@paima/wallets": walletPath + "src/mod.ts",
      "@paima/crypto": cryptoPath + "src/mod.ts",
      "@e2e/data-types": dataTypesPath + "src/mod.ts",
      "@paima/db": dbEmptyPath,
    },
  },
  root: "./client",
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
    deno(),
    nodePolyfills(),
  ],

  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
});
