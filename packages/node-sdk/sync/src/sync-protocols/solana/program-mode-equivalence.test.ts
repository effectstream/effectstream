import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { run } from "effection";
import { SOLANA_PRIMITIVE_PROGRAM_LOG } from "@effectstream/config";
import { SolanaFetcher } from "./fetcher.ts";
import { SolanaSyncState } from "./state.ts";
import type { ConfigType, PrimitiveType } from "./types.ts";
import { mergeIntoRoot } from "../orchestration/merge.ts";
import { chainPageRelation, type ChainBlock } from "../common/root.ts";

/**
 * AA 00064 P4.1a — the equivalence gate, offline (spec SC-002, SC-006).
 *
 * `fixtures/devnet-bridge-r3.json.gz` is the P0.4 (R3) recording of the two
 * bridge programs on devnet: all 13 X/Y signatures (slots 507835562–508111848),
 * with `getSignaturesForAddress` and `getTransaction` (program mode's input)
 * and the `getBlock` of each of the 13 slots (block mode's input).
 *
 * Block mode reads every slot of [507835562, 508111900] with the real fetcher;
 * every slot but the 13 (and the tip) answers "skipped". That stands for the
 * whole range by R3's completeness argument: a program can only be invoked by a
 * transaction listing it, and `getSignaturesForAddress` lists every such
 * transaction, so no other block can hold an X/Y primitive. Program mode
 * polls once at the recorded finalized tip 508111900 (getBlockTime 1791294238).
 *
 * Asserted per program: (1) the identical primitive list, field for field and
 * in order; (2) each primitive's merge key; (3) through the real merge
 * (`mergeIntoRoot`) against NTP root blocks (1 s), the Effectstream block each
 * primitive lands in. (4), the template's ops and `bridge_transfers` rows, is a
 * pure function of (1) and (3) (R1 §5: the state machine reads only `slot`,
 * `programId`, `logMessages` and the block number); P4 checks it end to end.
 */

const FIX = JSON.parse(gunzipSync(fs.readFileSync(path.join(import.meta.dir, "fixtures/devnet-bridge-r3.json.gz"))).toString("utf8"));
const PROGRAMS: Record<"X" | "Y", string> = FIX.programs;
const START: number = FIX.ranges.both[0];
const TIP: number = FIX.tip.slot;
const TIP_TIME: number = FIX.tip.getBlockTime;
const DELAY = 6000; // the template's live BRIDGE_SOLANA_DELAY_MS, the same in both modes (S4)
const DEPTH = 32;
/** The template's NTP start for a fresh database: the start slot's blockTime − 30 s (config.ts). */
const NTP_START = FIX.blocks[String(START)].blockTime * 1000 - 30_000;
const NAME = "BridgeSolanaProgramLog";

const entry = (programId: string) => ({
  syncProtocol: "parallelSolana",
  primitive: { name: NAME, type: SOLANA_PRIMITIVE_PROGRAM_LOG, programId },
});

function configFor(mode: "block" | "program", programIds: string[]): ConfigType {
  return {
    network: { rpcUrl: "http://recorded-devnet.test:8899" },
    syncProtocol: {
      name: "parallelSolana",
      mode,
      startBlockHeight: START,
      pollingInterval: 6000,
      delayMs: DELAY,
      confirmationDepth: DEPTH,
      // Offline the reads are instant; big steps keep 276k slots quick.
      stepSize: 50_000,
      getBlockConcurrency: 50_000,
      maxBufferedPages: 1_000_000,
    },
    primitives: programIds.map(entry),
  } as unknown as ConfigType;
}

// ── block mode: the real fetcher over every slot, recorded blocks or "skipped" ──

async function runBlockMode(programIds: string[]) {
  const config = configFor("block", programIds);
  const fetcher = new SolanaFetcher(config);
  const state = new SolanaSyncState(undefined, config, fetcher, fetcher.client, undefined as never);
  let getBlocks = 0;
  (fetcher.client as any).getSlot = async () => TIP + DEPTH;
  (fetcher.client as any).getBlock = async (slot: number) => {
    getBlocks++;
    const b = FIX.blocks[String(slot)];
    if (b) return b;
    // The tip is a root (a produced block): its time is recorded; it holds no X/Y transaction.
    if (slot === TIP) return { blockhash: "tip", blockTime: TIP_TIME, blockHeight: null, parentSlot: TIP - 1, transactions: [] };
    return null; // skipped (-32007), by the completeness argument
  };
  const log = console.log;
  console.log = () => {};
  try {
    await run(function* () {
      while (true) {
        const input = yield* state.stateToInput();
        if (input == null) break;
        const data = yield* fetcher.readData(input, state, state.lastPage);
        yield* state.updateState(input, data);
      }
    });
  } finally {
    console.log = log;
  }
  return { state, getBlocks };
}

// ── program mode: the recorded RPC answers, with R2's semantics ──

let restoreFetch: (() => void) | undefined;
const requests: { method: string; params: any[] }[] = [];

function serveRecorded() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    const req = JSON.parse(String(init?.body));
    requests.push({ method: req.method, params: req.params });
    const ok = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }));
    const fail = (code: number, message: string) => new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code, message } }));
    switch (req.method) {
      case "getSlot":
        return req.params[0].commitment === "finalized" ? ok(TIP) : fail(-32602, "program mode reads finalized only");
      case "getBlockTime": {
        const slot = req.params[0];
        if (slot === TIP) return ok(TIP_TIME);
        const b = FIX.blocks[String(slot)];
        return b ? ok(b.blockTime) : fail(-32007, `Slot ${slot} was skipped`);
      }
      case "getSignaturesForAddress": {
        const [address, cfg] = req.params;
        const name = (Object.keys(PROGRAMS) as ("X" | "Y")[]).find((k) => PROGRAMS[k] === address);
        if (cfg.minContextSlot > TIP) return fail(-32016, "Minimum context slot has not been reached");
        if (cfg.limit < 1 || cfg.limit > 1000) return fail(-32602, "Invalid limit; max 1000");
        let list: any[] = name ? FIX.gsfa[name] : [];
        if (cfg.before) {
          const i = list.findIndex((e) => e.signature === cfg.before);
          if (i === -1) return fail(-32020, "Transaction not found");
          list = list.slice(i + 1);
        }
        if (cfg.until) {
          const i = list.findIndex((e) => e.signature === cfg.until);
          if (i === -1) return ok([]);
          list = list.slice(0, i);
        }
        return ok(list.slice(0, cfg.limit));
      }
      case "getTransaction":
        return ok(FIX.tx[req.params[0]] ?? null);
      default:
        return fail(-32601, `unexpected ${req.method}`);
    }
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function runProgramMode(programIds: string[]) {
  const config = configFor("program", programIds);
  const fetcher = new SolanaFetcher(config);
  const state = new SolanaSyncState(undefined, config, fetcher, fetcher.client, undefined as never);
  const log = console.log;
  console.log = () => {};
  try {
    await run(function* () {
      const input = yield* state.stateToInput();
      const data = yield* fetcher.readData(input!, state, state.lastPage);
      yield* state.updateState(input!, data);
    });
  } finally {
    console.log = log;
  }
  return { state };
}

// ── comparison helpers ──

type Keyed = { primitive: PrimitiveType; key: number };

function keyedPrimitives(state: SolanaSyncState, programId?: string): Keyed[] {
  const out: Keyed[] = [];
  for (let i = 0; i < state.bufferedData.size(); i++) {
    const o = state.bufferedData.peekAt(i)!.output;
    for (const p of o.primitives) {
      if (programId == null || p.syncProtocol.contractAddress === programId) out.push({ primitive: p, key: Number(state.toRootPage(o)) });
    }
  }
  return out;
}

/** A copy of a block-mode state's buffer and page, so the reference run is merged without reading 276k slots again. */
function copyOf(source: SolanaSyncState): SolanaSyncState {
  const config = configFor("block", [PROGRAMS.X, PROGRAMS.Y]);
  const fetcher = new SolanaFetcher(config);
  const copy = new SolanaSyncState(structuredClone(source.lastPage), config, fetcher, fetcher.client, undefined as never);
  for (let i = 0; i < source.bufferedData.size(); i++) {
    copy.bufferedData.push({ output: structuredClone(source.bufferedData.peekAt(i)!.output), cleanup: () => {} });
  }
  return copy;
}

/** The real merge against NTP root blocks every second; returns signature → Effectstream block number. */
async function mergeAll(state: SolanaSyncState, programId?: string): Promise<Map<string, number>> {
  const landed = new Map<string, number>();
  const rootLimit = Number(state.lastPage!.root);
  await run(function* () {
    for (let n = 0; NTP_START + n * 1000 < rootLimit; n++) {
      const block: ChainBlock = {
        blockNumber: n as never,
        timestamp: (NTP_START + n * 1000) as never,
        blockInfo: [],
        resumePages: [],
        primitives: [],
      };
      const result = yield* mergeIntoRoot(state as never, { value: block, toPage: (b) => b.timestamp, comparePage: chainPageRelation });
      for (const p of block.primitives) {
        if (programId != null && p.syncProtocol.contractAddress !== programId) continue;
        expect(landed.has(p.syncProtocol.transactionHash!)).toBe(false);
        landed.set(p.syncProtocol.transactionHash!, n);
      }
      result.updateCache();
    }
  });
  return landed;
}

let block: Awaited<ReturnType<typeof runBlockMode>>;

beforeEach(() => {
  requests.length = 0;
  restoreFetch = serveRecorded();
});
afterEach(() => restoreFetch?.());

describe("P4.1a: block mode and program mode over the recorded devnet range", () => {
  test("block mode reads every slot of the range (the reference run)", async () => {
    block = await runBlockMode([PROGRAMS.X, PROGRAMS.Y]);
    expect(block.getBlocks).toBe(TIP - START + 1);
    expect(Number(block.state.lastPage!.own)).toBe(TIP);
    expect(Number(block.state.lastPage!.root)).toBe(TIP_TIME * 1000 + DELAY);
    // 13 recorded blocks + the tip.
    expect(block.state.bufferedData.size()).toBe(14);
  }, 120_000);

  for (const name of ["X", "Y"] as const) {
    test(`${name}: identical primitives, merge keys and Effectstream blocks`, async () => {
      const programId = PROGRAMS[name];
      const program = await runProgramMode([programId]);

      // Program mode's poll: getSlot + getBlockTime + 1 getSignaturesForAddress
      // (≤ 10 entries) + one getTransaction per listed, non-failed signature.
      const listed = FIX.gsfa[name].length;
      expect(requests.map((r) => r.method)).toEqual([
        "getSlot",
        "getBlockTime",
        "getSignaturesForAddress",
        ...Array(listed).fill("getTransaction"),
      ]);
      expect(Number(program.state.lastPage!.root)).toBe(Number(block.state.lastPage!.root));

      // (1) the primitive list, field for field, in order.
      const p = keyedPrimitives(program.state);
      const b = keyedPrimitives(block.state, programId);
      expect(p.map((k) => k.primitive)).toEqual(b.map((k) => k.primitive));
      expect(p.length).toBe(name === "X" ? 7 : 4); // the deploys give none (R3)
      expect(p.map((k) => (k.primitive.output.payload as { logMessages: string[] }).logMessages.join(" ").match(/\|(INIT|LOCKC|RELEASE)\|/)?.[1])).toEqual(
        name === "X" ? ["INIT", "LOCKC", "RELEASE", "LOCKC", "LOCKC", "LOCKC", "LOCKC"] : ["INIT", "LOCKC", "RELEASE", "LOCKC"],
      );
      // logIndex is the transaction's index in its block (R3 table).
      const expected = FIX.expected.filter((e: any) => e.program === name);
      for (const k of p) {
        const e = expected.find((x: any) => x.signature === k.primitive.syncProtocol.transactionHash);
        expect(k.primitive.syncProtocol.logIndex).toBe(e.index);
      }

      // (2) each primitive's merge key = the chain's blockTime·1000 + delayMs.
      expect(p.map((k) => k.key)).toEqual(b.map((k) => k.key));
      for (const k of p) {
        const e = expected.find((x: any) => x.signature === k.primitive.syncProtocol.transactionHash);
        expect(k.key).toBe(e.blockTime * 1000 + DELAY);
      }

      // (3) through the real merge, each primitive lands in the same Effectstream block.
      const programLanded = await mergeAll(program.state);
      const blockLanded = await mergeAll(copyOf(block.state), programId);
      expect(programLanded.size).toBe(p.length);
      expect([...programLanded.entries()]).toEqual([...blockLanded.entries()]);
      for (const [sig, n] of programLanded) {
        const e = expected.find((x: any) => x.signature === sig);
        // The first NTP block whose timestamp reaches the key.
        expect(n).toBe(Math.ceil((e.blockTime * 1000 + DELAY - NTP_START) / 1000));
      }
    }, 60_000);
  }

  test("both programs in one protocol: the union, in (slot, index) order, equals block mode's", async () => {
    const program = await runProgramMode([PROGRAMS.X, PROGRAMS.Y]);
    expect(keyedPrimitives(program.state)).toEqual(keyedPrimitives(block.state));
    expect(keyedPrimitives(program.state).length).toBe(11);
  });
});
