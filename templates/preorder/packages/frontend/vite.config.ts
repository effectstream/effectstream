import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  root: "./client",
  envDir: "..",

  resolve: {
    alias: {
      buffer: "buffer",
    },
  },

  build: {
    target: "esnext",
    minify: false,
    outDir: "dist",
  },

  server: {
    port: 10598,
    proxy: {
      "/api": "http://localhost:9999",
      "/yaci": {
        target: "http://localhost:10000",
        rewrite: (path) => path.replace(/^\/yaci/, "/local-cluster/api"),
      },
    },
  },

  plugins: [wasm(), topLevelAwait(), react()],
});
