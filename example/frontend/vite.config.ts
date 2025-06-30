import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deno from "@deno/vite-plugin";
// import inject from "npm:@rollup/plugin-inject";
import nodePolyfills from "npm:vite-plugin-node-stdlib-browser";

import "react";
import "react-dom";

export default defineConfig({
  root: "./client",
  server: {
    port: 3000,
    open: true,
  },
  plugins: [
    react(),
    deno(),
    nodePolyfills(),
  ],
  optimizeDeps: {
    include: ["react/jsx-runtime"],
  },
});
