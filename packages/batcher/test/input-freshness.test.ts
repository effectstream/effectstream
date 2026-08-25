// The freshness window (spec FR-011): an input whose signed `timestamp` is too
// old to be honest is refused at admission.
//
// This exists because retention and replay protection share fate. The dedup
// gate can only recognise a replay while the original's record still exists, so
// "we never pay twice" is only true for as long as records are kept — and that
// is only a guarantee if the batcher also refuses to accept a signature older
// than the retention window. Without a bounded acceptance window there is no
// floor to compare retention against, which is why FR-007's "TTL >> window"
// needed a window to exist at all.
//
// The parse rule is the subtle part, and it is not the one the brief assumed.
// The repo signs timestamps in THREE shapes (master plan F-P4.1): epoch-ms
// strings, epoch-ms JSON numbers coerced to strings by ajv, and ISO-8601 — the
// last of these in `e2e/bitcoin/run-tests.ts`, where the timestamp is part of
// the SIGNED message, and in `templates/zswap-da`. A strict epoch-ms gate would
// have 400'd both, silently, at admission.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Batcher, createNewBatcher, InputValidationError } from "../core/batcher.ts";
import { DEFAULT_CONFIG_VALUES } from "../core/config.ts";
import { DatabaseStorage } from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const TARGET = "product-a";
const HOUR = 3_600_000;

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

function stubAdapter(counters: { verifySignature: number }) {
  return {
    verifySignature: () => {
      counters.verifySignature++;
      return true;
    },
    validateInput: () => ({ valid: true }),
    buildBatchData: (inputs: DefaultBatcherInput[]) => ({
      selectedInputs: inputs,
      data: { inputs },
    }),
    estimateBatchFee: () => 0n,
    submitBatch: async () => "0xbatch",
    waitForTransactionReceipt: async () => ({
      hash: "0xbatch",
      blockNumber: 1n,
      status: 1,
    }),
    getChainName: () => "stub",
    isReady: () => true,
  };
}

async function withBatcher(
  fn: (ctx: {
    batcher: Batcher<DefaultBatcherInput>;
    storage: DatabaseStorage;
    counters: { verifySignature: number };
  }) => Promise<void>,
  config: Record<string, unknown> = {},
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-freshness-"));
  const storage = new DatabaseStorage({ dataDirectory: dir });
  const counters = { verifySignature: 0 };
  const batcher = createNewBatcher({
    pollingIntervalMs: 1_000_000,
    enableHttpServer: false,
    enableEventSystem: false,
    ...config,
  } as any, storage as any);
  batcher.addBlockchainAdapter(TARGET, stubAdapter(counters) as any, {
    criteriaType: "size",
    maxBatchSize: 1_000_000,
  });
  try {
    await batcher.init({ startPolling: false });
    await fn({
      batcher: batcher as Batcher<DefaultBatcherInput>,
      storage,
      counters,
    });
  } finally {
    await storage.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Submit and report the refusal, or `null` when it was accepted. */
async function refusal(
  batcher: Batcher<DefaultBatcherInput>,
  payload: DefaultBatcherInput,
): Promise<InputValidationError | null> {
  try {
    await batcher.batchInput(payload, "no-wait");
    return null;
  } catch (error) {
    if (error instanceof InputValidationError) return error;
    throw error;
  }
}

describe("the acceptance window", () => {
  test("an input just inside the window is accepted", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      const payload = input({ timestamp: String(Date.now() - (HOUR - 60_000)) });
      expect(await refusal(batcher, payload)).toBeNull();
      expect((await storage.getAllInputs()).length).toBe(1);
    });
  });

  test("an input just outside the window is refused, and queues nothing", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      const payload = input({ timestamp: String(Date.now() - (HOUR + 60_000)) });
      const error = await refusal(batcher, payload);

      expect(error).not.toBeNull();
      expect(error!.errorCode).toBe("INPUT_TIMESTAMP_EXPIRED");
      expect(error!.statusCode).toBe(400);
      // Re-sending the identical bytes only gets older. Telling the caller to
      // retry would be advice that can never come true.
      expect(error!.retryable).toBe(false);
      // A refused input is not accepted, so nothing was minted and nothing
      // queued (FR-001).
      expect((await storage.getAllInputs()).length).toBe(0);
    });
  });

  test("the window is honoured as configured, not as hardcoded", async () => {
    await withBatcher(async ({ batcher }) => {
      // 10 minutes old: outside a 5-minute window, and the same input is
      // accepted by the default 1h one in the case above.
      const payload = input({ timestamp: String(Date.now() - 600_000) });
      expect((await refusal(batcher, payload))!.errorCode).toBe(
        "INPUT_TIMESTAMP_EXPIRED",
      );
    }, { maxInputAgeMs: 300_000, statusRetentionTtlMs: 4 * 300_000 });
  });

  test("a small clock skew into the future is tolerated", async () => {
    await withBatcher(async ({ batcher }) => {
      // Client clocks are not synchronised with ours. Refusing a wallet that
      // runs a minute fast would be refusing a correct request.
      const payload = input({ timestamp: String(Date.now() + 60_000) });
      expect(await refusal(batcher, payload)).toBeNull();
    });
  });

  test("a timestamp far in the future is refused with its own code", async () => {
    await withBatcher(async ({ batcher }) => {
      const payload = input({ timestamp: String(Date.now() + 30 * 60_000) });
      const error = await refusal(batcher, payload);

      expect(error).not.toBeNull();
      // Distinct from EXPIRED on purpose: the remedy is different. "Expired"
      // means re-sign; this means the client's clock is wrong, and telling
      // them their request is too OLD would send them looking in the opposite
      // direction.
      expect(error!.errorCode).toBe("INPUT_TIMESTAMP_IN_FUTURE");
      expect(error!.statusCode).toBe(400);
    });
  });
});

describe("reading the timestamp", () => {
  test("ISO-8601 is accepted — two in-repo producers sign it", async () => {
    await withBatcher(async ({ batcher }) => {
      const payload = input({ timestamp: new Date().toISOString() });
      expect(await refusal(batcher, payload)).toBeNull();
    });
  });

  test("a stale ISO-8601 timestamp expires like any other", async () => {
    await withBatcher(async ({ batcher }) => {
      const payload = input({
        timestamp: new Date(Date.now() - 2 * HOUR).toISOString(),
      });
      expect((await refusal(batcher, payload))!.errorCode).toBe(
        "INPUT_TIMESTAMP_EXPIRED",
      );
    });
  });

  test("a short all-digits timestamp is epoch-ms, NOT a calendar year", async () => {
    // Parse ORDER is load-bearing, and this is the case that proves it.
    //
    // A four-digit all-digits string is a valid year to `Date.parse`. Take the
    // year after next: read as ISO it is a date over a year in the FUTURE
    // (rejected as clock skew), read as epoch-ms it is 1970 (rejected as
    // expired). Two different verdicts from the same bytes — so this assertion
    // pins the order, where "1755"/"0"/"1" below cannot: those come out
    // long-expired either way, which is exactly why a probe that reversed the
    // order left them all green.
    const futureYear = String(new Date().getFullYear() + 2);
    await withBatcher(async ({ batcher }) => {
      const error = await refusal(batcher, input({ timestamp: futureYear }));
      expect(error).not.toBeNull();
      expect(error!.errorCode).toBe("INPUT_TIMESTAMP_EXPIRED");

      // Small numbers are old instants, not distant dates.
      for (const stamp of ["1755", "0", "1"]) {
        const stale = await refusal(batcher, input({ timestamp: stamp }));
        expect(stale).not.toBeNull();
        expect(stale!.errorCode).toBe("INPUT_TIMESTAMP_EXPIRED");
      }
    });
  });

  test("a timestamp that is not a time at all is refused as unreadable", async () => {
    await withBatcher(async ({ batcher }) => {
      for (const stamp of ["", "   ", "abc", "not-a-date", "NaN"]) {
        const error = await refusal(batcher, input({ timestamp: stamp }));
        expect(error).not.toBeNull();
        // Not EXPIRED: we cannot say it is old, only that we cannot read it.
        // `Number("")` is 0, so a naive parse would have called the empty
        // string a 1970 timestamp and reported the wrong diagnosis.
        expect(error!.errorCode).toBe("INPUT_TIMESTAMP_UNREADABLE");
        expect(error!.statusCode).toBe(400);
        expect(error!.retryable).toBe(false);
      }
    });
  });

  test("a padded numeric timestamp is unreadable, not silently trimmed", async () => {
    // The exact bytes are what was signed and what the request id hashes. If
    // the gate trimmed and the signature check did not, the two would disagree
    // about what the request IS.
    await withBatcher(async ({ batcher }) => {
      const error = await refusal(
        batcher,
        input({ timestamp: `  ${Date.now()}  ` }),
      );
      expect(error!.errorCode).toBe("INPUT_TIMESTAMP_UNREADABLE");
    });
  });
});

describe("where the gate sits", () => {
  test("a stale input is refused BEFORE its signature is verified", async () => {
    // Cheapest check first: signature verification is the expensive step an
    // unauthenticated caller can force us into, and a string comparison
    // against the clock costs nothing.
    await withBatcher(async ({ batcher, counters }) => {
      await refusal(batcher, input({ timestamp: "1" }));
      expect(counters.verifySignature).toBe(0);

      // ...and a fresh one still gets verified, so the gate has not simply
      // swallowed the pipeline.
      await refusal(batcher, input());
      expect(counters.verifySignature).toBe(1);
    });
  });
});

describe("boot validation (fail closed)", () => {
  const adapters = {
    [TARGET]: stubAdapter({ verifySignature: 0 }) as any,
  };

  test("a retention TTL below 4x the window refuses to construct", async () => {
    // Retention and replay protection share fate: if records expire while a
    // signature is still acceptable, a replayed spend finds no record and gets
    // paid for twice. Booting with that configuration would mean advertising
    // duplicate protection that quietly does not hold.
    expect(() =>
      new Batcher({
        pollingIntervalMs: 1000,
        adapters,
        defaultTarget: TARGET,
        maxInputAgeMs: HOUR,
        statusRetentionTtlMs: 2 * HOUR,
      } as any)
    ).toThrow(/statusRetentionTtlMs/);
  });

  test("the refusal names both numbers, so it can be acted on", async () => {
    let message = "";
    try {
      new Batcher({
        pollingIntervalMs: 1000,
        adapters,
        defaultTarget: TARGET,
        maxInputAgeMs: HOUR,
        statusRetentionTtlMs: 2 * HOUR,
      } as any);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(String(2 * HOUR));
    expect(message).toContain(String(HOUR));
    expect(message).toContain(String(4 * HOUR));
  });

  test("a ratio of exactly 4x is allowed", async () => {
    expect(() =>
      new Batcher({
        pollingIntervalMs: 1000,
        adapters,
        defaultTarget: TARGET,
        maxInputAgeMs: HOUR,
        statusRetentionTtlMs: 4 * HOUR,
      } as any)
    ).not.toThrow();
  });

  test("the shipped defaults satisfy the rule by construction", async () => {
    // 24h retention against a 1h window is 24x. If a future edit narrows that
    // to below 4x, this fails before anyone deploys it.
    expect(DEFAULT_CONFIG_VALUES.maxInputAgeMs).toBe(HOUR);
    expect(DEFAULT_CONFIG_VALUES.statusRetentionTtlMs).toBe(24 * HOUR);
    expect(DEFAULT_CONFIG_VALUES.statusRetentionTtlMs).toBeGreaterThanOrEqual(
      4 * DEFAULT_CONFIG_VALUES.maxInputAgeMs,
    );
    expect(() =>
      new Batcher({
        pollingIntervalMs: 1000,
        adapters,
        defaultTarget: TARGET,
      } as any)
    ).not.toThrow();
  });

  test("the new knobs survive config casting", async () => {
    // `BatcherConfigSchema` is `additionalProperties: false` and the config is
    // run through `Value.Cast`, so a field missing from the schema is silently
    // DROPPED — the batcher would then validate the defaults and ignore what
    // the operator asked for.
    const batcher = new Batcher({
      pollingIntervalMs: 1000,
      adapters,
      defaultTarget: TARGET,
      maxInputAgeMs: 300_000,
      statusRetentionTtlMs: 4 * 300_000,
    } as any);
    expect((batcher.config as any).maxInputAgeMs).toBe(300_000);
    expect((batcher.config as any).statusRetentionTtlMs).toBe(4 * 300_000);
  });
});
