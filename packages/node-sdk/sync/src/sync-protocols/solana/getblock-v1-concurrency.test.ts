import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { run } from "effection";
import {
  SOLANA_PRIMITIVE_PROGRAM_LOG,
  SOLANA_PRIMITIVE_TOKEN_ACCOUNT,
} from "@effectstream/config";
import { SolanaFetcher } from "./fetcher.ts";
import {
  DEFAULT_MAX_SUPPORTED_TRANSACTION_VERSION,
  parseRetryAfter,
  SolanaClient,
  SolanaRateLimitError,
} from "./SolanaClient.ts";
import type { ConfigType, Output, Page } from "./types.ts";
import type { LastPage } from "../base/state.ts";
import type { RootPage } from "../types.ts";

/**
 * Reading today's Solana devnet (AA 00057 Q16):
 *
 *  - devnet blocks carry VERSION-1 transactions (solana-core 4.x). A block asked
 *    for with `maxSupportedTransactionVersion: 0` fails as a whole with -32015,
 *    and the reader used to retry that slot forever. It now asks for version 1,
 *    follows a -32015 hint once, and a transaction it cannot parse is skipped,
 *    never fatal to the block;
 *  - one `getBlock` takes ~0.5 s even on a private RPC, slower than devnet makes
 *    slots, so a step's slots are fetched CONCURRENTLY (default 8), still applied
 *    strictly in slot order;
 *  - an RPC's rate limit (HTTP 429) slows the reader down (backoff, halved
 *    concurrency) instead of breaking it.
 *
 * `fixtures/devnet-block-v1.json` is a real devnet block recorded read-only
 * (legacy, v0 and v1 transactions; the RPC URL is not recorded). The bridge LOCK
 * transaction added to it in the first test is synthetic: no devnet block holds
 * this template's lock.
 */

const FIXTURE = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "fixtures/devnet-block-v1.json"), "utf8"));
const BRIDGE = "9iMxfcNdpvq7mvLU5J1T9QU5KGMPGBezzk5fCxRMRc3v";
const LOCK_LINE =
  `Program log: EFFECTSTREAM_BRIDGE|LOCK|7|2iwbSktGBUzAPK6KPMjUtsHkuZNAJTY1Rve9ZaF21qu6|H5Eivza5kYbPLExwivZpgh3Ea3MF38pCsdKQcjSXi39w|10000000|${"ab".repeat(64)}`;

function bridgeLockTx() {
  return {
    transaction: {
      signatures: ["5".repeat(88)],
      message: {
        accountKeys: ["2iwbSktGBUzAPK6KPMjUtsHkuZNAJTY1Rve9ZaF21qu6", BRIDGE],
        instructions: [{ programIdIndex: 1, accounts: [0], data: "1" }],
      },
    },
    meta: {
      err: null,
      logMessages: [
        `Program ${BRIDGE} invoke [1]`,
        LOCK_LINE,
        `Program ${BRIDGE} consumed 4321 of 200000 compute units`,
        `Program ${BRIDGE} success`,
      ],
      preBalances: [1, 1],
      postBalances: [1, 1],
      loadedAddresses: { writable: [], readonly: [] },
    },
    version: "legacy",
  };
}

const programLogEntry = {
  syncProtocol: "parallelSolanaRPC",
  primitive: { name: "BridgeSolanaProgramLog", type: SOLANA_PRIMITIVE_PROGRAM_LOG, programId: BRIDGE },
};
const tokenEntry = {
  syncProtocol: "parallelSolanaRPC",
  primitive: { name: "SomeTokenAccount", type: SOLANA_PRIMITIVE_TOKEN_ACCOUNT, mint: "So11111111111111111111111111111111111111112" },
};

function fetcherWith(syncProtocol: Record<string, unknown> = {}, getBlock?: (slot: number) => Promise<any>): SolanaFetcher {
  const f = new SolanaFetcher({
    network: { rpcUrl: "http://127.0.0.1:8899" },
    syncProtocol: { name: "parallelSolanaRPC", ...syncProtocol },
    primitives: [],
  } as unknown as ConfigType);
  if (getBlock) (f.client as any).getBlock = getBlock;
  return f;
}

function primitivesOf(f: SolanaFetcher, slot: number, block: any, entries: any[]) {
  const it = f.readPrimitives(slot, block, entries as any) as any;
  const step = it.next();
  expect(step.done).toBe(true);
  return step.value as any[];
}

const rootConversion = { toRootPage: (o: Output) => (o.blockTime * 1000) as RootPage } as any;
const priorPage: LastPage<Page, RootPage> = { own: 0 as Page, ownBlockNumber: 0 as Page, root: 0 as RootPage };
function readData(f: SolanaFetcher, from: number, to: number) {
  return run(() => f.readData({ from, to, isPresync: false } as any, rootConversion, priorPage));
}
const block = (slot: number) => ({
  blockhash: `hash-${slot}`,
  blockTime: 1_700_000_000 + slot,
  blockHeight: slot,
  parentSlot: slot - 1,
  transactions: [],
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("a recorded devnet block with version-1 transactions", () => {
  test("the fixture is what devnet serves: v1 transactions, and -32015 when asked for version 0", () => {
    const versions = FIXTURE.block.transactions.map((t: any) => t.version);
    expect(versions.filter((v: unknown) => v === 1).length).toBeGreaterThan(0);
    expect(FIXTURE.errorWithVersion0.code).toBe(-32015);
    expect(FIXTURE.request.maxSupportedTransactionVersion).toBe(1);
  });

  test("a bridge LOCK in the same block is found; the v1 (and every other) transaction is read without error and not matched", () => {
    const b = structuredClone(FIXTURE.block);
    b.transactions.splice(3, 0, bridgeLockTx());
    const f = fetcherWith();
    const out = primitivesOf(f, FIXTURE.slot, b, [programLogEntry, tokenEntry]);
    const logs = out.filter((p) => p.primitive === "BridgeSolanaProgramLog");
    expect(logs.length).toBe(1);
    expect(logs[0].output.payload.logMessages).toEqual([LOCK_LINE]);
    expect(logs[0].syncProtocol.logIndex).toBe(3);
    expect(f.unparsableTransactions).toBe(0); // v1 transactions parse with the json shape as is
  });

  test("an unparsable non-bridge transaction is skipped and counted; the rest of the block is still read", () => {
    const b = structuredClone(FIXTURE.block);
    b.transactions.splice(1, 0, { transaction: { message: {} }, meta: { err: null, logMessages: [], postBalances: [], postTokenBalances: 5 } });
    b.transactions.push(bridgeLockTx());
    const f = fetcherWith();
    const out = primitivesOf(f, FIXTURE.slot, b, [programLogEntry, tokenEntry]);
    expect(f.unparsableTransactions).toBe(1);
    expect(out.filter((p) => p.primitive === "BridgeSolanaProgramLog").map((p) => p.syncProtocol.logIndex)).toEqual([b.transactions.length - 1]);
  });

  test("readData over the recorded block emits the block and the LOCK", async () => {
    const b = structuredClone(FIXTURE.block);
    b.transactions.push(bridgeLockTx());
    const f = fetcherWith({}, async (slot) => (slot === FIXTURE.slot ? b : null));
    (f as any).config.primitives = [programLogEntry];
    const r = await readData(f, FIXTURE.slot - 1, FIXTURE.slot + 1);
    expect(r.output.map((o) => o.output.slot)).toEqual([FIXTURE.slot]);
    expect(r.output[0].output.primitives.length).toBe(1);
    expect(Number(r.lastPage.own)).toBe(FIXTURE.slot + 1);
  });
});

describe("SolanaClient against a stub RPC", () => {
  let server: ReturnType<typeof Bun.serve>;
  const seen: number[] = [];
  let mode: "hint" | "old-rpc" | "429" | "ok" = "ok";
  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const body: any = await req.json();
        const v = body.params?.[1]?.maxSupportedTransactionVersion;
        seen.push(v);
        if (mode === "429") return new Response("Too Many Requests", { status: 429, headers: { "retry-after": "1" } });
        if (mode === "hint" && v < 2) {
          return Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32015, message: 'Transaction version (2) is not supported by the requesting client. Please try the request again with the following configuration parameter: "maxSupportedTransactionVersion": 2' } });
        }
        if (mode === "old-rpc" && v > 0) {
          return Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Invalid params: unsupported maxSupportedTransactionVersion" } });
        }
        return Response.json({ jsonrpc: "2.0", id: 1, result: FIXTURE.block });
      },
    });
  });
  afterAll(() => server.stop(true));
  const url = () => `http://127.0.0.1:${server.port}/?api-key=SECRET-KEY-123`;

  test("getBlock asks for version 1 by default", async () => {
    mode = "ok";
    seen.length = 0;
    const c = new SolanaClient(url());
    expect((await c.getBlock(1))?.blockhash).toBe(FIXTURE.block.blockhash);
    expect(seen).toEqual([DEFAULT_MAX_SUPPORTED_TRANSACTION_VERSION]);
    expect(DEFAULT_MAX_SUPPORTED_TRANSACTION_VERSION).toBe(1);
  });

  test("a -32015 hint raises the version once, and it is kept", async () => {
    mode = "hint";
    seen.length = 0;
    const c = new SolanaClient(url());
    expect((await c.getBlock(1))?.blockhash).toBe(FIXTURE.block.blockhash);
    expect(seen).toEqual([1, 2]);
    expect(c.maxSupportedTransactionVersion).toBe(2);
    await c.getBlock(2);
    expect(seen).toEqual([1, 2, 2]);
  });

  test("an RPC that rejects the parameter value falls back to version 0", async () => {
    mode = "old-rpc";
    seen.length = 0;
    const c = new SolanaClient(url());
    expect((await c.getBlock(1))?.blockhash).toBe(FIXTURE.block.blockhash);
    expect(seen).toEqual([1, 0]);
    expect(c.maxSupportedTransactionVersion).toBe(0);
  });

  test("HTTP 429 is a SolanaRateLimitError carrying Retry-After", async () => {
    mode = "429";
    const c = new SolanaClient(url());
    let err: unknown;
    try {
      await c.getBlock(1);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SolanaRateLimitError);
    expect((err as SolanaRateLimitError).retryAfterMs).toBe(1000);
    expect(parseRetryAfter("2.5")).toBe(2500);
    expect(parseRetryAfter(null)).toBeNull();
  });

  test("a transport error never carries the RPC URL's key", async () => {
    const c = new SolanaClient("http://127.0.0.1:9/?api-key=SECRET-KEY-123", 2000);
    let msg = "";
    try {
      await c.getBlock(1);
    } catch (e) {
      msg = `${String(e)} ${(e as Error).stack ?? ""}`;
    }
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).not.toContain("SECRET-KEY-123");
  });
});

describe("concurrent getBlock, applied in slot order", () => {
  test("blocks completing out of order are applied in strict slot order, with no gap", async () => {
    const order: number[] = [];
    const f = fetcherWith({ getBlockConcurrency: 8 }, async (slot) => {
      await sleep((50 - slot) % 9 * 5); // later slots of a batch often finish first
      order.push(slot);
      return block(slot);
    });
    const r = await readData(f, 1, 40);
    expect(r.output.map((o) => o.output.slot)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(Number(r.lastPage.own)).toBe(40);
    // They really did complete out of order.
    expect(order).not.toEqual([...order].sort((a, b) => a - b));
  });

  test("a slot error is retried without skipping; a persistent one stops the scan there and the next read resumes at it", async () => {
    const attempts = new Map<number, number>();
    let broken = true;
    const f = fetcherWith({ getBlockConcurrency: 8 }, async (slot) => {
      const n = (attempts.get(slot) ?? 0) + 1;
      attempts.set(slot, n);
      if (slot === 13 && n <= 2) throw new Error("transient");
      if (slot === 27 && broken) throw new Error("down");
      return block(slot);
    });
    const r1 = await readData(f, 1, 40);
    expect(r1.output.map((o) => o.output.slot)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
    expect(attempts.get(13)).toBe(3);
    expect(Number(r1.lastPage.own)).toBe(26);
    broken = false;
    const r2 = await readData(f, 27, 40);
    expect(r2.output.map((o) => o.output.slot)).toEqual(Array.from({ length: 14 }, (_, i) => i + 27));
  });

  test("throughput: 8 in flight read a slow RPC several times faster than one at a time", async () => {
    const slow = async (slot: number) => {
      await sleep(40);
      return block(slot);
    };
    const t1 = Date.now();
    await readData(fetcherWith({ getBlockConcurrency: 1 }, slow), 1, 24);
    const sequential = Date.now() - t1;
    const t8 = Date.now();
    const r = await readData(fetcherWith({ getBlockConcurrency: 8 }, slow), 1, 24);
    const concurrent = Date.now() - t8;
    expect(r.output.length).toBe(24);
    expect(sequential).toBeGreaterThanOrEqual(24 * 40);
    expect(concurrent * 4).toBeLessThan(sequential);
  });

  test("the default is 8 in flight", () => {
    expect(fetcherWith().getBlockConcurrency).toBe(8);
    expect(fetcherWith().currentConcurrency).toBe(8);
  });

  test("pacing: getBlockMinIntervalMs spaces the calls, even concurrent ones", async () => {
    const starts: number[] = [];
    const f = fetcherWith({ getBlockConcurrency: 8, getBlockMinIntervalMs: 30 }, async (slot) => {
      starts.push(Date.now());
      return block(slot);
    });
    await readData(f, 1, 8);
    starts.sort((a, b) => a - b);
    // Timers may fire a few ms early or late: check the overall spacing (unpaced, all 8 start at once).
    expect(starts.at(-1)! - starts[0]!).toBeGreaterThanOrEqual(7 * 30 - 15);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(15);
  });
});

describe("HTTP 429 slows the reader down instead of breaking it", () => {
  test("rate-limited calls wait (Retry-After or backoff), are not counted as failures, and halve the concurrency", async () => {
    const hits = new Map<number, number>();
    const f = fetcherWith({ getBlockConcurrency: 8, rateLimitBackoffMs: 5, rateLimitMaxBackoffMs: 20 }, async (slot) => {
      const n = (hits.get(slot) ?? 0) + 1;
      hits.set(slot, n);
      if (slot === 2 && n <= 4) throw new SolanaRateLimitError("getBlock", 429, n === 1 ? 10 : null);
      return block(slot);
    });
    const r = await readData(f, 1, 8);
    expect(r.output.map((o) => o.output.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(hits.get(2)).toBe(5); // 4 rate-limited waits, then the block (not 3 "attempts")
    expect(f.rateLimitedWaits).toBe(4);
    expect(f.currentConcurrency).toBe(4);
  });

  test("after rateLimitRetries the slot fails like any error (bounded), keeping the earlier blocks", async () => {
    const f = fetcherWith({ getBlockConcurrency: 1, rateLimitRetries: 2, rateLimitBackoffMs: 1 }, async (slot) => {
      if (slot >= 3) throw new SolanaRateLimitError("getBlock", 429, null);
      return block(slot);
    });
    const r = await readData(f, 1, 5);
    expect(r.output.map((o) => o.output.slot)).toEqual([1, 2]);
    expect(Number(r.lastPage.own)).toBe(2);
  });

  test("clean batches grow the concurrency back, up to the cap", () => {
    const f = fetcherWith({ getBlockConcurrency: 4 });
    f.adaptConcurrency(true);
    expect(f.currentConcurrency).toBe(2);
    for (let i = 0; i < 10; i++) f.adaptConcurrency(false);
    expect(f.currentConcurrency).toBe(3);
    for (let i = 0; i < 30; i++) f.adaptConcurrency(false);
    expect(f.currentConcurrency).toBe(4);
  });
});
