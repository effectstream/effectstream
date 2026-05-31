// True end-to-end test driving the frontend through the local-JS wallet
// (WalletMode.EvmViem). EvmViem needs only a hardcoded private key + RPC URL —
// no browser extension — so a headless Chromium can drive the full user flow:
// connect → render → submit a BATCHED gainExperience through the batcher.
//
// We exercise the batched path (sendBatcherTransaction) rather than the direct
// path: the batched path relies on `provider.signMessage` (which EvmViem
// implements) + the batcher's /send-input, not the EvmViem direct
// `sendTransaction` (which doesn't yet round-trip the indexer end-to-end — see
// references/migration.md "Known engine gap when migrating to EvmViem").

import { assert } from "../helpers.ts";
import { chromium } from "playwright-core";

const FRONTEND_PORT = 10599;

// Hardhat well-known account #0 (matches LOCAL_PRIVATE_KEY in frontend/index.js
// → connectLocalWallet → WalletMode.EvmViem).
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

    await page.goto(`http://localhost:${FRONTEND_PORT}/`, {
      waitUntil: "load",
      timeout: 15_000,
    });
    await page.waitForSelector(".container", { timeout: 10_000 });

    // 1. Connect the local-JS wallet (EvmViem builds a viem WalletClient
    //    in-process from the hardcoded Hardhat key — no extension needed).
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

    // 2. The JS namespace exposes the gameplay API with a connected wallet.
    const namespaceOK = await page.evaluate(() => {
      const ns = (window as any).web25;
      return Boolean(
        ns &&
          typeof ns.changeName === "function" &&
          typeof ns.gainExperience === "function" &&
          ns.getAddress() != null,
      );
    });
    await assert(
      "Local-JS wallet exposes the web25 JS namespace with a connected address",
      async () => namespaceOK,
    );

    // 3. Drive a BATCHED gainExperience through the batcher. This is the full
    //    web2.5 pipeline: EvmViem signs the batcher message → /send-input →
    //    batcher rolls it on-chain → indexer parses → STM credits XP → DB.
    const submitResult: { ok: boolean; error?: string } = await page.evaluate(
      async () => {
        try {
          await (window as any).web25.gainExperience(2);
          return { ok: true };
        } catch (e: any) {
          return { ok: false, error: e?.message ?? String(e) };
        }
      },
    );
    if (!submitResult.ok) {
      console.log("  [e2e diag] gainExperience rejected:", submitResult.error);
      if (consoleErrors.length) {
        console.log("  [e2e diag] page console.error:", consoleErrors.slice(0, 5));
      }
    }
    await assert(
      "Local-JS wallet's batched gainExperience(2) resolves end-to-end (web2.5 path)",
      async () => submitResult.ok,
    );

    await assert(
      "Submitting an action does not produce a fatal pageerror",
      async () => jsErrors.length === 0,
    );
  } finally {
    await browser.close();
  }
}
