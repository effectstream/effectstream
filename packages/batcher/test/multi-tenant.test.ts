// Multi-tenant (one batcher, many products) core guarantees:
//  - a shared queue must not let one product's row affect another's
//  - an unaddressed input must not fall into the first product's queue
//  - two products must never share a wallet seed
//  - retry policy is resolvable per target

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { FileStorage } from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { type Batcher, createNewBatcher } from "../core/batcher.ts";

const withStorage = async (fn: (s: FileStorage) => Promise<void>) => {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-multitenant-"));
  try {
    const storage = new FileStorage(dir);
    await storage.init();
    await fn(storage);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** Same payload, same sender, same timestamp — differing ONLY by target. */
const twinInputs = (): [DefaultBatcherInput, DefaultBatcherInput] => {
  const base = {
    address: "shared-address",
    addressType: 5,
    input: JSON.stringify({ tx: "aa".repeat(16) }),
    timestamp: "1754350000000",
  };
  return [
    { ...base, target: "product-a" } as DefaultBatcherInput,
    { ...base, target: "product-b" } as DefaultBatcherInput,
  ];
};

describe("shared queue keeps products separate", () => {
  test("removing product-a's input leaves product-b's identical input", async () => {
    await withStorage(async (storage) => {
      const [a, b] = twinInputs();
      await storage.addInput(a, "product-a");
      await storage.addInput(b, "product-b");
      expect((await storage.getAllInputs()).length).toBe(2);

      await storage.removeProcessedInputs([a], "product-a");

      const remaining = await storage.getAllInputs();
      expect(remaining.length).toBe(1);
      expect(remaining[0].target).toBe("product-b");
    });
  });

  test("retry-charging product-a's input does not charge product-b's twin", async () => {
    await withStorage(async (storage) => {
      const [a, b] = twinInputs();
      await storage.addInput(a, "product-a");
      await storage.addInput(b, "product-b");

      await storage.incrementRetryCount([a], "product-a", 5);

      const rows = await storage.getAllInputs();
      const rowA = rows.find((r) => r.target === "product-a");
      const rowB = rows.find((r) => r.target === "product-b");
      expect(rowA?.retryCount).toBe(1);
      expect(rowB?.retryCount ?? 0).toBe(0);
    });
  });

  test("getInputsByTarget partitions the shared file", async () => {
    await withStorage(async (storage) => {
      const [a, b] = twinInputs();
      await storage.addInput(a, "product-a");
      await storage.addInput(b, "product-b");

      expect((await storage.getInputsByTarget("product-a", "product-a")).length).toBe(1);
      expect((await storage.getInputsByTarget("product-b", "product-a")).length).toBe(1);
    });
  });

  test("legacy rows without a target still resolve via defaultTarget", async () => {
    await withStorage(async (storage) => {
      const legacy = {
        address: "legacy",
        addressType: 5,
        input: "{}",
        timestamp: "1",
      } as DefaultBatcherInput;
      await storage.addInput(legacy, "product-a");

      expect((await storage.getInputsByTarget("product-a", "product-a")).length).toBe(1);
      await storage.removeProcessedInputs([legacy], "product-a");
      expect((await storage.getAllInputs()).length).toBe(0);
    });
  });
});

describe("wallet-seed exclusivity", () => {
  // Two adapter instances sharing a seed each build their own WalletFacade,
  // with independent dust booking and independent balance mutexes → they
  // would select the same on-chain dust coins and double-spend them.
  // The registry is exercised directly: constructing a real adapter would
  // start wallet sync against a live node.
  test("a seed claimed by one product cannot be claimed by another", async () => {
    const { claimWalletSeeds, resetWalletSeedRegistry } = await import(
      "../adapters/midnight-balancing-adapter.ts"
    );
    resetWalletSeedRegistry();
    claimWalletSeeds(["seed-a"], "product-a");
    expect(() => claimWalletSeeds(["seed-a"], "product-b")).toThrow(/already in use by "product-a"/);
    resetWalletSeedRegistry();
  });

  test("distinct seeds coexist", async () => {
    const { claimWalletSeeds, resetWalletSeedRegistry } = await import(
      "../adapters/midnight-balancing-adapter.ts"
    );
    resetWalletSeedRegistry();
    claimWalletSeeds(["seed-a"], "product-a");
    expect(() => claimWalletSeeds(["seed-b", "seed-c"], "product-b")).not.toThrow();
    resetWalletSeedRegistry();
  });

  test("a seed listed twice inside ONE adapter is rejected", async () => {
    const { claimWalletSeeds, resetWalletSeedRegistry } = await import(
      "../adapters/midnight-balancing-adapter.ts"
    );
    resetWalletSeedRegistry();
    expect(() => claimWalletSeeds(["dup", "dup"], "product-a")).toThrow(/listed twice/);
    resetWalletSeedRegistry();
  });

  test("a rejected claim leaves no partial state behind", async () => {
    const { claimWalletSeeds, resetWalletSeedRegistry } = await import(
      "../adapters/midnight-balancing-adapter.ts"
    );
    resetWalletSeedRegistry();
    claimWalletSeeds(["taken"], "product-a");
    // "fresh" precedes the conflicting seed — it must NOT be left claimed.
    expect(() => claimWalletSeeds(["fresh", "taken"], "product-b")).toThrow();
    expect(() => claimWalletSeeds(["fresh"], "product-c")).not.toThrow();
    resetWalletSeedRegistry();
  });

  test("released seeds can be re-claimed (adapter torn down)", async () => {
    const { claimWalletSeeds, releaseWalletSeeds, resetWalletSeedRegistry } = await import(
      "../adapters/midnight-balancing-adapter.ts"
    );
    resetWalletSeedRegistry();
    claimWalletSeeds(["recycle"], "product-a");
    releaseWalletSeeds(["recycle"]);
    expect(() => claimWalletSeeds(["recycle"], "product-b")).not.toThrow();
    resetWalletSeedRegistry();
  });
});

describe("per-target retry policy resolution", () => {
  // Mirrors Batcher's getRetryPolicy wiring: per-target override wins,
  // otherwise the global value, otherwise the built-in default.
  const resolve = (
    config: {
      maxRetries?: number;
      retryDelayMs?: number;
      perTarget?: Record<string, { maxRetries?: number; retryDelayMs?: number }>;
    },
    target?: string,
  ) => {
    const override = target ? config.perTarget?.[target] : undefined;
    return {
      maxRetries: override?.maxRetries ?? config.maxRetries ?? 3,
      retryDelayMs: override?.retryDelayMs ?? config.retryDelayMs ?? 1000,
    };
  };

  test("per-target override wins", () => {
    const config = { maxRetries: 3, perTarget: { "product-b": { maxRetries: 10 } } };
    expect(resolve(config, "product-b").maxRetries).toBe(10);
    expect(resolve(config, "product-a").maxRetries).toBe(3);
  });

  test("falls back to global then default", () => {
    expect(resolve({ retryDelayMs: 250 }, "product-a").retryDelayMs).toBe(250);
    expect(resolve({}, "product-a")).toEqual({ maxRetries: 3, retryDelayMs: 1000 });
  });
});

describe("strict routing decision", () => {
  // These exercise the REAL Batcher. An earlier version of this file mirrored
  // the rule in the test instead, so when the rule was wrong the test agreed
  // with it and a two-adapter consumer (e2e/evm, which calls setDefaultTarget)
  // broke in CI while this file stayed green.

  const stubAdapter = () =>
    ({
      submitBatch: async () => "0xhash",
      estimateBatchFee: () => "0",
      buildBatchData: async () => null,
      getChainName: () => "stub",
    }) as unknown as Parameters<Batcher<DefaultBatcherInput>["addBlockchainAdapter"]>[1];

  const memoryStorage = () => {
    const rows: DefaultBatcherInput[] = [];
    return {
      init: async () => {},
      addInput: async (i: DefaultBatcherInput) => { rows.push(i); },
      getPendingInputs: async () => rows,
      getInputsByTarget: async () => rows,
      removeProcessedInputs: async () => {},
      updateInput: async () => {},
      clearAll: async () => { rows.length = 0; },
    } as unknown as Parameters<typeof createNewBatcher>[1];
  };

  const build = (targets: string[], explicitDefault?: string) => {
    const b = createNewBatcher(
      { pollingIntervalMs: 1000, enableHttpServer: false, enableEventSystem: false },
      memoryStorage(),
    );
    for (const t of targets) b.addBlockchainAdapter(t, stubAdapter(), { criteriaType: "size", maxBatchSize: 1 });
    if (explicitDefault) b.setDefaultTarget(explicitDefault);
    return b;
  };

  const unaddressed = (): DefaultBatcherInput =>
    ({ address: "0xabc", addressType: 1, input: "x", timestamp: "1" }) as DefaultBatcherInput;

  const routingError = async (b: ReturnType<typeof build>): Promise<string | null> => {
    try {
      await b.batchInput(unaddressed());
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return msg.includes("missing \"target\"") ? msg : null;
    }
  };

  test("several adapters and only an INFERRED default: unaddressed input is refused", async () => {
    // defaultTarget here is whichever adapter happened to be registered first.
    expect(await routingError(build(["a", "b", "c"]))).toContain('missing "target"');
  });

  test("REGRESSION: an explicit setDefaultTarget() is honoured", async () => {
    // e2e/evm registers two adapters and names its default. Routing must not
    // reject its unaddressed inputs — this is what broke in CI.
    expect(await routingError(build(["effectstream-l2", "evmCounter"], "effectstream-l2"))).toBeNull();
  });

  test("a single adapter keeps the defaultTarget fallback", async () => {
    expect(await routingError(build(["only"]))).toBeNull();
  });
});
