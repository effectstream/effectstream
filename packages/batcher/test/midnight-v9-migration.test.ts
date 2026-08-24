import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import * as Rx from "rxjs";
import {
  Transaction,
  ZswapOffer,
  ZswapOutput,
  createShieldedCoinInfo,
  sampleCoinPublicKey,
  sampleEncryptionPublicKey,
} from "@midnightntwrk/ledger-v9";

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

function makeInput(transactionHex: string): DefaultBatcherInput {
  return {
    addressType: 5,
    address: "third-party",
    timestamp: "1",
    input: JSON.stringify({ tx: transactionHex, txStage: "unproven" }),
  } as DefaultBatcherInput;
}

describe("Midnight ledger-v9 migration", () => {
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
    const calls: Array<{ method: string; options?: unknown }> = [];
    const recipe = { type: "UNPROVEN_TRANSACTION" };
    const adapter = Object.create(MidnightBalancingAdapter.prototype) as any;
    adapter.config = {};
    adapter.walletResults = [{
      walletZswapSecretKeys: { kind: "zswap" },
      walletDustSecretKey: { kind: "dust" },
      wallet: {
        balanceUnprovenTransaction: async (
          _tx: unknown,
          _keys: unknown,
          options: unknown,
        ) => {
          calls.push({ method: "balanceUnprovenTransaction", options });
          return recipe;
        },
      },
    }];
    adapter.waitForDustAvailability = async () => {};

    const result = await adapter.balanceEntry(
      { tx: makeUnprovenV9Transaction(), txStage: "unproven" },
      0,
    );

    expect(result).toBe(recipe);
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toMatchObject({
      tokenKindsToBalance: ["dust"],
    });
  });

  test("the contract adapter uses the v9 unbound recipe and async signing", async () => {
    const calls: string[] = [];
    const tx = { kind: "v9-unbound" };
    const recipe = { type: "UNBOUND_TRANSACTION" };
    const signed = { type: "SIGNED_UNBOUND_TRANSACTION" };
    const finalized = { kind: "v9-finalized" };
    const wallet = {
      state: () => Rx.of({ dust: { balance: () => 5n } }),
      balanceUnboundTransaction: async (
        received: unknown,
        _keys: unknown,
        options: unknown,
      ) => {
        expect(received).toBe(tx);
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
        return finalized;
      },
      submitTransaction: async () => "tx-id",
    };
    const adapter = Object.create(MidnightAdapter.prototype) as any;
    adapter.log = silentLog;
    const provider = adapter.createWalletAndMidnightProvider({
      wallet,
      zswapSecretKeys: {
        coinPublicKey: new Uint8Array(32),
        encryptionPublicKey: new Uint8Array(32),
      },
      walletZswapSecretKeys: {},
      dustSecretKey: {},
      walletDustSecretKey: {},
      unshieldedKeystore: {
        signDataAsync: async (payload: Uint8Array) => {
          expect(payload).toEqual(new Uint8Array([1, 2, 3]));
          calls.push("sign-async");
          return new Uint8Array([9]);
        },
      },
    });

    expect(await provider.balanceTx(tx)).toBe(finalized);
    expect(calls).toEqual([
      "balance-unbound",
      "sign-async",
      "sign-recipe",
      "finalize-recipe",
    ]);
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
});

interface PipelineHarness {
  adapter: any;
  events: string[];
  maxActiveByWallet: number[];
  maxGlobalActive: () => number;
}

function makePipelineHarness(walletCount: number, slotsPerWallet: number): PipelineHarness {
  const adapter = Object.create(MidnightBalancingAdapter.prototype) as any;
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
      signRecipe: async () => {
        throw new Error("fee wallet must not re-sign a third-party input");
      },
      finalizeRecipe: async (recipe: { id: string }) => {
        events.push(`${recipe.id}:prove`);
        await delay(5);
        return {
          ...recipe,
          transactionHash: () => `hash-${recipe.id}`,
          identifiers: () => [recipe.id],
          imbalances: () => new Map(),
        };
      },
      validateTransaction: async (
        finalized: { id: string },
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
        events.push(`${finalized.id}:validate`);
      },
      submitTransaction: async (finalized: { id: string }) => {
        events.push(`${finalized.id}:submit:start`);
        await delay(10);
        events.push(`${finalized.id}:submit:end`);
        activeByWallet[walletIdx]--;
        globalActive--;
        return `hash-${finalized.id}`;
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
  };
}

const trace = (label: string) => ({
  label,
  contentHash: label,
  retry: 0,
});

describe("per-wallet ledger-v9 serialization", () => {
  test("serializes balance through submit for two slots on one wallet", async () => {
    const harness = makePipelineHarness(1, 2);

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

    expect(results).toEqual(["hash-a", "hash-b"]);
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
    const harness = makePipelineHarness(2, 1);

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
