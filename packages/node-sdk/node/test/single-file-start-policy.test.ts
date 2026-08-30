// Facade guard for project 00034 (spec SC-003 + the single-file goal).
//
// The generic runtime now owns resolution, persistence and reuse, so the
// single-file facade must no longer hand-roll a Midnight tip query, read the
// snapshot table with raw SQL, or pre-read the NTP clock before building the
// config. It just declares `"latest"` and lets the runtime reconcile.

import { describe, expect, test } from "bun:test";

const facade = await Bun.file(
  new URL("../src/single-file.ts", import.meta.url),
).text();

describe("single-file facade delegates start resolution to the runtime", () => {
  test.each([
    ["resolveStartHeights", /resolveStartHeights/],
    ["fetchLatestHeight", /fetchLatestHeight/],
    ["readConfigSnapshot", /readConfigSnapshot/],
    ["numberFromSnapshot", /numberFromSnapshot/],
    ["ResolvedSource", /ResolvedSource/],
  ])("no longer defines or calls %s", (_name, pattern) => {
    expect(facade).not.toMatch(pattern as RegExp);
  });

  test("no longer issues a hand-rolled tip GraphQL query", () => {
    expect(facade).not.toMatch(/block\s*\{\s*height\s*\}/);
  });

  test("no longer reads the snapshot table with raw SQL", () => {
    expect(facade).not.toMatch(/sync_protocol_config_snapshot/);
    expect(facade).not.toMatch(/42P01/);
  });

  test('passes the declared start (including "latest") straight through', () => {
    expect(facade).toMatch(/startBlockHeight:\s*source\.startBlockHeight/);
  });

  test("stops copying a resolved height into the primitive", () => {
    // The primitive inherits the protocol's committed numeric start (FR-007),
    // so the primitive literal must not repeat a start height.
    const start = facade.indexOf("primitive: {");
    expect(start).toBeGreaterThan(-1);
    const primitiveBlock = facade.slice(start, facade.indexOf("}", start));
    expect(primitiveBlock).not.toMatch(/startBlockHeight/);
  });
});

describe("the facade surface is unchanged", () => {
  test('midnightContract still accepts "latest" and numeric starts', async () => {
    const { midnightContract } = await import("../src/single-file.ts");
    expect(
      midnightContract({
        network: "preview",
        address: "a".repeat(64),
        startBlockHeight: "latest",
        ledger: { round: "uint128" },
      }).startBlockHeight,
    ).toBe("latest");
    expect(
      midnightContract({
        network: "preview",
        address: "a".repeat(64),
        startBlockHeight: 12,
        ledger: { round: "uint128" },
      }).startBlockHeight,
    ).toBe(12);
  });

  test("runNode and pglite are still exported", async () => {
    const facadeModule = await import("../src/single-file.ts");
    expect(typeof facadeModule.runNode).toBe("function");
    expect(typeof facadeModule.pglite).toBe("function");
  });
});
