import { test, expect } from "bun:test";
import { run } from "effection";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@effectstream/config";
// Import via mod.ts (not the primitive file directly) to avoid the
// primitive ⇄ @effectstream/sm ⇄ mod.ts init cycle — same as erc20-primitive.test.ts.
import { MidnightTokenMintPrimitive } from "../mod.ts";
import { PrimitiveRegistry } from "../../PrimitiveRegistry.ts";

// Minimal view strategy — the IVM only calls strategy.createView(...).
const STRATEGY = {
  migrationSuffix: "",
  createView: (name: string, sql: string) => `CREATE VIEW ${name} AS ${sql};`,
} as any;

const MOCK_TX_DATA = {
  output: {
    payload: {
      contractAddress: "0200abcd",
      domainSep: "ab".repeat(32),
      rawTokenType: "cd".repeat(32),
      kind: "shielded",
      amount: "18446744073709551615", // u64 max — exceeds MAX_SAFE_INTEGER
      txHash: "ef".repeat(32),
      entryPoint: "mint",
    },
  },
} as unknown as FlattenSyncProtocolIOFor<
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL
>;

function cleanup() {
  // The base constructor registers `this` by instanceName and throws on dupes.
  PrimitiveRegistry.primitives = {};
}

function getPayloadOnce(p: MidnightTokenMintPrimitive) {
  let item: any;
  run(function* () {
    const result = p.getPayload(123, MOCK_TX_DATA).next().value;
    if (!result || !("isBatched" in result)) {
      throw new Error("No payload generated");
    }
    item = result.data[0];
  });
  return item;
}

test("MidnightTokenMint - persist defaults to true and owns its table", () => {
  cleanup();
  const p = new MidnightTokenMintPrimitive({
    instanceName: "tok",
    startBlockHeight: 1,
    stateMachinePrefix: undefined,
  });
  expect(p.persist).toBe(true);

  const ddl = p.getDynamicTables("tok", STRATEGY);
  expect(ddl).toBeDefined();
  // Owned intermediate table + the trigger on primitive_accounting.
  expect(ddl).toContain("primitives.midnight_token_mint_intermediate_tok");
  expect(ddl).toContain("trigger_update_midnight_token_mint_tok");
  expect(ddl).toContain("effectstream.primitive_accounting");
  expect(p.getViewPrefix()).toContain("midnight_token_mint_view_");
});

test("MidnightTokenMint - persist:false disables the owned table", () => {
  cleanup();
  const p = new MidnightTokenMintPrimitive({
    instanceName: "tok",
    startBlockHeight: 1,
    stateMachinePrefix: undefined,
    persist: false,
  });
  expect(p.persist).toBe(false);
  // No DDL emitted → createDynamicTables skips it → no table/trigger.
  expect(p.getDynamicTables("tok", STRATEGY)).toBeUndefined();
});

test("MidnightTokenMint - hyphenated instance names are sanitized, not rejected", () => {
  cleanup();
  // "Midnight-TokenMint" is the repo's own naming convention. Throwing here
  // killed the sync node at startup ("Invalid name: Midnight-TokenMint").
  const p = new MidnightTokenMintPrimitive({
    instanceName: "Midnight-TokenMint",
    startBlockHeight: 1,
    stateMachinePrefix: "midnightTokenMintState",
  });

  const ddl = p.getDynamicTables("Midnight-TokenMint", STRATEGY)!;
  expect(ddl).toContain(
    "primitives.midnight_token_mint_view_midnighttokenmint",
  );
  expect(ddl).toContain(
    "primitives.midnight_token_mint_intermediate_midnighttokenmint",
  );
  // No hyphen may survive into an SQL identifier.
  expect(ddl).not.toContain("midnight_token_mint_view_midnight-tokenmint");
});

test("MidnightTokenMint - owning a table does not suppress the STM input", () => {
  cleanup();
  const p = new MidnightTokenMintPrimitive({
    instanceName: "tok",
    startBlockHeight: 1,
    stateMachinePrefix: "midnightTokenMintState",
  });

  // Both paths are live at once: owned table DDL *and* an STM payload.
  expect(p.getDynamicTables("tok", STRATEGY)).toBeDefined();
  expect(p.getConfig().scheduledPrefix).toBe("midnightTokenMintState");

  const item = getPayloadOnce(p);
  expect(Array.isArray(item.stateMachinePayload)).toBe(true);
  expect(item.stateMachinePayload[0]).toBe("midnightTokenMintState");
  // Flat fields, in grammar order, so the STM handler reads them by name.
  expect(item.accountingPayload.rawTokenType).toBe("cd".repeat(32));
  expect(item.accountingPayload.amount).toBe("18446744073709551615");
});

test("MidnightTokenMint - no prefix means accounting only (opt-out is explicit)", () => {
  cleanup();
  const p = new MidnightTokenMintPrimitive({
    instanceName: "tok",
    startBlockHeight: 1,
    stateMachinePrefix: undefined,
  });

  const item = getPayloadOnce(p);
  expect(item.stateMachinePayload).toBe(null);
  // The accounting row (and therefore the owned table) is still written.
  expect(item.accountingPayload.rawTokenType).toBe("cd".repeat(32));
});
