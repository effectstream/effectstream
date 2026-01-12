import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deno from "@deno/vite-plugin";
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import wasm from "vite-plugin-wasm";
import "react";
import "react-dom";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { normalizePath } from "vite";
import path from "node:path";

export default defineConfig({
  root: "./client",

  resolve: {
    alias: {
      // Fix for: Module "npm:@scope/package@version" has been externalized for browser compatibility.
      //          Cannot access "npm:@scope/package@version.__esModule" in client code
      "npm:@polkadot/extension-dapp@^0.61.7": "@polkadot/extension-dapp",
      "npm:@foxglove/crc@^1.0.1": "@foxglove/crc",
      "./@polkadot/util": "npm:@polkadot/util-crypto",
      "./@polkadot/util-crypto": "npm:@polkadot/util-crypto",
      "npm:@polkadot/util-crypto@^13.4.3": "@polkadot/util-crypto",
      "npm:@polkadot/util@^13.4.3": "@polkadot/util",
      "npm:@polkadot/util-crypto@^13.5.6": "@polkadot/util-crypto",
      "npm:@polkadot/util@^13.5.6": "@polkadot/util",
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
      "npm:@dcspark/cip34-js@3.0.1": "@dcspark/cip34-js",
      "npm:@dcspark/carp-client@^3.3.0": "@dcspark/carp-client",
      "npm:@subsquid/ss58-codec@^1.2.3": "@subsquid/ss58-codec",
    },
  },

  // optimizeDeps: {
  //
  // },
  build: {
    target: "esnext",
    minify: false,
    // sourcemap: true,
    commonjsOptions: {
      // Transform CommonJS to ESM more aggressively
      transformMixedEsModules: true,
      extensions: [".js", ".cjs"],
      // Needed for Node.js modules
      ignoreDynamicRequires: true,
    },
  },
  server: {
    port: 4001,
    open: true,
  },
  plugins: [
    react(),
    deno(),
    nodePolyfills({
      overrides: {
        // Since `fs` is not supported in browsers, we can use the `memfs` package to polyfill it.
        fs: "memfs",
        "node:fs": "memfs",
      },
    }),
    // topLevelAwait(),
    wasm(),
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(
            path.resolve(
              "..",
              "shared",
              "contracts",
              "midnight",
              "contract-round-value",
              "src",
              "managed",
              "keys",
              "*",
            ),
          ),
          // src: "src/contract-round-value/src/managed/keys/*",
          dest: "keys",
        },
        {
          src: normalizePath(
            path.resolve(
              "..",
              "shared",
              "contracts",
              "midnight",
              "contract-round-value",
              "src",
              "managed",
              "zkir",
              "*",
            ),
          ),
          // src: "src/contract-round-value/src/managed/zkir/*",
          dest: "zkir",
        },
        {
          src: normalizePath(
            path.resolve(
              "..",
              "shared",
              "contracts",
              "midnight",
              // Support both legacy `contract.json` and the new network-suffixed manifests:
              // - contract-round-value.undeployed.json
              // - contract-round-value.preview.json
              // - etc
              "contract-round-value.*.json",
            ),
          ),
          dest: "contract_address",
        },
        {
          // Keep legacy copy target for backwards compatibility / older builds.
          // If this file is missing, the plugin will simply skip it.
          src: normalizePath(
            path.resolve(
              "..",
              "shared",
              "contracts",
              "midnight",
              "contract.json",
            ),
          ),
          dest: "contract_address",
        },
      ],
    }),
  ],

  optimizeDeps: {
    exclude: ["@midnight-ntwrk/onchain-runtime"],
    include: [
      // "@midnight-ntwrk/midnight-js-network-id",
      "react/jsx-runtime",
      "npm:@midnight-ntwrk/compact-runtime",
    ],
    esbuildOptions: {
      target: "esnext",
    },
  },
});
