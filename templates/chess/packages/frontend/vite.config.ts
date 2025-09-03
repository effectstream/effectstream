import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deno from "@deno/vite-plugin";
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import { fromFileUrl } from "jsr:@std/path";
import { join, dirname } from "node:path";

const chessMiddlewarePath = join(dirname(fromFileUrl(import.meta.url)), "../shared/middleware/");
const chessUtilsPath = join(dirname(fromFileUrl(import.meta.url)), "../shared/utils/"); 
const chessDataTypesPath = join(dirname(fromFileUrl(import.meta.url)), "../shared/data-types/");
const chessGameLogicPath = join(dirname(fromFileUrl(import.meta.url)), "../shared/game-logic/");

export default defineConfig({
  root: "./client",
  resolve: {
    alias: {
      "@chess/middleware": chessMiddlewarePath + "src/mod.ts",
      "@chess/utils": chessUtilsPath + "src/mod.ts",
      "@chess/data-types": chessDataTypesPath + "src/mod.ts",
      "@chess/game-logic": chessGameLogicPath + "src/mod.ts",
      "npm:@polkadot/extension-dapp@^0.61.7": "@polkadot/extension-dapp",
      "npm:@foxglove/crc@^1.0.1": "@foxglove/crc",
      "./@polkadot/util": "npm:@polkadot/util-crypto",
      "./@polkadot/util-crypto": "npm:@polkadot/util-crypto",
      "npm:@sinclair/typebox@^0.34.30": "@sinclair/typebox",
      "npm:/@sinclair/typebox@^0.34.30/value": "@sinclair/typebox/value",
      "npm:@sinclair/typebox@^0.34.30/value": "@sinclair/typebox/value",
      "npm:/@sinclair/typebox@~0.34.30/value": "@sinclair/typebox/value",
      "npm:viem": "viem",
      "npm:viem/accounts": "viem/accounts",
      "npm:viem@^2.21.3": "viem",
      "npm:viem@^2.21.3/accounts": "viem/accounts",
      "npm:/viem@^2.21.3/accounts": "viem/accounts",
      "npm:@dcspark/cip34-js@3.0.1": "@dcspark/cip34-js",
      "npm:@dcspark/carp-client@^3.3.0": "@dcspark/carp-client",
    },
  },
  build: {
    target: "esnext",
    minify: false,
  },
  optimizeDeps: {
    // exclude: ["*", "@chess/middleware", "@chess/utils", "@chess/data-types", "@chess/game-logic"],
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
});
