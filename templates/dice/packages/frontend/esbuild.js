import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import { sassPlugin } from "esbuild-sass-plugin";
import { build } from "esbuild";
import { copyFileSync, mkdirSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create public directory
mkdirSync("public", { recursive: true });
mkdirSync("public/dist", { recursive: true });
mkdirSync("public/assets", { recursive: true });

// Copy HTML file
copyFileSync("src/index.html", "public/index.html");

// Copy assets
try {
  cpSync("assets", "public/assets", { recursive: true });
} catch (e) {
  console.warn("No assets directory found, skipping copy");
}

// Build middleware
await build({
  entryPoints: ["./paimaMiddleware.src.js"],
  bundle: true,
  outfile: "public/paimaMiddleware.js",
  sourcemap: true,
  format: "esm",
  logLevel: "error", // Suppress polyfill warnings
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
    '.png': 'file',
    '.jpg': 'file',
    '.jpeg': 'file',
    '.gif': 'file',
    '.svg': 'file',
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file',
    '.eot': 'file',
  },
  define: {
    'process.env.NODE_ENV': '"development"',
  },
  alias: {
    // Path aliases from tsconfig.json
    '@src': resolve(__dirname, './src'),
    '@assets': resolve(__dirname, './assets'),
    '@typechain': resolve(__dirname, '../shared/contracts/evm/typechain-types'),
    '@abi': resolve(__dirname, '../shared/contracts/evm/abi'),

    // Package aliases - map old imports to new locations
    '@dice/game-logic': resolve(__dirname, '../shared/game-logic/src/mod.ts'),
    '@dice/middleware': resolve(__dirname, './public/paimaMiddleware.js'),
    '@dice/db': resolve(__dirname, '../client/database/src/mod.ts'),
    '@dice/utils': resolve(__dirname, '../shared/data-types/src/types.ts'),
    '@dice/data-types/types': resolve(__dirname, '../shared/data-types/src/types.ts'),
    '@dice/evm-contracts': resolve(__dirname, '../shared/contracts/evm/mod.ts'),

    // Map old Paima SDK imports to new package
    '@paima/sdk/providers': '@paimaexample/wallets',
    '@paima/providers': '@paimaexample/wallets',
    '@paima/sdk/mw-core': '@paimaexample/wallets',
    '@paima/sdk/prando': 'prando',
  },
  plugins: [
    sassPlugin(),
    nodeModulesPolyfillPlugin({
      globals: {
        process: true,
        Buffer: true,
      },
    }),
  ],
  publicPath: '/',
  assetNames: 'assets/[name]-[hash]',
});

console.log("✅ Build complete!");
