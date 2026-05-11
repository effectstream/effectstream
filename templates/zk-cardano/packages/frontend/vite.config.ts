import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import wasm from "vite-plugin-wasm";
import "react";
import "react-dom";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { normalizePath } from "vite";
import path from "node:path";

export default defineConfig({
  root: "./client",
  envDir: "..",

  resolve: {
    dedupe: ["effect", "@effect/platform", "@effect/schema"],
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
      "npm:@subsquid/ss58-codec@^1.2.3": "@subsquid/ss58-codec",
      "stream/web": "web-streams-polyfill/dist/ponyfill.es2018.mjs",
      "node-fetch": path.resolve(import.meta.dirname!, "native-fetch-shim.mjs"),
    },
  },

  build: {
    target: "esnext",
    minify: false,
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: [".js", ".cjs"],
      ignoreDynamicRequires: true,
    },
  },
  server: {
    port: 4001,
    open: true,
  },
  plugins: [
    {
      name: "fix-stream-web",
      enforce: "pre",
      resolveId(source) {
        if (source.endsWith("stream-browserify/web") || source === "stream/web" || source === "node:stream/web") {
          return path.resolve(import.meta.dirname!, "stream-web-shim.mjs");
        }
      },
    },
    react(),
    nodePolyfills({
      overrides: {
        fs: "memfs",
        "node:fs": "memfs",
      },
    }),
    wasm(),
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(
            path.resolve(
              "..",
              "contracts-midnight",
              "contract-ballot",
              "src",
              "managed",
              "keys",
              "*",
            ),
          ),
          dest: "keys",
        },
        {
          src: normalizePath(
            path.resolve(
              "..",
              "contracts-midnight",
              "contract-ballot",
              "src",
              "managed",
              "zkir",
              "*",
            ),
          ),
          dest: "zkir",
        },
        {
          src: normalizePath(
            path.resolve(
              "..",
              "contracts-midnight",
              "contract-ballot.*.json",
            ),
          ),
          dest: "contract_address",
        }
      ],
    }),
  ],

  optimizeDeps: {
    exclude: ["@midnight-ntwrk/onchain-runtime"],
    include: [
      "react/jsx-runtime",
      "npm:@midnight-ntwrk/compact-runtime",
    ],
    esbuildOptions: {
      target: "esnext",
    },
  },
});
