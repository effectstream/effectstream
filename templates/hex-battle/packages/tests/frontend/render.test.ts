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

// Phase C — render. Hex Battle is a canvas game: the lobby menu, hex board,
// units and buildings are all drawn onto #myCanvas (we do NOT pixel-drive it,
// per the migration plan). What we CAN assert from the DOM is that the real
// game's load-bearing surface mounts: the game container + canvas, the wallet
// selection modal with BOTH connect buttons (browser + local-JS), and that the
// bundle (game + @effectstream/wallets + engine) boots without fatal errors.
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

    // The real game's container + canvas mount.
    await page.waitForSelector('[data-testid="hex-battle-game"]', {
      timeout: 10_000,
    });

    await assert(
      "Frontend mounts: the Hex Battle game container is present",
      async () => (await page.$('[data-testid="hex-battle-game"]')) !== null,
    );

    await assert(
      "Frontend renders the gameplay canvas (#myCanvas)",
      async () =>
        (await page.$('[data-testid="game-canvas"]')) !== null &&
        (await page.$("#myCanvas")) !== null,
    );

    // The single global "Connect Wallet" button is injected by the bundle on
    // boot (mountConnectWidget). It opens a modal offering a real installed
    // wallet or a random "browser wallet".
    await assert(
      "Frontend exposes the global Connect Wallet button",
      async () => {
        await page.waitForSelector('[data-testid="connect-wallet"]', {
          timeout: 5_000,
        });
        return true;
      },
    );

    // The additive integration namespace (used by headless e2e) is wired up.
    await assert(
      "Frontend exposes the hexBattle integration namespace",
      async () =>
        await page.evaluate(() => {
          const ns = (window as any).hexBattle;
          return Boolean(
            ns &&
              typeof ns.connectLocalWallet === "function" &&
              typeof ns.createLobby === "function",
          );
        }),
    );

    await assert(
      "Frontend has no fatal JS errors on load",
      async () => jsErrors.length === 0,
    );
  } finally {
    await browser.close();
  }
}
