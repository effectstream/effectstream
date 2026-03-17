import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import "react";
import "react-dom";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import wasm from "vite-plugin-wasm";
import { viteStaticCopy } from "vite-plugin-static-copy";

const projectRoot = dirname(fileURLToPath(import.meta.url));

// This is a workaround to make the workspace imports work.
const walletPath = join(dirname(fileURLToPath(import.meta.url)), "../../packages/effectstream-sdk/wallets/");
const cryptoPath = join(dirname(fileURLToPath(import.meta.url)), "../../packages/effectstream-sdk/crypto/");
const dataTypesPath = join(dirname(fileURLToPath(import.meta.url)), "../shared/data-types/");
const concisePath = join(dirname(fileURLToPath(import.meta.url)), "../../packages/effectstream-sdk/concise/");
const configPath = join(dirname(fileURLToPath(import.meta.url)), "../../packages/effectstream-sdk/config/");
const utilsPath = join(dirname(fileURLToPath(import.meta.url)), "../../packages/effectstream-sdk/utils/");

const midnightContractEip20Path = join(dirname(fileURLToPath(import.meta.url)), "../shared/contracts/midnight/contract-eip-20/src/managed/contract/");
const midnightContractCounterBasicPath = join(dirname(fileURLToPath(import.meta.url)), "../shared/contracts/midnight/contract-counter/src/managed/contract/");

// This is a mock for @effectstream/db so it doesn't get loaded in the browser.
const dbEmptyPath = join(dirname(fileURLToPath(import.meta.url)), "effectstream-db-empty.ts");

export default defineConfig({
  define: {
    "process.env.EFFECTSTREAM_ENV": JSON.stringify("local"),
    Deno: undefined,
    Bun: undefined,
  },
  sourcemap: true,
  resolve: {
    alias: {
      "@e2e/midnight-contract-eip-20/contract": midnightContractEip20Path + "index.js",
      "@e2e/midnight-contract-counter-basic/contract": midnightContractCounterBasicPath + "index.js",
      "@effectstream/utils/runtime": utilsPath + "src/runtime.ts",
      "@effectstream/utils": utilsPath + "src/mod.ts",
      "@effectstream/config": configPath + "src/mod.ts",
      "@effectstream/concise": concisePath + "src/mod.ts",
      "@effectstream/crypto": cryptoPath + "src/mod.ts",
      "@e2e/data-types/config-localhost": dataTypesPath + "src/config.ts",
      "@e2e/data-types/config-testnet": dataTypesPath + "src/config.testnet.ts",
      // Link to NPM compiled package version
      // "@effectstream/wallets": walletPath + "npm/esm/wallets/src/mod.js",
      // Link to source package version
      "@effectstream/wallets": walletPath + "src/mod.ts",
      "@e2e/data-types": dataTypesPath + "src/mod.ts",
      "@effectstream/db": dbEmptyPath,
    },
  },
  root: "./client",
  build: {
    target: "esnext",
    minify: false,
    sourcemap: true,
  },
  server: {
    port: 4001,
    open: true,
  },
  plugins: [
    wasm(),
    react(),
    nodePolyfills(),
    viteStaticCopy({
      targets: [
        {
          src: join(projectRoot, "../shared/contracts/midnight/contract-counter.undeployed.json"),
          dest: "contract_address",
          rename: "counter.undeployed.json",
        },
        {
          src: join(projectRoot, "../shared/contracts/midnight/contract-counter/src/managed/keys/*"),
          dest: "keys",
        },
        {
          src: join(projectRoot, "../shared/contracts/midnight/contract-counter/src/managed/zkir/*"),
          dest: "zkir",
        },
      ],
    }),
  ],

  optimizeDeps: {
    exclude: ["@midnight-ntwrk/onchain-runtime"],
    esbuildOptions: {
      target: "esnext",
    },
  },
});
