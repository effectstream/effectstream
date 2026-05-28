/**
 * Wallets UI end-to-end tests.
 *
 * Drives the bundled Vite app through a real headless Chromium and exercises
 * each new local-JS-wallet mode end-to-end:
 *   - WalletMode.EvmViem      → sign + verify via CryptoManager.Evm()
 *   - WalletMode.CardanoLocal → sign + verify via CryptoManager.Cardano()
 *   - WalletMode.MidnightLocal → sign (verify via CryptoManager.Midnight()
 *     is NYI — see crypto/src/chains/midnight.ts. Asserts a non-empty
 *     signature instead so the sign half of the round-trip stays covered).
 *
 * No orchestrator or live chain is required: each local wallet derives keys
 * + signs purely client-side; verification runs in-page via @effectstream/crypto.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { assert, printSummary, anyError } from "@e2e/engine";

const __dirname = import.meta.dirname!;
const PORT = 4201;
const BASE_URL = `http://localhost:${PORT}/`;

function run(cmd: string, args: string[], opts: { cwd?: string; detached?: boolean; env?: NodeJS.ProcessEnv } = {}) {
  return spawn(cmd, args, {
    cwd: opts.cwd ?? __dirname,
    stdio: opts.detached ? ["ignore", "pipe", "pipe"] : "inherit",
    detached: opts.detached,
    env: opts.env ?? process.env,
  });
}

async function buildBundle(): Promise<void> {
  await assert("wallets-ui: vite build succeeds", async () => {
    // Vite + Midnight WASM exceeds Node's default heap; bump it.
    const proc = run("bun", ["run", "build"], {
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
    });
    return await new Promise<boolean>((resolve) => {
      proc.on("exit", (code) => resolve(code === 0));
    });
  });
}

async function startServer(): Promise<ReturnType<typeof spawn>> {
  const server = run("bun", ["run", "server:start"], { detached: true });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(BASE_URL);
      if (res.ok) return server;
    } catch {
      /* not ready */
    }
  }
  throw new Error(`server did not bind to ${BASE_URL} within 12s`);
}

function killServer(server: ReturnType<typeof spawn>): void {
  if (server.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

type ChainCase = {
  label: string;
  testid: string;          // data-testid of the wallet-login card
  message: string;         // message to sign in the page
  verifyExpected: boolean; // whether CryptoManager verification should pass
};

const CASES: ChainCase[] = [
  {
    label: "EVM (Viem Local)",
    testid: "login-evm-viem-local",
    message: "hello from playwright (evm)",
    verifyExpected: true,
  },
  {
    label: "Cardano (Lucid Local)",
    testid: "login-cardano-lucid-local",
    message: "hello from playwright (cardano)",
    verifyExpected: true,
  },
  {
    label: "Midnight (Local Seed)",
    testid: "login-midnight-local-seed",
    message: "hello from playwright (midnight)",
    verifyExpected: true,
  },
];

async function runCase(page: Page, c: ChainCase): Promise<void> {
  // Fresh page per case so wallet state isn't shared.
  await page.goto(BASE_URL);

  // 1. Login with the local wallet.
  await page.getByTestId(c.testid).click();
  await page.getByTestId("wallet-info").waitFor({ state: "visible", timeout: 15000 });
  const address = await page.getByTestId("wallet-address").innerText();
  await assert(
    `${c.label}: wallet exposes a non-empty address`,
    async () => address.length > 0,
  );

  // 2. Sign a message.
  await page.getByTestId("message-input").fill(c.message);
  await page.getByTestId("sign-message").click();
  await page.getByTestId("signature-result").waitFor({ state: "visible", timeout: 10000 });
  const signature = (await page.getByTestId("signature-result").innerText()).trim();
  await assert(
    `${c.label}: produces a non-empty signature`,
    async () => signature.length > 0,
  );

  // 3. Verify via @effectstream/crypto (runs in-page).
  await page.getByTestId("verify-signature").click();
  if (c.verifyExpected) {
    await assert(
      `${c.label}: CryptoManager verifies the signature`,
      async () => {
        try {
          await page.getByTestId("verification-ok").waitFor({ state: "visible", timeout: 10000 });
          return true;
        } catch {
          return false;
        }
      },
    );
  } else {
    // Expected-NYI: just confirm a verification result element rendered.
    await assert(
      `${c.label}: verification surfaced a result (Midnight verify is NYI in @effectstream/crypto)`,
      async () => {
        try {
          await page
            .locator('[data-testid="verification-ok"], [data-testid="verification-failed"]')
            .first()
            .waitFor({ state: "visible", timeout: 10000 });
          return true;
        } catch {
          return false;
        }
      },
    );
  }
}

async function browserTests(): Promise<void> {
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("pageerror", (err) => console.error("[page error]", err));
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error("[page console]", msg.text());
    });

    for (const c of CASES) {
      await runCase(page, c);
    }
  } finally {
    await browser?.close();
  }
}

async function main(): Promise<void> {
  let server: ReturnType<typeof spawn> | undefined;
  try {
    await buildBundle();

    await assert("wallets-ui: fastify server binds", async () => {
      server = await startServer();
      return true;
    });

    await browserTests();
    printSummary();
  } catch (e) {
    printSummary();
    console.error(e);
  } finally {
    if (server) killServer(server);
    if (anyError()) process.exit(1);
    process.exit(0);
  }
}

main();
