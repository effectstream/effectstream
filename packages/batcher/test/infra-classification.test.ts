// FR-1 / FR-6: an unrecognized worker failure is classified by PROBING THE
// NODE, not by reading the error's message.
//
// The message is not evidence. The failure 00017's Q-2 and 00020's M13 both
// observed arrives as the string `"Transaction submission error"` — a generic
// wrapper the Midnight SDK puts around a node refusal, a socket that went away
// and an already-spent input alike. Charging a retry for the second of those
// spends a user's budget on our outage; refusing to charge for the third lets a
// doomed input loop forever. Only asking the node which world we are in can
// tell them apart, so that is what the classifier is given.

import { describe, expect, test } from "bun:test";
import type { DefaultBatcherInput } from "../core/types.ts";
import {
  buildWorkerBatchOutcome,
  classifyWorkerFailure,
  nodeProbeUrl,
  PreSpendDefer,
  PreSpendPermanent,
  probeNodeReachable,
  PreSubmitInvariant,
} from "../adapters/midnight-balancing-adapter.ts";

const input: DefaultBatcherInput = {
  addressType: 1 as DefaultBatcherInput["addressType"],
  input: "0102",
  address: "caller",
  timestamp: "2026-08-14T00:00:00.000Z",
  target: "product-a",
};

const other: DefaultBatcherInput = { ...input, address: "other-caller" };

/** The exact wrapper both 00017's Q-2 and 00020's M13 captured. */
const OBSERVED = new Error("Transaction submission error");

describe("FR-1 — the probe, not the message, decides who pays", () => {
  test("an unrecognized failure is CHARGED when the node answered the probe", () => {
    const classified = classifyWorkerFailure(input, OBSERVED, true);

    // The node is up, so it gave a verdict about this transaction. That is
    // exactly what a retry budget is for.
    expect(classified.category).toBe("failed");
    expect(classified.value).toEqual({
      input,
      error: "Transaction submission error",
    });
  });

  test("the same failure becomes an UNCHARGED deferral when the node did not", () => {
    const classified = classifyWorkerFailure(input, OBSERVED, false);

    expect(classified.category).toBe("retryable");
    if (classified.category !== "retryable") throw new Error("unreachable");
    expect(classified.value.input).toBe(input);
    // The FR-2 signal: this deferral is our environment, so the processor
    // must rest the target rather than merely log it.
    expect(classified.value.infra).toBe(true);
    // The original diagnostic survives — a deferral that hid the SDK's own
    // words would make the next outage unreadable.
    expect(classified.value.reason).toContain("Transaction submission error");
    expect(classified.value.reason).toContain("unreachable");
  });

  test("the identical message lands in BOTH channels — so nothing was sniffed", () => {
    const charged = classifyWorkerFailure(input, OBSERVED, true);
    const parked = classifyWorkerFailure(input, OBSERVED, false);

    expect(charged.category).toBe("failed");
    expect(parked.category).toBe("retryable");
  });

  test("an unprobed classification behaves EXACTLY as it did before", () => {
    // Back-compat: every existing caller passes two arguments.
    expect(classifyWorkerFailure(input, OBSERVED).category).toBe("failed");
    expect(classifyWorkerFailure(input, OBSERVED, undefined).category)
      .toBe("failed");
  });

  test("a non-Error rejection is still readable in the deferral reason", () => {
    const classified = classifyWorkerFailure(input, "socket hang up", false);
    if (classified.category !== "retryable") {
      throw new Error(`expected retryable, got ${classified.category}`);
    }
    expect(classified.value.reason).toContain("socket hang up");
  });
});

describe("FR-1 — the typed channels are untouched by the probe", () => {
  for (const reachable of [true, false, undefined]) {
    test(`a permanent verdict stays permanent (probe=${reachable})`, () => {
      const classified = classifyWorkerFailure(
        input,
        new PreSpendPermanent("bad network", "NOT_WELL_FORMED", 400),
        reachable,
      );
      expect(classified.category).toBe("permanentRejected");
    });

    test(`a typed deferral stays a plain deferral (probe=${reachable})`, () => {
      const classified = classifyWorkerFailure(
        input,
        new PreSpendDefer("validation queue saturated"),
        reachable,
      );
      expect(classified.category).toBe("retryable");
      if (classified.category !== "retryable") throw new Error("unreachable");
      expect(classified.value.reason).toBe("validation queue saturated");
      // A saturated queue of ours is not an unreachable node: it must NOT
      // acquire the infra marker and rest the whole target.
      expect(classified.value.infra).toBeUndefined();
    });

    test(`an invariant stays an invariant (probe=${reachable})`, () => {
      const classified = classifyWorkerFailure(
        input,
        new PreSubmitInvariant("finalized tx failed revalidation"),
        reachable,
      );
      expect(classified.category).toBe("invariantFailure");
    });
  }
});

describe("FR-1/FR-2 — the outcome the adapter hands the processor", () => {
  test("an unreachable node defers every untyped failure and asks for a rest", () => {
    const outcome = buildWorkerBatchOutcome(
      [],
      [input, other],
      [
        { status: "rejected", reason: OBSERVED },
        { status: "rejected", reason: new Error("fetch failed") },
      ],
      false,
    );

    expect(outcome.failed).toEqual([]);
    expect(outcome.retryable?.length).toBe(2);
    // FR-2's signal, carried per deferral. The adapter says WHAT happened and
    // leaves the schedule to the processor, which is the only party that knows
    // how many rounds in a row this target has already been failing — and so
    // the only one that can back the retries off instead of asking for the
    // same flat rest for a five-second blip and a two-hour outage.
    expect(outcome.retryable?.every((d) => d.infra === true)).toBe(true);
    expect(outcome.cooldownMs).toBeUndefined();
    expect(outcome.hash).toBeUndefined();
  });

  test("a reachable node keeps charging, and asks for no rest at all", () => {
    const outcome = buildWorkerBatchOutcome(
      [],
      [input, other],
      [
        { status: "rejected", reason: OBSERVED },
        { status: "rejected", reason: new Error("already spent") },
      ],
      true,
    );

    expect(outcome.failed?.length).toBe(2);
    expect(outcome.retryable).toEqual([]);
    expect(outcome.cooldownMs).toBeUndefined();
  });

  test("FR-4 anchor: a payload that cannot deserialize is charged EVEN during an outage", () => {
    // The masking risk in one case. A row whose bytes are not a transaction is
    // deterministically doomed; if an outage excused it from its budget it
    // would sit in the queue for as long as the outage lasted and then some.
    const outcome = buildWorkerBatchOutcome([other], [input], [
      { status: "rejected", reason: OBSERVED },
    ], false);

    expect(outcome.failed).toEqual([{
      input: other,
      error: "transaction failed to deserialize",
    }]);
    expect(outcome.retryable?.length).toBe(1);
  });

  test("an unprobed batch is byte-for-byte what it was before", () => {
    const outcome = buildWorkerBatchOutcome([], [input], [
      { status: "rejected", reason: OBSERVED },
    ]);

    expect(outcome.failed?.length).toBe(1);
    expect(outcome.retryable).toEqual([]);
    expect(outcome.cooldownMs).toBeUndefined();
  });
});

describe("FR-1 — the probe itself", () => {
  test("the probe URL is the node's own, on the scheme HTTP JSON-RPC uses", () => {
    // The node serves JSON-RPC over HTTP on the SAME port as its WebSocket —
    // the 00017 template's compose healthcheck curls `http://localhost:9944`.
    // So there is nothing new to configure and nothing to keep in sync.
    expect(nodeProbeUrl("ws://node:9944")).toBe("http://node:9944/");
    expect(nodeProbeUrl("wss://rpc.example.com/chain")).toBe(
      "https://rpc.example.com/chain",
    );
    expect(nodeProbeUrl("http://node:9944/")).toBe("http://node:9944/");
    expect(nodeProbeUrl("https://node/rpc")).toBe("https://node/rpc");
  });

  test("a node that answers JSON-RPC is reachable, and is asked politely", async () => {
    let seenMethod: string | undefined;
    const seenContentTypes: Array<string | null> = [];
    const node = Bun.serve({
      port: 0,
      fetch: async (request) => {
        seenContentTypes.push(request.headers.get("content-type"));
        const body = await request.json() as { method?: string; id?: unknown };
        seenMethod = body.method;
        return Response.json({ jsonrpc: "2.0", id: body.id, result: {} });
      },
    });
    try {
      expect(await probeNodeReachable(`ws://127.0.0.1:${node.port}`, 5_000))
        .toBe(true);
      expect(seenMethod).toBe("system_health");
      expect(seenContentTypes).toEqual(["application/json"]);
    } finally {
      await node.stop(true);
    }
  });

  test("a port with nothing behind it is unreachable", async () => {
    // Bind, read the port, release it: a port that WAS free a moment ago is
    // the closest thing to a guaranteed-closed port a test can have.
    const scratch = Bun.serve({ port: 0, fetch: () => new Response("x") });
    const closedPort = scratch.port;
    await scratch.stop(true);

    expect(await probeNodeReachable(`ws://127.0.0.1:${closedPort}`, 5_000))
      .toBe(false);
  });

  test("a node that answers with an error status is unreachable", async () => {
    const node = Bun.serve({
      port: 0,
      fetch: () => new Response("service unavailable", { status: 503 }),
    });
    try {
      expect(await probeNodeReachable(`ws://127.0.0.1:${node.port}`, 5_000))
        .toBe(false);
    } finally {
      await node.stop(true);
    }
  });

  test("a node that answers a JSON-RPC ERROR is still reachable — it answered", async () => {
    // The probe asks "is the node there", not "does it like this method". A
    // deployment whose RPC surface is configured differently than expected must
    // fall back to today's behaviour (charge), not park every failure it sees.
    const node = Bun.serve({
      port: 0,
      fetch: () =>
        Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32601 } }),
    });
    try {
      expect(await probeNodeReachable(`ws://127.0.0.1:${node.port}`, 5_000))
        .toBe(true);
    } finally {
      await node.stop(true);
    }
  });

  test("a 200 that is not JSON-RPC at all is unreachable", async () => {
    // A proxy or captive portal answering 200 with HTML is not a node.
    const node = Bun.serve({
      port: 0,
      fetch: () => new Response("<html>gateway</html>"),
    });
    try {
      expect(await probeNodeReachable(`ws://127.0.0.1:${node.port}`, 5_000))
        .toBe(false);
    } finally {
      await node.stop(true);
    }
  });

  test("a node that never answers is unreachable, and BOUNDED", async () => {
    // The whole point of a cheap probe is that it cannot itself become the
    // outage. A hung socket must expire on our clock, not the peer's.
    let release: (response: Response) => void = () => {};
    const node = Bun.serve({
      port: 0,
      fetch: () => new Promise<Response>((resolve) => { release = resolve; }),
    });
    try {
      const started = Date.now();
      expect(await probeNodeReachable(`ws://127.0.0.1:${node.port}`, 250))
        .toBe(false);
      expect(Date.now() - started).toBeLessThan(3_000);
    } finally {
      // Let the stuck handler go before shutting down, or the server has an
      // in-flight request it will wait on forever and the TEST hangs instead.
      release(new Response("late"));
      await node.stop(true);
    }
  });

  test("an unusable URL is unreachable rather than an exception", async () => {
    expect(await probeNodeReachable("not a url", 250)).toBe(false);
    expect(await probeNodeReachable("", 250)).toBe(false);
  });
});
