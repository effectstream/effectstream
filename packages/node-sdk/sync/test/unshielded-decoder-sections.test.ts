import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeUnshieldedCreates } from "../src/sync-protocols/midnight/unshielded-decoder.ts";

/**
 * Covers the two decode rules that are ONLY observable when a single intent carries unshielded
 * outputs in BOTH sections:
 *
 *   1. `outputIndex` restarts at 0 for each section. A shared counter would make the fallible rows
 *      start at the guaranteed count instead.
 *   2. Guaranteed rows hash with `intentHash(0)` while fallible rows hash with
 *      `intentHash(<that intent's segment>)` — in the SAME transaction, so the two hashes must
 *      differ.
 *
 * Separate transactions cannot test either: in a guaranteed-only transaction the index starts at 0
 * whether the counter is shared or not, and likewise fallible-only. The live corpus has exactly
 * that shape (guaranteed rows in one transaction, fallible in another), which is why this fixture
 * exists.
 *
 * **Why a fixture instead of a live transaction.** This shape constructs and finalizes cleanly but
 * the node REJECTS it at submission — measured three times — because each section must balance
 * independently by value and fees come out of the guaranteed section. The decode rules, though, are
 * a pure function of the transaction bytes: the decoder never needs the chain to have accepted
 * them. So the bytes are committed and this test needs no chain, no wallet, and no dust.
 *
 * Regenerate with `bun e2e/midnight-umbra/make-both-sections-fixture.ts` if the ledger format
 * changes.
 */

const FIXTURE = join(import.meta.dir, "fixtures", "both-sections-intent.hex");
const rawBytes = Uint8Array.from(Buffer.from(readFileSync(FIXTURE, "utf8").trim(), "hex"));

// The fixture is not on any chain, so no archive records a result for it; the decoder's strict
// default would refuse. The waiver is the same one the devnet demo runs under.
const decode = () =>
  decodeUnshieldedCreates(rawBytes, undefined, "undeployed", "fixture-both-sections", {
    unsafeTreatUnknownResultAsSuccess: true,
  });

test("the fixture really does carry both sections (guard against a silently degraded fixture)", () => {
  const outcome = decode();
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  const guaranteed = outcome.outputs.filter((o) => o.section === "guaranteed");
  const fallible = outcome.outputs.filter((o) => o.section === "fallible");
  // If a regenerated fixture ever lost one section, every assertion below would still pass
  // vacuously — so fail here instead.
  expect(guaranteed.length).toBeGreaterThanOrEqual(2);
  expect(fallible.length).toBeGreaterThanOrEqual(1);
});

test("outputIndex restarts at 0 for each section, rather than sharing one counter", () => {
  const outcome = decode();
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;

  const guaranteed = outcome.outputs.filter((o) => o.section === "guaranteed");
  const fallible = outcome.outputs.filter((o) => o.section === "fallible");

  expect(guaranteed.map((o) => o.outputIndex)).toEqual(guaranteed.map((_, i) => i));
  // The load-bearing assertion: with a shared counter these would be [3, 4], not [0, 1].
  expect(fallible.map((o) => o.outputIndex)).toEqual(fallible.map((_, i) => i));
  expect(fallible[0]!.outputIndex).toBe(0);
});

test("guaranteed and fallible rows of one intent carry DIFFERENT intent hashes", () => {
  const outcome = decode();
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;

  const guaranteedHashes = new Set(
    outcome.outputs.filter((o) => o.section === "guaranteed").map((o) => o.intentHash));
  const fallibleHashes = new Set(
    outcome.outputs.filter((o) => o.section === "fallible").map((o) => o.intentHash));

  // Within a section every row shares one hash...
  expect(guaranteedHashes.size).toBe(1);
  expect(fallibleHashes.size).toBe(1);
  // ...and across sections they must differ, because the segment argument differs (0 vs the
  // intent's own segment). Using one rule for both — the original bug — collapses these to one
  // value, so this is what catches a regression to it.
  const [g] = [...guaranteedHashes];
  const [f] = [...fallibleHashes];
  expect(g).not.toBe(f);
  expect(g).toMatch(/^[0-9a-f]{64}$/);
  expect(f).toMatch(/^[0-9a-f]{64}$/);
});

test("every row is still fully formed (owner Bech32m, decimal value, hex token type)", () => {
  const outcome = decode();
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  for (const o of outcome.outputs) {
    expect(o.owner).toMatch(/^mn_addr_undeployed1[0-9a-z]+$/);
    expect(o.value).toMatch(/^\d+$/);
    expect(o.tokenType).toMatch(/^[0-9a-f]{64}$/);
  }
});
