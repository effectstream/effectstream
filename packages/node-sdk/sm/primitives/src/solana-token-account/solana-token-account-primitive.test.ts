import { expect, test } from "bun:test";
// Via the barrel, not the file directly: mod.ts registers every primitive class, so
// importing the file first hits a TDZ error on the map entry. Same as
// solana-program-log-primitive.test.ts.
import { SolanaTokenAccountPrimitive } from "./../mod.ts";
import { PrimitiveRegistry } from "../../PrimitiveRegistry.ts";

/**
 * Unit coverage for the primitive half of SOLANA:TokenAccount — the config guard and
 * the payload the state machine actually receives. The fetcher half (which balance
 * records match, and lookup-table resolution) is covered in
 * `sync/src/sync-protocols/solana/read-primitives.test.ts`.
 *
 * `getPayload` is a generator that never yields, so one `.next()` drives it to done.
 */

const MINT = "Mint111111111111111111111111111111111111111";
const OWNER = "0wner11111111111111111111111111111111111111";
const TOKEN_ACCOUNT = "Tok111111111111111111111111111111111111111";

function makePrimitive(overrides: Record<string, unknown> = {}) {
  // The Primitive constructor self-registers and PrimitiveRegistry.addPrimitive
  // throws on a duplicate instanceName, so the singleton has to be cleared between
  // constructions.
  PrimitiveRegistry.primitives = {};
  return new SolanaTokenAccountPrimitive({
    instanceName: "WatchedToken",
    startBlockHeight: 0,
    mint: MINT,
    stateMachinePrefix: "solana-token-account",
    ...overrides,
  } as any);
}

function payloadOf(primitive: SolanaTokenAccountPrimitive, payload: unknown) {
  const it = primitive.getPayload(0 as any, { output: { payload } } as any) as any;
  const step = it.next();
  expect(step.done).toBe(true);
  return step.value;
}

const balancePayload = {
  tokenAccount: TOKEN_ACCOUNT,
  mint: MINT,
  owner: OWNER,
  amount: "1500000000",
  decimals: 9,
  slot: 11,
};

test("rejects a config with no mint, owner or tokenAccount", () => {
  // Without a filter it would match every token balance on chain, which is never
  // what was meant — so this fails at construction rather than flooding the STM.
  expect(() =>
    makePrimitive({ mint: undefined })
  ).toThrow(/needs at least one of/);
});

test("accepts a config filtered by owner alone", () => {
  expect(() => makePrimitive({ mint: undefined, owner: OWNER })).not.toThrow();
});

test("accepts a config filtered by tokenAccount alone", () => {
  expect(() =>
    makePrimitive({ mint: undefined, tokenAccount: TOKEN_ACCOUNT })
  ).not.toThrow();
});

test("carries the raw u64 amount through as a string", () => {
  // 2^63 - 1: a value that silently loses precision as a JS number, which is why
  // the grammar types `amount` as a string.
  const huge = "9223372036854775807";
  const out = payloadOf(makePrimitive(), { ...balancePayload, amount: huge });
  expect(out.data[0].accountingPayload.amount).toBe(huge);
  expect(out.data[0].accountingPayload.decimals).toBe(9);
});

test("attributes the event to the owner", () => {
  const out = payloadOf(makePrimitive(), balancePayload);
  expect(out.data[0].fromAddressAndType.address).toBe(OWNER);
});

test("falls back to the token account when the RPC omitted the owner", () => {
  // `owner` is optional in the RPC's token balance record. The balance is still
  // valid state, so it is reported against the token account rather than dropped.
  const out = payloadOf(makePrimitive(), { ...balancePayload, owner: undefined });
  expect(out.data[0].fromAddressAndType.address).toBe(TOKEN_ACCOUNT);
  expect(out.data[0].accountingPayload.owner).toBe("");
});

test("builds a state machine payload prefixed by stateMachinePrefix", () => {
  const out = payloadOf(makePrimitive(), balancePayload);
  expect(out.data[0].stateMachinePayload).not.toBeNull();
  expect(out.data[0].stateMachinePayload[0]).toBe("solana-token-account");
});

test("emits no state machine payload when no prefix is configured", () => {
  // The accounting row is still written; only STM delivery is skipped. This is the
  // documented meaning of omitting the prefix.
  const out = payloadOf(
    makePrimitive({ stateMachinePrefix: undefined }),
    balancePayload,
  );
  expect(out.data[0].stateMachinePayload).toBeNull();
  expect(out.data[0].accountingPayload.mint).toBe(MINT);
});

test("getConfig round-trips the state machine prefix under both names", () => {
  // Every other builtin emits only `scheduledPrefix`, which the Primitive
  // constructor does not read — so a config round-tripped through getConfig() loses
  // its STM routing. Emitting both makes this primitive survive that trip.
  const config = makePrimitive().getConfig() as Record<string, unknown>;
  expect(config.stateMachinePrefix).toBe("solana-token-account");
  expect(config.scheduledPrefix).toBe("solana-token-account");
  expect(config.type).toBe("SOLANA:TokenAccount");
  expect(config.mint).toBe(MINT);
});
