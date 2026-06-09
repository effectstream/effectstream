import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import { build } from "esbuild";
import path from "node:path";
import { realpathSync } from "node:fs";

// The real Hex Battle game (canvas UI under src/frontend/, engine under
// @hex-battle/engine) is bundled with esbuild — the same bundler the other
// migrated templates (world-map-2d) use. The only migrated-boundary module it
// pulls in is src/paima/middleware.ts, which imports @effectstream/wallets; the
// node-modules polyfill + the external list below let that bundle for the
// browser. esbuild replaces the original webpack/ts-loader pipeline (the
// bundler is tooling, not the game).
//
// When the LINK_LOCAL test runner symlinks
//   <template>/node_modules/@effectstream/wallets -> <monorepo>/packages/effectstream-sdk/wallets
// only the TEMPLATE-ROOT's node_modules is relinked. Each workspace package
// (here packages/frontend) still has its own node_modules with a `.bun` cache
// copy of the published @effectstream/wallets — esbuild resolving from
// frontend/node_modules picks that cached copy and ignores our local edits.
//
// Walk up from this file to find the monorepo root (the directory whose
// `packages/` contains `effectstream-sdk/wallets/`) and force the bundler to
// resolve @effectstream/wallets at the monorepo source path directly.
function findMonorepoRoot(startDir) {
  let dir = startDir;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(dir, "packages/effectstream-sdk/wallets");
    try {
      if (realpathSync(candidate)) return dir;
    } catch {/* ignore */}
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null; // not inside the monorepo (e.g. published template) — use node_modules resolution
    }
    dir = parent;
  }
}
const monorepoRoot = findMonorepoRoot(import.meta.dirname);
// Force the @effectstream packages we bundle to resolve at the monorepo source
// (not a workspace's stale .bun cache copy). See note above re: LINK_LOCAL.
const effectstreamAlias = monorepoRoot
  ? {
      "@effectstream/wallets": path.join(
        monorepoRoot,
        "packages/effectstream-sdk/wallets/src/mod.ts",
      ),
      "@effectstream/crypto": path.join(
        monorepoRoot,
        "packages/effectstream-sdk/crypto/src/mod.ts",
      ),
    }
  : {};

await build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  // Bundle straight into site/ so site/index.html's `./bundle.js` resolves and
  // the static server serves the whole game (assets + bundle) from one dir.
  outfile: "site/bundle.js",
  sourcemap: true,
  format: "esm",
  target: "es2020",
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
  alias: effectstreamAlias,
  plugins: [
    nodeModulesPolyfillPlugin({
      globals: {
        process: true,
        Buffer: true,
      },
    }),
  ],
});

console.log("Frontend built to ./site (bundle.js)");
