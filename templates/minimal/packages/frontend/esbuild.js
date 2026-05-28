import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import { build } from "esbuild";

await build({
  entryPoints: ["./index.js"],
  bundle: true,
  outfile: "dist/min.js",
  sourcemap: true,
  format: "esm",
  // @effectstream/wallets uses dynamic `await import("@lucid-evolution/*")`
  // and `await import("@midnight-ntwrk/wallet-sdk-*")` for its optional-peer
  // Cardano-local + Midnight-local code paths. esbuild's default is to inline
  // dynamic imports into the bundle and try to resolve them at build time —
  // those peers aren't installed in an EVM-only template, so the build fails
  // unless we mark them external. This template never reaches those code paths
  // at runtime.
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
