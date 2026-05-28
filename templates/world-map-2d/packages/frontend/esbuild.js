import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import { build } from "esbuild";

await build({
  entryPoints: ["./index.js"],
  bundle: true,
  outfile: "dist/min.js",
  sourcemap: true,
  format: "esm",
  // @effectstream/wallets declares Cardano/Midnight wallet helpers as optional
  // peer dependencies (`@lucid-evolution/*`, `@midnight-ntwrk/ledger-v8`,
  // `@midnight-ntwrk/wallet-sdk-*`). This template only uses EVM wallets so
  // the bundler must not try to bundle them — mark them external. Any code
  // path that touches a Cardano/Midnight wallet at runtime would throw, but
  // we never reach those branches.
  external: [
    "@lucid-evolution/*",
    "@midnight-ntwrk/*",
  ],
  plugins: [
    nodeModulesPolyfillPlugin({
      globals: {
        process: true,
        Buffer: true,
      },
    }),
  ],
});

import { cp } from "node:fs/promises";
await cp("./index.html", "./dist/index.html");
await cp("./style.css", "./dist/style.css");

console.log("Frontend built to ./dist");
