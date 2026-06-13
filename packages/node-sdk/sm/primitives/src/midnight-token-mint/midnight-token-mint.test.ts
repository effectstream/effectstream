import { test, expect } from "bun:test";
// Import via mod.ts (not the primitive file directly) to avoid the
// primitive ⇄ @effectstream/sm ⇄ mod.ts init cycle — same as erc20-primitive.test.ts.
import { MidnightTokenMintPrimitive } from "../mod.ts";
import { PrimitiveRegistry } from "../../PrimitiveRegistry.ts";

// Minimal view strategy — the IVM only calls strategy.createView(...).
const STRATEGY = {
  migrationSuffix: "",
  createView: (name: string, sql: string) => `CREATE VIEW ${name} AS ${sql};`,
} as any;

function cleanup() {
  // The base constructor registers `this` by instanceName and throws on dupes.
  PrimitiveRegistry.primitives = {};
}

test("MidnightTokenMint - persist defaults to true and owns its table", () => {
  cleanup();
  const p = new MidnightTokenMintPrimitive({
    instanceName: "tok",
    startBlockHeight: 1,
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
    persist: false,
  });
  expect(p.persist).toBe(false);
  // No DDL emitted → createDynamicTables skips it → no table/trigger.
  expect(p.getDynamicTables("tok", STRATEGY)).toBeUndefined();
});
