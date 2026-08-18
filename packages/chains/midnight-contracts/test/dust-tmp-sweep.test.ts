// Stale `.tmp` orphans left by killed processes must be swept.
//
// Measured, not imagined: the preprod kill matrix (sweep brief §2 step 4) ran
// 14 `kill -9`s inside the save/rename cycle at a 5.1 MB payload and **8 of
// them (57%) left a full-size `<snapshot>.<pid>.tmp` behind**. At 13.7 KB
// (Phase 1's local scale) the write is over too fast to catch, which is why
// this only became visible on preprod. A crash-looping batcher therefore leaks
// 5.1 MB per restart, unbounded.
//
// Phase 2's `a4e67361` unlinks the tmp in `saveDustState`'s **catch block**,
// which closes the failed-write/failed-rename path — a different bug. `SIGKILL`
// runs no catch block, so it does not close this one. Hence a sweep.
//
// The liveness rule is the load-bearing part: a tmp owned by a *live* process
// is that process's in-flight write, and deleting it would make its `rename`
// fail. Sweeping is therefore gated on the owning pid being gone.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getDustStatePath,
  loadDustState,
  saveDustState,
  sweepStaleDustStateTmpFiles,
} from "../src/dust-state.ts";

const SEED_A = "0000000000000000000000000000000000000000000000000000000000000001";
const SEED_B = "0000000000000000000000000000000000000000000000000000000000000002";

const snapshot = (over: Partial<Record<string, unknown>> = {}): string =>
  JSON.stringify({
    publicKey: { publicKey: "123" },
    state: "ab".repeat(64),
    protocolVersion: "0",
    networkId: "preprod",
    offset: "128",
    ...over,
  });

/**
 * A pid that is definitely not running. Probed with the same `kill(pid, 0)`
 * the implementation uses, rather than assumed from a magic number, so the
 * test cannot go stale against a different `pid_max`.
 */
function deadPid(): number {
  for (let pid = 4_194_303; pid > 1; pid--) {
    try {
      process.kill(pid, 0);
    } catch (e) {
      if ((e as { code?: string }).code === "ESRCH") return pid;
    }
  }
  throw new Error("no dead pid found to test with");
}

let dir: string;
let filePath: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "es00009-dust-tmp-sweep-"));
  filePath = getDustStatePath(dir, "preprod", SEED_A);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Plant an orphan exactly as a SIGKILLed `saveDustState` would leave it. */
function plantOrphan(pid: number, body = snapshot()): string {
  const orphan = `${filePath}.${pid}.tmp`;
  fs.writeFileSync(orphan, body, "utf-8");
  return orphan;
}

describe("dust-state — stale .tmp sweep", () => {
  test("a save sweeps orphans from dead processes and leaves the snapshot correct", () => {
    const orphanA = plantOrphan(deadPid());
    const orphanB = plantOrphan(deadPid() - 1);
    fs.writeFileSync(filePath, snapshot({ offset: "100" }), "utf-8");

    expect(saveDustState(dir, "preprod", SEED_A, snapshot({ offset: "200" })))
      .toEqual(filePath);

    expect(fs.existsSync(orphanA)).toBe(false);
    expect(fs.existsSync(orphanB)).toBe(false);
    // The snapshot itself is the thing the sweep must not disturb.
    expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).offset).toEqual("200");
    expect(fs.readdirSync(dir)).toEqual([path.basename(filePath)]);
  });

  test("a load sweeps orphans and still returns the snapshot", () => {
    const orphan = plantOrphan(deadPid());
    fs.writeFileSync(filePath, snapshot(), "utf-8");

    expect(loadDustState(dir, "preprod", SEED_A)).toEqual(snapshot());

    expect(fs.existsSync(orphan)).toBe(false);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test("a tmp owned by a LIVE process is never swept", () => {
    // A real second process, not this one: `saveDustState`'s own tmp is
    // `<snapshot>.<our pid>.tmp`, so an own-pid orphan is indistinguishable
    // from the active write and gets consumed by the rename. A live *other*
    // pid is the case that matters — that file is somebody's in-flight write,
    // and deleting it turns their successful save into a failed one.
    const child = Bun.spawn(["sleep", "30"], { stdout: "ignore", stderr: "ignore" });
    try {
      const live = plantOrphan(child.pid);
      fs.writeFileSync(filePath, snapshot(), "utf-8");

      loadDustState(dir, "preprod", SEED_A);
      saveDustState(dir, "preprod", SEED_A, snapshot({ offset: "300" }));

      expect(fs.existsSync(live)).toBe(true);
    } finally {
      child.kill();
    }
  });

  test("another wallet's orphans are left alone", () => {
    // The sweep is scoped to siblings of THIS snapshot. A second wallet in the
    // same directory owns its own leaks and sweeps them on its own save/load.
    const otherPath = getDustStatePath(dir, "preprod", SEED_B);
    const otherOrphan = `${otherPath}.${deadPid()}.tmp`;
    fs.writeFileSync(otherOrphan, snapshot(), "utf-8");

    saveDustState(dir, "preprod", SEED_A, snapshot());

    expect(fs.existsSync(otherOrphan)).toBe(true);
  });

  test("files that merely look like tmps are left alone", () => {
    // Only the exact `<snapshot>.<pid>.tmp` shape the writer produces is
    // swept — a `.rejected` quarantine file or an operator's manual copy is
    // evidence, and deleting evidence is how a surprise 58-minute cold sync
    // becomes unexplainable.
    const decoys = [
      `${filePath}.rejected`,
      `${filePath}.tmp`,
      `${filePath}.notapid.tmp`,
      `${filePath}.123.tmp.bak`,
    ];
    for (const d of decoys) fs.writeFileSync(d, snapshot(), "utf-8");

    sweepStaleDustStateTmpFiles(dir, "preprod", SEED_A);

    for (const d of decoys) expect(fs.existsSync(d)).toBe(true);
  });

  test("the sweep reports what it removed, and is a no-op on undeployed", () => {
    const orphan = plantOrphan(deadPid());
    expect(sweepStaleDustStateTmpFiles(dir, "preprod", SEED_A)).toEqual([orphan]);
    expect(sweepStaleDustStateTmpFiles(dir, "preprod", SEED_A)).toEqual([]);

    // Persistence no-ops on undeployed, so nothing there is ours to delete.
    const undeployedPath = getDustStatePath(dir, "undeployed", SEED_A);
    const undeployedOrphan = `${undeployedPath}.${deadPid()}.tmp`;
    fs.writeFileSync(undeployedOrphan, snapshot(), "utf-8");
    expect(sweepStaleDustStateTmpFiles(dir, "undeployed", SEED_A)).toEqual([]);
    expect(fs.existsSync(undeployedOrphan)).toBe(true);
  });

  test("a missing directory is not an error", () => {
    expect(sweepStaleDustStateTmpFiles(path.join(dir, "nope"), "preprod", SEED_A))
      .toEqual([]);
  });
});
