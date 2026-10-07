import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { run, sleep } from "effection";
import { SOLANA_PRIMITIVE_PROGRAM_LOG, SOLANA_PRIMITIVE_TOKEN_ACCOUNT } from "@effectstream/config";
import { SolanaFetcher } from "./fetcher.ts";
import { SolanaSyncState } from "./state.ts";
import { FIRST_PAGE_LIMIT, isAboveCursor, PAGE_LIMIT } from "./program-mode.ts";
import type { ConfigType, Output, SolanaLastPage } from "./types.ts";
import { startSync } from "../orchestration/sync.ts";
import { FakeSolanaChain } from "./program-mode.test-rpc.ts";

/**
 * Program mode (AA 00064, contract C1–C10): the Solana sync reads only the
 * watched programs' transactions. These tests run the real fetcher, state and
 * client against a fake JSON-RPC with the semantics measured on devnet (R2).
 */

const X = "ProgXbridge1111111111111111111111111111111111";
const Y = "ProgYbridge2222222222222222222222222222222222";
const DELAY = 6000;
const START = 50;

const programLog = (programId: string, name = "BridgeSolanaProgramLog") => ({
  syncProtocol: "parallelSolana",
  primitive: { name, type: SOLANA_PRIMITIVE_PROGRAM_LOG, programId },
});

function makeSync(opts: {
  lastPage?: SolanaLastPage;
  primitives?: unknown[];
  syncProtocol?: Record<string, unknown>;
  pollingInterval?: number;
} = {}) {
  const config = {
    network: { rpcUrl: "http://fake-solana.test:8899" },
    syncProtocol: {
      name: "parallelSolana",
      type: "solana-rpc-parallel",
      mode: "program",
      startBlockHeight: START,
      pollingInterval: opts.pollingInterval ?? 6000,
      delayMs: DELAY,
      confirmationDepth: 32,
      stepSize: 24,
      rateLimitRetries: 10,
      rateLimitBackoffMs: 1,
      rateLimitMaxBackoffMs: 4,
      ...opts.syncProtocol,
    },
    primitives: opts.primitives ?? [programLog(X)],
  } as unknown as ConfigType;
  const fetcher = new SolanaFetcher(config);
  const state = new SolanaSyncState(opts.lastPage, config, fetcher, fetcher.client, undefined as never);
  return { config, fetcher, state };
}

type Sync = ReturnType<typeof makeSync>;

/** One fetch-loop pass (stateToInput → readData → updateState), as `startSync` runs it. */
async function pass(sync: Sync): Promise<"slept" | "polled"> {
  return await run(function* () {
    const input = yield* sync.state.stateToInput();
    if (input == null) return "slept" as const;
    const data = yield* sync.fetcher.readData(input, sync.state, sync.state.lastPage);
    yield* sync.state.updateState(input, data);
    return "polled" as const;
  });
}

/** A poll (skipping the sleep pass a completed poll leaves behind). */
async function poll(sync: Sync): Promise<void> {
  if ((await pass(sync)) === "slept") {
    expect(await pass(sync)).toBe("polled");
  }
}

/** A poll expected to fail as a whole. */
async function failingPoll(sync: Sync): Promise<unknown> {
  try {
    await poll(sync);
  } catch (e) {
    return e;
  }
  throw new Error("the poll did not fail");
}

/** Drain the buffer as the merge would, returning the outputs. */
function drain(sync: Sync): Output[] {
  const out: Output[] = [];
  while (sync.state.bufferedData.size() > 0) out.push(sync.state.bufferedData.shift()!.output);
  return out;
}

const sigsOf = (outputs: Output[]) => outputs.flatMap((o) => o.primitives.map((p) => p.syncProtocol.transactionHash));

let chain: FakeSolanaChain;
let restore: () => void;
beforeEach(() => {
  chain = new FakeSolanaChain();
  restore = chain.install();
});
afterEach(() => restore());

describe("a poll (C3) and its outputs (C4)", () => {
  test("idle: exactly getSlot(finalized) + getBlockTime(F) + one getSignaturesForAddress (C10), no getBlock", async () => {
    chain.finalized = 120;
    const sync = makeSync();
    await poll(sync);
    expect(chain.requests.map((r) => r.method)).toEqual(["getSlot", "getBlockTime", "getSignaturesForAddress"]);
    expect(chain.calls("getSlot")[0].params).toEqual([{ commitment: "finalized" }]);
    expect(chain.calls("getBlockTime")[0].params).toEqual([120]);
    const gsfa = chain.calls("getSignaturesForAddress")[0].params;
    expect(gsfa).toEqual([X, { commitment: "finalized", limit: FIRST_PAGE_LIMIT, minContextSlot: 120 }]);
    expect(sync.state.lastPage).toMatchObject({ own: 120, ownBlockNumber: 120, root: chain.blockTimeOf(120) * 1000 + DELAY });
    expect((sync.state.lastPage as SolanaLastPage).cursor).toEqual({ slot: START - 1, signatures: [] });
    expect(sync.state.bufferedData.size()).toBe(0);
  });

  test("the outputs' keys are the chain's blockTime; the progress key is getBlockTime(F) (C6, SC-006)", async () => {
    chain.finalized = 200;
    chain.invoke(X, "sigA", 60, 4, "LOCK|0");
    chain.invoke(X, "sigB", 150, 0, "LOCK|1");
    const sync = makeSync();
    await poll(sync);
    const outputs = drain(sync);
    expect(outputs.map((o) => o.slot)).toEqual([60, 150]);
    for (const o of outputs) {
      expect(o.blockTime).toBe(chain.blockTimeOf(o.slot));
      expect(Number(sync.state.toRootPage(o))).toBe(chain.blockTimeOf(o.slot) * 1000 + DELAY);
    }
    expect(Number(sync.state.lastPage!.root)).toBe(chain.blockTimeOf(200) * 1000 + DELAY);
  });

  test("the primitive records equal block mode's for the same transactions, field for field (C4)", async () => {
    chain.finalized = 200;
    chain.invoke(X, "sigA", 60, 4, "EFFECTSTREAM_BRIDGE|LOCK|0");
    chain.invoke(X, "sigB", 60, 9, "EFFECTSTREAM_BRIDGE|LOCK|1");
    chain.invoke(Y, "sigC", 61, 0, "other program");
    const program = makeSync();
    await poll(program);
    const programPrims = drain(program).flatMap((o) => o.primitives);

    // Block mode over the same slots.
    chain.confirmed = 61 + 32;
    const block = makeSync({ syncProtocol: { mode: "block", stepSize: 100 } });
    await poll(block);
    const blockPrims = drain(block).flatMap((o) => o.primitives);

    expect(programPrims.length).toBe(2);
    expect(programPrims).toEqual(blockPrims);
    expect(programPrims.map((p) => p.syncProtocol.logIndex)).toEqual([4, 9]);
    expect(programPrims[0] as unknown).toEqual({
      syncProtocol: { name: "parallelSolana", blockNumber: 60, transactionHash: "sigA", contractAddress: X, logIndex: 4 },
      primitive: "BridgeSolanaProgramLog",
      output: { payloadType: "solana:transaction", payload: { programId: X, slot: 60, logMessages: ["Program log: EFFECTSTREAM_BRIDGE|LOCK|0"] } },
    });
  });

  test("order within a slot is by transactionIndex, whatever the arrival order", async () => {
    chain.finalized = 200;
    chain.invoke(X, "late-index", 70, 17, "c");
    chain.invoke(X, "first-index", 70, 2, "a");
    chain.invoke(X, "mid-index", 70, 9, "b");
    const sync = makeSync();
    await poll(sync);
    const [o] = drain(sync);
    expect(o.slot).toBe(70);
    expect(o.primitives.map((p) => [p.syncProtocol.transactionHash, p.syncProtocol.logIndex])).toEqual([
      ["first-index", 2],
      ["mid-index", 9],
      ["late-index", 17],
    ]);
    // The cursor holds every signature emitted in its slot, in index order (C5).
    expect(o.cursor).toEqual({ slot: 70, signatures: ["first-index", "mid-index", "late-index"] });
    // blockInfo's hash in program mode is the slot's first kept signature (C4).
    expect(o.blockhash).toBe("first-index");
  });

  test("no transactionIndex from the RPC (Helius may omit it): list order, a warning, logIndex = rank (C4)", async () => {
    chain.finalized = 200;
    chain.omitIndexInList = true;
    chain.omitIndexInTx = true;
    chain.invoke(X, "s-b", 70, 9, "b");
    chain.invoke(X, "s-a", 70, 2, "a");
    chain.invoke(X, "s-c", 71, 5, "c");
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (m: string) => warnings.push(String(m));
    try {
      const sync = makeSync();
      await poll(sync);
      const outputs = drain(sync);
      expect(sigsOf(outputs)).toEqual(["s-a", "s-b", "s-c"]);
      expect(outputs.flatMap((o) => o.primitives.map((p) => p.syncProtocol.logIndex))).toEqual([0, 1, 0]);
      expect(sync.fetcher.programPoller!.indexFallbacks).toBe(3);
      expect(warnings.filter((w) => w.includes("no transactionIndex")).length).toBe(1);
    } finally {
      console.warn = warn;
    }
  });

  test("the listing's transactionIndex is used when getTransaction omits it (no fallback)", async () => {
    chain.finalized = 200;
    chain.omitIndexInTx = true;
    chain.invoke(X, "s-b", 70, 9, "b");
    chain.invoke(X, "s-a", 70, 2, "a");
    const sync = makeSync();
    await poll(sync);
    const outputs = drain(sync);
    expect(outputs[0].primitives.map((p) => p.syncProtocol.logIndex)).toEqual([2, 9]);
    expect(sync.fetcher.programPoller!.indexFallbacks).toBe(0);
  });

  test("failed transactions are ignored: never fetched, no primitive (as block mode)", async () => {
    chain.finalized = 200;
    chain.invoke(X, "ok", 60, 1, "LOCK|0");
    chain.invoke(X, "failed", 61, 0, "LOCK|1", { err: { InstructionError: [0, "Custom"] } });
    const sync = makeSync();
    await poll(sync);
    expect(sigsOf(drain(sync))).toEqual(["ok"]);
    expect(chain.calls("getTransaction").map((r) => r.params[0])).toEqual(["ok"]);
  });

  test("a transaction listed but not invoking the program (a deploy) gives no primitive (R3 #1, #9)", async () => {
    chain.finalized = 200;
    chain.add({ signature: "deploy", slot: 55, index: 12, accounts: ["payer111", X, "BPFLoader"], logs: ["Program BPFLoader invoke [1]", "Program BPFLoader success"] });
    chain.invoke(X, "init", 56, 26, "INIT");
    const sync = makeSync();
    await poll(sync);
    const outputs = drain(sync);
    expect(outputs.map((o) => [o.slot, o.primitives.length])).toEqual([[55, 0], [56, 1]]);
  });

  test("version-1 transactions: getTransaction asks for maxSupportedTransactionVersion 1 and follows a -32015 hint", async () => {
    chain.finalized = 200;
    chain.invoke(X, "v1", 60, 3, "LOCK|0", { version: 1 });
    chain.invoke(X, "v2", 61, 3, "LOCK|1", { version: 2 });
    const sync = makeSync();
    await poll(sync);
    expect(sigsOf(drain(sync))).toEqual(["v1", "v2"]);
    const versions = chain.calls("getTransaction").map((r) => [r.params[0], r.params[1].maxSupportedTransactionVersion]);
    // v1 at the default 1; v2 answered -32015 naming 2, asked again with 2 (kept from then on).
    expect(versions).toEqual([["v1", 1], ["v2", 1], ["v2", 2]]);
    expect(sync.fetcher.client.maxSupportedTransactionVersion).toBe(2);
  });

  test("entries above the tip F wait for the next poll (results run past a tip read just before, R2)", async () => {
    chain.finalized = 100;
    chain.invoke(X, "at-tip", 100, 0, "a");
    chain.invoke(X, "past-tip", 104, 0, "b"); // indexed already, slot > F
    const sync = makeSync();
    await poll(sync);
    expect(sigsOf(drain(sync))).toEqual(["at-tip"]);
    chain.finalized = 110;
    await poll(sync);
    expect(sigsOf(drain(sync))).toEqual(["past-tip"]);
  });

  test("F ≤ own: the poll ends after getSlot, with no other call and no change (C3.1)", async () => {
    chain.finalized = 100;
    const sync = makeSync();
    await poll(sync);
    const before = structuredClone(sync.state.lastPage);
    const n = chain.requests.length;
    await poll(sync); // same tip
    expect(chain.requests.slice(n).map((r) => r.method)).toEqual(["getSlot"]);
    expect(sync.state.lastPage).toEqual(before);
  });

  test("a tip below startBlockHeight makes no other call and publishes no page", async () => {
    chain.finalized = START - 5;
    const sync = makeSync();
    await poll(sync);
    expect(chain.requests.map((r) => r.method)).toEqual(["getSlot"]);
    expect(sync.state.lastPage).toBeUndefined();
  });

  test("discovery never goes below startBlockHeight", async () => {
    chain.finalized = 200;
    chain.invoke(X, "before-start", START - 1, 0, "old");
    chain.invoke(X, "at-start", START, 0, "new");
    const sync = makeSync();
    await poll(sync);
    expect(sigsOf(drain(sync))).toEqual(["at-start"]);
  });
});

describe("paging (C3.3, D1: no `until`)", () => {
  test("2,500 new signatures: pages of 10, then 1000 with `before`, oldest first, none missed, never `until`", async () => {
    chain.finalized = 5000;
    for (let i = 0; i < 2500; i++) chain.invoke(X, `s${String(i).padStart(5, "0")}`, 100 + Math.floor(i / 3), i % 3, `LOCK|${i}`);
    const sync = makeSync();
    await poll(sync);
    const outputs = drain(sync);
    const sigs = sigsOf(outputs);
    expect(sigs.length).toBe(2500);
    expect(sigs).toEqual([...sigs].sort()); // oldest first
    expect(new Set(sigs).size).toBe(2500); // no duplicate
    const pages = chain.calls("getSignaturesForAddress").map((r) => r.params[1]);
    expect(pages.map((p) => p.limit)).toEqual([FIRST_PAGE_LIMIT, PAGE_LIMIT, PAGE_LIMIT, PAGE_LIMIT]);
    expect(pages.every((p) => !("until" in p))).toBe(true);
    expect(pages[0].before).toBeUndefined();
    expect(pages.slice(1).every((p) => typeof p.before === "string")).toBe(true);
    expect(chain.count("getTransaction")).toBe(2500);
  });

  test("a first page of more than 10 new entries continues paging; it stops at the cursor", async () => {
    chain.finalized = 500;
    for (let i = 0; i < 5; i++) chain.invoke(X, `old${i}`, 100 + i, 0, "old");
    const sync = makeSync();
    await poll(sync);
    drain(sync);
    for (let i = 0; i < 15; i++) chain.invoke(X, `new${String(i).padStart(2, "0")}`, 600 + i, 0, "new");
    chain.finalized = 700;
    const n = chain.count("getSignaturesForAddress");
    await poll(sync);
    expect(sigsOf(drain(sync))).toEqual(Array.from({ length: 15 }, (_, i) => `new${String(i).padStart(2, "0")}`));
    // Page 1 (10, all new) → page 2 (1000 with before; it reaches the cursor and is short).
    expect(chain.calls("getSignaturesForAddress").slice(n).map((r) => r.params[1].limit)).toEqual([10, 1000]);
  });

  test("a cursor whose signature the RPC does not know still finds everything newer (why D1 drops `until`)", async () => {
    // With `until: <unknown>` the RPC answers [] silently (R2); the cursor's slot
    // comparison does not depend on the RPC knowing the signature.
    chain.finalized = 500;
    chain.invoke(X, "newer", 300, 0, "x");
    const sync = makeSync({ lastPage: { own: 250, ownBlockNumber: 250, root: 1, cursor: { slot: 250, signatures: ["unknown-to-this-rpc"] } } as never });
    await poll(sync);
    expect(sigsOf(drain(sync))).toEqual(["newer"]);
  });

  test("isAboveCursor is exact with or without transactionIndex", () => {
    const c = { slot: 10, signatures: ["a", "b"] };
    expect(isAboveCursor({ slot: 11, signature: "a" }, c)).toBe(true);
    expect(isAboveCursor({ slot: 10, signature: "c" }, c)).toBe(true);
    expect(isAboveCursor({ slot: 10, signature: "b" }, c)).toBe(false);
    expect(isAboveCursor({ slot: 9, signature: "z" }, c)).toBe(false);
  });

  test("two programs: the union, deduplicated by signature, in (slot, index) order", async () => {
    chain.finalized = 200;
    chain.invoke(X, "x1", 60, 5, "x");
    chain.add({
      signature: "both",
      slot: 60,
      index: 2,
      accounts: ["payer111", X, Y],
      logs: [`Program ${X} invoke [1]`, "Program log: from x", `Program ${X} success`, `Program ${Y} invoke [1]`, "Program log: from y", `Program ${Y} success`],
    });
    chain.invoke(Y, "y1", 59, 0, "y");
    const sync = makeSync({ primitives: [programLog(X, "PX"), programLog(Y, "PY")] });
    await poll(sync);
    const outputs = drain(sync);
    expect(outputs.map((o) => o.slot)).toEqual([59, 60]);
    expect(outputs[1].primitives.map((p) => [p.primitive, p.syncProtocol.transactionHash, p.syncProtocol.logIndex])).toEqual([
      ["PX", "both", 2],
      ["PY", "both", 2],
      ["PX", "x1", 5],
    ]);
    expect(chain.calls("getTransaction").filter((r) => r.params[0] === "both").length).toBe(1);
  });
});

describe("the tip's time (C3.2) and null blockTimes (C6)", () => {
  test("a skipped tip slot (-32007) steps back to the previous produced slot; progress stays F", async () => {
    chain.finalized = 103;
    chain.skipped.add(103);
    chain.skipped.add(102);
    const sync = makeSync();
    await poll(sync);
    expect(chain.calls("getBlockTime").map((r) => r.params[0])).toEqual([103, 102, 101]);
    expect(sync.state.lastPage).toMatchObject({ own: 103, root: chain.blockTimeOf(101) * 1000 + DELAY });
    expect(sync.fetcher.programPoller!.progress).toEqual({ slot: 103, blockTime: chain.blockTimeOf(101), blockTimeSlot: 101 });
  });

  test("a null blockTime steps back too", async () => {
    chain.finalized = 103;
    chain.nullBlockTime.add(103);
    const sync = makeSync();
    await poll(sync);
    expect(chain.calls("getBlockTime").map((r) => r.params[0])).toEqual([103, 102]);
  });

  test("a transaction whose getTransaction blockTime is null takes getBlockTime(slot)", async () => {
    chain.finalized = 200;
    chain.invoke(X, "no-time", 80, 0, "x", { blockTimeOverride: null });
    const sync = makeSync();
    await poll(sync);
    const [o] = drain(sync);
    expect(o.blockTime).toBe(chain.blockTimeOf(80));
    expect(chain.calls("getBlockTime").map((r) => r.params[0])).toEqual([200, 80]);
  });

  test("the root never decreases", async () => {
    chain.finalized = 200;
    const sync = makeSync({ lastPage: { own: 150, ownBlockNumber: 150, root: 9_999_999_999_999, cursor: { slot: 150, signatures: [] } } as never });
    await poll(sync);
    expect(Number(sync.state.lastPage!.root)).toBe(9_999_999_999_999);
  });
});

describe("errors (C7): 429 and timeouts back off; a poll succeeds or fails as a whole", () => {
  test("429s (Retry-After seconds) on discovery wait and retry: the poll succeeds with no gap", async () => {
    chain.finalized = 200;
    chain.invoke(X, "a", 60, 0, "x");
    chain.inject({ method: "getSignaturesForAddress", status: 429, headers: { "retry-after": "0" } });
    chain.inject({ method: "getSignaturesForAddress", status: 429 });
    const sync = makeSync();
    await poll(sync);
    expect(sigsOf(drain(sync))).toEqual(["a"]);
    expect(sync.fetcher.client.counters.rateLimited.getSignaturesForAddress).toBe(2);
    expect(sync.fetcher.programPoller!.rateLimitedWaits).toBe(2);
    expect(sync.fetcher.client.counters.calls.getSignaturesForAddress).toBe(3);
  });

  test("a timeout (transport failure) is retried within the poll", async () => {
    chain.finalized = 200;
    chain.invoke(X, "a", 60, 0, "x");
    chain.inject({ method: "getTransaction", throws: new Error("[Solana getTransaction] request timed out after 15000ms") });
    const sync = makeSync();
    await poll(sync);
    expect(sigsOf(drain(sync))).toEqual(["a"]);
    expect(sync.fetcher.client.counters.failed.getTransaction).toBe(1);
  });

  test("a call that still fails fails the whole poll: no output, no page change; the next poll has no gap", async () => {
    chain.finalized = 200;
    chain.invoke(X, "a", 60, 0, "x");
    chain.invoke(X, "b", 61, 0, "y");
    const sync = makeSync();
    await poll(sync);
    drain(sync);
    const page = structuredClone(sync.state.lastPage);
    chain.invoke(X, "c", 210, 0, "z");
    chain.invoke(X, "d", 211, 0, "w");
    chain.finalized = 220;
    // The second getTransaction fails 3 times (its whole budget).
    for (const n of [2, 3, 4]) chain.inject({ method: "getTransaction", times: n, error: { code: -32603, message: "internal" } });
    const err = await failingPoll(sync);
    expect(String(err)).toContain("internal");
    expect(sync.state.bufferedData.size()).toBe(0);
    expect(sync.state.lastPage).toEqual(page);
    expect(sync.fetcher.programPoller!.failedPolls).toBe(1);
    await poll(sync);
    expect(sigsOf(drain(sync))).toEqual(["c", "d"]);
  });

  test.each([
    ["-32016 (minContextSlot not reached)", "getSignaturesForAddress", { code: -32016, message: "Minimum context slot has not been reached" }],
    ["-32020 (unknown before)", "getSignaturesForAddress", { code: -32020, message: "Transaction not found" }],
    ["-32004 (block not available)", "getBlockTime", { code: -32004, message: "Block not available for slot 200" }],
  ])("%s fails the poll with no page change", async (_label, method, error) => {
    chain.finalized = 200;
    chain.invoke(X, "a", 60, 0, "x");
    const sync = makeSync();
    for (const n of [1, 2, 3]) chain.inject({ method, times: n, error });
    await failingPoll(sync);
    expect(sync.state.lastPage).toBeUndefined();
    expect(sync.state.bufferedData.size()).toBe(0);
  });

  test("a null getTransaction for a listed signature fails the poll", async () => {
    chain.finalized = 200;
    chain.invoke(X, "a", 60, 0, "x");
    const sync = makeSync();
    for (const n of [1, 2, 3]) chain.inject({ method: "getTransaction", times: n, result: null });
    const err = await failingPoll(sync);
    expect(String(err)).toContain("returned null");
    expect(sync.state.bufferedData.size()).toBe(0);
  });
});

describe("the cursor and restarts (C5, FR-004, SC-004)", () => {
  /** What the runtime persists with a block: outputToLastPage(last consumed output), through JSONB. */
  const persist = (sync: Sync, o: Output) => JSON.parse(JSON.stringify(sync.state.outputToLastPage(o))) as SolanaLastPage;

  test("the resume marker carries the cursor", async () => {
    chain.finalized = 200;
    chain.invoke(X, "a", 60, 1, "x");
    chain.invoke(X, "b", 60, 4, "y");
    const sync = makeSync();
    await poll(sync);
    const [o] = drain(sync);
    expect(persist(sync, o)).toEqual({
      own: 60,
      ownBlockNumber: 60,
      root: chain.blockTimeOf(60) * 1000 + DELAY,
      cursor: { slot: 60, signatures: ["a", "b"] },
    });
  });

  test("a restart after part of a poll's outputs committed: no miss, no duplicate", async () => {
    chain.finalized = 200;
    chain.invoke(X, "a", 60, 0, "x");
    chain.invoke(X, "b1", 70, 1, "y");
    chain.invoke(X, "b2", 70, 3, "z");
    chain.invoke(X, "c", 90, 0, "w");
    const first = makeSync();
    await poll(first);
    const outputs = drain(first);
    // Only the first output was merged and committed before the process died.
    const marker = persist(first, outputs[0]);
    chain.invoke(X, "d", 150, 0, "v");
    const second = makeSync({ lastPage: marker });
    await poll(second);
    expect(sigsOf(drain(second))).toEqual(["b1", "b2", "c", "d"]);
  });

  test("a restart between discovery and processing (the poll died after listing): found again, exactly once", async () => {
    chain.finalized = 200;
    chain.invoke(X, "a", 60, 0, "x");
    const first = makeSync();
    await poll(first);
    const marker = persist(first, drain(first)[0]);
    chain.invoke(X, "b", 120, 0, "y");
    chain.invoke(X, "c", 121, 0, "z");
    chain.finalized = 300;
    // Discovery ran, then getTransaction failed for good: the process "dies" here.
    for (const n of [1, 2, 3]) chain.inject({ method: "getTransaction", times: n, throws: new Error("connection reset") });
    await failingPoll(first);
    const second = makeSync({ lastPage: marker });
    await poll(second);
    expect(sigsOf(drain(second))).toEqual(["b", "c"]);
  });

  test("a restart inside a slot: the committed signatures are filtered, the rest emitted", async () => {
    chain.finalized = 200;
    chain.invoke(X, "a", 60, 1, "x");
    const first = makeSync();
    await poll(first);
    const marker = persist(first, drain(first)[0]);
    // Another program transaction in the same slot shows up late (R2: not seen on Agave).
    chain.invoke(X, "late", 60, 7, "y");
    const second = makeSync({ lastPage: marker });
    await poll(second);
    expect(sigsOf(drain(second))).toEqual(["late"]);
  });

  test("a late entry (above the cursor, at or below an earlier tip) is emitted once and counted", async () => {
    chain.finalized = 200;
    chain.invoke(X, "a", 60, 0, "x");
    const sync = makeSync();
    await poll(sync);
    drain(sync);
    chain.invoke(X, "late", 150, 0, "y"); // ≤ the previous F (200)
    chain.finalized = 220;
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (m: string) => warnings.push(String(m));
    try {
      await poll(sync);
    } finally {
      console.warn = warn;
    }
    expect(sigsOf(drain(sync))).toEqual(["late"]);
    expect(sync.fetcher.programPoller!.lateSignatures).toBe(1);
    expect(warnings.some((w) => w.includes("appeared late"))).toBe(true);
    await poll(sync);
    expect(drain(sync).length).toBe(0);
  });

  test("a late entry in the cursor's own slot extends the cursor (the marker never forgets an emitted signature)", async () => {
    chain.finalized = 200;
    chain.invoke(X, "a", 190, 0, "x");
    const sync = makeSync();
    await poll(sync);
    drain(sync);
    chain.invoke(X, "late", 190, 5, "y");
    chain.finalized = 210;
    const warn = console.warn;
    console.warn = () => {};
    try {
      await poll(sync);
    } finally {
      console.warn = warn;
    }
    const [o] = drain(sync);
    expect(o.cursor).toEqual({ slot: 190, signatures: ["a", "late"] });
    // A restart from this output's marker re-emits neither.
    const again = makeSync({ lastPage: persist(sync, o) });
    await poll(again);
    expect(drain(again).length).toBe(0);
  });
});

describe("start-up guards (C1, C5 / FR-007)", () => {
  test("program mode refuses a block-mode database (a resume marker without cursor)", () => {
    expect(() => makeSync({ lastPage: { own: 10, ownBlockNumber: 10, root: 1 } as never })).toThrow(/block-mode resume marker/);
  });

  test("block mode refuses a program-mode database (a resume marker with a cursor)", () => {
    expect(() =>
      makeSync({ syncProtocol: { mode: "block" }, lastPage: { own: 10, ownBlockNumber: 10, root: 1, cursor: { slot: 10, signatures: [] } } as never })
    ).toThrow(/program-mode resume marker/);
  });

  test("program mode refuses a primitive it cannot read completely, and needs one ProgramLog", () => {
    expect(() =>
      makeSync({ primitives: [programLog(X), { syncProtocol: "parallelSolana", primitive: { name: "T", type: SOLANA_PRIMITIVE_TOKEN_ACCOUNT, mint: "m" } }] })
    ).toThrow(/reads only SOLANA:ProgramLog/);
    expect(() => makeSync({ primitives: [] })).toThrow(/at least one SOLANA:ProgramLog/);
  });

  test("an unknown mode is a start-up error; no mode is block mode (the engine default)", () => {
    expect(() => makeSync({ syncProtocol: { mode: "slots" } })).toThrow(/unknown sync mode/);
    expect(makeSync({ syncProtocol: { mode: undefined } }).state.mode).toBe("block");
  });
});

describe("pacing (C2): one poll per interval, always", () => {
  test("over ~10 intervals the loop polls ~10 times (never back to back), 3 calls per idle poll", async () => {
    chain.finalized = 100;
    chain.tipStepPerGetSlot = 25; // devnet: ~4.19 slots/s × 6 s
    const INTERVAL = 40;
    const sync = makeSync({ pollingInterval: INTERVAL });
    // Inline, as the runtime runs it (main.ts): startSync spawns its loops in
    // the caller's scope; leaving the scope halts them.
    await run(function* () {
      yield* startSync(sync.state as never);
      yield* sleep(INTERVAL * 10 + INTERVAL / 2);
    });
    const polls = chain.count("getSlot");
    expect(polls).toBeGreaterThanOrEqual(6);
    expect(polls).toBeLessThanOrEqual(11);
    expect(chain.count("getBlockTime")).toBe(polls);
    expect(chain.count("getSignaturesForAddress")).toBe(polls);
    expect(chain.count("getBlock")).toBe(0);
    expect(sync.fetcher.client.counters.total).toBe(3 * polls);
  });

  test("a poll that found transactions still sleeps the full interval before the next", async () => {
    chain.finalized = 100;
    chain.tipStepPerGetSlot = 25;
    for (let i = 0; i < 30; i++) chain.invoke(X, `t${i}`, 60 + i, 0, "x");
    const sync = makeSync();
    expect(await pass(sync)).toBe("polled");
    expect(await pass(sync)).toBe("slept");
    expect(await pass(sync)).toBe("polled");
  });

  test("a full buffer pauses polling (backpressure, as block mode)", async () => {
    chain.finalized = 200;
    for (let i = 0; i < 5; i++) chain.invoke(X, `t${i}`, 60 + i, 0, "x");
    // The cap is max(maxBufferedPages, stepSize + 1) (block mode's rule): 3.
    const sync = makeSync({ syncProtocol: { maxBufferedPages: 3, stepSize: 2 } });
    await poll(sync);
    expect(sync.state.bufferedData.size()).toBe(5);
    expect(await pass(sync)).toBe("slept");
    expect(await pass(sync)).toBe("slept");
    drain(sync);
    expect(await pass(sync)).toBe("polled");
  });
});

describe("observability (C9, FR-006)", () => {
  test("program mode: mode, interval, calls per method, progress, cursor, polls", async () => {
    chain.finalized = 200;
    chain.invoke(X, "a", 60, 0, "x");
    const sync = makeSync();
    await poll(sync);
    expect(sync.state.healthDetails()).toEqual({
      mode: "program",
      rpcCalls: { getSlot: 1, getBlockTime: 1, getSignaturesForAddress: 1, getTransaction: 1 },
      rpcCallsTotal: 4,
      rpcRateLimited: {},
      rpcFailed: {},
      pollIntervalMs: 6000,
      programs: [X],
      polls: 1,
      idlePolls: 0,
      failedPolls: 0,
      transactions: 1,
      lateSignatures: 0,
      indexFallbacks: 0,
      progress: { slot: 200, blockTime: chain.blockTimeOf(200), blockTimeSlot: 200 },
      cursor: { slot: 60, signatures: ["a"] },
    });
  });

  test("block mode: the mode and its calls per method (getSlot and getBlock share one client)", async () => {
    chain.confirmed = 70;
    const sync = makeSync({ syncProtocol: { mode: "block", startBlockHeight: 30, stepSize: 5 } });
    await poll(sync);
    const d = sync.state.healthDetails() as { mode: string; rpcCalls: Record<string, number> };
    expect(d.mode).toBe("block");
    expect(d.rpcCalls).toEqual({ getSlot: 1, getBlock: 5 });
    expect(sync.state.client).toBe(sync.fetcher.client);
  });
});

describe("block mode is unchanged by default", () => {
  test("getSlot(confirmed) − confirmationDepth, then getBlock per slot; no program-mode call", async () => {
    chain.confirmed = 100;
    chain.invoke(X, "a", 60, 0, "x");
    const sync = makeSync({ syncProtocol: { mode: undefined, startBlockHeight: 60, stepSize: 4 } });
    expect(sync.state.mode).toBe("block");
    await poll(sync);
    expect(chain.calls("getSlot")[0].params).toEqual([{ commitment: "confirmed" }]);
    expect(chain.calls("getBlock").map((r) => r.params[0])).toEqual([60, 61, 62, 63]);
    expect(chain.count("getSignaturesForAddress") + chain.count("getTransaction") + chain.count("getBlockTime")).toBe(0);
    expect(sigsOf(drain(sync))).toEqual(["a"]);
    expect((sync.state.lastPage as SolanaLastPage).cursor).toBeUndefined();
  });
});
