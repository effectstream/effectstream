// True end-to-end test driving the frontend through the local-JS wallet
// (WalletMode.EvmViem). Because EvmViem only needs a hardcoded private key +
// RPC URL — no browser extension — a headless Chromium can drive the *full*
// user flow: wallet connect → submit gainedExperience → see the XP reflected
// via the API. This is the kind of test only a JS-native wallet makes possible.
//
// Pattern applies equally to Cardano (`WalletMode.CardanoLocal`) and Midnight
// (`WalletMode.MidnightLocal`). See references/migration.md
// § "Preserve user-facing UX" and references/tests.md § "Phase C".

import { assert } from "../helpers.ts";
import { chromium } from "playwright-core";

const FRONTEND_PORT = 10599;
const API_PORT = 9999;

// Hardhat well-known account #0 (matches frontend/index.js connectLocalWallet
// → WalletMode.EvmViem private key).
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

async function readXp(): Promise<number | null> {
  const res = await fetch(
    `http://localhost:${API_PORT}/user_state?wallet=${EXPECTED_ADDRESS}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { experience: number } | null;
  return data ? Number(data.experience) : null;
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

    // 1. Connect Local Wallet — EvmViem creates a viem WalletClient in-process
    //    from the hardcoded Hardhat private key (no extension needed).
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

    // 3. Validate the JS namespace exposing the wallet/tx API is available and
    //    points at the connected wallet.
    const namespaceOK = await page.evaluate(() => {
      const ns = (window as any).gamemaker;
      return Boolean(
        ns &&
          typeof ns.gainExperience === "function" &&
          typeof ns.fetchUserState === "function" &&
          ns.getAddress() != null,
      );
    });
    await assert(
      "Local-JS wallet exposes the gameplay JS namespace with a connected address",
      async () => namespaceOK,
    );

    // 4. Drive gainExperience(2) through the frontend's JS namespace. Full
    //    pipeline: local-JS wallet signs → tx mines → indexer picks up → STM
    //    transition runs → DB updates → API serves new XP. Possible because
    //    the EvmViem provider implements IProvider.sendTransaction (engine fix
    //    merged in fix/wallets-evm-viem-send-transaction).
    const xpBefore = (await readXp()) ?? 0;
    const moveBefore = jsErrors.length;
    const submitResult: { ok: boolean; error?: string } = await page.evaluate(
      async () => {
        try {
          await (window as any).gamemaker.gainExperience(2);
          return { ok: true };
        } catch (e: any) {
          return { ok: false, error: e?.message ?? String(e) };
        }
      },
    );
    if (!submitResult.ok) {
      console.log("  [e2e diag] gainExperience rejected:", submitResult.error);
      if (consoleErrors.length) {
        console.log(
          "  [e2e diag] page console.error:",
          consoleErrors.slice(0, 5),
        );
      }
    }
    await assert(
      "Local-JS wallet's gainExperience(2) resolves end-to-end (chain receipt)",
      async () => submitResult.ok,
    );

    // 5. The XP submitted via the frontend lands in the DB and is served by the
    //    API (+20 for experience=2, per `prev + experience * 10`). Poll until
    //    the indexer + STM have processed the new input.
    await assert(
      "gainExperience(2) submitted from the frontend increases XP via the API (+20)",
      async () => {
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline) {
          const xp = await readXp();
          if (xp !== null && xp >= xpBefore + 20) return true;
          await new Promise((r) => setTimeout(r, 1000));
        }
        return false;
      },
    );

    await assert(
      "Submitting gainExperience does not produce a fatal pageerror",
      async () => jsErrors.length === moveBefore,
    );
  } finally {
    await browser.close();
  }
}
