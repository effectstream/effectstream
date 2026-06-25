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

// Phase C — interactions. The wallet connector is one global "Connect Wallet"
// button (injected by the bundle, top-right) that opens a modal offering a real
// installed wallet or a random "browser wallet". We click the button to open
// the modal, then click "Create browser wallet" (the path that works without a
// browser extension), asserting neither fires a fatal pageerror. `console.error`
// from discovery (no window.ethereum in headless Chromium) is expected/ignored.
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
    await page.waitForSelector('[data-testid="hex-battle-game"]', {
      timeout: 10_000,
    });

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

    // The global Connect Wallet button is injected by the bundle on boot.
    await page.waitForSelector('[data-testid="connect-wallet"]', {
      state: "visible",
      timeout: 10_000,
    });
    await clickDoesNotThrow(
      "Connect Wallet (opens modal)",
      '[data-testid="connect-wallet"]',
    );

    // The modal offers a random "browser wallet" — the path that works without a
    // browser extension. Clicking it generates + funds + connects a wallet.
    await page.waitForSelector('[data-testid="create-browser-wallet"]', {
      state: "visible",
      timeout: 5_000,
    });
    await clickDoesNotThrow(
      "Create browser wallet",
      '[data-testid="create-browser-wallet"]',
    );
  } finally {
    await browser.close();
  }
}
