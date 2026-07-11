import { defineConfig } from "vite";
import path from "path";
import nodePolyfills from "vite-plugin-node-stdlib-browser";

export default defineConfig({
  root: path.resolve(import.meta.dirname!, "client"),
  envDir: "..",

  resolve: {
    alias: {
      "npm:@polkadot/extension-dapp@^0.61.7": "@polkadot/extension-dapp",
      "npm:@foxglove/crc@^1.0.1": "@foxglove/crc",
      "./@polkadot/util": "npm:@polkadot/util-crypto",
      "./@polkadot/util-crypto": "npm:@polkadot/util-crypto",
      "npm:@polkadot/util-crypto@^13.4.3": "@polkadot/util-crypto",
      "npm:@polkadot/util@^13.4.3": "@polkadot/util",
      "npm:@polkadot/util-crypto@^13.5.6": "@polkadot/util-crypto",
      "npm:@polkadot/util@^13.5.6": "@polkadot/util",
      "npm:@sinclair/typebox@^0.34.41": "@sinclair/typebox",
      "npm:@sinclair/typebox@0.34.41": "@sinclair/typebox",
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
      "node-fetch": path.resolve(import.meta.dirname!, "native-fetch-shim.mjs"),
    },
  },

  build: {
    outDir: path.resolve(import.meta.dirname!, "client/dist"),
    emptyOutDir: true,
    target: "esnext",
    minify: false,
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: [".js", ".cjs"],
      ignoreDynamicRequires: true,
    },
    rollupOptions: {
      // Split large vendor deps into separate chunks so Rollup never has to
      // hold the full dependency graph in memory at once. Without this the
      // build OOMs on servers with <4 GB RAM.
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/pixi.js") || id.includes("/node_modules/@pixi/"))
            return "vendor-pixi";
          // viem / @effectstream/wallets / @polkadot are circularly dependent —
          // keep them in one chunk to avoid Rollup circular-chunk warnings.
          if (
            id.includes("/node_modules/viem") ||
            id.includes("/node_modules/@effectstream/") ||
            id.includes("/node_modules/@polkadot/")
          )
            return "vendor-web3";
        },
      },
    },
  },

  server: {
    port: 10599,
  },

  plugins: [
    nodePolyfills({
      overrides: {
        fs: "memfs",
        "node:fs": "memfs",
      },
    }),
  ],
});
