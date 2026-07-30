import { expect, test } from "bun:test";
import { SolanaFetcher } from "./fetcher.ts";
import type { ConfigType } from "./types.ts";

/**
 * Direct unit coverage for `SolanaFetcher.readPrimitives` — the function that
 * decides what the state machine is told happened on chain. It had none, which
 * meant the reverted-transaction skip, the lookup-table resolution and the
 * two-primitive dispatch were all only exercised (if at all) by a full e2e run
 * against a live validator.
 *
 * `readPrimitives` is a generator that never yields, so it can be driven to
 * completion with a single `.next()`.
 */

const WATCHED_PROGRAM = "Watch1111111111111111111111111111111111111";
const OTHER_PROGRAM = "0ther1111111111111111111111111111111111111";
const WATCHED_ADDRESS = "Addr11111111111111111111111111111111111111";

function makeFetcher(): SolanaFetcher {
  return new SolanaFetcher({
    network: { rpcUrl: "http://127.0.0.1:8899" },
    syncProtocol: { name: "parallelSolanaRPC" },
    primitives: [],
  } as unknown as ConfigType);
}

/** Run the generator to completion and return the primitives it produced. */
function run(fetcher: SolanaFetcher, slot: number, block: any, entries: any[]) {
  const it = fetcher.readPrimitives(slot, block, entries as any) as any;
  const step = it.next();
  expect(step.done).toBe(true);
  return step.value as any[];
}

const programLogEntry = {
  syncProtocol: "parallelSolanaRPC",
  primitive: { name: "WatchedLog", programId: WATCHED_PROGRAM },
};
const balanceEntry = {
  syncProtocol: "parallelSolanaRPC",
  primitive: { name: "WatchedBalance", address: WATCHED_ADDRESS },
};

/** A transaction that genuinely invoked the watched program. */
function invokingTx(overrides: Record<string, unknown> = {}) {
  return {
    transaction: {
      message: { accountKeys: [WATCHED_ADDRESS, WATCHED_PROGRAM] },
      signatures: ["sig-1"],
    },
    meta: {
      err: null,
      logMessages: [
        `Program ${WATCHED_PROGRAM} invoke [1]`,
        "Program log: hello",
        `Program ${WATCHED_PROGRAM} success`,
      ],
      postBalances: [500, 0],
      ...overrides,
    },
  };
}

test("emits a ProgramLog primitive for a genuine invocation", () => {
  const out = run(makeFetcher(), 42, { transactions: [invokingTx()] }, [
    programLogEntry,
  ]);
  expect(out.length).toBe(1);
  expect(out[0].primitive).toBe("WatchedLog");
  expect(out[0].output.payload.programId).toBe(WATCHED_PROGRAM);
  expect(out[0].output.payload.logMessages).toEqual(["Program log: hello"]);
  expect(out[0].syncProtocol.transactionHash).toBe("sig-1");
});

test("SKIPS a reverted transaction (security fix B2)", () => {
  // A failed tx's logs describe work that was rolled back and its postBalances
  // are the pre-state. Emitting either would drive state transitions off events
  // that never happened.
  const reverted = invokingTx({ err: { InstructionError: [0, "Custom"] } });
  const out = run(makeFetcher(), 42, { transactions: [reverted] }, [
    programLogEntry,
    balanceEntry,
  ]);
  expect(out).toEqual([]);
});

test("SKIPS a transaction the RPC could not decode (meta === null)", () => {
  const undecodable = {
    transaction: {
      message: { accountKeys: [WATCHED_PROGRAM] },
      signatures: ["sig-x"],
    },
    meta: null,
  };
  const out = run(makeFetcher(), 42, { transactions: [undecodable] }, [
    programLogEntry,
  ]);
  expect(out).toEqual([]);
});

test("does NOT attribute another program's logs to the watched program", () => {
  // The spoof: the watched program is present as a bare account key while a
  // different program emits the text.
  const spoof = {
    transaction: {
      message: { accountKeys: [WATCHED_PROGRAM, OTHER_PROGRAM] },
      signatures: ["sig-2"],
    },
    meta: {
      err: null,
      logMessages: [
        `Program ${OTHER_PROGRAM} invoke [1]`,
        `Program log: ${WATCHED_PROGRAM} forged event`,
        `Program ${OTHER_PROGRAM} success`,
      ],
      postBalances: [0, 0],
    },
  };
  const out = run(makeFetcher(), 42, { transactions: [spoof] }, [
    programLogEntry,
  ]);
  expect(out).toEqual([]);
});

test("eventType filters against the program's OWN lines only", () => {
  const tx = invokingTx({
    logMessages: [
      `Program ${OTHER_PROGRAM} invoke [1]`,
      "Program log: MARKER from someone else",
      `Program ${OTHER_PROGRAM} success`,
      `Program ${WATCHED_PROGRAM} invoke [1]`,
      "Program log: nothing relevant",
      `Program ${WATCHED_PROGRAM} success`,
    ],
  });
  const entry = {
    syncProtocol: "parallelSolanaRPC",
    primitive: { name: "WatchedLog", programId: WATCHED_PROGRAM, eventType: "MARKER" },
  };
  expect(run(makeFetcher(), 42, { transactions: [tx] }, [entry])).toEqual([]);
});

test("AccountBalance reads postBalances by resolved account index", () => {
  const out = run(makeFetcher(), 7, { transactions: [invokingTx()] }, [
    balanceEntry,
  ]);
  expect(out.length).toBe(1);
  expect(out[0].output.payload).toMatchObject({
    address: WATCHED_ADDRESS,
    lamports: 500,
    slot: 7,
  });
});

test("AccountBalance resolves lookup-table addresses (security fix B3)", () => {
  // The watched address arrives via an ALT, so it is absent from
  // message.accountKeys — but postBalances is indexed over the full list:
  // static keys, then ALT writable, then ALT readonly.
  const tx = {
    transaction: {
      message: { accountKeys: [OTHER_PROGRAM] },
      signatures: ["sig-3"],
    },
    meta: {
      err: null,
      logMessages: [],
      postBalances: [1, 999, 2],
      loadedAddresses: { writable: [WATCHED_ADDRESS], readonly: ["Ro11111111111111111111111111111111111111111"] },
    },
  };
  const out = run(makeFetcher(), 9, { transactions: [tx] }, [balanceEntry]);
  expect(out.length).toBe(1);
  expect(out[0].output.payload.lamports).toBe(999);
});

test("dispatches both primitive kinds from one transaction", () => {
  const out = run(makeFetcher(), 42, { transactions: [invokingTx()] }, [
    balanceEntry,
    programLogEntry,
  ]);
  expect(out.map((p) => p.primitive).sort())
    .toEqual(["WatchedBalance", "WatchedLog"]);
});

test("returns nothing when no primitives are configured", () => {
  expect(run(makeFetcher(), 42, { transactions: [invokingTx()] }, [])).toEqual([]);
});
