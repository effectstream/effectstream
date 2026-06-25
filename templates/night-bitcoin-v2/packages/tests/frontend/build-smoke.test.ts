import { assert } from "../helpers.ts";
import path from "path";

export async function frontendBuildTest() {
  await assert("Frontend vite build exits successfully", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "--filter", "@night-bitcoin/frontend", "build"],
      {
        cwd: path.resolve(import.meta.dirname!, "../../.."),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const exitCode = await proc.exited;
    return exitCode === 0;
  });
}
