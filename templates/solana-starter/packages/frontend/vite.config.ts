import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import nodePolyfills from "vite-plugin-node-stdlib-browser";

// @solana/web3.js expects Node's Buffer in the browser; the polyfill plugin
// provides it (and other node stdlib shims).
export default defineConfig({
  plugins: [react(), nodePolyfills()],
  define: {
    global: "globalThis",
  },
});
