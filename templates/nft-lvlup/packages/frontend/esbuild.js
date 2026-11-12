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
      throw new Error(
        "frontend/esbuild.js: could not find the @effectstream monorepo root from " +
          startDir,
      );
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
  // peer dependencies. This template only uses EVM wallets so the bundler must
  // not try to bundle them — mark them external. @effectstream/midnight-contracts
  // (pulled in by the Midnight local-wallet path) uses Node-only APIs like
  // node:util's parseArgs that the browser polyfill can't provide; the EVM
  // wallet path never reaches it, so externalize it too.
  external: [
    "@lucid-evolution/*",
    "@midnight-ntwrk/*",
    "@effectstream/midnight-contracts",
  ],
  alias: {
    "@effectstream/wallets": `${walletsPkg}/src/mod.ts`,
  },
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
