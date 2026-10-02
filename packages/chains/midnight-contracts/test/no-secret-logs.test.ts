// E7 (00050): wallet seeds never reach log output. The seed controls the
// wallet's funds, and live deployments ship their logs off the host.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { saveDustState } from "../src/dust-state.ts";

// Dummy seed: never funded anywhere.
const SEED = "5eed".repeat(16);
const SEED_PREFIX = SEED.slice(0, 16);

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "e00050-no-secret-logs-"));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Run `fn` while capturing everything console.* prints. */
function captureConsole(fn: () => void): string {
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const original = methods.map((m) => console[m]);
  const lines: string[] = [];
  for (const m of methods) {
    console[m] = (...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
    };
  }
  try {
    fn();
  } finally {
    methods.forEach((m, i) => {
      console[m] = original[i];
    });
  }
  return lines.join("\n");
}

describe("no seed in logs (E7)", () => {
  test("buildWalletAndWaitForFunds logs the address but never the seed", async () => {
    // A subprocess: the wallet SDK keeps sockets open, and the wallet is built
    // offline (endpoints on a closed loopback port; the funds wait times out).
    const moduleUrl = new URL("../src/build-wallet.ts", import.meta.url).href;
    const probe = Bun.spawn([
      process.execPath,
      "--eval",
      `
        const { buildWalletAndWaitForFunds } = await import(${JSON.stringify(moduleUrl)});
        const urls = {
          id: "undeployed",
          indexer: "http://127.0.0.1:9/api/v4/graphql",
          indexerWS: "ws://127.0.0.1:9/api/v4/graphql/ws",
          node: "http://127.0.0.1:9",
          proofServer: "http://127.0.0.1:9",
        };
        await buildWalletAndWaitForFunds(urls, ${JSON.stringify(SEED)}, "undeployed");
        console.log("PROBE DONE");
        process.exit(0);
      `,
    ], {
      env: {
        ...process.env,
        MIDNIGHT_SKIP_WAIT_FOR_FUNDS: "true",
        MIDNIGHT_WALLET_SYNC_TIMEOUT_MS: "1500",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => probe.kill(), 60_000);
    const [exitCode, stdout, stderr] = await Promise.all([
      probe.exited,
      new Response(probe.stdout).text(),
      new Response(probe.stderr).text(),
    ]);
    clearTimeout(timer);
    const output = `${stdout}\n${stderr}`;

    expect(exitCode).toBe(0);
    expect(output).toContain("Wallet address:");
    expect(output).toContain("PROBE DONE");
    expect(output).not.toContain(SEED);
    expect(output).not.toContain(SEED_PREFIX);
  }, 90_000);

  test("saveDustState logs neither the seed nor the seed-derived file name", () => {
    const dir = join(workDir, "dust");
    let saved: string | null = null;
    const output = captureConsole(() => {
      saved = saveDustState(dir, "stagenet", SEED, "{}");
    });
    expect(saved).not.toBeNull();
    // The cache file itself is still keyed by the seed prefix (00050 Q14).
    expect(readdirSync(dir)).toEqual([`stagenet-${SEED_PREFIX}.json`]);
    expect(output).toContain("Dust state saved in");
    expect(output).not.toContain(SEED_PREFIX);
  });

  test("a failed saveDustState redacts the file name in the error", () => {
    // The target path is a directory, so the write fails with an error that
    // names the seed-derived file (EISDIR ... 'stagenet-<seed prefix>.json').
    const base = join(workDir, "blocked");
    mkdirSync(join(base, `stagenet-${SEED_PREFIX}.json`), { recursive: true });
    let saved: string | null = "unset";
    const output = captureConsole(() => {
      saved = saveDustState(base, "stagenet", SEED, "{}");
    });
    expect(saved).toBeNull();
    expect(output).toContain("Failed to save dust state in");
    expect(output).toContain("<dust-state file>");
    expect(output).not.toContain(SEED_PREFIX);
  });
});
