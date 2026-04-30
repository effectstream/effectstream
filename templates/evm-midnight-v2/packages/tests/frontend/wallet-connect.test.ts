import { assert } from "../helpers.ts";
import { chromium } from "playwright-core";
import path from "path";

const FRONTEND_PORT = 10599;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    } catch {}
  }
  throw new Error(
    "Chrome/Chromium not found. Install Chrome or set CHROME_PATH.",
  );
}

async function waitForServer(timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${FRONTEND_PORT}/`);
      if (res.ok) return;
    } catch {}
    await delay(300);
  }
  throw new Error(`Frontend server did not start within ${timeoutMs / 1000}s`);
}

export async function walletConnectTest() {
  const frontendDir = path.resolve(import.meta.dirname!, "../../frontend");
  const proc = Bun.spawn([process.argv0, "run", "server/main.ts"], {
    cwd: frontendDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  const executablePath = process.env["CHROME_PATH"] || findChrome();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
  });

  try {
    await waitForServer();

    const page = await browser.newPage();
    await page.goto(`http://localhost:${FRONTEND_PORT}/`, {
      waitUntil: "load",
      timeout: 15_000,
    });
    await page.waitForSelector(".wallet-demo-section", { timeout: 10_000 });

    // The status bar should show "Connect EVM" button
    await assert(
      "Frontend: status bar shows Connect EVM button",
      async () => {
        const btn = await page.$(".evm-chip .status-connect-btn");
        return btn !== null;
      },
    );

    // Click Connect EVM → modal opens
    await assert("Frontend: clicking Connect EVM opens wallet modal", async () => {
      const btn = await page.$(".evm-chip .status-connect-btn");
      if (!btn) return false;
      await btn.click();
      await page.waitForSelector(".wallet-modal-overlay", { timeout: 5_000 });
      return true;
    });

    // Modal should show Local Wallet first with RECOMMENDED badge
    await assert(
      "Frontend: wallet modal shows Local Wallet with RECOMMENDED badge",
      async () => {
        const badge = await page.$(".recommended-badge");
        if (!badge) return false;
        const text = await badge.textContent();
        return text?.includes("RECOMMENDED") ?? false;
      },
    );

    // Modal should show the key disclaimer with copy button
    await assert(
      "Frontend: wallet modal shows key disclaimer with copy button",
      async () => {
        const disclaimer = await page.$(".wallet-disclaimer");
        if (!disclaimer) return false;
        const copyBtn = await page.$(".copy-key-btn");
        return copyBtn !== null;
      },
    );

    // Close modal
    await assert("Frontend: can close wallet modal", async () => {
      const closeBtn = await page.$(".wallet-modal-close");
      if (!closeBtn) return false;
      await closeBtn.click();
      await page.waitForSelector(".wallet-modal-overlay", {
        state: "hidden",
        timeout: 3_000,
      });
      return true;
    });

    // Verify Midnight connect button is present
    await assert(
      "Frontend: status bar shows Connect Midnight button",
      async () => {
        const btn = await page.$(".midnight-chip .status-connect-btn");
        return btn !== null;
      },
    );

    // Verify the cards title is rendered
    await assert("Frontend: cards title renders correctly", async () => {
      const title = await page.$(".cards-title");
      if (!title) return false;
      const text = await title.textContent();
      return text?.includes("Merged EVM ERC721") ?? false;
    });

    // Verify refresh button is in the card
    await assert("Frontend: refresh button present in card", async () => {
      const btn = await page.$(".tokens-cards-container .refresh-button");
      return btn !== null;
    });

    // Wait for token cards to load from the API (polls every 5s)
    await assert(
      "Frontend: token cards render from API data",
      async () => {
        await page.waitForSelector(".token-card", { timeout: 15_000 });
        const cards = await page.$$(".token-card");
        return cards.length > 0;
      },
    );

    // Verify token #100 (minted in Phase C) appears
    await assert(
      "Frontend: token #100 card is visible",
      async () => {
        const names = await page.$$eval(".card-token-name", (els) =>
          els.map((el) => el.textContent ?? ""),
        );
        return names.some((t) => t.includes("#100") || t.includes("100"));
      },
    );

    // Verify the Midnight property from Phase D renders on token #100's card
    await assert(
      "Frontend: token #100 shows testProp property from Midnight",
      async () => {
        const cards = await page.$$(".token-card");
        for (const card of cards) {
          const name = await card.$eval(".card-token-name", (el) => el.textContent ?? "").catch(() => "");
          if (!name.includes("100")) continue;
          const keys = await card.$$eval(".property-key", (els) =>
            els.map((el) => (el.textContent ?? "").replace(":", "").trim()),
          );
          const values = await card.$$eval(".property-value", (els) =>
            els.map((el) => (el.textContent ?? "").trim()),
          );
          const idx = keys.indexOf("testProp");
          if (idx >= 0 && values[idx] === "testValue") return true;
        }
        return false;
      },
    );
  } finally {
    await browser.close();
    proc.kill();
  }
}
