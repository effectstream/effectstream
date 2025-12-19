import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

// Create public directory
mkdirSync("public", { recursive: true });
mkdirSync("public/dist", { recursive: true });

// Copy HTML file
copyFileSync("src/index.html", "public/index.html");

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

// Build main React app
await build({
  entryPoints: ["./src/main.tsx"],
  bundle: true,
  outfile: "public/dist/bundle.js",
  sourcemap: true,
  format: "esm",
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.jsx': 'jsx',
    '.js': 'jsx',
  },
  define: {
    'process.env.NODE_ENV': '"development"',
  },
  alias: {
    '@dice/game-logic': '../shared/game-logic/src/mod.ts',
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

console.log("Build complete!");
