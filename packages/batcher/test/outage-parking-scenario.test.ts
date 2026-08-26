// SC-3: a node outage, end to end, against the real storage backend.
//
// Every other file in this project tests one joint. This one runs the whole
// chain the defect actually travelled — real `DatabaseStorage`, real
// `createNewBatcher`, the real `probeNodeReachable`, the real
// `buildWorkerBatchOutcome`, the real `BatchProcessor` — and asks the question
// a poller would ask: what does `/input-status` say?
//
// Two shapes, both measured in 00017/00020:
//
//  1. OUTAGE BEFORE SUBMISSION (00017's Q-2). The node is down when the batch
//     is built. Nothing reached the chain. Before this project, one charged
//     retry per poll round meant ~3 seconds of downtime deleted the input and
//     published `failed / RETRIES_EXHAUSTED` for a transaction that was never
//     submitted — real input loss.
//
//  2. OUTAGE STRADDLING A LANDED SUBMISSION (00020's M13). The transaction
//     landed, the receipt was lost, the row survived, the resubmission was
//     refused because the spends were used. Before this project the request
//     went terminal `failed / RETRIES_EXHAUSTED` while being CONFIRMED on
//     chain — the store telling pollers the opposite of the truth.
//
// The adapter here is deliberately shaped like the balancing adapter — workers
// under `Promise.allSettled`, so nothing ever throws out of `submitBatch` and
// the thrown-channel parking path is unreachable — because that shape IS the
// defect.

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createNewBatcher } from "../core/batcher.ts";
import { DatabaseStorage } from "../core/storage.ts";
import { RETRIES_EXHAUSTED } from "../core/batch-processor.ts";
import {
  buildWorkerBatchOutcome,
  findLandedMidnightTransaction,
  probeNodeReachable,
} from "../adapters/midnight-balancing-adapter.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const TARGET = "product-a";
const NOW = Date.now();
const LANDED_HASH = "ab".repeat(32);

/** The verbatim wrapper 00017's Q-2 and 00020's M13 both recorded. */
const SUBMIT_ERROR = "Transaction submission error";

const makeInput = (nonce: string): DefaultBatcherInput => ({
  addressType: 5,
  address: "product-a-workload",
  input: JSON.stringify({ nonce }),
  timestamp: String(NOW),
  signature: `0xsignature-${nonce}`,
  target: TARGET,
});

interface Chain {
  /** The node's JSON-RPC endpoint; stopping the server IS the outage. */
  nodeUrl: string;
  indexerUrl: string;
  stopNode: () => Promise<void>;
  /** Transactions the indexer will admit to knowing about. */
  onChain: Set<string>;
  stopAll: () => Promise<void>;
}

async function startChain(): Promise<Chain> {
  const onChain = new Set<string>();
  const node = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const body = await request.json() as { id?: unknown };
      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        result: { peers: 1, isSyncing: false, shouldHavePeers: true },
      });
    },
  });
  const indexer = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const body = await request.json() as {
        variables: { offset: Record<string, string> };
      };
      const key = Object.values(body.variables.offset)[0];
      return Response.json({
        data: {
          transactions: onChain.has(key)
            ? [{
              hash: LANDED_HASH,
              block: { height: 4242 },
              transactionResult: { status: "SUCCESS" },
            }]
            : [],
        },
      });
    },
  });
  let nodeStopped = false;
  const stopNode = async () => {
    if (nodeStopped) return;
    nodeStopped = true;
    await node.stop(true);
  };
  return {
    nodeUrl: `http://127.0.0.1:${node.port}`,
    indexerUrl: `http://127.0.0.1:${indexer.port}`,
    onChain,
    stopNode,
    stopAll: async () => {
      await stopNode();
      await indexer.stop(true);
    },
  };
}

interface AdapterScript {
  /** What each worker does this round. */
  outcome: "submit" | "refuse";
  /** Swallow the receipt, as a lost/restarted confirmation would. */
  loseReceipt?: boolean;
}

/**
 * An adapter shaped like `MidnightBalancingAdapter`: per-worker pipelines under
 * `Promise.allSettled`, a `BatchOutcome` return, and the SHIPPED classification
 * and landed-check helpers rather than test re-implementations of them.
 */
function outageAdapter(chain: Chain, script: AdapterScript) {
  return {
    verifySignature: () => true,
    validateInput: () => ({ valid: true }),
    buildBatchData: (inputs: DefaultBatcherInput[]) =>
      inputs.length === 0 ? null : { selectedInputs: inputs, data: { inputs } },
    estimateBatchFee: () => 0n,
    submitBatch: async (data: { inputs: DefaultBatcherInput[] }) => {
      const results = await Promise.allSettled(
        data.inputs.map(async () => {
          if (script.outcome === "submit") return LANDED_HASH;
          throw new Error(SUBMIT_ERROR);
        }),
      );
      const nodeReachable =
        results.some((result) => result.status === "rejected")
          ? await probeNodeReachable(chain.nodeUrl, 2_000)
          : undefined;
      return buildWorkerBatchOutcome(
        [],
        data.inputs,
        results as PromiseSettledResult<string>[],
        nodeReachable,
      );
    },
    findLandedTransaction: async (
      input: DefaultBatcherInput,
      context: { target: string; transactionHash?: string },
    ) =>
      await findLandedMidnightTransaction({
        indexer: chain.indexerUrl,
        // The M13 case: the batcher wrote the hash down before it died.
        transactionHash: context.transactionHash,
        timeoutMs: 2_000,
      }),
    waitForTransactionReceipt: async () => {
      if (script.loseReceipt) {
        throw new Error("receipt never arrived — the batcher was restarted");
      }
      return { hash: LANDED_HASH, blockNumber: 4242n, status: 1 };
    },
    getAccountAddress: () => "batcher",
    getChainName: () => "midnight-like",
    isReady: () => true,
    getBlockNumber: async () => 4242n,
  };
}

async function withBatcher(
  script: AdapterScript,
  fn: (ctx: {
    batcher: ReturnType<typeof createNewBatcher>;
    storage: DatabaseStorage;
    chain: Chain;
    script: AdapterScript;
    cooldowns: number[];
  }) => Promise<void>,
): Promise<void> {
  const chain = await startChain();
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-outage-"));
  const storage = new DatabaseStorage({ dataDirectory: dir });
  const batcher = createNewBatcher({
    pollingIntervalMs: 1_000_000,
    enableHttpServer: false,
    enableEventSystem: false,
    maxRetries: 3,
    retryDelayMs: 10,
  }, storage as any);
  batcher.addBlockchainAdapter(TARGET, outageAdapter(chain, script) as any, {
    criteriaType: "size",
    maxBatchSize: 4,
  });
  await batcher.init({ startPolling: false });

  // The processor calls `this.setTargetCooldown(...)` through the batcher, so
  // overriding the method here observes exactly what it asked for.
  const cooldowns: number[] = [];
  const original = batcher.setTargetCooldown.bind(batcher);
  batcher.setTargetCooldown = (target: string, ms: number) => {
    cooldowns.push(ms);
    original(target, ms);
  };

  try {
    await fn({ batcher, storage, chain, script, cooldowns });
  } finally {
    await (batcher as any).gracefulShutdown().catch(() => {});
    await storage.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    await chain.stopAll();
  }
}

test("SC-3 shape 1: a node outage before submission parks every input, charges nothing, drops nothing", async () => {
  await withBatcher({ outcome: "refuse" }, async (ctx) => {
    const ids = await Promise.all(
      ["a", "b", "c", "d"].map(async (nonce) =>
        (await ctx.batcher.batchInput(makeInput(nonce), "no-wait")).requestId
      ),
    );

    // The node goes away BEFORE anything is submitted. Nothing reaches the
    // chain in this whole test; the counter delta would be zero.
    await ctx.chain.stopNode();

    const OUTAGE_ROUNDS = 6;
    for (let round = 0; round < OUTAGE_ROUNDS; round++) {
      await ctx.batcher.forceProcessBatches();
    }

    // Before this project: 6 rounds × 1 charge, `maxRetries: 3` → every input
    // deleted by round 3 with `failed / RETRIES_EXHAUSTED`, for transactions
    // the node never even saw.
    const statuses = await Promise.all(
      ids.map((id) => ctx.batcher.getRequestStatus(id)),
    );
    const drops = statuses.filter((s) => s?.errorCode === RETRIES_EXHAUSTED);
    expect(drops.length).toBe(0);
    expect(statuses.every((s) => s?.state !== "failed")).toBe(true);
    expect(statuses.every((s) => s?.retryCount === 0)).toBe(true);

    // Parked, and the target actually rested — one cooldown per round, each
    // longer than the last, which is what stops a long outage from rebuilding
    // the same doomed batch thousands of times.
    expect(ctx.cooldowns.length).toBe(OUTAGE_ROUNDS);
    for (let i = 1; i < ctx.cooldowns.length; i++) {
      expect(ctx.cooldowns[i]).toBeGreaterThan(ctx.cooldowns[i - 1]);
    }
    expect(ctx.cooldowns[0]).toBe(1000);

    // The rows are still there, which is the whole point: nothing was lost.
    expect((await ctx.storage.getAllInputs()).length).toBe(4);

    // The node comes back. The identical inputs, never charged, now confirm.
    ctx.script.outcome = "submit";
    await ctx.batcher.forceProcessBatches();

    const settled = await Promise.all(
      ids.map((id) => ctx.batcher.getRequestStatus(id)),
    );
    expect(settled.every((s) => s?.state === "confirmed")).toBe(true);
    expect(settled.every((s) => s?.transactionHash === LANDED_HASH)).toBe(true);
    expect(settled.every((s) => s?.errorCode !== RETRIES_EXHAUSTED)).toBe(true);
  });
}, 120_000);

test("SC-3 shape 2 (M13): a request whose transaction landed reads CONFIRMED, not retry-exhausted", async () => {
  await withBatcher({ outcome: "submit", loseReceipt: true }, async (ctx) => {
    const { requestId } = await ctx.batcher.batchInput(makeInput("m13"), "no-wait");

    // Round 1 submits successfully and the transaction lands — but the receipt
    // never comes back, exactly as a restart mid-confirmation loses it. The row
    // survives because rows are only removed after a receipt.
    await ctx.batcher.forceProcessBatches().catch(() => {});
    ctx.chain.onChain.add(LANDED_HASH);

    const midFlight = await ctx.batcher.getRequestStatus(requestId);
    expect(midFlight?.state).toBe("submitted");
    expect(midFlight?.transactionHash).toBe(LANDED_HASH);
    expect((await ctx.storage.getAllInputs()).length).toBe(1);

    // Round 2 re-picks the surviving row. The node is UP, so the probe says so
    // and the refusal is a real verdict — the spends are already used. This is
    // precisely where the batcher used to start charging a confirmed request.
    ctx.script.outcome = "refuse";
    await ctx.batcher.forceProcessBatches();

    const status = await ctx.batcher.getRequestStatus(requestId);
    expect(status?.state).toBe("confirmed");
    expect(status?.errorCode).not.toBe(RETRIES_EXHAUSTED);
    expect(status?.transactionHash).toBe(LANDED_HASH);
    expect(status?.blockNumber).toBe(4242n);
    expect(status?.retryCount).toBe(0);
    // Reconciled means resolved: the row is gone, so it cannot be re-picked.
    expect((await ctx.storage.getAllInputs()).length).toBe(0);
  });
}, 120_000);

test("SC-3 negative control: with nothing on chain, the SAME sequence still exhausts and drops", async () => {
  // Without this, the case above could pass because the batcher had quietly
  // stopped charging anything at all. Here the indexer knows about no
  // transaction, so the identical path must reach the identical old ending.
  await withBatcher({ outcome: "submit", loseReceipt: true }, async (ctx) => {
    const { requestId } = await ctx.batcher.batchInput(makeInput("ctl"), "no-wait");

    await ctx.batcher.forceProcessBatches().catch(() => {});
    // NOTE: `chain.onChain` is left EMPTY — the transaction never landed.
    ctx.script.outcome = "refuse";

    for (let round = 0; round < 3; round++) {
      await ctx.batcher.forceProcessBatches();
    }

    const status = await ctx.batcher.getRequestStatus(requestId);
    expect(status?.state).toBe("failed");
    expect(status?.errorCode).toBe(RETRIES_EXHAUSTED);
    expect((await ctx.storage.getAllInputs()).length).toBe(0);
  });
}, 120_000);

test("SC-3/FR-4: an outage that never ends still bounds a deterministically doomed input", async () => {
  // The masking risk stated plainly. If parking were unbounded, an input that
  // is in fact never going to succeed would sit uncharged for the life of the
  // process. It parks, then it pays.
  await withBatcher({ outcome: "refuse" }, async (ctx) => {
    const { requestId } = await ctx.batcher.batchInput(makeInput("doomed"), "no-wait");
    await ctx.chain.stopNode();

    let terminal = await ctx.batcher.getRequestStatus(requestId);
    let rounds = 0;
    while (rounds < 200 && terminal?.state !== "failed") {
      await ctx.batcher.forceProcessBatches();
      terminal = await ctx.batcher.getRequestStatus(requestId);
      rounds++;
    }

    expect(terminal?.state).toBe("failed");
    expect(terminal?.errorCode).toBe(RETRIES_EXHAUSTED);
    // Bounded, and generously: 50 free parks and then the ordinary 3-retry
    // budget. The escalating cooldown means those 53 rounds span more than
    // three quarters of an hour of real downtime.
    expect(rounds).toBeLessThanOrEqual(60);
    expect(rounds).toBeGreaterThan(50);
  });
}, 180_000);
