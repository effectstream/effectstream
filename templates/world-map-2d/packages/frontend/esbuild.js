import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import { build } from "esbuild";

build({
  entryPoints: ["./paimaMiddleware.src.js"],
  bundle: true,
  outfile: "paimaMiddleware.js",
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
