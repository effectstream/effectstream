import { assert } from "../helpers.ts";
import path from "path";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForViteServer(
  url: string,
  timeoutMs = 60_000,
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

  // Spawn the Vite dev server HERE (not as a long-lived orchestrator process).
  // Launched early and left idle for ~80s under memory pressure it can be
  // OOM-killed silently, and the readiness poll below would then time out.
  // Starting it immediately before the check keeps the live window tiny and
  // self-contained; we tear it down in the finally.
  // --host is not cosmetic. Vite's default host is "localhost", which Node
  // resolves to ::1 inside the CI container, so vite binds IPv6 loopback ONLY
  // (`ss -ltn` → LISTEN [::1]:10598). Bun's fetch resolves "localhost" to
  // 127.0.0.1, so the readiness poll below got ECONNREFUSED for the full 60s
  // while vite sat there reporting "ready in 418 ms". Pin both ends to the same
  // literal IPv4 address so neither can drift onto a different family again.
  const viteProc = Bun.spawn(
    ["bunx", "vite", "--port", "10598", "--host", "127.0.0.1", "--mode", "dev"],
    { cwd: frontendDir, stdout: "inherit", stderr: "inherit" },
  );

  try {
    await waitForViteServer("http://127.0.0.1:10598");

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
  } finally {
    viteProc.kill();
  }
}
