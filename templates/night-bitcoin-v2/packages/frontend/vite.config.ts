import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import wasm from "vite-plugin-wasm";
import "react";
import "react-dom";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { normalizePath } from "vite";
import path from "node:path";
import { existsSync } from "node:fs";
const cryptoShim = path.resolve(import.meta.dirname!, "client/src/shims/crypto.ts");

function resolveOnchainRuntimeV3(): string {
  for (const base of [
    path.resolve(import.meta.dirname!, "node_modules/@midnightntwrk/onchain-runtime-v4"),
    path.resolve(import.meta.dirname!, "../../node_modules/@midnightntwrk/onchain-runtime-v4"),
  ]) {
    if (existsSync(path.join(base, "midnight_onchain_runtime_wasm.js"))) return base;
  }
  throw new Error(
    "Cannot find @midnightntwrk/onchain-runtime-v4 — run ./link.sh from the template root",
  );
}

const onchainRuntimeV3 = resolveOnchainRuntimeV3();

// Vite's SPA fallback serves index.html for any unmatched path, which makes
// requests for missing ZK artifacts return HTML instead of a 404. The proof
// server then receives HTML, can't parse it, and returns 400 "bad input".
// Force a real 404 on /keys/* and /zkir/* when the file isn't present.
function zkArtifactFourOhFour(): Plugin {
  const publicDir = path.resolve(import.meta.dirname!, "client/dist");
  const guarded = ["/keys/", "/zkir/"];

  const middleware = (req: any, res: any, next: () => void) => {
    const url: string = req.url?.split("?")[0] ?? "";
    if (!guarded.some((prefix) => url.startsWith(prefix))) return next();
    const filePath = path.resolve(publicDir, "." + url);
    if (existsSync(filePath)) return next();
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain");
    res.end(`ZK artifact not found: ${url}\n`);
  };

  return {
    name: "zk-artifact-404",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  root: "./client",
  envDir: "..",

  resolve: {
    dedupe: ["effect", "@effect/platform", "@effect/schema"],
    // Array form: first-match-wins. User aliases here run before any aliases
    // injected by `vite-plugin-node-stdlib-browser`'s `config()` hook (which
    // would otherwise rewrite `crypto` → bare `crypto-browserify`, dropping
    // `timingSafeEqual` that midnight-js storage encryption needs).
    alias: [
      {
        find: /^@midnight-ntwrk\/onchain-runtime$/,
        replacement: path.join(onchainRuntimeV3, "midnight_onchain_runtime_wasm.js"),
      },
      { find: /^crypto$/, replacement: cryptoShim },
      { find: /^node:crypto$/, replacement: cryptoShim },
      { find: /^npm:@polkadot\/extension-dapp@\^0\.61\.7$/, replacement: "@polkadot/extension-dapp" },
      { find: /^npm:@foxglove\/crc@\^1\.0\.1$/, replacement: "@foxglove/crc" },
      { find: /^\.\/@polkadot\/util$/, replacement: "npm:@polkadot/util-crypto" },
      { find: /^\.\/@polkadot\/util-crypto$/, replacement: "npm:@polkadot/util-crypto" },
      { find: /^npm:@polkadot\/util-crypto@\^13\.4\.3$/, replacement: "@polkadot/util-crypto" },
      { find: /^npm:@polkadot\/util@\^13\.4\.3$/, replacement: "@polkadot/util" },
      { find: /^npm:@polkadot\/util-crypto@\^13\.5\.6$/, replacement: "@polkadot/util-crypto" },
      { find: /^npm:@polkadot\/util@\^13\.5\.6$/, replacement: "@polkadot/util" },
      { find: /^npm:@sinclair\/typebox@\^0\.34\.41$/, replacement: "@sinclair/typebox" },
      { find: /^npm:@sinclair\/typebox@0\.34\.41$/, replacement: "@sinclair/typebox" },
      { find: /^npm:\/@sinclair\/typebox@\^0\.34\.41\/value$/, replacement: "@sinclair/typebox/value" },
      { find: /^npm:@sinclair\/typebox@\^0\.34\.41\/value$/, replacement: "@sinclair/typebox/value" },
      { find: /^npm:\/@sinclair\/typebox@~0\.34\.41\/value$/, replacement: "@sinclair/typebox/value" },
      { find: /^npm:@sinclair\/typebox@\^0\.34\.30$/, replacement: "@sinclair/typebox" },
      { find: /^npm:\/@sinclair\/typebox@\^0\.34\.30\/value$/, replacement: "@sinclair/typebox/value" },
      { find: /^npm:@sinclair\/typebox@\^0\.34\.30\/value$/, replacement: "@sinclair/typebox/value" },
      { find: /^npm:\/@sinclair\/typebox@~0\.34\.30\/value$/, replacement: "@sinclair/typebox/value" },
      { find: /^npm:viem$/, replacement: "viem" },
      { find: /^npm:viem\/accounts$/, replacement: "viem/accounts" },
      { find: /^npm:viem@2\.37\.3$/, replacement: "viem" },
      { find: /^npm:viem@2\.37\.3\/accounts$/, replacement: "viem/accounts" },
      { find: /^npm:\/viem@2\.37\.3\/accounts$/, replacement: "viem/accounts" },
      { find: /^npm:@dcspark\/cip34-js@3\.0\.1$/, replacement: "@dcspark/cip34-js" },
      { find: /^npm:@dcspark\/carp-client@\^3\.3\.0$/, replacement: "@dcspark/carp-client" },
      { find: /^npm:@subsquid\/ss58-codec@\^1\.2\.3$/, replacement: "@subsquid/ss58-codec" },
      { find: /^stream\/web$/, replacement: "web-streams-polyfill/dist/ponyfill.es2018.mjs" },
      { find: /^node-fetch$/, replacement: path.resolve(import.meta.dirname!, "native-fetch-shim.mjs") },
    ],
  },

  build: {
    target: "esnext",
    minify: false,
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: [".js", ".cjs"],
      ignoreDynamicRequires: true,
    },
  },
  server: {
    port: 10599,
    open: true,
  },
  plugins: [
    {
      name: "fix-stream-web",
      enforce: "pre",
      resolveId(source) {
        if (
          source.endsWith("stream-browserify/web") ||
          source === "stream/web" ||
          source === "node:stream/web"
        ) {
          return path.resolve(import.meta.dirname!, "stream-web-shim.mjs");
        }
      },
    },
    react(),
    nodePolyfills({
      overrides: {
        fs: "memfs",
        "node:fs": "memfs",
      },
    }),
    wasm(),
    zkArtifactFourOhFour(),
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(
            path.resolve(
              "..",
              "contracts-midnight",
              "erc7683",
              "src",
              "managed",
              "keys",
              "*",
            ),
          ),
          dest: "keys",
        },
        {
          src: normalizePath(
            path.resolve(
              "..",
              "contracts-midnight",
              "erc7683",
              "src",
              "managed",
              "zkir",
              "*",
            ),
          ),
          dest: "zkir",
        },
        {
          // Runtime artifact written by the contract deploy step. May be
          // absent on a fresh build (deploy hasn't run yet); silent: true
          // skips the validation error and the frontend will fetch it at
          // runtime once it exists.
          src: normalizePath(
            path.resolve(
              "..",
              "contracts-midnight",
              "erc7683.undeployed.json",
            ),
          ),
          dest: "contract_address",
          silent: true,
        },
        {
          src: normalizePath(
            path.resolve(
              "..",
              "contracts-midnight",
              "unshielded-erc20",
              "src",
              "managed",
              "keys",
              "*",
            ),
          ),
          dest: "keys",
        },
        {
          src: normalizePath(
            path.resolve(
              "..",
              "contracts-midnight",
              "unshielded-erc20",
              "src",
              "managed",
              "zkir",
              "*",
            ),
          ),
          dest: "zkir",
        },
        {
          // Same as erc7683.undeployed.json above — runtime artifact.
          src: normalizePath(
            path.resolve(
              "..",
              "contracts-midnight",
              "unshielded-erc20.undeployed.json",
            ),
          ),
          dest: "contract_address",
          silent: true,
        },
      ],
    }),
  ],

  optimizeDeps: {
    exclude: ["@midnightntwrk/onchain-runtime-v4"],
    include: [
      "react/jsx-runtime",
      "npm:@midnight-ntwrk/compact-runtime",
    ],
    esbuildOptions: {
      target: "esnext",
      plugins: [
        // Vite's optimizeDeps pre-bundling uses esbuild directly and does NOT
        // honor `resolve.alias` — without this plugin the midnight-js
        // storage-encryption module binds to the real `crypto-browserify`
        // (no timingSafeEqual) and fails at runtime.
        {
          name: "alias-node-crypto-to-shim",
          setup(build) {
            build.onResolve({ filter: /^(node:)?crypto$/ }, () => ({
              path: cryptoShim,
            }));
          },
        },
      ],
    },
  },
});
