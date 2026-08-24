// Multi-tenant (one batcher, many products) core guarantees:
//  - a shared queue must not let one product's row affect another's
//  - an unaddressed input must not fall into the first product's queue
//  - two products must never share a wallet seed
//  - retry policy is resolvable per target

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("legacy targetless rows (upgrade path)", () => {
  // Rows written before per-row targets existed have no `target`, and
  // createInputKey falls back to whoever is currently processing — so an
  // untargeted row is read as belonging to the asker. A queue carried across
  // the upgrade therefore lets one product remove another's row. New rows are
  // stamped on write; the ones already on disk need the migration.

  test("REGRESSION: a legacy row survives another product's removal", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "legacy-"));
    try {
      const base = { address: "a", addressType: 5, input: "{}", timestamp: "1" };
      // Written by the previous version: the default-target row carries no target.
      writeFileSync(
        path.join(dir, "pending-inputs.jsonl"),
        JSON.stringify(base) + "\n" +
          JSON.stringify({ ...base, target: "product-b" }) + "\n",
      );

      const storage = new FileStorage(dir);
      await storage.init("product-a");
      expect((await storage.getAllInputs()).length).toBe(2);

      await storage.removeProcessedInputs(
        [{ ...base, target: "product-b" } as DefaultBatcherInput],
        "product-b",
      );

      const left = await storage.getAllInputs();
      expect(left.length).toBe(1);
      expect(left[0].target).toBe("product-a");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("init without a default target leaves the file untouched", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "legacy-"));
    try {
      const row = JSON.stringify({ address: "a", addressType: 5, input: "{}", timestamp: "1" });
      writeFileSync(path.join(dir, "pending-inputs.jsonl"), row + "\n");
      const storage = new FileStorage(dir);
      await storage.init();
      expect((await storage.getAllInputs())[0].target).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("already-stamped rows and corrupt lines are left alone", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "legacy-"));
    try {
      writeFileSync(
        path.join(dir, "pending-inputs.jsonl"),
        JSON.stringify({ address: "a", addressType: 5, input: "{}", timestamp: "1", target: "product-z" }) +
          "\nnot-json\n",
      );
      const storage = new FileStorage(dir);
      await storage.init("product-a");
      const rows = await storage.getAllInputs();
      expect(rows.length).toBe(1);
      expect(rows[0].target).toBe("product-z"); // not re-stamped
      const raw = readFileSync(path.join(dir, "pending-inputs.jsonl"), "utf8");
      expect(raw).toContain("not-json"); // unparseable line preserved
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("validation results can carry a status code", () => {
  // Everything invalid used to become a 400. A gate that fails because its
  // OWN dependency is unavailable — an unreachable indexer leaving ledger
  // parameters unknown, say — must not tell the caller their transaction was
  // malformed. That distinction is what lets a fail-closed check say 503
  // (retryable infrastructure) rather than 400 (your input is wrong).

  const build = (result: unknown) => {
    const b = createNewBatcher(
      { pollingIntervalMs: 1000, enableHttpServer: false, enableEventSystem: false },
      {
        init: async () => {},
        addInput: async () => {},
        getPendingInputs: async () => [],
        getInputsByTarget: async () => [],
        removeProcessedInputs: async () => {},
        updateInput: async () => {},
        clearAll: async () => {},
      } as unknown as Parameters<typeof createNewBatcher>[1],
    );
    b.addBlockchainAdapter("only", {
      submitBatch: async () => "0xhash",
      estimateBatchFee: () => "0",
      buildBatchData: async () => null,
      getChainName: () => "stub",
      // Without this the adapter is refused earlier, for a missing signature —
      // which would make this test red for a reason that has nothing to do
      // with the status code it claims to check.
      verifySignature: () => true,
      validateInput: async () => result,
    } as unknown as Parameters<Batcher<DefaultBatcherInput>["addBlockchainAdapter"]>[1], {
      criteriaType: "size",
      maxBatchSize: 1,
    });
    return b;
  };

  const statusOf = async (result: unknown): Promise<number | string> => {
    try {
      await build(result).batchInput(
        { address: "0xabc", addressType: 1, input: "x", timestamp: "1" } as DefaultBatcherInput,
      );
      return "no-throw";
    } catch (e) {
      return (e as { statusCode?: number }).statusCode ?? "no-status";
    }
  };

  test("REGRESSION: an adapter can request 503 for its own unavailability", async () => {
    expect(await statusOf({ valid: false, error: "params unavailable", statusCode: 503 }))
      .toBe(503);
  });

  test("a plain invalid result still defaults to 400", async () => {
    expect(await statusOf({ valid: false, error: "bad input" })).toBe(400);
  });
});

describe("wallet-instance exclusivity (injected walletResult)", () => {
  // The seed registry only sees wallets the adapter DERIVES. `config.walletResult`
  // hands one in and skips that path entirely, so two adapters could declare
  // different nominal seeds, both pass the seed check, and then operate the same
  // wallet — the exact double-spend the seed registry exists to prevent, reached
  // through the one door it does not watch.

  test("REGRESSION: one wallet handed to two adapters is refused", async () => {
    const { claimWalletInstance } = await import(
      "../adapters/midnight-balancing-adapter.ts"
    );
    const wallet = { stop: async () => {} };
    const handedToA = { wallet, zswapSecretKeys: {} };
    const handedToB = { wallet, zswapSecretKeys: {} }; // different wrapper, SAME wallet

    expect(claimWalletInstance(handedToA, "product-a")).not.toBeNull();
    expect(() => claimWalletInstance(handedToB, "product-b")).toThrow(
      /already in use by "product-a"/,
    );
  });

  test("distinct wallet instances coexist", async () => {
    const { claimWalletInstance } = await import(
      "../adapters/midnight-balancing-adapter.ts"
    );
    expect(() => claimWalletInstance({ wallet: { id: 1 } }, "product-a")).not.toThrow();
    expect(() => claimWalletInstance({ wallet: { id: 2 } }, "product-b")).not.toThrow();
  });

  test("REGRESSION: close() does not stop a wallet it was handed", async () => {
    // An injected wallet belongs to whoever passed it in and may still be in
    // use there. Stopping it on close breaks a caller that did nothing wrong.
    // Drives the real adapter: the ownership flag is what decides this, and a
    // test that re-implemented the rule would not have caught it.
    const { MidnightBalancingAdapter, resetWalletSeedRegistry } = await import(
      "../adapters/midnight-balancing-adapter.ts"
    );
    resetWalletSeedRegistry();

    const stopped: string[] = [];
    const injected = { wallet: { stop: async () => { stopped.push("injected"); } } };
    const owned = { wallet: { stop: async () => { stopped.push("owned"); } } };

    const adapter = new MidnightBalancingAdapter(
      [
        "1111111111111111111111111111111111111111111111111111111111111111",
        "2222222222222222222222222222222222222222222222222222222222222222",
      ],
      {
        indexer: "http://x", indexerWS: "ws://x", node: "http://x",
        proofServer: "http://x", networkId: "Undeployed",
        logLabel: "ownership-test",
      } as never,
    );

    // Simulate a completed initialize: slot 0 injected, slot 1 built by us.
    const inner = adapter as unknown as {
      walletResults: unknown[];
      walletIsInjected: boolean[];
    };
    inner.walletResults = [injected, owned];
    inner.walletIsInjected = [true, false];

    await adapter.close();

    expect(stopped).toEqual(["owned"]);
    resetWalletSeedRegistry();
  });

  test("a value with no usable identity is not claimed and does not throw", async () => {
    const { claimWalletInstance } = await import(
      "../adapters/midnight-balancing-adapter.ts"
    );
    expect(claimWalletInstance(null, "product-a")).toBeNull();
    expect(claimWalletInstance(undefined, "product-a")).toBeNull();
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
    claimWalletSeeds(["0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a"], "product-a");
    expect(() => claimWalletSeeds(["0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a"], "product-b")).toThrow(/already in use by "product-a"/);
    resetWalletSeedRegistry();
  });

  test("distinct seeds coexist", async () => {
    const { claimWalletSeeds, resetWalletSeedRegistry } = await import(
      "../adapters/midnight-balancing-adapter.ts"
    );
    resetWalletSeedRegistry();
    claimWalletSeeds(["0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a"], "product-a");
    expect(() => claimWalletSeeds(["0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b", "0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c"], "product-b")).not.toThrow();
    resetWalletSeedRegistry();
  });

  test("a seed listed twice inside ONE adapter is rejected", async () => {
    const { claimWalletSeeds, resetWalletSeedRegistry } = await import(
      "../adapters/midnight-balancing-adapter.ts"
    );
    resetWalletSeedRegistry();
    expect(() => claimWalletSeeds(["d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0", "d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0"], "product-a")).toThrow(/listed twice/);
    resetWalletSeedRegistry();
  });

  test("a rejected claim leaves no partial state behind", async () => {
    const { claimWalletSeeds, resetWalletSeedRegistry } = await import(
      "../adapters/midnight-balancing-adapter.ts"
    );
    resetWalletSeedRegistry();
    claimWalletSeeds(["7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a"], "product-a");
    // "f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5" precedes the conflicting seed — it must NOT be left claimed.
    expect(() => claimWalletSeeds(["f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5", "7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a"], "product-b")).toThrow();
    expect(() => claimWalletSeeds(["f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5"], "product-c")).not.toThrow();
    resetWalletSeedRegistry();
  });

  test("released seeds can be re-claimed (adapter torn down)", async () => {
    const { claimWalletSeeds, releaseWalletSeeds, resetWalletSeedRegistry } = await import(
      "../adapters/midnight-balancing-adapter.ts"
    );
    resetWalletSeedRegistry();
    const claim = claimWalletSeeds(["9e".repeat(32)], "product-a");
    releaseWalletSeeds(claim);
    expect(() => claimWalletSeeds(["9e".repeat(32)], "product-b")).not.toThrow();
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

describe("security review: cross-target row identity", () => {
  // A row's identity must not depend on WHO IS READING IT. A default-routed
  // input used to be stored without a target, so `createInputKey`'s fallback
  // let whichever product was being processed adopt it — and an identical row
  // belonging to that product matched, so removing one removed both.

  const twinPayload = () => ({
    address: "shared-address",
    addressType: 5,
    input: JSON.stringify({ tx: "aa".repeat(16) }),
    timestamp: "1754350000000",
  });

  test("REGRESSION: removing an explicit target's row spares the default-routed twin", async () => {
    await withStorage(async (storage) => {
      const targetless = { ...twinPayload() } as DefaultBatcherInput;
      const explicitB = { ...twinPayload(), target: "product-b" } as DefaultBatcherInput;

      await storage.addInput(targetless, "product-a"); // routed to the default
      await storage.addInput(explicitB, "product-b");
      expect((await storage.getAllInputs()).length).toBe(2);

      await storage.removeProcessedInputs([explicitB], "product-b");

      const remaining = await storage.getAllInputs();
      expect(remaining.length).toBe(1);
      expect(remaining[0].target).toBe("product-a"); // stamped on write
    });
  });

  test("REGRESSION: retry-charging an explicit target spares the default-routed twin", async () => {
    await withStorage(async (storage) => {
      const targetless = { ...twinPayload() } as DefaultBatcherInput;
      const explicitB = { ...twinPayload(), target: "product-b" } as DefaultBatcherInput;

      await storage.addInput(targetless, "product-a");
      await storage.addInput(explicitB, "product-b");

      await storage.incrementRetryCount([explicitB], "product-b", 5);

      const rows = await storage.getAllInputs();
      expect(rows.length).toBe(2);
      // Identify the twin as "the row that is not product-b" rather than by an
      // expected target: if the fix regresses the row is stored targetless, and
      // a `find(target === "product-a")` would return undefined and pass
      // vacuously against `?? 0`.
      const charged = rows.filter((r) => (r.retryCount ?? 0) > 0);
      expect(charged.length).toBe(1);
      expect(charged[0].target).toBe("product-b");
    });
  });

  test("a default-routed input can still be removed by the caller that owns it", async () => {
    await withStorage(async (storage) => {
      const targetless = { ...twinPayload() } as DefaultBatcherInput;
      await storage.addInput(targetless, "product-a");
      await storage.removeProcessedInputs([targetless], "product-a");
      expect((await storage.getAllInputs()).length).toBe(0);
    });
  });
});

describe("security review: seed identity is the derived bytes", () => {
  test("REGRESSION: the same seed spelled differently is still one wallet", async () => {
    const {
      assertPolicyIsEffective,
      claimWalletSeeds,
      releaseWalletSeeds,
      resetWalletSeedRegistry,
    } = await import("../adapters/midnight-balancing-adapter.ts");

    resetWalletSeedRegistry();
    const lower = "ab".repeat(32);
    // Same bytes: different case, and an 0x prefix.
    for (const equivalent of ["AB".repeat(32), "0x" + lower, ` ${lower} `]) {
      resetWalletSeedRegistry();
      claimWalletSeeds([lower], "product-a");
      expect(() => claimWalletSeeds([equivalent], "product-b")).toThrow(
        /already in use/,
      );
    }
    resetWalletSeedRegistry();
  });

  test("a seed that is not valid hex is refused outright", async () => {
    const {
      assertPolicyIsEffective,
      claimWalletSeeds,
      releaseWalletSeeds,
      resetWalletSeedRegistry,
    } = await import("../adapters/midnight-balancing-adapter.ts");

    resetWalletSeedRegistry();
    expect(() => claimWalletSeeds(["not-hex!"], "p")).toThrow(/not valid hex/);
    expect(() => claimWalletSeeds(["abc"], "p")).toThrow(/not valid hex/); // odd length
    expect(() => claimWalletSeeds([""], "p")).toThrow(/not valid hex/);
  });

  test("only the claim token can release, and it is unforgeable", async () => {
    const {
      assertPolicyIsEffective,
      claimWalletSeeds,
      releaseWalletSeeds,
      resetWalletSeedRegistry,
    } = await import("../adapters/midnight-balancing-adapter.ts");

    resetWalletSeedRegistry();
    const seed = "cd".repeat(32);
    const claimA = claimWalletSeeds([seed], "product-a");

    // REGRESSION: release used to take (seeds, owner?) with the owner
    // OPTIONAL — so any caller could free another adapter's claim just by
    // naming its seed, and then construct a second adapter on that wallet.
    // Only the token minted at claim time works now, and it cannot be forged
    // by reconstructing a value that merely looks like one.
    const forged = { __walletSeedClaim: Symbol("nope") } as never;
    releaseWalletSeeds(forged);
    releaseWalletSeeds(undefined);
    expect(() => claimWalletSeeds([seed], "product-b")).toThrow(/already in use/);

    // The holder of the claim can.
    releaseWalletSeeds(claimA);
    expect(() => claimWalletSeeds([seed], "product-b")).not.toThrow();
    resetWalletSeedRegistry();
  });
});

describe("security review: a policy that authorizes nothing is refused", () => {
  test("REGRESSION: allowedTokenTypes alone does not silently allow everything", async () => {
    const {
      assertPolicyIsEffective,
      claimWalletSeeds,
      releaseWalletSeeds,
      resetWalletSeedRegistry,
    } = await import("../adapters/midnight-balancing-adapter.ts");

    expect(() => assertPolicyIsEffective({ allowedTokenTypes: ["aa"] } as never, "p"))
      .toThrow(/authorizes nothing/);
  });

  test("an empty policy object is refused", async () => {
    const {
      assertPolicyIsEffective,
      claimWalletSeeds,
      releaseWalletSeeds,
      resetWalletSeedRegistry,
    } = await import("../adapters/midnight-balancing-adapter.ts");

    expect(() => assertPolicyIsEffective({} as never, "p")).toThrow(/authorizes nothing/);
  });

  test("absent policy stays allow-all (backward compatible)", async () => {
    const {
      assertPolicyIsEffective,
      claimWalletSeeds,
      releaseWalletSeeds,
      resetWalletSeedRegistry,
    } = await import("../adapters/midnight-balancing-adapter.ts");

    expect(() => assertPolicyIsEffective(undefined, "p")).not.toThrow();
  });

  test("any real rule is accepted", async () => {
    const {
      assertPolicyIsEffective,
      claimWalletSeeds,
      releaseWalletSeeds,
      resetWalletSeedRegistry,
    } = await import("../adapters/midnight-balancing-adapter.ts");

    for (
      const p of [
        { allowZswapTransfers: true },
        { allowedContracts: ["ab"] },
        { allowedCircuits: [{ contract: "ab", entryPoint: "x" }] },
        { allowCustomFinalFilter: () => true },
      ]
    ) {
      expect(() => assertPolicyIsEffective(p as never, "p")).not.toThrow();
    }
  });
});
