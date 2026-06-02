/**
 * Standalone "does the page launch?" smoke test for the REAL Hex Battle frontend.
 *
 * Unlike the orchestrator-coupled Phase C tests (render/interactions/e2e), which
 * assume Phase A/B already started the full stack, this test needs **no backend**
 * — no chain, DB, or sync node; no ports 5432/8545/9999. It builds the frontend,
 * serves it on :10599, loads it in headless Chromium, and asserts the real game's
 * surface mounts. That lets you verify the page launches even when the full
 * service can't run (e.g. port 5432 is in use by something else).
 *
 * Run it standalone:
 *   bun run packages/tests/frontend/launch.test.ts      (or: bun run test:launch)
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 10599;
const FRONTEND_DIR = path.join(import.meta.dirname!, "..", "..", "frontend");

// Resolve a Chromium binary. CHROME_PATH wins; otherwise probe common system
// paths. NOTE: this verifies the file actually EXISTS (existsSync) — the older
// `Bun.file(candidate)` check returned a truthy lazy handle even for missing
// files, so it always "found" /usr/bin/google-chrome and then threw at launch.
function findChrome(): string | undefined {
  const env = process.env["CHROME_PATH"];
  if (env && existsSync(env)) return env;
  for (
    const candidate of [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
  ) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function killPort(port: number): void {
  Bun.spawnSync(["sh", "-c", `lsof -ti tcp:${port} | xargs -r kill`]);
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* server not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`frontend did not come up at ${url} within ${timeoutMs}ms`);
}

export async function frontendLaunchTest(): Promise<void> {
  const executablePath = findChrome();
  if (!executablePath) {
    console.log(
      "  [TEST] Frontend launch — [SKIP] (no Chrome found; set CHROME_PATH to enable)",
    );
    return;
  }

  // 1. Build the real game bundle (esbuild -> site/bundle.js). No ports needed.
  console.log("  [launch] building frontend (esbuild)...");
  const build = Bun.spawn(["bun", "run", "build"], {
    cwd: FRONTEND_DIR,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await build.exited) !== 0) throw new Error("frontend build failed");

  // 2. Serve site/ on :10599 (frontend only — no backend).
  killPort(PORT);
  console.log(`  [launch] serving on :${PORT}...`);
  const server = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: FRONTEND_DIR,
    stdout: "inherit",
    stderr: "inherit",
  });

  let failures = 0;
  const assert = async (
    name: string,
    fn: () => Promise<boolean> | boolean,
  ): Promise<void> => {
    let ok = false;
    try {
      ok = await fn();
    } catch (e) {
      console.log(`    ${name}: threw ${(e as Error)?.message ?? e}`);
    }
    console.log(`  [TEST] ${name}... ${ok ? "PASS" : "FAIL"}`);
    if (!ok) failures++;
  };

  try {
    await waitForServer(`http://localhost:${PORT}/`, 30_000);

    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      const page = await browser.newPage();
      const jsErrors: string[] = [];
      page.on("pageerror", (err) => jsErrors.push(err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") jsErrors.push(`console.error: ${msg.text()}`);
      });

      await page.goto(`http://localhost:${PORT}/`, {
        waitUntil: "load",
        timeout: 20_000,
      });
      await page.waitForSelector('[data-testid="hex-battle-game"]', {
        timeout: 10_000,
      });
      // Give the bundle a moment to boot (it sets window.hexBattle during init).
      await page.waitForTimeout(2_000);
      if (jsErrors.length) {
        console.log("    --- JS errors captured on boot ---");
        for (const e of jsErrors.slice(0, 12)) console.log(`      ${e}`);
      }
      const nsState = await page.evaluate(() =>
        JSON.stringify(
          Object.keys((window as { hexBattle?: object }).hexBattle ?? {}),
        )
      );
      console.log(`    window.hexBattle keys: ${nsState}`);

      await assert(
        "page title is HexBattle",
        async () => (await page.title()) === "HexBattle",
      );
      await assert(
        "the real game container + canvas (#myCanvas) mount",
        async () =>
          (await page.$('[data-testid="hex-battle-game"]')) !== null &&
          (await page.$('[data-testid="game-canvas"]')) !== null &&
          (await page.$("#myCanvas")) !== null,
      );
      await assert(
        "both wallet connect buttons present (browser + local-JS)",
        async () =>
          (await page.$('[data-testid="connect-browser-wallet"]')) !== null &&
          (await page.$('[data-testid="connect-local-wallet"]')) !== null,
      );
      await assert(
        "the hexBattle integration namespace is wired",
        async () =>
          await page.evaluate(() => {
            const ns = (window as { hexBattle?: Record<string, unknown> })
              .hexBattle;
            return Boolean(
              ns &&
                typeof ns.connectLocalWallet === "function" &&
                typeof ns.createLobby === "function",
            );
          }),
      );
      await assert(
        "no fatal JS errors while the game boots",
        async () => jsErrors.length === 0,
      );
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
    killPort(PORT);
  }

  if (failures > 0) {
    throw new Error(`frontend launch: ${failures} assertion(s) failed`);
  }
  console.log(
    "\n  [launch] PASS — the Hex Battle page launches and renders (frontend-only, no backend).",
  );
}

// Allow running standalone: `bun run packages/tests/frontend/launch.test.ts`
if (import.meta.main) {
  frontendLaunchTest()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("  [launch] FAIL:", (e as Error)?.message ?? e);
      process.exit(1);
    });
}
