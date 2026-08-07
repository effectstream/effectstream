import { test, expect } from "bun:test";
import { UmbraClient } from "../src/sync-protocols/midnight/UmbraClient.ts";
import { assertExactlyOneMidnightSource } from "@effectstream/config";

// These cover the parts of the UmbraDB-backed path that must fail LOUDLY. Every one of them is a
// case where the alternative failure mode is silence: a feed that returns nothing, a timestamp
// that becomes NaN, a config that reads from the wrong place. Silence is the dangerous outcome in
// a migration whose whole promise is "the state machine still fires at the same heights", because
// a state machine that never fires looks exactly like a chain where nothing happened.
//
// The live read path itself (real archive rows -> real state-machine inputs) is covered end to
// end by the e2e differential suite against a real node, indexer and archive; unit tests here
// would need a Postgres instance to add anything the differential does not already prove.

test("assertPrimitivesSupported accepts ZswapRoot", () => {
  expect(() => UmbraClient.assertPrimitivesSupported(["Midnight:ZswapRoot"])).not.toThrow();
});

test("assertPrimitivesSupported rejects every replay-gated primitive, by name", () => {
  for (
    const t of [
      "Midnight:NullifierAndCommitment",
      "Midnight:UnshieldedSpend",
      "Midnight:UnshieldedCreate",
      "Midnight:TokenMint",
      "Midnight:Generic",
    ]
  ) {
    expect(() => UmbraClient.assertPrimitivesSupported([t])).toThrow(t);
  }
});

test("assertPrimitivesSupported names ALL unsupported primitives, not just the first", () => {
  // A config flipped wholesale to UmbraDB has several unsupported primitives at once; reporting
  // one at a time turns one fix into several round trips.
  let message = "";
  try {
    UmbraClient.assertPrimitivesSupported([
      "Midnight:ZswapRoot",
      "Midnight:TokenMint",
      "Midnight:Generic",
    ]);
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toContain("Midnight:TokenMint");
  expect(message).toContain("Midnight:Generic");
  // The supported one must not be reported as a problem.
  expect(message.split("Supported today")[0]).not.toContain("Midnight:ZswapRoot");
});

test("a schema name that is not a plain identifier is refused before it reaches a query", () => {
  // `pg` cannot parameterize an identifier, so the schema is interpolated into the SQL text.
  // This is the boundary that keeps a config value from becoming query syntax.
  for (const bad of ['chain_archive"; drop table blocks; --', "chain archive", "1archive", ""]) {
    expect(() =>
      new UmbraClient({ databaseUrl: "postgres://localhost/x", schema: bad, net: "n" })
    ).toThrow(/plain SQL identifier/);
  }
});

test("exactly-one-source rejects both, neither, and an empty indexer string", () => {
  const umbra = { databaseUrl: "postgres://localhost/x", net: "undeployed" };
  expect(() => assertExactlyOneMidnightSource("p", { indexer: "http://i", umbra }))
    .toThrow(/both/);
  expect(() => assertExactlyOneMidnightSource("p", {})).toThrow(/neither/);
  // An empty string is a misconfiguration, not a source -- otherwise it would silently count as
  // "indexer configured" and defeat the neither-set check.
  expect(() => assertExactlyOneMidnightSource("p", { indexer: "" })).toThrow(/neither/);
  expect(() => assertExactlyOneMidnightSource("p", { indexer: "http://i" })).not.toThrow();
  expect(() => assertExactlyOneMidnightSource("p", { umbra })).not.toThrow();
});

test("the exactly-one-source error names the offending protocol", () => {
  // Configs carry several Midnight entries during a migration (one umbra, one residual indexer),
  // so an error that does not say which one is barely actionable.
  expect(() => assertExactlyOneMidnightSource("parallelMidnightUmbra", {}))
    .toThrow(/parallelMidnightUmbra/);
});
