import { assert } from "../helpers.ts";
import path from "node:path";

// Phase C — build smoke. The frontend bundles the real Hex Battle game
// (canvas UI + @hex-battle/engine + @effectstream/wallets) with esbuild into
// packages/frontend/site/bundle.js. This asserts the bundler exits 0 and the
// bundle artifact lands in the served site/ dir.
export async function frontendBuildTest() {
  const frontendDir = path.resolve(import.meta.dirname!, "../../frontend");

  await assert("Frontend esbuild exits successfully", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "--filter", "@hex-battle/frontend", "build"],
      {
        cwd: path.resolve(import.meta.dirname!, "../../.."),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    return (await proc.exited) === 0;
  });

  await assert("Frontend bundle is emitted to site/bundle.js", async () => {
    const bundle = Bun.file(path.join(frontendDir, "site", "bundle.js"));
    return (await bundle.exists()) && bundle.size > 0;
  });
}
