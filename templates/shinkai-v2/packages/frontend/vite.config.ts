import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: path.resolve(import.meta.dirname!, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname!, "client/dist"),
    emptyOutDir: true,
  },
  server: {
    port: 10599,
  },
});
