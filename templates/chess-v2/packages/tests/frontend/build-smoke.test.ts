import { assert } from "../helpers.ts";
import path from "path";

export async function frontendBuildTest() {
  await assert("Frontend builds without errors", async () => {
    const proc = Bun.spawn(["bunx", "vite", "build", "--mode", "dev"], {
      cwd: path.resolve(import.meta.dirname!, "../../frontend"),
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      console.error("Frontend build stderr:", stderr);
    }
    return exitCode === 0;
  });
}
