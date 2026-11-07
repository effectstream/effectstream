import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { dirname, resolve } from "node:path";
import * as Rx from "rxjs";
import {
  CostModel,
  Transaction,
  ZswapOffer,
  ZswapOutput,
  createShieldedCoinInfo,
  sampleCoinPublicKey,
  sampleEncryptionPublicKey,
} from "@midnightntwrk/ledger-v9";
import { LedgerTransaction } from "@midnight-ntwrk/midnight-js-types";
import {
  ProtocolVersion,
  WalletTransaction,
} from "@midnightntwrk/wallet-sdk-abstractions";

import { MidnightAdapter } from "../adapters/midnight-adapter.ts";
import { MidnightBalancingAdapter } from "../adapters/midnight-balancing-adapter.ts";
import { WorkerPool } from "../adapters/worker-pool.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const silentLog = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function makeUnprovenV9Transaction(value = 7n) {
  const output = ZswapOutput.new(
    createShieldedCoinInfo("11".repeat(32), value),
    undefined,
    sampleCoinPublicKey(),
    sampleEncryptionPublicKey(),
  );
  return Transaction.fromParts("undeployed", ZswapOffer.fromOutput(output));
}

/** The protocol version a 2.x node reports: inside the ledger-v9 epoch. */
const ACTIVE_PROTOCOL_VERSION = ProtocolVersion.ProtocolVersion(2_001_000n);

/**
 * A prover answering with an empty, well-formed proof. The transactions it
 * yields decode as proven ledger-v9 transactions, which is all the adapter
 * seams under test read; nothing here is ever verified by a node.
 */
const emptyProofProvider = {
  check: async () => [],
  prove: async () => {
    const header = new TextEncoder().encode("midnight:proof-versioned:");
    const proof = new Uint8Array(header.length + 2);
    proof.set(header);
    proof[header.length] = 1;
    return proof;
  },
  lookupKey: async () => undefined,
};

async function makeProvenV9Transactions(value = 7n) {
  const unbound = await makeUnprovenV9Transaction(value).prove(
    emptyProofProvider,
    CostModel.initialCostModel(),
  );
  return { unbound, finalized: unbound.bind() };
}

function makeInput(transactionHex: string): DefaultBatcherInput {
  return {
    addressType: 5,
    address: "third-party",
    timestamp: "1",
    input: JSON.stringify({ tx: transactionHex, txStage: "unproven" }),
  } as DefaultBatcherInput;
}

describe("Midnight ledger-v9 migration", () => {
  test("migrated consumers load one Ledger-v9 generation and no Ledger-v8", async () => {
    const workspaceRoot = resolve(import.meta.dir, "../../..");
    const consumerRoots = [
      resolve(workspaceRoot, "packages/batcher"),
      resolve(workspaceRoot, "packages/effectstream-sdk/config"),
      resolve(workspaceRoot, "packages/effectstream-sdk/crypto"),
      resolve(workspaceRoot, "packages/effectstream-sdk/wallets"),
    ];
    const ledgerConsumers = consumerRoots.filter(
      (root) => !root.endsWith("/config"),
    );
    const v9Entries = ledgerConsumers.map((root) =>
      Bun.resolveSync("@midnightntwrk/ledger-v9", root),
    );

    expect(new Set(v9Entries).size).toBe(1);
    expect(v9Entries[0]).toContain(
      "@midnightntwrk+ledger-v9@1.0.1/node_modules/@midnightntwrk/ledger-v9",
    );
    for (const root of consumerRoots) {
      expect(() => Bun.resolveSync("@midnight-ntwrk/ledger-v8", root)).toThrow();
    }

    const runtimeEntry = Bun.resolveSync(
      "@midnight-ntwrk/onchain-runtime",
      resolve(workspaceRoot, "packages/effectstream-sdk/config"),
    );
    expect(runtimeEntry).toContain(
      "@midnightntwrk+onchain-runtime-v4@4.0.1",
    );

    const ledgerRoot = dirname(v9Entries[0]);
    const wasmFiles = await Array.fromAsync(
      new Bun.Glob("**/*.wasm").scan({ cwd: ledgerRoot, onlyFiles: true }),
    );
    expect(wasmFiles).toEqual(["midnight_ledger_wasm_v9_bg.wasm"]);

    const loaded = await Promise.all(v9Entries.map((entry) => import(entry)));
    expect(new Set(loaded).size).toBe(1);
  });

  test("deserializes a real ledger-v9 unproven third-party transaction", () => {
    const original = makeUnprovenV9Transaction();
    const adapter = Object.create(MidnightBalancingAdapter.prototype) as any;
    const entry = adapter.deserializeTxEntry(
      makeInput(Buffer.from(original.serialize()).toString("hex")),
    );

    expect(entry.txStage).toBe("unproven");
    expect(Buffer.from(entry.tx.serialize())).toEqual(
      Buffer.from(original.serialize()),
    );
  });

  test("balances delegated transactions for DUST only", async () => {
    const calls: Array<{ method: string; tx: unknown; options?: unknown }> = [];
    const recipe = { type: "UNPROVEN_TRANSACTION" };
    const original = makeUnprovenV9Transaction();
    const adapter = Object.create(MidnightBalancingAdapter.prototype) as any;
    adapter.config = {};
    adapter.walletResults = [{
      wallet: {
        state: () => Rx.of({ activeProtocolVersion: ACTIVE_PROTOCOL_VERSION }),
        balanceUnprovenTransaction: async (tx: unknown, options: unknown) => {
          calls.push({ method: "balanceUnprovenTransaction", tx, options });
          return recipe;
        },
      },
    }];
    adapter.waitForDustAvailability = async () => {};

    const result = await adapter.balanceEntry(
      { tx: original, txStage: "unproven" },
      0,
    );

    expect(result).toBe(recipe);
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toMatchObject({
      tokenKindsToBalance: ["dust"],
    });
    // The wallet receives a sealed handle at the chain's protocol version,
    // carrying exactly the third party's transaction.
    const handle = calls[0].tx as WalletTransaction;
    expect(WalletTransaction.is(handle)).toBe(true);
    expect(handle.stage).toBe("Unproven");
    expect(handle.protocolVersion).toBe(ACTIVE_PROTOCOL_VERSION);
    expect(Buffer.from(handle.serialize())).toEqual(
      Buffer.from(original.serialize()),
    );
  });

  test("the contract adapter uses the v9 unbound recipe and async signing", async () => {
    const calls: string[] = [];
    const { unbound, finalized } = await makeProvenV9Transactions();
    const recipe = { type: "UNBOUND_TRANSACTION" };
    const signed = { type: "SIGNED_UNBOUND_TRANSACTION" };
    const finalizedHandle = WalletTransaction.adopt(
      "Finalized",
      finalized,
      ACTIVE_PROTOCOL_VERSION,
    );
    let submitted: unknown;
    const wallet = {
      state: () =>
        Rx.of({
          activeProtocolVersion: ACTIVE_PROTOCOL_VERSION,
          dust: { balance: () => 5n },
        }),
      balanceUnboundTransaction: async (received: unknown, options: unknown) => {
        const handle = received as WalletTransaction;
        expect(WalletTransaction.is(handle)).toBe(true);
        expect(handle.stage).toBe("Unbound");
        expect(Buffer.from(handle.serialize())).toEqual(
          Buffer.from(unbound.serialize()),
        );
        expect(options).toMatchObject({ tokenKindsToBalance: ["dust"] });
        calls.push("balance-unbound");
        return recipe;
      },
      signRecipe: async (
        received: unknown,
        sign: (payload: Uint8Array) => Promise<unknown>,
      ) => {
        expect(received).toBe(recipe);
        await sign(new Uint8Array([1, 2, 3]));
        calls.push("sign-recipe");
        return signed;
      },
      finalizeRecipe: async (received: unknown) => {
        expect(received).toBe(signed);
        calls.push("finalize-recipe");
        return finalizedHandle;
      },
      submitTransaction: async (received: unknown) => {
        submitted = received;
        return "tx-id";
      },
    };
    const adapter = Object.create(MidnightAdapter.prototype) as any;
    adapter.log = silentLog;
    const { walletProvider, midnightProvider } = adapter
      .createWalletAndMidnightProvider({
        wallet,
        zswapSecretKeys: {
          coinPublicKey: new Uint8Array(32),
          encryptionPublicKey: new Uint8Array(32),
        },
        unshieldedKeystore: {
          signDataAsync: async (payload: Uint8Array) => {
            expect(payload).toEqual(new Uint8Array([1, 2, 3]));
            calls.push("sign-async");
            return new Uint8Array([9]);
          },
        },
      });

    expect(walletProvider.supportedEras).toEqual(["v9"]);
    expect(midnightProvider.supportedEras).toEqual(["v9"]);

    const balanced = await walletProvider.balanceTx(
      LedgerTransaction.seal("v9", "Unbound", unbound),
    );
    expect(balanced.era).toBe("v9");
    expect(balanced.stage).toBe("Finalized");
    expect(Buffer.from(balanced.serialize())).toEqual(
      Buffer.from(finalized.serialize()),
    );
    expect(calls).toEqual([
      "balance-unbound",
      "sign-async",
      "sign-recipe",
      "finalize-recipe",
    ]);

    expect(await midnightProvider.submitTx(balanced)).toBe("tx-id");
    const submittedHandle = submitted as WalletTransaction;
    expect(WalletTransaction.is(submittedHandle)).toBe(true);
    expect(submittedHandle.stage).toBe("Finalized");
    expect(Buffer.from(submittedHandle.serialize())).toEqual(
      Buffer.from(finalized.serialize()),
    );
  });

  test("regular adapter accepts an available DUST coin with aggregate balance zero", async () => {
    const complete = { isStrictlyComplete: () => true };
    const dustState = {
      progress: complete,
      availableCoins: [{}],
      balance: () => 0n,
    };
    const adapter = Object.create(MidnightAdapter.prototype) as any;
    adapter.walletSeeds = ["seed"];
    adapter.walletResults = [{ wallet: { dust: { state: Rx.of(dustState) } } }];
    adapter.walletFundingTimeoutMs = 100;
    adapter.hasFundsPerWallet = [false];
    adapter.lastFundingBalancesPerWallet = [null];
    adapter.walletDustExhausted = [true];
    adapter.log = silentLog;

    await adapter.ensureWalletFunds(0);

    expect(adapter.hasFundsPerWallet).toEqual([true]);
    expect(adapter.walletDustExhausted).toEqual([false]);
    expect(adapter.lastFundingBalancesPerWallet[0].dustBalance).toBe(0n);
  });

  test("balancing adapter accepts a value-sufficient DUST coin with aggregate balance zero", async () => {
    const complete = { isStrictlyComplete: () => true };
    const dustState = {
      progress: complete,
      availableCoins: [{ generatedNow: 10n }],
      balance: () => 0n,
    };
    const adapter = Object.create(MidnightBalancingAdapter.prototype) as any;
    adapter.walletSeeds = ["seed"];
    adapter.walletResults = [{ wallet: { dust: { state: Rx.of(dustState) } } }];
    adapter.walletFundingTimeoutMs = 100;
    adapter.config = { minSpendableDustPerCoin: 10n, maxSlotsPerWallet: 1 };
    adapter.availableDustUtxoCounts = [null];
    adapter.walletDustExhausted = [true];
    adapter.pool = new WorkerPool([0]);
    adapter.log = silentLog;

    await adapter.ensureWalletFunds(0);

    expect(adapter.walletDustExhausted).toEqual([false]);
    expect(adapter.availableDustUtxoCounts).toEqual([1]);
    expect(adapter.pool.hasAvailableWorker()).toBe(true);
  });

  test("balancing adapter publicly recovers from zero-slot startup when DUST becomes value-sufficient", async () => {
    const complete = { isStrictlyComplete: () => true };
    const state = new Rx.BehaviorSubject({
      progress: complete,
      availableCoins: [] as Array<{ generatedNow: bigint }>,
      balance: () => 0n,
    });
    const adapter = Object.create(MidnightBalancingAdapter.prototype) as any;
    adapter.walletSeeds = ["seed"];
    adapter.walletResults = [{ wallet: { dust: { state } } }];
    adapter.walletInitialized = [true];
    adapter.walletDustExhausted = [true];
    adapter.availableDustUtxoCounts = [0];
    adapter.pool = new WorkerPool([0]);
    adapter.config = { minSpendableDustPerCoin: 10n, maxSlotsPerWallet: 1 };
    adapter.lastDustRefreshAt = 0;
    adapter.dustRefreshInFlight = false;
    adapter.isInitialized = true;
    adapter.inFlightInputKeys = new Set<string>();
    adapter.batchCounter = 0;
    adapter.log = silentLog;

    expect(adapter.hasAvailableCapacity()).toBe(false);
    await delay(0);
    expect(adapter.pool.getTotalWorkerCount()).toBe(0);

    state.next({
      progress: complete,
      availableCoins: [{ generatedNow: 10n }],
      balance: () => 0n,
    });
    adapter.lastDustRefreshAt = 0;
    expect(adapter.hasAvailableCapacity()).toBe(false);
    await delay(0);

    expect(adapter.hasAvailableCapacity()).toBe(true);
    expect(adapter.pool.getTotalWorkerCount()).toBe(1);
    const batch = adapter.buildBatchData([
      makeInput(Buffer.from(makeUnprovenV9Transaction().serialize()).toString("hex")),
    ]);
    expect(batch?.data.workerAssignments).toEqual([{ walletIdx: 0, slotIdx: 0 }]);
    adapter.releaseBatchResources(batch!.data);
  });

  test("balancing capacity and acquisition both reject an exhausted free wallet while the ready wallet is busy", () => {
    const adapter = Object.create(MidnightBalancingAdapter.prototype) as any;
    adapter.walletSeeds = ["ready", "exhausted"];
    adapter.walletInitialized = [true, true];
    adapter.walletDustExhausted = [false, true];
    adapter.pool = new WorkerPool([1, 1]);
    adapter.config = {};
    adapter.lastDustRefreshAt = Date.now();
    adapter.dustRefreshInFlight = false;
    adapter.isInitialized = true;
    adapter.inFlightInputKeys = new Set<string>();
    adapter.batchCounter = 0;
    adapter.log = silentLog;

    const readyWorker = adapter.pool.acquireWorker(
      (walletIdx: number) => walletIdx === 0,
    );
    expect(readyWorker).toMatchObject({ walletIdx: 0, slotIdx: 0 });
    expect(adapter.hasAvailableCapacity()).toBe(false);
    expect(adapter.buildBatchData([
      makeInput(Buffer.from(makeUnprovenV9Transaction().serialize()).toString("hex")),
    ])).toBeNull();

    adapter.pool.releaseWorker(0, 0);
    expect(adapter.hasAvailableCapacity()).toBe(true);
  });
});

interface PipelineHarness {
  adapter: any;
  events: string[];
  maxActiveByWallet: number[];
  maxGlobalActive: () => number;
  /** The ledger transaction hash of the finalized transaction for an entry id. */
  hashOf: (id: string) => string;
}

async function makePipelineHarness(
  walletCount: number,
  slotsPerWallet: number,
  ids: string[],
): Promise<PipelineHarness> {
  const adapter = Object.create(MidnightBalancingAdapter.prototype) as any;
  // One real finalized ledger-v9 transaction per entry id, sealed the way the
  // facade returns it from finalizeRecipe.
  const finalizedById = new Map<string, WalletTransaction<"Finalized">>();
  const idByHandle = new Map<unknown, string>();
  const hashById = new Map<string, string>();
  for (const [i, id] of ids.entries()) {
    const { finalized } = await makeProvenV9Transactions(BigInt(i + 1));
    const handle = WalletTransaction.adopt(
      "Finalized",
      finalized,
      ACTIVE_PROTOCOL_VERSION,
    );
    finalizedById.set(id, handle);
    idByHandle.set(handle, id);
    hashById.set(id, finalized.transactionHash().toString());
  }
  const events: string[] = [];
  const activeByWallet = new Array(walletCount).fill(0);
  const maxActiveByWallet = new Array(walletCount).fill(0);
  let globalActive = 0;
  let globalMax = 0;

  adapter.pool = new WorkerPool(
    new Array(walletCount).fill(slotsPerWallet),
  );
  adapter.walletSeeds = new Array(walletCount).fill("seed");
  adapter.config = {};
  adapter.log = silentLog;
  adapter.getDustBalance = async () => 10n;
  adapter.refreshUtxoCountAfterBalance = async () => {};
  adapter.balanceEntry = async (entry: { id: string }, walletIdx: number) => {
    if (activeByWallet[walletIdx] > 0) {
      throw new Error("DustDoubleSpend");
    }
    activeByWallet[walletIdx]++;
    globalActive++;
    maxActiveByWallet[walletIdx] = Math.max(
      maxActiveByWallet[walletIdx],
      activeByWallet[walletIdx],
    );
    globalMax = Math.max(globalMax, globalActive);
    events.push(`${entry.id}:balance:start`);
    await delay(5);
    events.push(`${entry.id}:balance:end`);
    return { id: entry.id, walletIdx, blockData: { height: 1 } };
  };
  adapter.walletResults = Array.from({ length: walletCount }, (_, walletIdx) => ({
    unshieldedKeystore: {
      signDataAsync: async () => new Uint8Array([walletIdx]),
    },
    wallet: {
      state: () => Rx.of({ activeProtocolVersion: ACTIVE_PROTOCOL_VERSION }),
      signRecipe: async () => {
        throw new Error("fee wallet must not re-sign a third-party input");
      },
      finalizeRecipe: async (recipe: { id: string }) => {
        events.push(`${recipe.id}:prove`);
        await delay(5);
        return finalizedById.get(recipe.id)!;
      },
      validateTransaction: async (
        finalizedHandle: unknown,
        options: {
          flags: Record<string, boolean>;
          blockData?: { height: number };
        },
      ) => {
        expect(options).toEqual({
          flags: {
            enforceBalancing: true,
            verifySignatures: true,
            enforceLimits: true,
          },
          blockData: { height: 1 },
        });
        events.push(`${idByHandle.get(finalizedHandle)}:validate`);
      },
      submitTransaction: async (finalizedHandle: unknown) => {
        const id = idByHandle.get(finalizedHandle);
        events.push(`${id}:submit:start`);
        await delay(10);
        events.push(`${id}:submit:end`);
        activeByWallet[walletIdx]--;
        globalActive--;
        return `hash-${id}`;
      },
      revert: async () => {},
      revertTransaction: async () => {},
    },
  }));

  return {
    adapter,
    events,
    maxActiveByWallet,
    maxGlobalActive: () => globalMax,
    hashOf: (id: string) => hashById.get(id)!,
  };
}

const trace = (label: string) => ({
  label,
  contentHash: label,
  retry: 0,
});

describe("per-wallet ledger-v9 serialization", () => {
  test("serializes balance through submit for two slots on one wallet", async () => {
    const harness = await makePipelineHarness(1, 2, ["a", "b"]);

    const results = await Promise.all([
      harness.adapter.processWorkerTx(
        { id: "a", txStage: "unproven" },
        0,
        0,
        trace("a"),
      ),
      harness.adapter.processWorkerTx(
        { id: "b", txStage: "unproven" },
        0,
        1,
        trace("b"),
      ),
    ]);

    expect(results).toEqual([harness.hashOf("a"), harness.hashOf("b")]);
    expect(harness.maxActiveByWallet).toEqual([1]);
    expect(harness.events.indexOf("a:submit:end")).toBeLessThan(
      harness.events.indexOf("b:balance:start"),
    );
    expect(harness.events.indexOf("a:prove")).toBeLessThan(
      harness.events.indexOf("a:validate"),
    );
    expect(harness.events.indexOf("a:validate")).toBeLessThan(
      harness.events.indexOf("a:submit:start"),
    );
    expect(harness.events.join(" ")).not.toContain("DustDoubleSpend");
    expect(harness.events.join(" ")).not.toContain(":sign");
  });

  test("retains concurrency across different wallets", async () => {
    const harness = await makePipelineHarness(2, 1, ["wallet-a", "wallet-b"]);

    await Promise.all([
      harness.adapter.processWorkerTx(
        { id: "wallet-a", txStage: "unproven" },
        0,
        0,
        trace("wallet-a"),
      ),
      harness.adapter.processWorkerTx(
        { id: "wallet-b", txStage: "unproven" },
        1,
        0,
        trace("wallet-b"),
      ),
    ]);

    expect(harness.maxActiveByWallet).toEqual([1, 1]);
    expect(harness.maxGlobalActive()).toBe(2);
  });

  test("serializes contract callTx operations for one wallet", async () => {
    const adapter = Object.create(MidnightAdapter.prototype) as any;
    adapter.pool = new WorkerPool([2]);
    let active = 0;
    let maxActive = 0;

    const operation = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(5);
      active--;
      return "ok";
    };

    expect(await Promise.all([
      adapter.runSerializedWalletOperation(0, operation, 1000, "timeout"),
      adapter.runSerializedWalletOperation(0, operation, 1000, "timeout"),
    ])).toEqual(["ok", "ok"]);
    expect(maxActive).toBe(1);
  });

  test("regular adapter re-admits a wallet after DUST timeout and recovery", async () => {
    const complete = { isStrictlyComplete: () => true };
    const state = new Rx.BehaviorSubject({
      progress: complete,
      availableCoins: [] as unknown[],
      balance: () => 0n,
    });
    const adapter = Object.create(MidnightAdapter.prototype) as any;
    adapter.pool = new WorkerPool([1]);
    adapter.walletSeeds = ["seed"];
    adapter.walletResults = [{ wallet: { dust: { state } } }];
    adapter.walletInitialized = [true];
    adapter.walletDustExhausted = [false];
    adapter.lastDustRefreshAt = 0;
    adapter.dustRefreshInFlight = false;
    adapter.isInitialized = true;
    adapter.log = silentLog;

    await adapter.waitForDustAvailability(0, 0);
    expect(adapter.walletDustExhausted).toEqual([true]);
    expect(adapter.hasAvailableCapacity()).toBe(false);
    await delay(0);
    expect(adapter.pickNextWallet()).toBeNull();

    state.next({
      progress: complete,
      availableCoins: [{}],
      balance: () => 0n,
    });
    adapter.lastDustRefreshAt = 0;
    expect(adapter.hasAvailableCapacity()).toBe(false);
    await delay(0);

    expect(adapter.hasAvailableCapacity()).toBe(true);
    expect(adapter.pickNextWallet()).toMatchObject({ walletIdx: 0, slotIdx: 0 });
  });
});
