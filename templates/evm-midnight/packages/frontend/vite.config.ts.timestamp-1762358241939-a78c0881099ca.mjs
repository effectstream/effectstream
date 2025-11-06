// vite.config.ts
import { defineConfig } from "file:///Users/eduardosoto/Code/paima-engine/templates/evm-midnight/node_modules/.deno/vite@7.2.0_1/node_modules/vite/dist/node/index.js";
import react from "file:///Users/eduardosoto/Code/paima-engine/templates/evm-midnight/node_modules/.deno/@vitejs+plugin-react@4.7.0_1/node_modules/@vitejs/plugin-react/dist/index.js";
import deno from "file:///Users/eduardosoto/Code/paima-engine/templates/evm-midnight/node_modules/.deno/@deno+vite-plugin@1.0.5_1/node_modules/@deno/vite-plugin/dist/index.js";
import nodePolyfills from "file:///Users/eduardosoto/Code/paima-engine/templates/evm-midnight/node_modules/.deno/vite-plugin-node-stdlib-browser@0.2.1_1/node_modules/vite-plugin-node-stdlib-browser/index.cjs";
import wasm from "file:///Users/eduardosoto/Code/paima-engine/templates/evm-midnight/node_modules/.deno/vite-plugin-wasm@3.5.0_1/node_modules/vite-plugin-wasm/exports/import.mjs";
import "file:///Users/eduardosoto/Code/paima-engine/templates/evm-midnight/node_modules/.deno/react@19.1.0/node_modules/react/index.js";
import "file:///Users/eduardosoto/Code/paima-engine/templates/evm-midnight/node_modules/.deno/react-dom@19.1.0/node_modules/react-dom/index.js";
import { viteStaticCopy } from "file:///Users/eduardosoto/Code/paima-engine/templates/evm-midnight/node_modules/.deno/vite-plugin-static-copy@3.1.4_1/node_modules/vite-plugin-static-copy/dist/index.js";
import { normalizePath } from "file:///Users/eduardosoto/Code/paima-engine/templates/evm-midnight/node_modules/.deno/vite@7.2.0_1/node_modules/vite/dist/node/index.js";
import path from "node:path";
var vite_config_default = defineConfig({
  root: "./client",
  resolve: {
    alias: {
      // Fix for: Module "npm:@scope/package@version" has been externalized for browser compatibility.
      //          Cannot access "npm:@scope/package@version.__esModule" in client code
      "npm:@polkadot/extension-dapp@^0.61.7": "@polkadot/extension-dapp",
      "npm:@foxglove/crc@^1.0.1": "@foxglove/crc",
      "./@polkadot/util": "npm:@polkadot/util-crypto",
      "./@polkadot/util-crypto": "npm:@polkadot/util-crypto",
      "npm:@polkadot/util-crypto@^13.4.3": "@polkadot/util-crypto",
      "npm:@polkadot/util@^13.4.3": "@polkadot/util",
      "npm:@polkadot/util-crypto@^13.5.6": "@polkadot/util-crypto",
      "npm:@polkadot/util@^13.5.6": "@polkadot/util",
      "npm:@sinclair/typebox@^0.34.41": "@sinclair/typebox",
      "npm:/@sinclair/typebox@^0.34.41/value": "@sinclair/typebox/value",
      "npm:@sinclair/typebox@^0.34.41/value": "@sinclair/typebox/value",
      "npm:/@sinclair/typebox@~0.34.41/value": "@sinclair/typebox/value",
      "npm:@sinclair/typebox@^0.34.30": "@sinclair/typebox",
      "npm:/@sinclair/typebox@^0.34.30/value": "@sinclair/typebox/value",
      "npm:@sinclair/typebox@^0.34.30/value": "@sinclair/typebox/value",
      "npm:/@sinclair/typebox@~0.34.30/value": "@sinclair/typebox/value",
      "npm:viem": "viem",
      "npm:viem/accounts": "viem/accounts",
      "npm:viem@2.37.3": "viem",
      "npm:viem@2.37.3/accounts": "viem/accounts",
      "npm:/viem@2.37.3/accounts": "viem/accounts",
      "npm:@dcspark/cip34-js@3.0.1": "@dcspark/cip34-js",
      "npm:@dcspark/carp-client@^3.3.0": "@dcspark/carp-client",
      "npm:@subsquid/ss58-codec@^1.2.3": "@subsquid/ss58-codec"
    }
  },
  // optimizeDeps: {
  //
  // },
  build: {
    target: "esnext",
    minify: false,
    // sourcemap: true,
    commonjsOptions: {
      // Transform CommonJS to ESM more aggressively
      transformMixedEsModules: true,
      extensions: [".js", ".cjs"],
      // Needed for Node.js modules
      ignoreDynamicRequires: true
    }
  },
  server: {
    port: 4001,
    open: true
  },
  plugins: [
    react(),
    deno(),
    nodePolyfills({
      overrides: {
        // Since `fs` is not supported in browsers, we can use the `memfs` package to polyfill it.
        fs: "memfs",
        "node:fs": "memfs"
      }
    }),
    // topLevelAwait(),
    wasm(),
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(
            path.resolve(
              "..",
              "shared",
              "contracts",
              "midnight",
              "contract-round-value",
              "src",
              "managed",
              "counter",
              "keys",
              "*"
            )
          ),
          // src: "src/contract-round-value/src/managed/counter/keys/*",
          dest: "keys"
        },
        {
          src: normalizePath(
            path.resolve(
              "..",
              "shared",
              "contracts",
              "midnight",
              "contract-round-value",
              "src",
              "managed",
              "counter",
              "zkir",
              "*"
            )
          ),
          // src: "src/contract-round-value/src/managed/counter/zkir/*",
          dest: "zkir"
        },
        {
          src: normalizePath(
            path.resolve(
              "..",
              "shared",
              "contracts",
              "midnight",
              "contract.json"
            )
          ),
          dest: "contract_address"
        }
      ]
    })
  ],
  optimizeDeps: {
    exclude: ["@midnight-ntwrk/onchain-runtime"],
    include: [
      // "@midnight-ntwrk/midnight-js-network-id",
      "react/jsx-runtime",
      "npm:@midnight-ntwrk/compact-runtime"
    ],
    esbuildOptions: {
      target: "esnext"
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlUm9vdCI6ICJmaWxlOi8vL1VzZXJzL2VkdWFyZG9zb3RvL0NvZGUvcGFpbWEtZW5naW5lL3RlbXBsYXRlcy9ldm0tbWlkbmlnaHQvcGFja2FnZXMvZnJvbnRlbmQvIiwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvZWR1YXJkb3NvdG8vQ29kZS9wYWltYS1lbmdpbmUvdGVtcGxhdGVzL2V2bS1taWRuaWdodC9wYWNrYWdlcy9mcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2VkdWFyZG9zb3RvL0NvZGUvcGFpbWEtZW5naW5lL3RlbXBsYXRlcy9ldm0tbWlkbmlnaHQvcGFja2FnZXMvZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL2VkdWFyZG9zb3RvL0NvZGUvcGFpbWEtZW5naW5lL3RlbXBsYXRlcy9ldm0tbWlkbmlnaHQvcGFja2FnZXMvZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xuaW1wb3J0IGRlbm8gZnJvbSBcIkBkZW5vL3ZpdGUtcGx1Z2luXCI7XG5pbXBvcnQgbm9kZVBvbHlmaWxscyBmcm9tIFwidml0ZS1wbHVnaW4tbm9kZS1zdGRsaWItYnJvd3NlclwiO1xuaW1wb3J0IHdhc20gZnJvbSBcInZpdGUtcGx1Z2luLXdhc21cIjtcbmltcG9ydCBcInJlYWN0XCI7XG5pbXBvcnQgXCJyZWFjdC1kb21cIjtcbmltcG9ydCB7IHZpdGVTdGF0aWNDb3B5IH0gZnJvbSBcInZpdGUtcGx1Z2luLXN0YXRpYy1jb3B5XCI7XG5pbXBvcnQgeyBub3JtYWxpemVQYXRoIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJub2RlOnBhdGhcIjtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcm9vdDogXCIuL2NsaWVudFwiLFxuXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgLy8gRml4IGZvcjogTW9kdWxlIFwibnBtOkBzY29wZS9wYWNrYWdlQHZlcnNpb25cIiBoYXMgYmVlbiBleHRlcm5hbGl6ZWQgZm9yIGJyb3dzZXIgY29tcGF0aWJpbGl0eS5cbiAgICAgIC8vICAgICAgICAgIENhbm5vdCBhY2Nlc3MgXCJucG06QHNjb3BlL3BhY2thZ2VAdmVyc2lvbi5fX2VzTW9kdWxlXCIgaW4gY2xpZW50IGNvZGVcbiAgICAgIFwibnBtOkBwb2xrYWRvdC9leHRlbnNpb24tZGFwcEBeMC42MS43XCI6IFwiQHBvbGthZG90L2V4dGVuc2lvbi1kYXBwXCIsXG4gICAgICBcIm5wbTpAZm94Z2xvdmUvY3JjQF4xLjAuMVwiOiBcIkBmb3hnbG92ZS9jcmNcIixcbiAgICAgIFwiLi9AcG9sa2Fkb3QvdXRpbFwiOiBcIm5wbTpAcG9sa2Fkb3QvdXRpbC1jcnlwdG9cIixcbiAgICAgIFwiLi9AcG9sa2Fkb3QvdXRpbC1jcnlwdG9cIjogXCJucG06QHBvbGthZG90L3V0aWwtY3J5cHRvXCIsXG4gICAgICBcIm5wbTpAcG9sa2Fkb3QvdXRpbC1jcnlwdG9AXjEzLjQuM1wiOiBcIkBwb2xrYWRvdC91dGlsLWNyeXB0b1wiLFxuICAgICAgXCJucG06QHBvbGthZG90L3V0aWxAXjEzLjQuM1wiOiBcIkBwb2xrYWRvdC91dGlsXCIsXG4gICAgICBcIm5wbTpAcG9sa2Fkb3QvdXRpbC1jcnlwdG9AXjEzLjUuNlwiOiBcIkBwb2xrYWRvdC91dGlsLWNyeXB0b1wiLFxuICAgICAgXCJucG06QHBvbGthZG90L3V0aWxAXjEzLjUuNlwiOiBcIkBwb2xrYWRvdC91dGlsXCIsXG4gICAgICBcIm5wbTpAc2luY2xhaXIvdHlwZWJveEBeMC4zNC40MVwiOiBcIkBzaW5jbGFpci90eXBlYm94XCIsXG4gICAgICBcIm5wbTovQHNpbmNsYWlyL3R5cGVib3hAXjAuMzQuNDEvdmFsdWVcIjogXCJAc2luY2xhaXIvdHlwZWJveC92YWx1ZVwiLFxuICAgICAgXCJucG06QHNpbmNsYWlyL3R5cGVib3hAXjAuMzQuNDEvdmFsdWVcIjogXCJAc2luY2xhaXIvdHlwZWJveC92YWx1ZVwiLFxuICAgICAgXCJucG06L0BzaW5jbGFpci90eXBlYm94QH4wLjM0LjQxL3ZhbHVlXCI6IFwiQHNpbmNsYWlyL3R5cGVib3gvdmFsdWVcIixcbiAgICAgIFwibnBtOkBzaW5jbGFpci90eXBlYm94QF4wLjM0LjMwXCI6IFwiQHNpbmNsYWlyL3R5cGVib3hcIixcbiAgICAgIFwibnBtOi9Ac2luY2xhaXIvdHlwZWJveEBeMC4zNC4zMC92YWx1ZVwiOiBcIkBzaW5jbGFpci90eXBlYm94L3ZhbHVlXCIsXG4gICAgICBcIm5wbTpAc2luY2xhaXIvdHlwZWJveEBeMC4zNC4zMC92YWx1ZVwiOiBcIkBzaW5jbGFpci90eXBlYm94L3ZhbHVlXCIsXG4gICAgICBcIm5wbTovQHNpbmNsYWlyL3R5cGVib3hAfjAuMzQuMzAvdmFsdWVcIjogXCJAc2luY2xhaXIvdHlwZWJveC92YWx1ZVwiLFxuICAgICAgXCJucG06dmllbVwiOiBcInZpZW1cIixcbiAgICAgIFwibnBtOnZpZW0vYWNjb3VudHNcIjogXCJ2aWVtL2FjY291bnRzXCIsXG4gICAgICBcIm5wbTp2aWVtQDIuMzcuM1wiOiBcInZpZW1cIixcbiAgICAgIFwibnBtOnZpZW1AMi4zNy4zL2FjY291bnRzXCI6IFwidmllbS9hY2NvdW50c1wiLFxuICAgICAgXCJucG06L3ZpZW1AMi4zNy4zL2FjY291bnRzXCI6IFwidmllbS9hY2NvdW50c1wiLFxuICAgICAgXCJucG06QGRjc3BhcmsvY2lwMzQtanNAMy4wLjFcIjogXCJAZGNzcGFyay9jaXAzNC1qc1wiLFxuICAgICAgXCJucG06QGRjc3BhcmsvY2FycC1jbGllbnRAXjMuMy4wXCI6IFwiQGRjc3BhcmsvY2FycC1jbGllbnRcIixcbiAgICAgIFwibnBtOkBzdWJzcXVpZC9zczU4LWNvZGVjQF4xLjIuM1wiOiBcIkBzdWJzcXVpZC9zczU4LWNvZGVjXCIsXG4gICAgfSxcbiAgfSxcblxuICAvLyBvcHRpbWl6ZURlcHM6IHtcbiAgLy9cbiAgLy8gfSxcbiAgYnVpbGQ6IHtcbiAgICB0YXJnZXQ6IFwiZXNuZXh0XCIsXG4gICAgbWluaWZ5OiBmYWxzZSxcbiAgICAvLyBzb3VyY2VtYXA6IHRydWUsXG4gICAgY29tbW9uanNPcHRpb25zOiB7XG4gICAgICAvLyBUcmFuc2Zvcm0gQ29tbW9uSlMgdG8gRVNNIG1vcmUgYWdncmVzc2l2ZWx5XG4gICAgICB0cmFuc2Zvcm1NaXhlZEVzTW9kdWxlczogdHJ1ZSxcbiAgICAgIGV4dGVuc2lvbnM6IFtcIi5qc1wiLCBcIi5janNcIl0sXG4gICAgICAvLyBOZWVkZWQgZm9yIE5vZGUuanMgbW9kdWxlc1xuICAgICAgaWdub3JlRHluYW1pY1JlcXVpcmVzOiB0cnVlLFxuICAgIH0sXG4gIH0sXG4gIHNlcnZlcjoge1xuICAgIHBvcnQ6IDQwMDEsXG4gICAgb3BlbjogdHJ1ZSxcbiAgfSxcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgZGVubygpLFxuICAgIG5vZGVQb2x5ZmlsbHMoe1xuICAgICAgb3ZlcnJpZGVzOiB7XG4gICAgICAgIC8vIFNpbmNlIGBmc2AgaXMgbm90IHN1cHBvcnRlZCBpbiBicm93c2Vycywgd2UgY2FuIHVzZSB0aGUgYG1lbWZzYCBwYWNrYWdlIHRvIHBvbHlmaWxsIGl0LlxuICAgICAgICBmczogXCJtZW1mc1wiLFxuICAgICAgICBcIm5vZGU6ZnNcIjogXCJtZW1mc1wiLFxuICAgICAgfSxcbiAgICB9KSxcbiAgICAvLyB0b3BMZXZlbEF3YWl0KCksXG4gICAgd2FzbSgpLFxuICAgIHZpdGVTdGF0aWNDb3B5KHtcbiAgICAgIHRhcmdldHM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHNyYzogbm9ybWFsaXplUGF0aChcbiAgICAgICAgICAgIHBhdGgucmVzb2x2ZShcbiAgICAgICAgICAgICAgXCIuLlwiLFxuICAgICAgICAgICAgICBcInNoYXJlZFwiLFxuICAgICAgICAgICAgICBcImNvbnRyYWN0c1wiLFxuICAgICAgICAgICAgICBcIm1pZG5pZ2h0XCIsXG4gICAgICAgICAgICAgIFwiY29udHJhY3Qtcm91bmQtdmFsdWVcIixcbiAgICAgICAgICAgICAgXCJzcmNcIixcbiAgICAgICAgICAgICAgXCJtYW5hZ2VkXCIsXG4gICAgICAgICAgICAgIFwiY291bnRlclwiLFxuICAgICAgICAgICAgICBcImtleXNcIixcbiAgICAgICAgICAgICAgXCIqXCIsXG4gICAgICAgICAgICApLFxuICAgICAgICAgICksXG4gICAgICAgICAgLy8gc3JjOiBcInNyYy9jb250cmFjdC1yb3VuZC12YWx1ZS9zcmMvbWFuYWdlZC9jb3VudGVyL2tleXMvKlwiLFxuICAgICAgICAgIGRlc3Q6IFwia2V5c1wiLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3JjOiBub3JtYWxpemVQYXRoKFxuICAgICAgICAgICAgcGF0aC5yZXNvbHZlKFxuICAgICAgICAgICAgICBcIi4uXCIsXG4gICAgICAgICAgICAgIFwic2hhcmVkXCIsXG4gICAgICAgICAgICAgIFwiY29udHJhY3RzXCIsXG4gICAgICAgICAgICAgIFwibWlkbmlnaHRcIixcbiAgICAgICAgICAgICAgXCJjb250cmFjdC1yb3VuZC12YWx1ZVwiLFxuICAgICAgICAgICAgICBcInNyY1wiLFxuICAgICAgICAgICAgICBcIm1hbmFnZWRcIixcbiAgICAgICAgICAgICAgXCJjb3VudGVyXCIsXG4gICAgICAgICAgICAgIFwiemtpclwiLFxuICAgICAgICAgICAgICBcIipcIixcbiAgICAgICAgICAgICksXG4gICAgICAgICAgKSxcbiAgICAgICAgICAvLyBzcmM6IFwic3JjL2NvbnRyYWN0LXJvdW5kLXZhbHVlL3NyYy9tYW5hZ2VkL2NvdW50ZXIvemtpci8qXCIsXG4gICAgICAgICAgZGVzdDogXCJ6a2lyXCIsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzcmM6IG5vcm1hbGl6ZVBhdGgoXG4gICAgICAgICAgICBwYXRoLnJlc29sdmUoXG4gICAgICAgICAgICAgIFwiLi5cIixcbiAgICAgICAgICAgICAgXCJzaGFyZWRcIixcbiAgICAgICAgICAgICAgXCJjb250cmFjdHNcIixcbiAgICAgICAgICAgICAgXCJtaWRuaWdodFwiLFxuICAgICAgICAgICAgICBcImNvbnRyYWN0Lmpzb25cIixcbiAgICAgICAgICAgICksXG4gICAgICAgICAgKSxcbiAgICAgICAgICBkZXN0OiBcImNvbnRyYWN0X2FkZHJlc3NcIixcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSksXG4gIF0sXG5cbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgZXhjbHVkZTogW1wiQG1pZG5pZ2h0LW50d3JrL29uY2hhaW4tcnVudGltZVwiXSxcbiAgICBpbmNsdWRlOiBbXG4gICAgICAvLyBcIkBtaWRuaWdodC1udHdyay9taWRuaWdodC1qcy1uZXR3b3JrLWlkXCIsXG4gICAgICBcInJlYWN0L2pzeC1ydW50aW1lXCIsXG4gICAgICBcIm5wbTpAbWlkbmlnaHQtbnR3cmsvY29tcGFjdC1ydW50aW1lXCIsXG4gICAgXSxcbiAgICBlc2J1aWxkT3B0aW9uczoge1xuICAgICAgdGFyZ2V0OiBcImVzbmV4dFwiLFxuICAgIH0sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBeVosU0FBUyxvQkFBb0I7QUFDdGIsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixPQUFPLG1CQUFtQjtBQUMxQixPQUFPLFVBQVU7QUFDakIsT0FBTztBQUNQLE9BQU87QUFDUCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixPQUFPLFVBQVU7QUFFakIsSUFBTyxz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
