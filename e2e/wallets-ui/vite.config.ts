import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import "react";
import "react-dom";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import wasm from "vite-plugin-wasm";
import { viteStaticCopy } from "vite-plugin-static-copy";

const projectRoot = dirname(fileURLToPath(import.meta.url));

// Workspace-path workaround. Paths are relative to this file (e2e/wallets-ui/).
const walletPath = join(projectRoot, "../../packages/effectstream-sdk/wallets/");
const cryptoPath = join(projectRoot, "../../packages/effectstream-sdk/crypto/");
const dataTypesPath = join(projectRoot, "../shared/data-types/");
const concisePath = join(projectRoot, "../../packages/effectstream-sdk/concise/");
const configPath = join(projectRoot, "../../packages/effectstream-sdk/config/");
const utilsPath = join(projectRoot, "../../packages/effectstream-sdk/utils/");

const midnightContractEip20Path = join(projectRoot, "../shared/contracts/midnight/contract-eip-20/src/managed/contract/");
const midnightContractCounterBasicPath = join(projectRoot, "../shared/contracts/midnight/contract-counter/src/managed/contract/");

// The client statically imports the gitignored `src/managed/` output of the
// Midnight contracts. Fail fast with instructions instead of letting rollup
// die later with a cryptic "Could not resolve ./managed/contract/index.js".
for (const [name, managedPath] of [
  ["contract-counter", midnightContractCounterBasicPath],
  ["contract-eip-20", midnightContractEip20Path],
] as const) {
  if (!existsSync(managedPath)) {
    throw new Error(
      `Missing generated Midnight contract artifacts for ${name}.\n` +
        `Compile them first (requires the \`compact\` CLI):\n\n` +
        `  cd e2e/shared/contracts/midnight/${name} && bun run compact\n`,
    );
  }
}

// Browser-safe config — the real @e2e/data-types/config-localhost reads
// the filesystem at module load which crashes in the browser.
const browserConfigPath = join(projectRoot, "config-browser.ts");

// Stub for @effectstream/db so it doesn't try to import pg in the browser.
const dbEmptyPath = join(projectRoot, "effectstream-db-empty.ts");

export default defineConfig({
  define: {
    "process.env.EFFECTSTREAM_ENV": JSON.stringify("local"),
    Deno: undefined,
    Bun: undefined,
  },
  resolve: {
    // Multiple workspace packages pin slightly different @sinclair/typebox
    // versions (0.34.41 and 0.34.49). Vite would otherwise load both, splitting
    // the per-instance `FormatRegistry` so address-format validators registered
    // by @effectstream/utils never resolve at the Value.Check call site
    // ("Unknown format 'cardano-address'" -> address validity reads as Invalid).
    dedupe: ["@sinclair/typebox"],
    alias: {
      "@e2e/midnight-contract-eip-20/contract": midnightContractEip20Path + "index.js",
      "@e2e/midnight-contract-counter-basic/contract": midnightContractCounterBasicPath + "index.js",
      "@effectstream/utils/runtime": utilsPath + "src/runtime.ts",
      // Subpath alias must precede the base `@effectstream/utils` alias — vite
      // prefix-matches, so without this `@effectstream/utils/node-env` (imported
      // by @effectstream/events/event-connect.ts) resolves to `src/mod.ts/node-env`
      // → ENOTDIR, failing the build. `./node-env` maps to config.ts (per the
      // utils package exports).
      "@effectstream/utils/node-env": utilsPath + "src/config.ts",
      // Same prefix-matching hazard: `./types` is the browser-safe subset that
      // wallets/crypto/concise import (the root barrel re-exports config.ts,
      // which runs dotenv at import time). Without this line it resolves to
      // `src/mod.ts/types` → ENOTDIR and the whole app fails to build, which
      // surfaces in the wallets-ui suite as a blank page and a click timeout.
      "@effectstream/utils/types": utilsPath + "src/types/mod.ts",
      // Like the other utils subpaths above, this must precede the broad root
      // alias or Vite appends the subpath to the mod.ts file (ENOTDIR).
      "@effectstream/utils/polkadot-esm-cjs-warning": utilsPath + "src/polkadot-esm-cjs-warning.ts",
      "@effectstream/utils": utilsPath + "src/mod.ts",
      "@effectstream/config": configPath + "src/mod.ts",
      "@effectstream/concise": concisePath + "src/mod.ts",
      "@effectstream/crypto": cryptoPath + "src/mod.ts",
      "@effectstream/wallets": walletPath + "src/mod.ts",
      "@e2e/data-types/config-localhost": browserConfigPath,
      "@e2e/data-types": dataTypesPath + "src/mod.ts",
      "@effectstream/db": dbEmptyPath,
    },
  },
  root: "./client",
  build: {
    target: "esnext",
    minify: false,
    sourcemap: true,
  },
  server: {
    port: 4201,
    open: true,
  },
  plugins: [
    wasm(),
    react(),
    nodePolyfills(),
    viteStaticCopy({
      targets: [
        // The deployed-contract address only exists after
        // `midnight-contract:deploy` against a live local node; the build
        // smoke must work without it (the Midnight counter flow fails its
        // runtime fetch with a clear error instead).
        ...(existsSync(join(projectRoot, "../shared/contracts/midnight/contract-counter.undeployed.json"))
          ? [
              {
                src: join(projectRoot, "../shared/contracts/midnight/contract-counter.undeployed.json"),
                dest: "contract_address",
                rename: "counter.undeployed.json",
              },
            ]
          : []),
        {
          src: join(projectRoot, "../shared/contracts/midnight/contract-counter/src/managed/keys/*"),
          dest: "keys",
        },
        {
          src: join(projectRoot, "../shared/contracts/midnight/contract-counter/src/managed/zkir/*"),
          dest: "zkir",
        },
      ],
    }),
  ],

  optimizeDeps: {
    exclude: ["@midnight-ntwrk/onchain-runtime"],
    esbuildOptions: {
      target: "esnext",
    },
  },
});
