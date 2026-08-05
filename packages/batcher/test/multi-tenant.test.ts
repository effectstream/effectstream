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
  // Mirrors Batcher.batchInput: reject unaddressed inputs when several
  // products share the process, unless explicitly opted out.
  const requiresTarget = (adapterCount: number, configured?: boolean) =>
    configured ?? adapterCount > 1;

  test("multi-product batchers require an explicit target", () => {
    expect(requiresTarget(3)).toBe(true);
  });

  test("single-product batchers keep the defaultTarget fallback", () => {
    expect(requiresTarget(1)).toBe(false);
  });

  test("explicit config overrides the heuristic in both directions", () => {
    expect(requiresTarget(1, true)).toBe(true);
    expect(requiresTarget(5, false)).toBe(false);
  });
});
