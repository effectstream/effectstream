// True end-to-end test driving the nft-lvlup frontend through the local-JS
// wallet (WalletMode.EvmViem). Because EvmViem only needs a hardcoded private
// key + RPC URL — no browser extension — a headless Chromium can drive the full
// user flow: connect → mint a character (nftMint) → level it up (lvlUp) → the
// roster reflects the new level. This is the kind of test only a JS-native
// wallet makes possible.

import { assert } from "../helpers.ts";
import { chromium } from "playwright-core";

const FRONTEND_PORT = 10599;

// Hardhat well-known account #0 (matches frontend/index.js connectLocalWallet).
const EXPECTED_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

// Use a fresh token id (distinct from the Phase B tokens 1 + 2) so the e2e
// flow exercises a clean mint → lvlUp without colliding with prior state.
const E2E_TOKEN = 42;

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

export async function frontendE2ETest(): Promise<void> {
  const executablePath = findChrome();
  if (!executablePath) {
    console.log(
      "  [TEST] Frontend e2e — [SKIP] (no Chrome found; set CHROME_PATH to enable)",
    );
    return;
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    const jsErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(`${err.name}: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.addInitScript(() => {
      window.addEventListener("unhandledrejection", (e: any) => {
        console.error(`unhandledrejection: ${e.reason?.message ?? e.reason}`);
      });
    });

    await page.goto(`http://localhost:${FRONTEND_PORT}/`, {
      waitUntil: "load",
      timeout: 15_000,
    });
    await page.waitForSelector(".container", { timeout: 10_000 });

    // 1. Connect the local-JS wallet (EvmViem). No browser extension needed.
    await page.click('[data-testid="connect-local-wallet"]', { timeout: 5_000 });
    await page.waitForFunction(
      (expected) => {
        const el = document.querySelector('[data-testid="wallet-address"]');
        return el && el.textContent?.toLowerCase().includes(expected);
      },
      EXPECTED_ADDRESS,
      { timeout: 15_000 },
    );
    await assert(
      "Local-JS wallet connects in headless Chromium and shows the address",
      async () => {
        const text = await page.locator('[data-testid="wallet-address"]')
          .innerText();
        return text.toLowerCase().includes(EXPECTED_ADDRESS);
      },
    );

    // 2. The gameplay surface (mint panel + character roster) renders.
    await assert(
      "Gameplay surface renders for the connected wallet",
      async () =>
        (await page.$('[data-testid="mint-panel"]')) !== null &&
        (await page.$('[data-testid="mint-btn"]')) !== null &&
        (await page.$('[data-testid="character-list"]')) !== null,
    );

    // 3. The JS namespace exposing the wallet/tx API is available + connected.
    const namespaceOK = await page.evaluate(() => {
      const ns = (window as any).nftLvlUp;
      return Boolean(
        ns &&
          typeof ns.mintCharacter === "function" &&
          typeof ns.lvlUp === "function" &&
          ns.getAddress() != null,
      );
    });
    await assert(
      "Local-JS wallet exposes the gameplay JS namespace with a connected address",
      async () => namespaceOK,
    );

    // 4. Mint a character end-to-end: local-JS wallet signs → tx mines via the
    //    EvmViem provider's IProvider.sendTransaction → the indexer records the
    //    nftMint action. Then poll the API until the character row appears.
    const before = jsErrors.length;
    const mintResult: { ok: boolean; error?: string } = await page.evaluate(
      async (tokenId) => {
        try {
          await (window as any).nftLvlUp.mintCharacter(tokenId, "ether");
          return { ok: true };
        } catch (e: any) {
          return { ok: false, error: e?.message ?? String(e) };
        }
      },
      E2E_TOKEN,
    );
    if (!mintResult.ok) {
      console.log("  [e2e diag] mintCharacter rejected:", mintResult.error);
      if (consoleErrors.length) {
        console.log("  [e2e diag] page console.error:", consoleErrors.slice(0, 5));
      }
    }
    await assert(
      "Local-JS wallet's mintCharacter resolves end-to-end (chain receipt)",
      async () => mintResult.ok,
    );

    await assert(
      "Minted character appears via the API at level 1 (type ether)",
      async () => {
        const start = Date.now();
        while (Date.now() - start < 20_000) {
          const res = await page.evaluate(
            (tokenId) => (window as any).nftLvlUp.fetchCharacter(tokenId),
            E2E_TOKEN,
          );
          if (res && Number(res.level) === 1 && res.type === "ether") return true;
          await new Promise((r) => setTimeout(r, 750));
        }
        return false;
      },
    );

    // 5. Level up the character end-to-end and confirm the level increments.
    const lvlResult: { ok: boolean; error?: string } = await page.evaluate(
      async (tokenId) => {
        try {
          await (window as any).nftLvlUp.lvlUp(tokenId);
          return { ok: true };
        } catch (e: any) {
          return { ok: false, error: e?.message ?? String(e) };
        }
      },
      E2E_TOKEN,
    );
    if (!lvlResult.ok) {
      console.log("  [e2e diag] lvlUp rejected:", lvlResult.error);
    }
    await assert(
      "Local-JS wallet's lvlUp resolves end-to-end (chain receipt)",
      async () => lvlResult.ok,
    );

    await assert(
      "Levelled-up character reaches level 2 via the API",
      async () => {
        const start = Date.now();
        while (Date.now() - start < 20_000) {
          const res = await page.evaluate(
            (tokenId) => (window as any).nftLvlUp.fetchCharacter(tokenId),
            E2E_TOKEN,
          );
          if (res && Number(res.level) === 2) return true;
          await new Promise((r) => setTimeout(r, 750));
        }
        return false;
      },
    );

    await assert(
      "Driving mint + lvlUp does not produce a fatal pageerror",
      async () => jsErrors.length === before,
    );
  } finally {
    await browser.close();
  }
}
