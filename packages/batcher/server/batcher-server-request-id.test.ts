// The request id at the WIRE (spec FR-001): every 200 carries it, at every
// confirmation level, and a duplicate says so.
//
// Why this cannot be tested at `batchInput()`: the envelope has carried
// `{requestId, receipt, duplicate?}` since Phase 2, but Fastify serialises
// responses THROUGH the TypeBox response schema and silently drops any property
// the schema does not declare. So a handler that returns the id into an
// unchanged schema is indistinguishable, at the unit level, from one that works
// — and the caller gets a 200 with no id. Only an injected request can see that.
//
// Two halves:
//   1. the four confirmation branches, driven against a stubbed `batchInput`,
//      because `wait-effectstream-processed` otherwise needs an MQTT broker and
//      the point here is the RENDERING, not the waiting;
//   2. one end-to-end pass on a real Batcher over a real tracking database, so
//      the stub cannot be wrong about the shape it is standing in for.

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Batcher, createNewBatcher } from "../core/batcher.ts";
import type { BatchInputResult } from "../core/batcher.ts";
import { DatabaseStorage } from "../core/storage.ts";
import type { BatcherStorage } from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { startBatcherHttpServer } from "./batcher-server.ts";

class MemoryStorage implements BatcherStorage<DefaultBatcherInput> {
  readonly inputs: DefaultBatcherInput[] = [];
  async init(): Promise<void> {}
  async addInput(input: DefaultBatcherInput): Promise<void> {
    this.inputs.push(input);
  }
  async getAllInputs(): Promise<DefaultBatcherInput[]> {
    return [...this.inputs];
  }
  async removeProcessedInputs(): Promise<void> {}
  async getInputCountAndSize(): Promise<{ count: number; size: number }> {
    return { count: this.inputs.length, size: 0 };
  }
  async getInputsByTarget(): Promise<DefaultBatcherInput[]> {
    return [...this.inputs];
  }
  async incrementRetryCount(): Promise<DefaultBatcherInput[]> {
    return [];
  }
  async clearAllInputs(): Promise<void> {
    this.inputs.length = 0;
  }
}

const stubAdapter = () => ({
  verifySignature: () => true,
  validateInput: () => ({ valid: true }),
  getChainName: () => "test",
  getAccountAddress: () => "batcher",
  isReady: () => true,
  getBlockNumber: async () => 0n,
  buildBatchData: (inputs: DefaultBatcherInput[]) => ({
    selectedInputs: inputs,
    data: { inputs },
  }),
  estimateBatchFee: () => 0n,
  submitBatch: async () => "0xbatch",
  waitForTransactionReceipt: async () => ({
    hash: "0xbatch",
    blockNumber: 7n,
    status: 1,
  }),
});

const body = (confirmationLevel: string) => ({
  confirmationLevel,
  data: {
    address: "wallet",
    addressType: 0,
    input: "payload",
    signature: "sig",
    // Fresh: the freshness gate (task 4.3) refuses a stale signed timestamp,
    // and a test pinned to 1970 would fail for a reason it is not about.
    timestamp: String(Date.now()),
    target: "test",
  },
});

/**
 * Drive the response rendering with a scripted `batchInput`.
 *
 * The instance method is replaced rather than the adapter scripted, because
 * what is under test is how the SERVER renders an envelope — including the two
 * envelopes a real batcher would make us stand up infrastructure to produce
 * (an EffectStream rollup, and a duplicate at wait-receipt).
 */
async function postWithEnvelope(
  confirmationLevel: string,
  envelope: BatchInputResult,
) {
  const storage = new MemoryStorage();
  const batcher = new Batcher({
    pollingIntervalMs: 1000,
    adapters: { test: stubAdapter() as any },
    defaultTarget: "test",
  }, storage);
  (batcher as any).batchInput = async () => envelope;
  const server = await startBatcherHttpServer(batcher, 0);
  try {
    const res = await server.inject({
      method: "POST",
      url: "/send-input",
      payload: body(confirmationLevel),
    });
    return res;
  } finally {
    await server.close();
  }
}

const ID = "a".repeat(64);

test("no-wait: the 200 carries the request id", async () => {
  const res = await postWithEnvelope("no-wait", {
    requestId: ID,
    receipt: null,
  });

  expect(res.statusCode).toBe(200);
  const payload = res.json();
  expect(payload.requestId).toBe(ID);
  // FR-009: fields are ADDED, never removed.
  expect(payload.success).toBe(true);
  expect(payload.inputsProcessed).toBe(1);
  // Nothing was claimed about duplication, so the marker stays absent rather
  // than being rendered as `false` — a client testing truthiness sees the same
  // thing either way, but a client testing presence should not be told a
  // duplicate check happened when it did not.
  expect(payload.duplicate).toBeUndefined();
});

test("wait-receipt: the id rides alongside the transaction hash", async () => {
  const res = await postWithEnvelope("wait-receipt", {
    requestId: ID,
    receipt: { hash: "0xdeadbeef", blockNumber: 7n, status: 1 } as any,
  });

  expect(res.statusCode).toBe(200);
  const payload = res.json();
  expect(payload.requestId).toBe(ID);
  expect(payload.transactionHash).toBe("0xdeadbeef");
});

test("wait-effectstream-processed: the id survives the rollup branch too", async () => {
  const res = await postWithEnvelope("wait-effectstream-processed", {
    requestId: ID,
    receipt: {
      hash: "0xdeadbeef",
      blockNumber: 7n,
      status: 1,
      rollup: 12,
    } as any,
  });

  expect(res.statusCode).toBe(200);
  const payload = res.json();
  expect(payload.requestId).toBe(ID);
  expect(payload.transactionHash).toBe("0xdeadbeef");
  expect(payload.rollup).toBe(12);
});

test("a body that omits the confirmation level still returns the id", async () => {
  // Measured, because the obvious test here asserts something unreachable: the
  // handler's switch has a `default:` branch and a `if (!confirmationLevel)`
  // config fallback above it, and NEITHER can be reached over HTTP. Probed —
  // an omitted level is filled with "wait-receipt" by ajv's `useDefaults`
  // before the handler runs, and an unrecognised one is a 400 at body
  // validation. Both were dead before this phase and stay dead; the id was
  // added to the `default:` branch anyway, so a future caller that reaches it
  // by another route is not the one place the contract lapses.
  const storage = new MemoryStorage();
  const batcher = new Batcher({
    pollingIntervalMs: 1000,
    adapters: { test: stubAdapter() as any },
    defaultTarget: "test",
  }, storage);
  (batcher as any).batchInput = async () => ({ requestId: ID, receipt: null });
  const server = await startBatcherHttpServer(batcher, 0);
  try {
    const { confirmationLevel: _omitted, ...rest } = body("no-wait");
    const res = await server.inject({
      method: "POST",
      url: "/send-input",
      payload: rest,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().requestId).toBe(ID);
  } finally {
    await server.close();
  }
});

test("a duplicate is a SUCCESS carrying the original id, not a timeout", async () => {
  // A duplicate always has `receipt: null` whatever level was asked for
  // (Phase 3). Rendering that through the wait-receipt branch unchanged would
  // produce a 200 with no hash and no explanation — indistinguishable from a
  // batch that never landed.
  const res = await postWithEnvelope("wait-receipt", {
    requestId: ID,
    receipt: null,
    duplicate: true,
  });

  expect(res.statusCode).toBe(200);
  const payload = res.json();
  expect(payload.success).toBe(true);
  expect(payload.duplicate).toBe(true);
  expect(payload.requestId).toBe(ID);
  expect(payload.transactionHash).toBeUndefined();
  // The caller asked to wait and did not get a receipt; the body has to say
  // WHY, or the only reading left is "it timed out".
  expect(payload.message.toLowerCase()).toContain("duplicate");
});

test("a duplicate at no-wait says so as well", async () => {
  const res = await postWithEnvelope("no-wait", {
    requestId: ID,
    receipt: null,
    duplicate: true,
  });

  expect(res.json().duplicate).toBe(true);
  expect(res.json().requestId).toBe(ID);
});

test("a rejected submission mints no id at all", async () => {
  // FR-001's other half: nothing was accepted, so there is nothing to poll and
  // no id to hand out. A 400 carrying an id would be an invitation to poll for
  // a request that does not exist.
  const storage = new MemoryStorage();
  const batcher = new Batcher({
    pollingIntervalMs: 1000,
    adapters: {
      test: {
        ...stubAdapter(),
        validateInput: () => ({ valid: false, error: "nope" }),
      } as any,
    },
    defaultTarget: "test",
  }, storage);
  const server = await startBatcherHttpServer(batcher, 0);
  try {
    const res = await server.inject({
      method: "POST",
      url: "/send-input",
      payload: body("no-wait"),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().requestId).toBeUndefined();
  } finally {
    await server.close();
  }
});

test("end to end: a real batcher over a real database returns a poll-able id, and the resubmission is flagged", async () => {
  // The stub above asserts rendering. This asserts that the thing being
  // rendered is real: the id in the body is the id the tracking store knows.
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-request-id-"));
  const storage = new DatabaseStorage({ dataDirectory: dir });
  const batcher = createNewBatcher({
    pollingIntervalMs: 1_000_000,
    enableHttpServer: false,
    enableEventSystem: false,
  }, storage as any);
  batcher.addBlockchainAdapter("test", stubAdapter() as any, {
    criteriaType: "size",
    maxBatchSize: 1_000_000,
  });
  await batcher.init({ startPolling: false });
  const server = await startBatcherHttpServer(batcher as any, 0);
  try {
    const payload = body("no-wait");
    const first = await server.inject({
      method: "POST",
      url: "/send-input",
      payload,
    });
    expect(first.statusCode).toBe(200);
    const requestId = first.json().requestId;
    expect(requestId).toMatch(/^[0-9a-f]{64}$/);
    expect(await storage.getStatus(requestId)).toBeDefined();

    const second = await server.inject({
      method: "POST",
      url: "/send-input",
      payload,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().requestId).toBe(requestId);
    expect(second.json().duplicate).toBe(true);
    // One row: the whole point of the gate is that the second submission costs
    // nothing.
    expect((await storage.getAllInputs()).length).toBe(1);
  } finally {
    await server.close();
    await storage.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
});
