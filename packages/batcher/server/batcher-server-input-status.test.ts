// `GET /input-status/:requestId` — the second half of the user's ask (spec
// FR-003, User Story 2): a client holding an id learns whether its request is
// complete, incomplete, or failed, without holding an HTTP connection open.
//
// The endpoint is a projection, not a new source of truth: the store's five
// lifecycle states collapse onto the spec's three top-level answers, and the
// exact state rides along as `subState` so a caller that wants the detail is
// not forced to guess it from a hash being present.
//
// Statuses are driven through the storage API directly rather than by running
// batches. The mapping is what is under test here; Phase 3 already proved the
// processor writes the right transitions, and re-proving it through a scripted
// adapter would only make a failure harder to localise.

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createNewBatcher } from "../core/batcher.ts";
import { DatabaseStorage, FileStorage } from "../core/storage.ts";
import { computeRequestId } from "../core/request-id.ts";
import { RETRIES_EXHAUSTED } from "../core/batch-processor.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { startBatcherHttpServer } from "./batcher-server.ts";

const TARGET = "product-a";

const input = (
  overrides: Partial<DefaultBatcherInput> = {},
): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-1",
  input: JSON.stringify({ tx: "aa".repeat(8) }),
  timestamp: String(Date.now()),
  signature: "0xsignature-1",
  target: TARGET,
  ...overrides,
});

const stubAdapter = () => ({
  verifySignature: () => true,
  validateInput: () => ({ valid: true }),
  buildBatchData: (inputs: DefaultBatcherInput[]) => ({
    selectedInputs: inputs,
    data: { inputs },
  }),
  estimateBatchFee: () => 0n,
  submitBatch: async () => "0xbatch",
  waitForTransactionReceipt: async () => ({
    hash: "0xbatch",
    blockNumber: 4242n,
    status: 1,
  }),
  getChainName: () => "stub",
  isReady: () => true,
});

async function withServer(
  fn: (ctx: {
    server: Awaited<ReturnType<typeof startBatcherHttpServer>>;
    storage: DatabaseStorage;
  }) => Promise<void>,
  options: { rateLimit?: { maxRequests: number; windowMs: number; preAuthMaxRequests?: number } } = {},
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-input-status-"));
  const storage = new DatabaseStorage({ dataDirectory: dir });
  const batcher = createNewBatcher({
    pollingIntervalMs: 1_000_000,
    enableHttpServer: false,
    enableEventSystem: false,
    ...(options.rateLimit ? { rateLimit: options.rateLimit } : {}),
  }, storage as any);
  batcher.addBlockchainAdapter(TARGET, stubAdapter() as any, {
    criteriaType: "size",
    maxBatchSize: 1_000_000,
  });
  await batcher.init({ startPolling: false });
  const server = await startBatcherHttpServer(batcher as any, 0);
  try {
    await fn({ server, storage });
  } finally {
    await server.close();
    await storage.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

const poll = (
  server: Awaited<ReturnType<typeof startBatcherHttpServer>>,
  id: string,
) => server.inject({ method: "GET", url: `/input-status/${id}` });

test("a queued request reads incomplete/queued with no retries yet", async () => {
  await withServer(async ({ server, storage }) => {
    const payload = input();
    const id = computeRequestId(payload, TARGET);
    await storage.recordAccepted(id, payload, TARGET);

    const res = await poll(server, id);
    expect(res.statusCode).toBe(200);
    const status = res.json();
    expect(status.status).toBe("incomplete");
    expect(status.subState).toBe("queued");
    expect(status.retryCount).toBe(0);
    // The caller needs to know WHEN we took responsibility, not just that we
    // did — it is what makes "this has been stuck for an hour" expressible.
    expect(typeof status.acceptedAt).toBe("string");
    expect(Number.isNaN(Date.parse(status.acceptedAt))).toBe(false);
    // Nothing has reached a chain, so there is nothing to report about one.
    expect(status.transactionHash).toBeUndefined();
    expect(status.blockNumber).toBeUndefined();
    expect(status.errorCode).toBeUndefined();
  });
});

test("mid-flight reads incomplete, and still surfaces the hash it already has", async () => {
  // Spec edge case: an input selected into a batch that has been submitted but
  // not confirmed. "incomplete" is the honest top-level answer, but withholding
  // the hash would hide the one thing that lets a caller look it up themselves.
  await withServer(async ({ server, storage }) => {
    const payload = input();
    const id = computeRequestId(payload, TARGET);
    await storage.recordAccepted(id, payload, TARGET);
    await storage.recordTransition(id, "batching");
    await storage.recordTransition(id, "submitted", {
      transactionHash: "0xbatch",
    });

    const status = (await poll(server, id)).json();
    expect(status.status).toBe("incomplete");
    expect(status.subState).toBe("submitted");
    expect(status.transactionHash).toBe("0xbatch");
  });
});

test("a confirmed request reads complete, with hash and block", async () => {
  await withServer(async ({ server, storage }) => {
    const payload = input();
    const id = computeRequestId(payload, TARGET);
    await storage.recordAccepted(id, payload, TARGET);
    await storage.recordTransition(id, "batching");
    await storage.recordTransition(id, "submitted", { transactionHash: "0xh" });
    await storage.recordTransition(id, "confirmed", {
      transactionHash: "0xh",
      blockNumber: 4242n,
    });

    const status = (await poll(server, id)).json();
    expect(status.status).toBe("complete");
    expect(status.subState).toBe("confirmed");
    expect(status.transactionHash).toBe("0xh");
    // A bigint cannot be JSON — if this is not converted the route throws at
    // serialisation and the caller gets a 500 for a request that succeeded.
    expect(status.blockNumber).toBe(4242);
  });
});

test("a permanently rejected request reads failed, carrying the adapter's code", async () => {
  await withServer(async ({ server, storage }) => {
    const payload = input();
    const id = computeRequestId(payload, TARGET);
    await storage.recordAccepted(id, payload, TARGET);
    await storage.recordTransition(id, "failed", {
      errorCode: "NOT_WELL_FORMED",
      message: "transaction is not well-formed",
    });

    const status = (await poll(server, id)).json();
    expect(status.status).toBe("failed");
    expect(status.subState).toBe("failed");
    expect(status.errorCode).toBe("NOT_WELL_FORMED");
    expect(status.message).toContain("well-formed");
  });
});

test("retry exhaustion reads failed with the count that caused it", async () => {
  // User Story 2.4: never a 404, never silence. This is the state that used to
  // be unobservable — storage dropped the row with a console.warn.
  await withServer(async ({ server, storage }) => {
    const payload = input();
    const id = computeRequestId(payload, TARGET);
    await storage.recordAccepted(id, payload, TARGET);
    await storage.recordTransition(id, "failed", {
      errorCode: RETRIES_EXHAUSTED,
      message: "retries exhausted",
      retryCount: 3,
    });

    const status = (await poll(server, id)).json();
    expect(status.status).toBe("failed");
    expect(status.errorCode).toBe(RETRIES_EXHAUSTED);
    expect(status.retryCount).toBe(3);
  });
});

test("an id this batcher never accepted is a 404 that says which kind of nothing", async () => {
  await withServer(async ({ server }) => {
    const res = await poll(server, "b".repeat(64));
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.reason).toBe("unknown-or-expired");
    // Not fastify's route-not-found: this route EXISTS and answered.
    expect(body.error).not.toBe("Not Found");
  });
});

test("a malformed id is a 400 and never reaches storage", async () => {
  // A lookup is a database round trip. An id that cannot possibly be one is
  // refused at the door, so a scraper cannot spend our storage budget on
  // garbage — and the caller is told their id is wrong rather than that their
  // request is missing, which are very different bugs to chase.
  await withServer(async ({ server, storage }) => {
    let lookups = 0;
    const real = storage.getStatus.bind(storage);
    (storage as any).getStatus = async (id: string) => {
      lookups++;
      return real(id);
    };

    for (const bad of ["not-hex", "abc", "A".repeat(64), "a".repeat(63), "a".repeat(65)]) {
      const res = await poll(server, bad);
      expect(res.statusCode).toBe(400);
      expect(res.json().reason).toBe("malformed-id");
    }
    expect(lookups).toBe(0);
  });
});

test("the poll endpoint draws down the same pre-auth bucket as /send-input", async () => {
  // Spec FR-008: an unauthenticated read must not become an amplification
  // vector. The bucket is the IP one charged before signature verification,
  // which is exactly the budget a scraper would otherwise bypass entirely.
  await withServer(async ({ server }) => {
    const first = await poll(server, "c".repeat(64));
    const second = await poll(server, "c".repeat(64));
    const third = await poll(server, "c".repeat(64));

    expect(first.statusCode).toBe(404);
    expect(second.statusCode).toBe(404);
    expect(third.statusCode).toBe(429);
    expect(third.headers["retry-after"]).toBeDefined();
  }, { rateLimit: { maxRequests: 100, windowMs: 60_000, preAuthMaxRequests: 2 } });
});

test("with queue-only storage the route answers 501 with a machine-readable reason", async () => {
  // Spec Addendum A FR-012b, REVISING plan Q-P2 (which said "do not register
  // the route"). An unregistered route answers 404 — the same answer this
  // endpoint gives for an id that aged out — so a client could never tell
  // "your id expired" from "this deployment tracks nothing", and the second
  // has a one-variable fix worth naming. 501 says the honest thing: the
  // endpoint exists in this API and is not implemented by this deployment.
  //
  // The id is still computed and returned by /send-input — it is a pure
  // function of the payload — so the caller's own bookkeeping keeps working.
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-input-status-file-"));
  const storage = new FileStorage<DefaultBatcherInput>(dir);
  const batcher = createNewBatcher({
    pollingIntervalMs: 1_000_000,
    enableHttpServer: false,
    enableEventSystem: false,
  }, storage as any);
  batcher.addBlockchainAdapter(TARGET, stubAdapter() as any, {
    criteriaType: "size",
    maxBatchSize: 1_000_000,
  });
  await batcher.init({ startPolling: false });

  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  let server;
  try {
    server = await startBatcherHttpServer(batcher as any, 0);
  } finally {
    console.warn = realWarn;
  }

  try {
    const res = await poll(server, "d".repeat(64));
    expect(res.statusCode).toBe(501);
    const body = res.json();
    expect(body.reason).toBe("request-tracking-disabled");
    expect(body.enableWith).toBe("BATCHER_DB_SCHEMA");
    expect(body.success).toBe(false);
    expect(String(body.message)).toContain("BATCHER_DB_SCHEMA");

    // A malformed id gets the same 501, not a 400: the shape of the id is not
    // this caller's problem when the deployment answers no id at all.
    const malformed = await poll(server, "not-an-id");
    expect(malformed.statusCode).toBe(501);
    expect(malformed.json().reason).toBe("request-tracking-disabled");

    const said = warnings.filter((w) => w.includes("/input-status"));
    expect(said.length).toBe(1);
    expect(said[0]).toContain("BATCHER_DB_SCHEMA");

    const sent = await server.inject({
      method: "POST",
      url: "/send-input",
      payload: { confirmationLevel: "no-wait", data: input() },
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().requestId).toMatch(/^[0-9a-f]{64}$/);

    // The same fact on the health surface, so an operator can see it without
    // provoking a 501 (FR-012b).
    const stats = await server.inject({ method: "GET", url: "/queue-stats" });
    expect(stats.statusCode).toBe(200);
    expect(stats.json().requestTracking).toEqual({
      enabled: false,
      reason: "queue-only-storage",
      enableWith: "BATCHER_DB_SCHEMA",
      disabled: [
        "durable request tracking (GET /input-status/:requestId)",
        "replay/dedup protection against paying twice for one signed request",
        "status retention and boot reconciliation",
      ],
    });
  } finally {
    await server!.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("with tracking on, /queue-stats says so plainly", async () => {
  // The other side of FR-012b. `enabled: true` with nothing else is the whole
  // answer: there is no remedy to name when nothing is wrong.
  await withServer(async ({ server }) => {
    const stats = await server.inject({ method: "GET", url: "/queue-stats" });
    expect(stats.statusCode).toBe(200);
    expect(stats.json().requestTracking).toEqual({ enabled: true });
  });
});

test("the endpoint is documented under the batcher tag", async () => {
  // The OpenAPI document is the contract clients are generated from; a route
  // that works but is untagged is invisible there (`hideUntagged: true`).
  await withServer(async ({ server }) => {
    const res = await server.inject({
      method: "GET",
      url: "/documentation/json",
    });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    const route = spec.paths["/input-status/{requestId}"];
    expect(route).toBeDefined();
    expect(route.get.tags).toContain("batcher");
  });
});
