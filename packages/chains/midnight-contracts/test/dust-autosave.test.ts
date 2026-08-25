// The snapshot has to keep advancing while the batcher runs.
//
// Phase 1 §1 mapped every write of dust state: three call sites, all inside
// `waitForDustFundsWithRetry`, all during init. Nothing periodic, nothing on
// shutdown — `close()` stops the wallets without saving — and the injected-
// wallet path (adapter:1136-1148) never persisted at all. So a week of uptime
// left a week-old snapshot, and the restart replayed a week of chain. That is
// the incident this project started from.
//
// Phase 1 deliberately shipped no test for it: there was no seam to inject
// into, and a test written against an imagined API would have pinned a design
// rather than a defect. These ride with the commit that creates the seam.
//
// Intervals here are milliseconds; the production default is minutes.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadDustState } from "../src/dust-state.ts";
import { startDustStateAutosave } from "../src/get-wallet-info.ts";

const SEED = "0000000000000000000000000000000000000000000000000000000000000001";
const PUBLIC_KEY =
  "11886380015789543296729785856017363359697744265386149017101029008360306658047";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A dust wallet that advances one event per serialization. */
function fakeDustWallet(): { serializeState: () => Promise<string>; calls: () => number } {
  let offset = 0;
  let calls = 0;
  return {
    serializeState: async () => {
      calls++;
      offset += 1;
      return JSON.stringify({
        publicKey: { publicKey: PUBLIC_KEY },
        state: "ab".repeat(64),
        protocolVersion: "0",
        networkId: "preprod",
        offset: String(offset),
      });
    },
    calls: () => calls,
  };
}

const offsetOnDisk = (dir: string): string | null => {
  const raw = loadDustState(dir, "preprod", SEED, { expectedPublicKey: PUBLIC_KEY });
  return raw ? String(JSON.parse(raw).offset) : null;
};

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "es00009-dust-autosave-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("dust state autosave", () => {
  test("the snapshot keeps advancing while the wallet runs", async () => {
    const wallet = fakeDustWallet();
    const autosave = startDustStateAutosave(wallet, {
      networkId: "preprod",
      seed: SEED,
      dustStateDir: dir,
      intervalMs: 25,
    });
    await sleep(130);
    await autosave.stop();

    expect(wallet.calls()).toBeGreaterThan(2);
    expect(Number(offsetOnDisk(dir))).toBeGreaterThan(2);
  });

  test("stopping saves once more — shutdown must not drop the last minutes", async () => {
    const wallet = fakeDustWallet();
    const autosave = startDustStateAutosave(wallet, {
      networkId: "preprod",
      seed: SEED,
      dustStateDir: dir,
      // No periodic saving at all: the final save is the only one, which is
      // exactly the close()-without-a-timer case.
      intervalMs: 0,
    });
    expect(offsetOnDisk(dir)).toBeNull();

    await autosave.stop();
    expect(offsetOnDisk(dir)).toEqual("1");
  });

  test("a stopped autosave never writes again", async () => {
    const wallet = fakeDustWallet();
    const autosave = startDustStateAutosave(wallet, {
      networkId: "preprod",
      seed: SEED,
      dustStateDir: dir,
      intervalMs: 20,
    });
    await autosave.stop();
    const after = wallet.calls();
    await sleep(100);
    // A timer left armed on a stopped wallet serializes state from a facade
    // that is being torn down, and keeps the process alive.
    expect(wallet.calls()).toEqual(after);
  });

  test("a save that throws does not kill the loop", async () => {
    let calls = 0;
    const flaky = {
      serializeState: async () => {
        calls++;
        if (calls < 3) throw new Error("wallet busy");
        return JSON.stringify({
          publicKey: { publicKey: PUBLIC_KEY },
          state: "ab".repeat(64),
          protocolVersion: "0",
          networkId: "preprod",
          offset: "77",
        });
      },
    };
    const autosave = startDustStateAutosave(flaky, {
      networkId: "preprod",
      seed: SEED,
      dustStateDir: dir,
      intervalMs: 20,
    });
    await sleep(130);
    await autosave.stop();
    expect(offsetOnDisk(dir)).toEqual("77");
  });

  test("saves do not stack up behind a slow one", async () => {
    let started = 0;
    const slow = {
      serializeState: async () => {
        started++;
        await sleep(120);
        return JSON.stringify({
          publicKey: { publicKey: PUBLIC_KEY },
          state: "ab".repeat(64),
          protocolVersion: "0",
          networkId: "preprod",
          offset: String(started),
        });
      },
    };
    const autosave = startDustStateAutosave(slow, {
      networkId: "preprod",
      seed: SEED,
      dustStateDir: dir,
      intervalMs: 10,
    });
    await sleep(100);
    // Ten ticks fired while the first serialization was still running. A
    // multi-megabyte preprod snapshot takes real time; queueing one save per
    // tick behind it would pile up work on the same event loop the wallet
    // syncs on.
    expect(started).toEqual(1);
    await autosave.stop();
  });
});
