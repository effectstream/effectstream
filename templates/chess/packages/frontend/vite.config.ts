import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deno from "@deno/vite-plugin";
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const fromFileUrl = fileURLToPath;

const chessUtilsPath = join(
  dirname(fromFileUrl(import.meta.url)),
  "../shared/utils/",
);
const chessDataTypesPath = join(
  dirname(fromFileUrl(import.meta.url)),
  "../shared/data-types/",
);
const chessGameLogicPath = join(
  dirname(fromFileUrl(import.meta.url)),
  "../shared/game-logic/",
);
const paimaCryptoPath = join(
  dirname(fromFileUrl(import.meta.url)),
  "../../../../packages/paima-sdk/crypto/",
);
const paimaUtilsPath = join(
  dirname(fromFileUrl(import.meta.url)),
  "../../../../packages/paima-sdk/utils/",
);
const paimaConcisePath = join(
  dirname(fromFileUrl(import.meta.url)),
  "../../../../packages/paima-sdk/concise/",
);
const paimaWalletsPath = join(
  dirname(fromFileUrl(import.meta.url)),
  "../../../../packages/paima-sdk/wallets/",
);
const paimaConfigPath = join(
  dirname(fromFileUrl(import.meta.url)),
  "../../../../packages/paima-sdk/config/",
);
const paimaEventClientPath = join(
  dirname(fromFileUrl(import.meta.url)),
  "../../../../packages/paima-sdk/events/",
);
const paimaPrecompilePath = join(
  dirname(fromFileUrl(import.meta.url)),
  "../../../../packages/paima-sdk/precompile/",
);
const chessApiContractPath = join(
  dirname(fromFileUrl(import.meta.url)),
  "../shared/api/",
);
export default defineConfig({
  root: "./client",
  resolve: {
    alias: {
      // LOCAL IMPORTS
      // COMMENT TO USE THE jsr/npm @paimaexample packages

      // "@paimaexample/crypto": paimaCryptoPath + "src/mod.ts",
      // "@paima/crypto": paimaCryptoPath + "src/mod.ts",
      // "@paimaexample/utils": paimaUtilsPath + "src/mod.ts",
      // "@paima/utils": paimaUtilsPath + "src/mod.ts",
      // "@paimaexample/concise": paimaConcisePath + "src/mod.ts",
      // "@paima/concise": paimaConcisePath + "src/mod.ts",
      // "@paimaexample/wallets": paimaWalletsPath + "src/mod.ts",
      // "@paima/wallets": paimaWalletsPath + "src/mod.ts",
      // "@paima/config": paimaConfigPath + "src/mod.ts",
      // "@paima/event-client": paimaEventClientPath + "src/mod.ts",
      // "@paima/precompile": paimaPrecompilePath + "src/mod.ts",

      // END OF LOCAL IMPORTS

      "@chess/api-contract": chessApiContractPath + "src/mod.ts",
      "@chess/utils": chessUtilsPath + "src/mod.ts",
      "@chess/data-types/types": chessDataTypesPath + "src/chess-types.ts",
      "@chess/game-logic": chessGameLogicPath + "src/mod.ts",

      // Fix for: Module "npm:@scope/package@version" has been externalized for browser compatibility.
      //          Cannot access "npm:@scope/package@version.__esModule" in client code
      "npm:@cardano-foundation/cardano-verify-datasignature@1.0.11":
        "@cardano-foundation/cardano-verify-datasignature",
      "npm:@polkadot/extension-dapp@^0.61.7": "@polkadot/extension-dapp",
      "npm:@polkadot/util@^13.5.6": "@polkadot/util",
      "npm:@polkadot/util@^13.4.3": "@polkadot/util",
      "npm:@polkadot/util-crypto@^13.4.3": "@polkadot/util-crypto",
      "npm:@foxglove/crc@^1.0.1": "@foxglove/crc",
      "./@polkadot/util": "npm:@polkadot/util-crypto",
      "./@polkadot/util-crypto": "npm:@polkadot/util-crypto",
      "npm:@polkadot/util-crypto@^13.5.6": "@polkadot/util-crypto",
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
      "npm:@dcspark/cip34-js@3.0.1": "@dcspark/cip34-js",
      "npm:viem@2.37.3/accounts": "viem/accounts",
      "npm:/viem@2.37.3/accounts": "viem/accounts",
      "npm:viem@2.37.3": "viem",
      "npm:@dcspark/carp-client@^3.3.0": "@dcspark/carp-client",
      "npm:@subsquid/ss58-codec@^1.2.3": "@subsquid/ss58-codec",
    },
  },
  build: {
    target: "esnext",
    minify: false,
  },
  optimizeDeps: {},
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
