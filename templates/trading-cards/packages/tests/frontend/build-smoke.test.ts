import { assert } from "../helpers.ts";
import path from "node:path";

export async function frontendBuildTest() {
  await assert("Frontend esbuild exits successfully", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "--filter", "@trading-cards/frontend", "build"],
      {
        cwd: path.resolve(import.meta.dirname!, "../../.."),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    return (await proc.exited) === 0;
  });
}
