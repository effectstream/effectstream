import { assert } from "../helpers.ts";
import path from "path";
import { chromium } from "playwright-core";

const FRONTEND_PORT = 10599;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${FRONTEND_PORT}/`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await delay(300);
  }
  throw new Error(`Frontend server did not start within ${timeoutMs / 1000}s`);
}

function findChrome(): string {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];
  for (const c of candidates) {
    try {
      if (Bun.file(c).size > 0) return c;
    } catch { /* ignore */ }
  }
  throw new Error("Chrome/Chromium not found. Install Chrome or set CHROME_PATH.");
}

export async function frontendRenderTest() {
  const frontendDir = path.resolve(import.meta.dirname!, "../../frontend");
  const proc = Bun.spawn([process.argv0, "run", "server/main.ts"], {
    cwd: frontendDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    await waitForServer();

    await assert("Frontend server responds 200 on /", async () => {
      const res = await fetch(`http://localhost:${FRONTEND_PORT}/`);
      return res.status === 200;
    });

    const executablePath = process.env["CHROME_PATH"] || findChrome();
    // Opt in only for x64 Chromium running under ARM Docker/QEMU; native CI
    // keeps the normal multi-process browser launch.
    const emulatedChromiumArgs =
      process.env["EFFECTSTREAM_CHROMIUM_NO_ZYGOTE"] === "1"
        ? ["--no-zygote"]
        : undefined;
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: emulatedChromiumArgs,
    });
    const page = await browser.newPage();

    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto(`http://localhost:${FRONTEND_PORT}/`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForSelector(".app-container", { timeout: 15_000 });

    await assert("Frontend React app mounts (app-container rendered)", async () => {
      const container = await page.$(".app-container");
      return container !== null;
    });

    await assert("Frontend renders header", async () => {
      const header = await page.$("header.app-header");
      return header !== null;
    });

    await assert("Frontend renders main title 'Night-Bitcoin Swap'", async () => {
      const title = await page.textContent("h1.main-title");
      return title !== null && title.includes("Night-Bitcoin Swap");
    });

    await assert("Frontend renders swap container", async () => {
      const swap = await page.$(".swap-container");
      return swap !== null;
    });

    await assert("Frontend has no fatal JS errors", async () => {
      if (jsErrors.length > 0) {
        console.log("\n  JS errors:", jsErrors);
      }
      return jsErrors.length === 0;
    });
  } finally {
    if (browser) await browser.close();
    proc.kill();
  }
}
