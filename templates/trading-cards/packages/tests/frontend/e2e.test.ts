// True end-to-end test driving the trading-cards frontend through the local-JS
// wallet (WalletMode.EvmViem). Because EvmViem only needs a hardcoded private
// key + RPC URL — no browser extension — a headless Chromium can drive the full
// user flow: connect → gameplay surface renders → submit a write tx from the JS
// namespace (mint an account NFT + create a lobby). See references/migration.md
// § "Preserve user-facing UX" / "Wallet UI" banners.

import { assert } from "../helpers.ts";
import { chromium } from "playwright-core";

const FRONTEND_PORT = 10599;

// Hardhat well-known account #0 (matches frontend/index.js connectLocalWallet).
const EXPECTED_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

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

    // 2. Wait for the wallet-address element to show Hardhat account #0.
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

    // 3. The card-game surface is rendered.
    await assert(
      "Gameplay surface renders for the connected wallet",
      async () =>
        (await page.$('[data-testid="main-menu"]')) !== null &&
        (await page.$('[data-testid="card-game"]')) !== null &&
        (await page.$('[data-testid="play-card-btn"]')) !== null,
    );

    // 4. The JS namespace exposing the wallet/tx API is available + connected.
    const namespaceOK = await page.evaluate(() => {
      const ns = (window as any).tradingCards;
      return Boolean(
        ns &&
          typeof ns.accountMint === "function" &&
          typeof ns.createLobby === "function" &&
          typeof ns.joinLobby === "function" &&
          typeof ns.submitMove === "function" &&
          ns.getAddress() != null,
      );
    });
    await assert(
      "Local-JS wallet exposes the gameplay JS namespace with a connected address",
      async () => namespaceOK,
    );

    // 5. Drive write txs through the namespace: mint an account NFT, then create
    //    a lobby + submit a card move. This is the full pipeline (local-JS
    //    wallet signs → tx mines via the EvmViem provider). Resolving the
    //    receipts is sufficient proof the wallet path works end-to-end.
    const before = jsErrors.length;
    const submitResult: { ok: boolean; error?: string } = await page.evaluate(
      async () => {
        try {
          const ns = (window as any).tradingCards;
          // Use a high token id so it doesn't clash with the Phase B NFTs.
          await ns.accountMint(777);
          await ns.createLobby(777, "", 2, 100);
          return { ok: true };
        } catch (e: any) {
          return { ok: false, error: e?.message ?? String(e) };
        }
      },
    );
    if (!submitResult.ok) {
      console.log("  [e2e diag] write tx rejected:", submitResult.error);
      if (consoleErrors.length) {
        console.log(
          "  [e2e diag] page console.error:",
          consoleErrors.slice(0, 5),
        );
      }
    }
    await assert(
      "Local-JS wallet's accountMint + createLobby resolve end-to-end (chain receipt)",
      async () => submitResult.ok,
    );

    await assert(
      "Submitting txs does not produce a fatal pageerror",
      async () => jsErrors.length === before,
    );
  } finally {
    await browser.close();
  }
}
