import { assert } from "../helpers.ts";
import path from "path";

export async function frontendBuildTest() {
  await assert("Frontend Vite build succeeds", async () => {
    const frontendDir = path.resolve(import.meta.dirname!, "../../../packages/frontend");
    const proc = Bun.spawn(["bun", "run", "build"], {
      cwd: frontendDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      console.error("[Frontend build stderr]", stderr);
    }
    return exitCode === 0;
  });
}
