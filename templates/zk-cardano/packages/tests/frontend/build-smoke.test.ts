import { assert } from "../helpers.ts";
import path from "node:path";
import fs from "node:fs";

export async function frontendBuildTest() {
  const frontendDir = path.resolve(import.meta.dirname!, "../../../packages/frontend");

  await assert("Vite build succeeds", async () => {
    const proc = Bun.spawn(["bun", "run", "build"], {
      cwd: frontendDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  });

  await assert("Build output exists", async () => {
    return fs.existsSync(path.join(frontendDir, "client", "dist", "index.html"));
  });
}
