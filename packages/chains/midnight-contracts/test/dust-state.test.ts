// Dust-state persistence: what must hold, and what Phase 1 proved does not.
//
// The suite is split deliberately. The CHARACTERIZATION block pins behaviour
// that exists today and must survive Phase 2 — the `undeployed` no-op in
// particular is load-bearing (chain resets invalidate cached state) and easy
// to delete by accident while adding a validity guard. The RED block pins
// behaviour Phase 1 measured to be missing; those tests fail on this branch
// on purpose and are the Phase 2 acceptance criteria.
//
// Evidence for every RED case is in plans/00009-phase1-brief.md §2 —
// each was reproduced against a live local stack, not inferred.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getDustStatePath, loadDustState, saveDustState } from "../src/dust-state.ts";

const SEED_A = "0000000000000000000000000000000000000000000000000000000000000001";
const SEED_B = "0000000000000000000000000000000000000000000000000000000000000002";

/** A snapshot in the exact shape wallet-sdk-dust-wallet@4.2.0 writes. */
const snapshot = (over: Partial<Record<string, unknown>> = {}): string =>
  JSON.stringify({
    publicKey: { publicKey: "123" },
    state: "ab".repeat(64),
    protocolVersion: "0",
    networkId: "preprod",
    offset: "128",
    ...over,
  });

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "es00009-dust-state-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("dust-state — characterization (must keep holding after Phase 2)", () => {
  test("undeployed is a no-op in both directions", () => {
    // Load must not resurrect state from a previous chain incarnation, and
    // save must not create a file that a later named-network run could pick
    // up. Both halves matter; testing only one has let this regress before.
    expect(saveDustState(dir, "undeployed", SEED_A, snapshot())).toBeNull();
    expect(fs.readdirSync(dir)).toEqual([]);

    fs.writeFileSync(getDustStatePath(dir, "undeployed", SEED_A), snapshot(), "utf-8");
    expect(loadDustState(dir, "undeployed", SEED_A)).toBeNull();
  });

  test("the path is keyed by the FULL seed, not a prefix", () => {
    // Conventional dev seeds differ only in their last characters, so a
    // prefix key collides and one wallet restores another's dust.
    expect(getDustStatePath(dir, "preprod", SEED_A))
      .not.toEqual(getDustStatePath(dir, "preprod", SEED_B));
  });

  test("networkId cannot escape baseDir via path traversal", () => {
    const p = getDustStatePath(dir, "../../etc/preprod", SEED_A);
    expect(path.dirname(p)).toEqual(dir);
    expect(p.includes("..")).toBe(false);
  });

  test("a save is atomic and leaves no temp file behind", () => {
    saveDustState(dir, "preprod", SEED_A, snapshot());
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect(JSON.parse(loadDustState(dir, "preprod", SEED_A)!).offset).toEqual("128");
  });

  test("a missing snapshot loads as null rather than throwing", () => {
    expect(loadDustState(dir, "preprod", SEED_A)).toBeNull();
  });
});

describe("dust-state — RED: guards Phase 1 proved are missing", () => {
  // Phase 1 §2: the harness wrote a file keyed `harness-named-*` whose
  // snapshot body said `"networkId":"undeployed"`, and restore consumed it
  // without complaint. `DustWallet.restore` (DustWallet.ts:295-300) never
  // compares the snapshot's networkId against the configured one — only
  // startWithSeed/startWithSecretKey read the configured id. So the single
  // identity field the snapshot DOES record is never checked by anyone.
  test("a snapshot recorded on another network is refused", () => {
    fs.writeFileSync(
      getDustStatePath(dir, "preprod", SEED_A),
      snapshot({ networkId: "testnet" }),
      "utf-8",
    );
    expect(loadDustState(dir, "preprod", SEED_A)).toBeNull();
  });

  // Phase 1 §2: truncating a real snapshot to half its bytes made
  // DustWallet.restore throw `getOrThrow called on a Left` straight out of
  // buildWalletFacade (get-wallet-info.ts:878). waitForDustFundsWithRetry
  // treats that as a non-stall error and rethrows without ever rebuilding
  // from scratch (gwi:701-730), so one bad file bricks wallet init until an
  // operator deletes it. The load layer must reject it and let the caller
  // cold-sync instead. This is also the post-sdk-upgrade path: the snapshot
  // carries no format version, so a ledger bump fails here identically.
  test("a truncated snapshot is refused rather than handed to restore", () => {
    const raw = snapshot();
    fs.writeFileSync(
      getDustStatePath(dir, "preprod", SEED_A),
      raw.slice(0, Math.floor(raw.length / 2)),
      "utf-8",
    );
    expect(loadDustState(dir, "preprod", SEED_A)).toBeNull();
  });

  test("a snapshot missing required fields is refused", () => {
    fs.writeFileSync(
      getDustStatePath(dir, "preprod", SEED_A),
      JSON.stringify({ publicKey: { publicKey: "123" } }),
      "utf-8",
    );
    expect(loadDustState(dir, "preprod", SEED_A)).toBeNull();
  });

  // Phase 1 §2: with `offset` past the end of the indexer's event log the
  // wallet emits exactly once, never sets isConnected, and hangs — measured
  // over a 45 s window. The batcher then RE-SAVES that state on the stall
  // path (gwi:707) and again on final failure (gwi:721), so the poisoned
  // snapshot outlives the process and every restart repeats the ~5-minute
  // failure. A save must never move a usable snapshot backwards into an
  // unusable one; the simplest form of that rule is: do not persist a
  // snapshot whose offset regresses below the one already on disk.
  test("a save does not overwrite a good snapshot with a regressed offset", () => {
    saveDustState(dir, "preprod", SEED_A, snapshot({ offset: "128" }));
    saveDustState(dir, "preprod", SEED_A, snapshot({ offset: "0" }));
    expect(JSON.parse(loadDustState(dir, "preprod", SEED_A)!).offset).toEqual("128");
  });
});
