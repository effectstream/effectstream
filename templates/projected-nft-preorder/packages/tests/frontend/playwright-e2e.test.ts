import { assert } from "../helpers.ts";
import path from "node:path";

export async function playwrightE2eTest() {
  const frontendDir = path.resolve(import.meta.dirname!, "../../../packages/frontend");

  await assert("Playwright E2E tests pass", async () => {
    const proc = Bun.spawn(["bunx", "playwright", "test", "--reporter=list"], {
      cwd: frontendDir,
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  });
}
