import { assert } from "../helpers.ts";
import path from "path";
import fs from "node:fs";

export async function frontendBuildTest() {
  await assert("Frontend vite build exits successfully", async () => {
    const frontendDir = path.resolve(import.meta.dirname!, "../../frontend");
    const proc = Bun.spawn(
      ["bunx", "vite", "build", "--mode", "dev"],
      {
        cwd: frontendDir,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      console.error("[BUILD ERROR]", stderr.slice(-500));
      return false;
    }
    const distPath = path.join(frontendDir, "client", "dist", "index.html");
    return fs.existsSync(distPath);
  });
}
