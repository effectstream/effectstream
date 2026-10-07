import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { run } from "effection";
import { SOLANA_PRIMITIVE_PROGRAM_LOG } from "@effectstream/config";
import { SolanaFetcher } from "./fetcher.ts";
import { SolanaSyncState } from "./state.ts";
import { parseRetryAfter } from "./SolanaClient.ts";
import type { ConfigType, Output, SolanaLastPage } from "./types.ts";
import { FakeSolanaChain } from "./program-mode.test-rpc.ts";

/**
 * The determinism guard (AA 00064 P2.4, C8, spec FR-009 / SC-006): program
 * mode never reads the wall clock. Its only time is the chain's `blockTime`;
 * it waits with `sleep` timers only.
 *
 *  1. A source check: no `Date.now()`, `new Date()`, `performance.now()` (or
 *     `Date()`, `process.hrtime`, `Bun.nanoseconds`) in `program-mode.ts` or
 *     `state.ts`; in the shared files only block mode's known reads remain
 *     (`SolanaClient.parseRetryAfter`'s HTTP-date branch, `fetcher.paceGetBlock`).
 *  2. A runtime trap: polls run (429 with an HTTP-date `Retry-After`, a skipped
 *     tip, a null blockTime, a -32015 version hint, a late entry, a failed poll)
 *     while every clock read records its caller. No read may come from the
 *     Solana sync's files or the HTTP helper. Shared telemetry outside them
 *     (the fetch loop's health stamps, the backpressure timer) is out of scope,
 *     as C8 states: it never feeds a key.
 *  3. The same chain replayed twice gives byte-identical outputs and pages.
 */

const here = import.meta.dir;
const read = (rel: string) => fs.readFileSync(path.join(here, rel), "utf8");

/** Source without comments, so prose may name the forbidden calls. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const CLOCK = [
  /\bDate\.now\s*\(/g,
  /\bnew\s+Date\s*\(/g,
  /(?<!new\s+|[.\w])Date\s*\(\s*\)/g,
  /\bperformance\.now\s*\(/g,
  /\bprocess\.hrtime\b/g,
  /\bBun\.nanoseconds\s*\(/g,
];

function clockReads(src: string): { index: number; text: string }[] {
  const c = code(src);
  return CLOCK.flatMap((re) => [...c.matchAll(re)].map((m) => ({ index: m.index!, text: m[0] })));
}

/** The body of the method declared by `signature` (up to the next decorator or end). */
function methodRange(src: string, signature: string): [number, number] {
  const c = code(src);
  const start = c.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const next = c.indexOf("@bound", start + signature.length);
  return [start, next === -1 ? c.length : next];
}

describe("1. source check", () => {
  test("program-mode.ts and state.ts read no clock", () => {
    expect(clockReads(read("program-mode.ts"))).toEqual([]);
    expect(clockReads(read("state.ts"))).toEqual([]);
    expect(clockReads(read("types.ts"))).toEqual([]);
    expect(clockReads(read("program-logs.ts"))).toEqual([]);
  });

  test("SolanaClient.ts: the only clock read is parseRetryAfter's HTTP-date branch (never used in program mode)", () => {
    const src = read("SolanaClient.ts");
    const reads = clockReads(src);
    expect(reads.length).toBe(1);
    const c = code(src);
    const fn = c.indexOf("export function parseRetryAfter(");
    const end = c.indexOf("\nexport ", fn + 1);
    expect(reads[0].index).toBeGreaterThan(fn);
    expect(reads[0].index).toBeLessThan(end);
  });

  test("fetcher.ts: the only clock read is block mode's getBlock pacing", () => {
    const src = read("fetcher.ts");
    const reads = clockReads(src);
    expect(reads.length).toBe(1);
    const [from, to] = methodRange(src, "*paceGetBlock(");
    expect(reads[0].index).toBeGreaterThan(from);
    expect(reads[0].index).toBeLessThan(to);
  });

  test("the HTTP helper reads no clock (its deadline is a timer)", () => {
    expect(clockReads(read("../common/http.ts"))).toEqual([]);
  });
});

// ── 2. the runtime trap ──

const X = "ProgXbridge1111111111111111111111111111111111";
const GUARDED = /sync-protocols\/(solana\/[^/]+|common\/http)\.ts/;
const THIS_FILE = /program-mode-determinism\.test\.ts/;

type Read = { what: string; caller: string };

function trapClocks(): { reads: Read[]; restore: () => void } {
  const reads: Read[] = [];
  const RealDate = globalThis.Date;
  const realNow = RealDate.now;
  const perf = globalThis.performance;
  const realPerfNow = perf.now;
  const record = (what: string) => {
    const frames = (new Error().stack ?? "").split("\n").slice(1).map((l) => l.trim());
    // The first frame outside this file is the code that read the clock.
    const caller = frames.find((f) => !THIS_FILE.test(f)) ?? "<unknown>";
    reads.push({ what, caller });
  };
  class TrapDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) record("new Date()");
      // @ts-expect-error spread into Date's overloads
      super(...args);
    }
    static override now(): number {
      record("Date.now()");
      return realNow.call(RealDate);
    }
  }
  globalThis.Date = TrapDate as DateConstructor;
  Object.defineProperty(perf, "now", {
    configurable: true,
    writable: true,
    value: () => {
      record("performance.now()");
      return realPerfNow.call(perf);
    },
  });
  return {
    reads,
    restore: () => {
      globalThis.Date = RealDate;
      Object.defineProperty(perf, "now", { configurable: true, writable: true, value: realPerfNow });
    },
  };
}

function makeSync(lastPage?: SolanaLastPage) {
  const config = {
    network: { rpcUrl: "http://fake-solana.test:8899" },
    syncProtocol: {
      name: "parallelSolana",
      mode: "program",
      startBlockHeight: 50,
      pollingInterval: 6000,
      delayMs: 6000,
      rateLimitRetries: 10,
      rateLimitBackoffMs: 1,
      rateLimitMaxBackoffMs: 2,
    },
    primitives: [{ syncProtocol: "parallelSolana", primitive: { name: "BridgeSolanaProgramLog", type: SOLANA_PRIMITIVE_PROGRAM_LOG, programId: X } }],
  } as unknown as ConfigType;
  const fetcher = new SolanaFetcher(config);
  const state = new SolanaSyncState(lastPage, config, fetcher, fetcher.client, undefined as never);
  return { fetcher, state };
}

async function pass(sync: ReturnType<typeof makeSync>): Promise<boolean> {
  return await run(function* () {
    const input = yield* sync.state.stateToInput();
    if (input == null) return false;
    // As the engine's loop calls it: no `lastPage` argument (P4.4).
    const data = yield* sync.fetcher.readData(input, sync.state, undefined);
    yield* sync.state.updateState(input, data);
    return true;
  });
}

/** A scripted chain run through every program-mode path; returns what the state produced. */
async function scenario(chain: FakeSolanaChain): Promise<{ outputs: Output[]; pages: unknown[]; errors: string[] }> {
  const sync = makeSync();
  const outputs: Output[] = [];
  const pages: unknown[] = [];
  const errors: string[] = [];
  const step = async () => {
    try {
      while (!(await pass(sync))) { /* the sleep pass after a poll */ }
    } catch (e) {
      errors.push(String(e));
    }
    while (sync.state.bufferedData.size() > 0) outputs.push(sync.state.bufferedData.shift()!.output);
    pages.push(structuredClone(sync.state.lastPage));
  };

  chain.finalized = 103;
  chain.skipped.add(103); // the tip is skipped: step back (C3.2)
  chain.invoke(X, "a", 60, 4, "LOCK|0");
  chain.invoke(X, "v2", 61, 2, "LOCK|1", { version: 2 }); // -32015 names version 2: asked again
  chain.invoke(X, "nullTime", 62, 0, "LOCK|2", { blockTimeOverride: null });
  chain.inject({ method: "getSignaturesForAddress", status: 429, headers: { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" } });
  await step();

  chain.finalized = 140;
  chain.invoke(X, "late", 90, 0, "LOCK|3"); // ≤ the previous tip: a late entry (C5)
  for (const n of [1, 2, 3]) chain.inject({ method: "getTransaction", times: n, error: { code: -32603, message: "internal" } });
  await step(); // fails as a whole (C7)
  await step(); // recovers: emits it
  return { outputs, pages, errors };
}

describe("2. runtime trap", () => {
  let chain: FakeSolanaChain;
  let restoreFetch: () => void;
  beforeEach(() => {
    chain = new FakeSolanaChain();
    restoreFetch = chain.install();
  });
  afterEach(() => restoreFetch());

  test("the trap sees a clock read in a guarded file (control: parseRetryAfter's HTTP-date branch)", () => {
    const trap = trapClocks();
    try {
      parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT");
    } finally {
      trap.restore();
    }
    expect(trap.reads.some((r) => GUARDED.test(r.caller))).toBe(true);
  });

  test("a program-mode run through every path reads no clock from the Solana sync or its client", async () => {
    const trap = trapClocks();
    let result: Awaited<ReturnType<typeof scenario>>;
    try {
      result = await scenario(chain);
    } finally {
      trap.restore();
    }
    const guarded = trap.reads.filter((r) => GUARDED.test(r.caller));
    expect(guarded).toEqual([]);
    // The scenario really went through those paths.
    expect(result!.errors.length).toBe(1);
    expect(result!.outputs.flatMap((o) => o.primitives.map((p) => p.syncProtocol.transactionHash))).toEqual(["a", "v2", "nullTime", "late"]);
    expect(chain.calls("getBlockTime").map((r) => r.params[0])).toContain(102);
    expect(chain.calls("getTransaction").some((r) => r.params[1].maxSupportedTransactionVersion === 2)).toBe(true);
  });
});

describe("3. replay", () => {
  test("the same chain replayed twice gives identical outputs, keys and pages", async () => {
    const runOnce = async () => {
      const chain = new FakeSolanaChain();
      const restore = chain.install();
      try {
        return JSON.stringify(await scenario(chain));
      } finally {
        restore();
      }
    };
    const first = await runOnce();
    const second = await runOnce();
    expect(second).toBe(first);
  });
});
