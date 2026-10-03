// T-SM: the bridge state machine over RECORDED P0 payloads, through the real
// Stm (grammar parse included) against in-process PGLite with the template's
// migrations. No chain, no ports.
//
// Fixtures (copied from the evidence):
//   fixtures/p0-s3-stf-payloads.jsonl   SOLANA:ProgramLog inputs from S3's local
//                                       validator: INIT, LOCK nonce 0, RELEASE id 0
//   fixtures/p0-s2-midnight-payloads.json  Midnight:Generic snapshots from S2's
//                                       real node: mints 1, 2 and withdrawals 0, 1
//
// Run: bun test ./state-machine.test.ts
import { beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import bs58 from "bs58";
import { createBridgeStateMachine } from "@solana-midnight-bridge/node/state-machine";
import { planMidnightSnapshot, planSolanaLogs } from "@solana-midnight-bridge/node/stf-logic";
import { freshDb, runGenerator, transferRows } from "./helpers/pglite-db.ts";

const FIX = path.join(import.meta.dirname!, "fixtures");
const s3Inputs = fs.readFileSync(path.join(FIX, "p0-s3-stf-payloads.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l) as { blockHeight: number; parsedInput: { slot: number; programId: string; logMessages: string[] } });
const s2Snapshots = (JSON.parse(fs.readFileSync(path.join(FIX, "p0-s2-midnight-payloads.json"), "utf8")) as {
  payloads: { effectstreamBlock: number; payload: Record<string, unknown> }[];
}).payloads;

const PROGRAM_ID = s3Inputs[0]!.parsedInput.programId; // the S3 scratch program (public key only)
const S3_MINT = "H5Eivza5kYbPLExwivZpgh3Ea3MF38pCsdKQcjSXi39w";
const S2_SOURCE_MINT_HEX = String(s2Snapshots[0]!.payload.sourceMint);

type Input = { kind: "solana"; block: number; slot: number; programId: string; logMessages: string[] } | { kind: "midnight"; block: number; payload: unknown };

const solanaInputs: Input[] = s3Inputs.map((i) => ({ kind: "solana", block: i.blockHeight, ...i.parsedInput }));
const midnightInputs: Input[] = s2Snapshots.map((s) => ({ kind: "midnight", block: s.effectstreamBlock, payload: s.payload }));

function conciseOf(i: Input): string {
  return i.kind === "solana"
    ? JSON.stringify(["bridge-solana-log", i.slot, i.programId, i.logMessages])
    : JSON.stringify(["bridge-midnight-state", i.payload]);
}

async function feed(db: PGlite, sm: ReturnType<typeof createBridgeStateMachine>, inputs: Input[]) {
  for (const i of inputs) {
    const gen = sm.gameStateTransitions(i.block, {
      blockHeight: i.block as any,
      blockTimestamp: Date.now() as any,
      conciseInput: conciseOf(i),
      randomGenerator: undefined as any,
      emit: () => {},
    });
    await runGenerator(db, gen as any);
  }
}

// Synthetic inputs in the exact recorded line formats (S3's program emits them).
const DEPOSITOR = "2iwbSktGBUzAPK6KPMjUtsHkuZNAJTY1Rve9ZaF21qu6";
const RECIPIENT_HEX = (s3Inputs[1]!.parsedInput.logMessages[0]!.split("|")[6])!;
const lockLine = (nonce: number, amount: number, mint = S3_MINT) =>
  `Program log: EFFECTSTREAM_BRIDGE|LOCK|${nonce}|${DEPOSITOR}|${mint}|${amount}|${RECIPIENT_HEX}`;
const releaseLine = (id: number, owner: string, amount: number) =>
  `Program log: EFFECTSTREAM_BRIDGE|RELEASE|${id}|${owner}|${amount}`;
const OWNER = bs58.encode(Buffer.from("cc63de1ba249b0bddafcf3295f10bcf6f46003416b6339f168e75a8037a1d01e", "hex"));
const snapshot = (mintedLocks: Record<string, string>, withdrawals: Record<string, { solanaRecipient: string; amount: string }>) => ({
  ...s2Snapshots[0]!.payload, mintedLocks, withdrawals,
});

let db: PGlite;
let sm: ReturnType<typeof createBridgeStateMachine>;
beforeEach(async () => {
  db = await freshDb();
  sm = createBridgeStateMachine({ programId: PROGRAM_ID });
});

describe("recorded P0 payloads", () => {
  test("S3 LOCK and RELEASE logs settle the expected rows (INIT ignored)", async () => {
    await feed(db, sm, solanaInputs);
    expect(await transferRows(db)).toEqual([
      {
        direction: "m2s", source_id: "0", amount: "4000000",
        recipient: "5Bu7NHWFFj9wvySUnk1m7xSFsWL7iquZQswcQ5bkxUmg", sender: null, status: "completed",
        src_ref: null, dst_ref: "solana-slot:86", observed_block: 37, completed_block: 37,
      },
      {
        direction: "s2m", source_id: "0", amount: "10000000", recipient: RECIPIENT_HEX, sender: DEPOSITOR,
        status: "observed", src_ref: "solana-slot:84", dst_ref: null, observed_block: 36, completed_block: null,
      },
    ]);
  });

  test("S2 snapshots: every mintedLocks key completes, every withdrawal is observed", async () => {
    await feed(db, sm, midnightInputs);
    const rows = await transferRows(db);
    expect(rows.map((r) => [r.direction, r.source_id, r.amount, r.status, r.recipient])).toEqual([
      ["m2s", "0", "4", "observed", OWNER],
      ["m2s", "1", "4", "observed", OWNER],
      ["s2m", "1", "10", "completed", null],
      ["s2m", "2", "10", "completed", null],
    ]);
    // Each row keeps the block where it was FIRST seen.
    expect(rows.find((r) => r.direction === "s2m" && r.source_id === "2")!.completed_block).toBe(1192);
  });

  test("replaying every recorded input a second time changes nothing", async () => {
    const all = [...solanaInputs, ...midnightInputs];
    await feed(db, sm, all);
    const once = await transferRows(db);
    await feed(db, sm, all);
    expect(await transferRows(db)).toEqual(once);
    await feed(db, sm, [...all].reverse());
    expect(await transferRows(db)).toEqual(once);
  });

  test("two locks in one snapshot (S2 payload #4) are both reconciled", async () => {
    await feed(db, sm, [{ kind: "midnight", block: 500, payload: s2Snapshots[3]!.payload }]);
    const rows = await transferRows(db);
    expect(rows.filter((r) => r.direction === "s2m" && r.status === "completed").map((r) => r.source_id)).toEqual(["1", "2"]);
  });
});

describe("round trip in the recorded formats", () => {
  test("two LOCKs in one transaction, then their mint snapshot, then withdrawals and releases", async () => {
    await feed(db, sm, [{ kind: "solana", block: 10, slot: 100, programId: PROGRAM_ID, logMessages: [lockLine(1, 10), lockLine(2, 7)] }]);
    let rows = await transferRows(db);
    expect(rows.map((r) => [r.direction, r.source_id, r.amount, r.status])).toEqual([
      ["s2m", "1", "10", "observed"],
      ["s2m", "2", "7", "observed"],
    ]);
    await feed(db, sm, [{ kind: "midnight", block: 12, payload: snapshot({ "1": "10", "2": "7" }, {}) }]);
    rows = await transferRows(db);
    expect(rows.every((r) => r.status === "completed")).toBe(true);
    expect(rows[0]!.recipient).toBe(RECIPIENT_HEX); // the LOCK's data survives completion
    await feed(db, sm, [{
      kind: "midnight", block: 15,
      payload: snapshot({ "1": "10", "2": "7" }, {
        "0": { solanaRecipient: "cc63de1ba249b0bddafcf3295f10bcf6f46003416b6339f168e75a8037a1d01e", amount: "4" },
        "1": { solanaRecipient: "cc63de1ba249b0bddafcf3295f10bcf6f46003416b6339f168e75a8037a1d01e", amount: "3" },
      }),
    }]);
    rows = await transferRows(db);
    expect(rows.filter((r) => r.direction === "m2s").map((r) => [r.source_id, r.amount, r.status, r.recipient])).toEqual([
      ["0", "4", "observed", OWNER],
      ["1", "3", "observed", OWNER],
    ]);
    await feed(db, sm, [{ kind: "solana", block: 20, slot: 200, programId: PROGRAM_ID, logMessages: [releaseLine(0, OWNER, 4)] }]);
    await feed(db, sm, [{ kind: "solana", block: 21, slot: 201, programId: PROGRAM_ID, logMessages: [releaseLine(1, OWNER, 3)] }]);
    rows = await transferRows(db);
    expect(rows.map((r) => r.status)).toEqual(["completed", "completed", "completed", "completed"]);
    expect(rows.find((r) => r.direction === "m2s" && r.source_id === "1")!.dst_ref).toBe("solana-slot:201");
  });

  test("a snapshot seen BEFORE the LOCK (re-sync order) completes; the late LOCK only fills in its data", async () => {
    await feed(db, sm, [{ kind: "midnight", block: 5, payload: snapshot({ "3": "9" }, {}) }]);
    await feed(db, sm, [{ kind: "solana", block: 6, slot: 60, programId: PROGRAM_ID, logMessages: [lockLine(3, 9)] }]);
    const [row] = await transferRows(db);
    expect(row).toMatchObject({ direction: "s2m", source_id: "3", status: "completed", sender: DEPOSITOR, recipient: RECIPIENT_HEX, src_ref: "solana-slot:60" });
  });

  test("a RELEASE seen before its withdrawal snapshot stays completed", async () => {
    await feed(db, sm, [{ kind: "solana", block: 5, slot: 50, programId: PROGRAM_ID, logMessages: [releaseLine(4, OWNER, 2)] }]);
    await feed(db, sm, [{ kind: "midnight", block: 6, payload: snapshot({}, { "4": { solanaRecipient: "cc63de1ba249b0bddafcf3295f10bcf6f46003416b6339f168e75a8037a1d01e", amount: "2" } }) }]);
    const [row] = await transferRows(db);
    expect(row).toMatchObject({ direction: "m2s", source_id: "4", status: "completed", src_ref: "midnight-block:6", dst_ref: "solana-slot:50" });
  });

  test("inputs from another program are ignored", async () => {
    await feed(db, sm, [{ kind: "solana", block: 5, slot: 50, programId: "11111111111111111111111111111111", logMessages: [lockLine(1, 10)] }]);
    expect(await transferRows(db)).toEqual([]);
  });
});

describe("pure planning (stf-logic)", () => {
  test("LOCKs of another mint are ignored when the deployment mint is known", () => {
    const input = { slot: 1, programId: PROGRAM_ID, logMessages: [lockLine(1, 10), lockLine(2, 10, "So11111111111111111111111111111111111111112")] };
    expect(planSolanaLogs(input, { programId: PROGRAM_ID, expectedMint: S3_MINT }).map((o) => o.kind === "lock-observed" && o.nonce)).toEqual([1n]);
  });

  test("malformed snapshot entries are skipped and reported; a foreign sourceMint rejects the snapshot", () => {
    const { ops, rejected } = planMidnightSnapshot(snapshot({ "1": "10", "x": "5", "2": "-1" }, {
      "0": { solanaRecipient: "zz", amount: "1" },
      "1": { solanaRecipient: "cc63de1ba249b0bddafcf3295f10bcf6f46003416b6339f168e75a8037a1d01e", amount: "18446744073709551616" },
    }));
    expect(ops).toEqual([{ kind: "mint-completed", nonce: 1n, amount: 10n }]);
    expect(rejected.sort()).toEqual(["mintedLocks[2]", "mintedLocks[x]", "withdrawals[0]", "withdrawals[1]"].sort());
    const foreign = planMidnightSnapshot(snapshot({ "1": "10" }, {}), { expectedSourceMint: "00".repeat(32) });
    expect(foreign.ops).toEqual([]);
    expect(foreign.rejected[0]).toContain("not the deployment's mint");
    const own = planMidnightSnapshot(snapshot({ "1": "10" }, {}), { expectedSourceMint: S2_SOURCE_MINT_HEX });
    expect(own.ops.length).toBe(1);
  });
});
