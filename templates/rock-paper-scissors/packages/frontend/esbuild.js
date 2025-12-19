import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import { build } from "esbuild";
import { copyFileSync } from "node:fs";

// Build middleware
await build({
  entryPoints: ["./paimaMiddleware.src.js"],
  bundle: true,
  outfile: "public/paimaMiddleware.js",
  sourcemap: true,
  format: "esm",
  plugins: [
    nodeModulesPolyfillPlugin({
      globals: {
        process: true,
        Buffer: true,
      },
    }),
  ],
});

// Build main game bundle
await build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  outfile: "public/dist/bundle.js",
  sourcemap: true,
  format: "esm",
  external: ['../../paimaMiddleware.js'],
  define: {
    'process.env.NODE_ENV': '"development"',
  },
  alias: {
    '@rock-paper-scissors/game-logic': '../shared/game-logic/src/mod.ts',
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
