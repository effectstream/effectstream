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
      if (Bun.file(candidate)) return candidate;
    } catch {/* ignore */}
  }
  return undefined;
}

export async function frontendInteractionsTest(): Promise<void> {
  const executablePath = findChrome();
  if (!executablePath) {
    console.log(
      "  [TEST] Frontend interactions — [SKIP] (no Chrome found; set CHROME_PATH to enable)",
    );
    return;
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    const jsErrors: string[] = [];
    page.on("pageerror", (err) =>
      jsErrors.push(`${err.name}: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") jsErrors.push(`console.error: ${msg.text()}`);
    });

    await page.goto(`http://localhost:${FRONTEND_PORT}/`, {
      waitUntil: "load",
      timeout: 15_000,
    });
    await page.waitForSelector(".container", { timeout: 10_000 });

    // Per skill: every primary CTA reachable on the landing screen must be
    // exercised. We assert that clicking a CTA does NOT produce a NEW fatal
    // pageerror — happy-path completion is not required (e.g. no MetaMask in
    // headless). `console.error` from our catch blocks is expected for the
    // browser-wallet button when window.ethereum is absent — those are logged,
    // not thrown.
    async function clickDoesNotThrow(name: string, selector: string) {
      await assert(`CTA ${name} does not throw on click`, async () => {
        const beforePageErrors = jsErrors.filter((e) =>
          !e.startsWith("console.error:")
        ).length;
        await page.click(selector, { timeout: 5_000 });
        await page.waitForTimeout(2_000);
        const afterPageErrors = jsErrors.filter((e) =>
          !e.startsWith("console.error:")
        ).length;
        return afterPageErrors === beforePageErrors;
      });
    }

    await clickDoesNotThrow(
      "Connect Browser Wallet",
      '[data-testid="connect-browser-wallet"]',
    );
    await clickDoesNotThrow(
      "Connect Local Wallet",
      '[data-testid="connect-local-wallet"]',
    );
    await clickDoesNotThrow(
      "Refresh Characters",
      '[data-testid="refresh-characters-btn"]',
    );
  } finally {
    await browser.close();
  }
}
