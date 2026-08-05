import { expect, test } from "bun:test";
import { run } from "effection";
import { SolanaFetcher } from "./fetcher.ts";
import type { ConfigType, Output, Page } from "./types.ts";
import type { LastPage } from "../base/state.ts";
import type { RootPage } from "../types.ts";

/**
 * How `readData` behaves when the RPC misbehaves. The contract it must keep:
 *
 *  - a transient failure costs nothing — the block is retried immediately
 *  - a persistent failure keeps whatever was already fetched, and the page
 *    advances only over slots that were positively resolved, so no slot is ever
 *    stepped over unread
 *  - a failure with nothing resolved throws, so the fetch loop counts it and
 *    /health can see it, rather than looking idle
 */

const BLOCKHASH = "hash";

function makeFetcher(getBlock: (slot: number) => Promise<any>): SolanaFetcher {
  const fetcher = new SolanaFetcher({
    network: { rpcUrl: "http://127.0.0.1:8899" },
    syncProtocol: { name: "parallelSolanaRPC" },
    primitives: [],
  } as unknown as ConfigType);
  (fetcher.client as any).getBlock = getBlock;
  return fetcher;
}

const block = (slot: number) => ({
  blockhash: `${BLOCKHASH}-${slot}`,
  blockTime: 1_700_000_000 + slot,
  blockHeight: slot,
  parentSlot: slot - 1,
  transactions: [],
});

const rootConversion = {
  toRootPage: (o: Output) => (o.blockTime * 1000) as RootPage,
} as any;

const priorPage: LastPage<Page, RootPage> = {
  own: 0 as Page,
  ownBlockNumber: 0 as Page,
  root: 0 as RootPage,
};

function readData(fetcher: SolanaFetcher, from: number, to: number) {
  return run(() =>
    fetcher.readData(
      { from, to, isPresync: false } as any,
      rootConversion,
      priorPage,
    )
  );
}

test("a transient failure is retried and costs no blocks", async () => {
  const attempts = new Map<number, number>();
  const fetcher = makeFetcher(async (slot) => {
    const n = (attempts.get(slot) ?? 0) + 1;
    attempts.set(slot, n);
    if (slot === 2 && n === 1) throw new Error("transient timeout");
    return block(slot);
  });

  const result = await readData(fetcher, 1, 3);

  expect(result.output.length).toBe(3);
  expect(attempts.get(2)).toBe(2); // failed once, succeeded on retry
  expect(Number(result.lastPage.own)).toBe(3);
});

test("a persistent failure keeps earlier blocks and stops at the bad slot", async () => {
  const fetcher = makeFetcher(async (slot) => {
    if (slot >= 3) throw new Error("still down");
    return block(slot);
  });

  const result = await readData(fetcher, 1, 5);

  // Slots 1-2 survive rather than the whole chunk being discarded...
  expect(result.output.map((o) => o.output.slot)).toEqual([1, 2]);
  // ...and the page stops at 2, so the next poll resumes AT 3 — the failed slot
  // is never stepped over.
  expect(Number(result.lastPage.own)).toBe(2);
});

test("a failure with nothing resolved throws, so the loop can count it", async () => {
  const fetcher = makeFetcher(async () => {
    throw new Error("RPC unreachable");
  });

  let thrown: unknown;
  try {
    await readData(fetcher, 10, 15);
  } catch (e) {
    thrown = e;
  }
  expect(String(thrown)).toContain("RPC unreachable");
});

test("retries are bounded — it gives up rather than hanging forever", async () => {
  let calls = 0;
  const fetcher = makeFetcher(async () => {
    calls++;
    throw new Error("down");
  });

  let thrown: unknown;
  try {
    await readData(fetcher, 1, 1);
  } catch (e) {
    thrown = e;
  }
  expect(String(thrown)).toContain("down");
  // 3 attempts for the single slot, then hand back to the fetch loop. An
  // unbounded inner retry would never return and would freeze the health signal.
  expect(calls).toBe(3);
});

test("a fully skipped range advances the page over CONFIRMED-skipped slots only", async () => {
  const fetcher = makeFetcher(async () => null); // every slot skipped

  const result = await readData(fetcher, 1, 4);

  expect(result.output.length).toBe(0);
  expect(Number(result.lastPage.own)).toBe(4);
});

test("skipped-then-failed advances only to the last confirmed slot", async () => {
  const fetcher = makeFetcher(async (slot) => {
    if (slot <= 2) return null; // confirmed skipped
    throw new Error("down"); // never resolved
  });

  const result = await readData(fetcher, 1, 5);

  expect(result.output.length).toBe(0);
  // 2, not 5: slots 3-5 were never read, so the page must not pass them.
  expect(Number(result.lastPage.own)).toBe(2);
});

test("trailing skipped slots still advance the page past the last block", async () => {
  const fetcher = makeFetcher(async (slot) => (slot === 1 ? block(1) : null));

  const result = await readData(fetcher, 1, 4);

  expect(result.output.map((o) => o.output.slot)).toEqual([1]);
  // Paging to 4 (not 1) avoids re-scanning slots already confirmed empty.
  expect(Number(result.lastPage.own)).toBe(4);
});
