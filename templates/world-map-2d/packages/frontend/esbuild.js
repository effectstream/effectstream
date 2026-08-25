import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import { build } from "esbuild";
import path from "node:path";
import { realpathSync } from "node:fs";

// When the LINK_LOCAL test runner symlinks
//   <template>/node_modules/@effectstream/wallets -> <monorepo>/packages/effectstream-sdk/wallets
// only the TEMPLATE-ROOT's node_modules is relinked. Each workspace package
// (here packages/frontend) still has its own node_modules with a `.bun` cache
// copy of the published @effectstream/wallets — esbuild resolving from
// frontend/node_modules picks that cached copy and ignores our local edits.
//
// Walk up from this file to find the monorepo root (the directory whose
// `packages/` contains `effectstream-sdk/wallets/`) and force the bundler
// to resolve @effectstream/wallets at the monorepo source path directly.
// This bypasses both the template's `.bun` cache AND the workspace's
// `.bun` cache. Extend the alias map as needed for other @effectstream/*
// packages this frontend imports.
function findMonorepoWalletsSrc(startDir) {
  let dir = startDir;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(dir, "packages/effectstream-sdk/wallets");
    try {
      if (realpathSync(candidate)) return candidate;
    } catch {/* ignore */}
    const parent = path.dirname(dir);
    if (parent === dir) {
      // Not inside the monorepo (e.g. a standalone Docker build with published
      // packages). Return null so the bundler resolves the published
      // @effectstream/wallets from node_modules normally — the monorepo-src
      // alias below only exists to honor local edits during LINK_LOCAL dev.
      return null;
    }
    dir = parent;
  }
}
const walletsPkg = findMonorepoWalletsSrc(import.meta.dirname);

await build({
  entryPoints: ["./index.js"],
  bundle: true,
  outfile: "dist/min.js",
  sourcemap: true,
  format: "esm",
  // @effectstream/wallets declares Cardano/Midnight wallet helpers as optional
  // peer dependencies (`@lucid-evolution/*`, `@midnight-ntwrk/ledger-v8`,
  // `@midnightntwrk/wallet-sdk-*`). This template only uses EVM wallets so
  // the bundler must not try to bundle them — mark them external. Any code
  // path that touches a Cardano/Midnight wallet at runtime would throw, but
  // we never reach those branches.
  external: [
    "@lucid-evolution/*",
    "@midnight-ntwrk/*",
  ],
  alias: walletsPkg
    ? { "@effectstream/wallets": `${walletsPkg}/src/mod.ts` }
    : {},
  plugins: [
    // @effectstream/wallets declares Cardano/Midnight wallet helpers as optional
    // peer deps (@lucid-evolution/*, @midnight-ntwrk/*, @midnightntwrk/*,
    // @effectstream/midnight-contracts).
    // This template is EVM-only and never executes those branches. Bundling them
    // fails (Lucid resolution, ledger .wasm, Node-only parseArgs), and marking
    // them `external` leaves bare ESM specifiers the browser can't resolve at load
    // time even when the code never runs (e.g. "Failed to resolve module specifier
    // @midnightntwrk/wallet-sdk-shielded"). Resolve them to an empty stub instead:
    // no bare specifiers, and the dead branches see undefined imports never touched.
    //
    // BOTH Midnight scopes must be listed. Ledger v9 moved the ledger and
    // onchain-runtime packages from `@midnight-ntwrk/*` to `@midnightntwrk/*`
    // (no hyphen), so a filter covering only the hyphenated scope stopped
    // matching `@midnightntwrk/ledger-v9` — esbuild then followed it into
    // midnight_ledger_wasm_v9_bg.wasm and failed with
    // "No loader is configured for .wasm files".
    {
      name: "stub-optional-wallet-deps",
      setup(build) {
        const filter =
          /^(@lucid-evolution\/|@midnight-ntwrk\/|@midnightntwrk\/|@effectstream\/midnight-contracts(\/|$))/;
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
