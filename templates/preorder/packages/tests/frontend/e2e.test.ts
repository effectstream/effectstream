import { assert } from "../helpers.ts";
import path from "path";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForViteServer(
  url: string,
  timeoutMs = 30_000,
): Promise<void> {
  console.log(`  Waiting for Vite dev server at ${url}...`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not ready */
    }
    await delay(1000);
  }
  throw new Error(`Vite dev server did not start within ${timeoutMs / 1000}s`);
}

export async function frontendE2eTest(): Promise<void> {
  console.log("  Running Playwright E2E tests...");

  const frontendDir = path.resolve(import.meta.dirname!, "../../frontend");

  await waitForViteServer("http://localhost:10598");

  const installProc = Bun.spawn(
    ["bunx", "playwright", "install", "chromium"],
    {
      cwd: frontendDir,
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  await installProc.exited;

  const proc = Bun.spawn(
    ["bunx", "playwright", "test", "--config", "playwright.config.ts"],
    {
      cwd: frontendDir,
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        VITE_API_URL: `http://localhost:${process.env["EFFECTSTREAM_API_PORT"] || "9999"}`,
      },
    },
  );

  const exitCode = await proc.exited;
  await assert("Playwright E2E tests pass", async () => exitCode === 0);
}
