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
    // @effectstream/wallets declares Cardano/Midnight wallet helpers as optional
    // peer deps (@lucid-evolution/*, @midnight-ntwrk/*, @effectstream/midnight-contracts).
    // This template is EVM-only and never executes those branches. Bundling them
    // fails (Lucid resolution, ledger-v8 .wasm, Node-only parseArgs), and marking
    // them `external` leaves bare ESM specifiers the browser can't resolve at load
    // time even when the code never runs (e.g. "Failed to resolve module specifier
    // @midnightntwrk/wallet-sdk-shielded"). Resolve them to an empty stub instead:
    // no bare specifiers, and the dead branches see undefined imports never touched.
    {
      name: "stub-optional-wallet-deps",
      setup(build) {
        const filter =
          /^(@lucid-evolution\/|@midnight-ntwrk\/|@effectstream\/midnight-contracts(\/|$))/;
        build.onResolve({ filter }, (args) => ({
          path: args.path,
          namespace: "optional-wallet-stub",
        }));
        build.onLoad(
          { filter: /.*/, namespace: "optional-wallet-stub" },
          () => ({ contents: "module.exports = {};", loader: "js" }),
        );
      },
    },
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
