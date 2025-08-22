import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deno from "@deno/vite-plugin";
import nodePolyfills from "vite-plugin-node-stdlib-browser";

import "react";
import "react-dom";

export default defineConfig({
  root: "./client",
  server: {
    port: 4001,
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
