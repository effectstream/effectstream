import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import { build } from "esbuild";

await build({
  entryPoints: ["./index.js"],
  bundle: true,
  outfile: "dist/min.js",
  sourcemap: true,
  format: "esm",
  // @effectstream/wallets declares Cardano/Midnight helpers (@lucid-evolution/*,
  // @midnight-ntwrk/*) as optional deps. This template is EVM-only and never
  // hits those code paths, so mark them external — otherwise esbuild fails on
  // the unresolved Lucid import and the ledger-v8 .wasm (no wasm loader).
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
