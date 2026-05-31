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

// Phase C — interactions. The wallet connect buttons live in the game's
// wallet-selection modal (#wallet_selection), which the canvas game reveals via
// popup.js's `wallet_selection_show()`. We reveal it directly (the canvas-drawn
// menu button that normally opens it can't be DOM-clicked), then assert each
// connect CTA fires without throwing a fatal pageerror. `console.error` from a
// catch block (e.g. the browser-wallet button when window.ethereum is absent in
// headless Chromium) is expected and ignored.
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

    // Reveal the wallet-selection modal so its buttons become clickable.
    await page.evaluate(() => {
      const sel = document.getElementById("wallet_selection");
      sel?.classList.remove("hide");
    });
    await page.waitForSelector('[data-testid="connect-browser-wallet"]', {
      state: "visible",
      timeout: 5_000,
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

    await clickDoesNotThrow(
      "Connect Browser Wallet",
      '[data-testid="connect-browser-wallet"]',
    );

    // Re-reveal the modal (it hides itself after a selection) for the local one.
    await page.evaluate(() => {
      const sel = document.getElementById("wallet_selection");
      sel?.classList.remove("hide");
    });
    await page.waitForSelector('[data-testid="connect-local-wallet"]', {
      state: "visible",
      timeout: 5_000,
    });
    await clickDoesNotThrow(
      "Connect Local Wallet",
      '[data-testid="connect-local-wallet"]',
    );
  } finally {
    await browser.close();
  }
}
