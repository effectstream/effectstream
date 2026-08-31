import { assert } from "../helpers.ts";
import { chromium } from "playwright-core";

const FRONTEND_PORT = 10599;

function findChrome(): string | undefined {
  const env = process.env["CHROME_PATH"];
  if (env) return env;
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
    try {
      const stat = Bun.file(candidate);
      if (stat) return candidate;
    } catch {/* ignore */}
  }
  return undefined;
}

export async function frontendRenderTest(): Promise<void> {
  const executablePath = findChrome();
  if (!executablePath) {
    console.log(
      "  [TEST] Frontend render — [SKIP] (no Chrome found; set CHROME_PATH to enable)",
    );
    return;
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto(`http://localhost:${FRONTEND_PORT}/`, {
      waitUntil: "load",
      timeout: 15_000,
    });
    await page.waitForSelector(".container", { timeout: 10_000 });

    await assert(
      "Frontend mounts: .container is present",
      async () => (await page.$(".container")) !== null,
    );

    await assert(
      "Frontend exposes both wallet buttons (browser + local)",
      async () =>
        (await page.$('[data-testid="connect-browser-wallet"]')) !== null &&
        (await page.$('[data-testid="connect-local-wallet"]')) !== null,
    );

    await assert(
      "Frontend ships the gameplay surface (mint panel + character roster)",
      async () =>
        (await page.$('[data-testid="mint-panel"]')) !== null &&
        (await page.$('[data-testid="mint-type-select"]')) !== null &&
        (await page.$('[data-testid="mint-btn"]')) !== null &&
        (await page.$('[data-testid="characters"]')) !== null &&
        (await page.$('[data-testid="character-list"]')) !== null,
    );

    await assert(
      "Frontend has no fatal JS errors on load",
      async () => jsErrors.length === 0,
    );
  } finally {
    await browser.close();
  }
}
