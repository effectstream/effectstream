import { expect, test } from "bun:test";
import {
  SOLANA_PRIMITIVE_ACCOUNT_BALANCE,
  SOLANA_PRIMITIVE_PROGRAM_LOG,
  SOLANA_PRIMITIVE_TOKEN_ACCOUNT,
} from "@effectstream/config";
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

// `type` is what readPrimitives dispatches on. These fixtures used to omit it,
// which the old field-truthy dispatch tolerated — real configs always carry it,
// because `Primitive.getConfig()` sets it and runtime/src/main.ts substitutes its
// output for the raw config entry.
const programLogEntry = {
  syncProtocol: "parallelSolanaRPC",
  primitive: {
    name: "WatchedLog",
    type: SOLANA_PRIMITIVE_PROGRAM_LOG,
    programId: WATCHED_PROGRAM,
  },
};
const balanceEntry = {
  syncProtocol: "parallelSolanaRPC",
  primitive: {
    name: "WatchedBalance",
    type: SOLANA_PRIMITIVE_ACCOUNT_BALANCE,
    address: WATCHED_ADDRESS,
  },
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
    primitive: {
      name: "WatchedLog",
      type: SOLANA_PRIMITIVE_PROGRAM_LOG,
      programId: WATCHED_PROGRAM,
      eventType: "MARKER",
    },
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

// ───────────────────────── SOLANA:TokenAccount ─────────────────────────

const MINT = "Mint111111111111111111111111111111111111111";
const OTHER_MINT = "0therMint11111111111111111111111111111111";
const TOKEN_ACCOUNT = "Tok111111111111111111111111111111111111111";
const OWNER = "0wner11111111111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const tokenEntry = {
  syncProtocol: "parallelSolanaRPC",
  primitive: {
    name: "WatchedToken",
    type: SOLANA_PRIMITIVE_TOKEN_ACCOUNT,
    mint: MINT,
  },
};

/** `meta.postTokenBalances` record shape, per the JSON-RPC `getBlock` response. */
function tokenBalance(overrides: Record<string, unknown> = {}) {
  return {
    accountIndex: 0,
    mint: MINT,
    owner: OWNER,
    programId: TOKEN_PROGRAM,
    uiTokenAmount: {
      amount: "1500000000",
      decimals: 9,
      uiAmount: 1.5,
      uiAmountString: "1.5",
    },
    ...overrides,
  };
}

/** A successful transaction carrying token balances. */
function tokenTx(
  balances: Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
) {
  return {
    transaction: {
      message: { accountKeys: [TOKEN_ACCOUNT, WATCHED_PROGRAM] },
      signatures: ["sig-tok"],
    },
    meta: {
      err: null,
      logMessages: [],
      postBalances: [0, 0],
      postTokenBalances: balances,
      ...overrides,
    },
  };
}

test("TokenAccount emits the post balance for a watched mint", () => {
  const out = run(makeFetcher(), 11, { transactions: [tokenTx([tokenBalance()])] }, [
    tokenEntry,
  ]);
  expect(out.length).toBe(1);
  expect(out[0].primitive).toBe("WatchedToken");
  expect(out[0].output.payloadType).toBe("solana:token-balance");
  expect(out[0].output.payload).toEqual({
    tokenAccount: TOKEN_ACCOUNT,
    mint: MINT,
    owner: OWNER,
    // Raw u64 as a string: 1.5 tokens at 9 decimals does not survive a JS number
    // once amounts get large, so the grammar carries the base units.
    amount: "1500000000",
    decimals: 9,
    slot: 11,
  });
});

test("TokenAccount resolves lookup-table token accounts (security fix B3)", () => {
  // `accountIndex` indexes the resolved list — static keys, then ALT writable, then
  // ALT readonly — so a token account reached through an ALT is at an index past
  // the end of message.accountKeys. Without resolution this reads undefined and
  // drops the balance silently.
  // Two static keys (indices 0-1), then ALT writable (2), then ALT readonly (3),
  // so the watched token account sits at index 3 — past the end of accountKeys.
  const tx = tokenTx([tokenBalance({ accountIndex: 3 })], {
    loadedAddresses: {
      writable: ["W1111111111111111111111111111111111111111111"],
      readonly: [TOKEN_ACCOUNT],
    },
  });
  tx.transaction.message.accountKeys = [OTHER_PROGRAM, WATCHED_PROGRAM];
  const out = run(makeFetcher(), 12, { transactions: [tx] }, [tokenEntry]);
  expect(out.length).toBe(1);
  expect(out[0].output.payload.tokenAccount).toBe(TOKEN_ACCOUNT);
});

test("TokenAccount SKIPS a reverted transaction (security fix B2)", () => {
  const tx = tokenTx([tokenBalance()], { err: { InstructionError: [0, "Custom"] } });
  expect(run(makeFetcher(), 13, { transactions: [tx] }, [tokenEntry])).toEqual([]);
});

test("TokenAccount ignores balances for a different mint", () => {
  const tx = tokenTx([tokenBalance({ mint: OTHER_MINT })]);
  expect(run(makeFetcher(), 14, { transactions: [tx] }, [tokenEntry])).toEqual([]);
});

test("TokenAccount narrows by owner", () => {
  const entry = {
    syncProtocol: "parallelSolanaRPC",
    primitive: {
      name: "WatchedToken",
      type: SOLANA_PRIMITIVE_TOKEN_ACCOUNT,
      mint: MINT,
      owner: OWNER,
    },
  };
  expect(
    run(makeFetcher(), 15, { transactions: [tokenTx([tokenBalance()])] }, [entry]),
  ).toHaveLength(1);
  expect(
    run(
      makeFetcher(),
      15,
      { transactions: [tokenTx([tokenBalance({ owner: "someone-else" })])] },
      [entry],
    ),
  ).toEqual([]);
});

test("TokenAccount narrows by tokenProgramId, separating Token-2022", () => {
  const entry = {
    syncProtocol: "parallelSolanaRPC",
    primitive: {
      name: "WatchedToken",
      type: SOLANA_PRIMITIVE_TOKEN_ACCOUNT,
      mint: MINT,
      tokenProgramId: TOKEN_2022_PROGRAM,
    },
  };
  // Same mint, classic SPL Token program — must not match a Token-2022 filter.
  expect(
    run(makeFetcher(), 16, { transactions: [tokenTx([tokenBalance()])] }, [entry]),
  ).toEqual([]);
  expect(
    run(
      makeFetcher(),
      16,
      { transactions: [tokenTx([tokenBalance({ programId: TOKEN_2022_PROGRAM })])] },
      [entry],
    ),
  ).toHaveLength(1);
});

test("TokenAccount narrows by tokenAccount", () => {
  const entry = {
    syncProtocol: "parallelSolanaRPC",
    primitive: {
      name: "WatchedToken",
      type: SOLANA_PRIMITIVE_TOKEN_ACCOUNT,
      tokenAccount: TOKEN_ACCOUNT,
    },
  };
  expect(
    run(makeFetcher(), 17, { transactions: [tokenTx([tokenBalance()])] }, [entry]),
  ).toHaveLength(1);
  // accountIndex 1 resolves to WATCHED_PROGRAM, not the watched token account.
  expect(
    run(
      makeFetcher(),
      17,
      { transactions: [tokenTx([tokenBalance({ accountIndex: 1 })])] },
      [entry],
    ),
  ).toEqual([]);
});

test("TokenAccount emits one primitive per matching balance record", () => {
  const tx = tokenTx([
    tokenBalance(),
    tokenBalance({ accountIndex: 1, owner: "second-owner" }),
    tokenBalance({ mint: OTHER_MINT, accountIndex: 1 }),
  ]);
  const out = run(makeFetcher(), 18, { transactions: [tx] }, [tokenEntry]);
  expect(out.length).toBe(2);
  expect(out.map((p) => p.output.payload.owner)).toEqual([OWNER, "second-owner"]);
});

test("TokenAccount tolerates a transaction with no token balances", () => {
  expect(run(makeFetcher(), 19, { transactions: [invokingTx()] }, [tokenEntry]))
    .toEqual([]);
});

test("a TokenAccount entry is never treated as an AccountBalance", () => {
  // The regression the type dispatch exists for. `SolanaPrimitive` is a flat bag of
  // optionals, so a config can set `address` on a TokenAccount entry — under the old
  // field-truthy dispatch (`if (prim.address)` first) that emitted a lamport-balance
  // event under the token primitive's name.
  const entry = {
    syncProtocol: "parallelSolanaRPC",
    primitive: {
      name: "WatchedToken",
      type: SOLANA_PRIMITIVE_TOKEN_ACCOUNT,
      mint: MINT,
      address: TOKEN_ACCOUNT,
    },
  };
  const out = run(makeFetcher(), 20, { transactions: [tokenTx([tokenBalance()])] }, [
    entry,
  ]);
  expect(out.length).toBe(1);
  expect(out[0].output.payloadType).toBe("solana:token-balance");
  expect(out[0].output.payload).not.toHaveProperty("lamports");
});

test("an unsupported primitive type is ignored rather than misrouted", () => {
  const entry = {
    syncProtocol: "parallelSolanaRPC",
    primitive: {
      name: "FromTheFuture",
      type: "SOLANA:NotImplementedYet",
      address: WATCHED_ADDRESS,
      programId: WATCHED_PROGRAM,
    },
  };
  expect(run(makeFetcher(), 21, { transactions: [invokingTx()] }, [entry]))
    .toEqual([]);
});
