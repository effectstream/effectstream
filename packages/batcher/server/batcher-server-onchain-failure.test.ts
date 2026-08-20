import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createNewBatcher,
  InputTerminalError,
  type Batcher,
} from "../core/batcher.ts";
import { ONCHAIN_FAILED } from "../core/batch-processor.ts";
import { computeRequestId } from "../core/request-id.ts";
import { DatabaseStorage } from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { startBatcherHttpServer } from "./batcher-server.ts";

const TARGET = "failed-chain-test";

function input(nonce: string): DefaultBatcherInput {
  return {
    addressType: 5 as DefaultBatcherInput["addressType"],
    address: `failed-wallet-${nonce}`,
    input: JSON.stringify({ nonce }),
    timestamp: String(Date.now()),
    signature: `failed-signature-${nonce}`,
    target: TARGET,
  };
}

function failedAdapter() {
  return {
    verifySignature: () => true,
    validateInput: async () => ({ valid: true }),
    buildBatchData: (inputs: DefaultBatcherInput[]) => ({
      selectedInputs: inputs,
      data: { inputs },
    }),
    estimateBatchFee: () => 0n,
    submitBatch: async () => "0xreverted",
    waitForTransactionReceipt: async () => ({
      hash: "0xreverted",
      blockNumber: 9001n,
      status: 0,
    }),
    getAccountAddress: () => "failed-chain-batcher",
    getChainName: () => "failed-chain",
    isReady: () => true,
    getBlockNumber: async () => 9001n,
  };
}

interface FailureContext {
  batcher: Batcher<DefaultBatcherInput>;
  storage: DatabaseStorage;
  terminal: any[];
}

async function withFailureBatcher(
  fn: (context: FailureContext) => Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-onchain-failure-"));
  const storage = new DatabaseStorage({ dataDirectory: dir });
  const batcher = createNewBatcher({
    pollingIntervalMs: 1_000_000,
    enableHttpServer: false,
    enableEventSystem: true,
  }, storage as any) as Batcher<DefaultBatcherInput>;
  batcher.addBlockchainAdapter(TARGET, failedAdapter() as any, {
    criteriaType: "size",
    maxBatchSize: 1,
  });
  const terminal: any[] = [];
  batcher.addStateTransition(
    "request:terminal" as never,
    ((payload: unknown) => terminal.push(payload)) as never,
  );
  await batcher.init({ startPolling: false });
  try {
    await fn({ batcher, storage, terminal });
  } finally {
    await (batcher as any).gracefulShutdown().catch(() => {});
    await storage.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

async function waitUntilQueued(storage: DatabaseStorage): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if ((await storage.getAllInputs()).length > 0) return;
    await Bun.sleep(5);
  }
  throw new Error("input was not queued before the test deadline");
}

test("SDK, terminal event, and polling agree on one failed transaction", async () => {
  await withFailureBatcher(async ({ batcher, storage, terminal }) => {
    const payload = input("sdk");
    const requestId = computeRequestId(payload, TARGET);
    const pending = batcher.batchInput(payload, "wait-receipt", 20_000);
    await waitUntilQueued(storage);

    const startedAt = performance.now();
    await batcher.forceProcessBatches(TARGET);
    const error = await pending.catch((caught) => caught);

    expect(error).toBeInstanceOf(InputTerminalError);
    expect(error).toMatchObject({
      statusCode: 422,
      errorCode: ONCHAIN_FAILED,
      requestId,
      transactionHash: "0xreverted",
      retryable: false,
    });
    expect(performance.now() - startedAt).toBeLessThan(5_000);
    expect((batcher as any).submissionCallbacks.size).toBe(0);

    expect(terminal).toHaveLength(1);
    expect(terminal[0]).toMatchObject({
      requestId,
      target: TARGET,
      state: "failed",
      transactionHash: "0xreverted",
      errorCode: ONCHAIN_FAILED,
    });
    expect(await storage.getStatus(requestId)).toMatchObject({
      requestId,
      state: "failed",
      transactionHash: "0xreverted",
      errorCode: ONCHAIN_FAILED,
    });
  });
}, { timeout: 30_000 });

test("HTTP wait-receipt returns structured 422 and its id polls failed", async () => {
  await withFailureBatcher(async ({ batcher, storage, terminal }) => {
    const port = Number(process.env.BATCHER_TEST_PORT ?? "18379");
    const server = await startBatcherHttpServer(batcher, port);
    try {
      const payload = input("http");
      const requestId = computeRequestId(payload, TARGET);
      const pending = server.inject({
        method: "POST",
        url: "/send-input",
        payload: {
          confirmationLevel: "wait-receipt",
          timeoutMs: 20_000,
          data: payload,
        },
      });
      await waitUntilQueued(storage);
      await batcher.forceProcessBatches(TARGET);

      const response = await pending;
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        success: false,
        error: "On-chain transaction failed",
        message: "Transaction failed on-chain: 0xreverted",
        requestId,
        transactionHash: "0xreverted",
        errorCode: ONCHAIN_FAILED,
        retryable: false,
      });

      const poll = await server.inject({
        method: "GET",
        url: `/input-status/${requestId}`,
      });
      expect(poll.statusCode).toBe(200);
      expect(poll.json()).toMatchObject({
        status: "failed",
        subState: "failed",
        transactionHash: "0xreverted",
        errorCode: ONCHAIN_FAILED,
      });
      expect(terminal).toHaveLength(1);
      expect(terminal[0]).toMatchObject({
        requestId,
        state: "failed",
        transactionHash: "0xreverted",
        errorCode: ONCHAIN_FAILED,
      });
      expect((batcher as any).submissionCallbacks.size).toBe(0);
    } finally {
      await server.close();
    }
  });
}, { timeout: 30_000 });
