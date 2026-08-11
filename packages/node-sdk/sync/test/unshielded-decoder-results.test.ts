import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeUnshieldedCreates } from "../src/sync-protocols/midnight/unshielded-decoder.ts";

/**
 * Covers how the decoder treats a transaction's applied RESULT — gaps §2.2 (`FAILURE`) and §2.3
 * (`PARTIAL_SUCCESS`).
 *
 * These need no chain. The result is an *argument* to the decoder, not something read out of the
 * transaction bytes, so the refusal logic is exercised by passing each value. That matters, because
 * producing a genuinely failed transaction on a devnet is awkward and — see the note below — would
 * not even reach this code path today.
 *
 * The reference is unambiguous about why these must refuse rather than decode:
 *   - `FAILURE` -> the ledger early-returns; NOTHING was created, so emitting the transaction's
 *     offers would invent UTXOs that never existed.
 *   - `PARTIAL_SUCCESS` -> only the SUCCESSFUL segments' fallible outputs count, and the archive
 *     carries no segment map, so emitting them unfiltered over-reports.
 *
 * **The gap this does not close, stated plainly.** Stock UmbraDB never populates
 * `transactions.result`, so on the demo stack a failed transaction arrives here as `undefined`, not
 * `"failure"` — and under the devnet waiver its offers WOULD be emitted. End-to-end coverage of a
 * real failed transaction is therefore blocked on the archive recording results at all (plan
 * dependency B3), not on constructing one. The differential's precondition check is what stands in
 * for it meanwhile.
 */

const FIXTURE = join(import.meta.dir, "fixtures", "both-sections-intent.hex");
const rawBytes = Uint8Array.from(Buffer.from(readFileSync(FIXTURE, "utf8").trim(), "hex"));

const decode = (result: string | undefined, waive: boolean) =>
  decodeUnshieldedCreates(rawBytes, result, "undeployed", "fixture-results", {
    unsafeTreatUnknownResultAsSuccess: waive,
  });

test("a KNOWN failure is refused — the ledger created nothing, so the offers must not be emitted", () => {
  const outcome = decode("failure", false);
  expect(outcome.ok).toBe(false);
  if (outcome.ok) return;
  expect(outcome.refusal.reason).toBe("result_unknown_or_not_success");
});

test("a KNOWN partial success is refused — the archive has no segment map to filter by", () => {
  const outcome = decode("partial_success", false);
  expect(outcome.ok).toBe(false);
  if (outcome.ok) return;
  expect(outcome.refusal.reason).toBe("result_unknown_or_not_success");
});

test("the unsafe waiver does NOT override a KNOWN failure or partial success", () => {
  // This is the whole point of splitting the check in two. The waiver exists because stock UmbraDB
  // records no result at all; it must never extend to a transaction the archive positively tells us
  // did not fully apply. Deleting or commenting out the check — the obvious shortcut — would waive
  // all three cases and silently invent UTXOs.
  for (const known of ["failure", "partial_success"]) {
    const outcome = decode(known, true);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal.reason).toBe("result_unknown_or_not_success");
  }
});

test("an UNKNOWN result refuses by default and proceeds only under the waiver", () => {
  const strict = decode(undefined, false);
  expect(strict.ok).toBe(false);

  const waived = decode(undefined, true);
  expect(waived.ok).toBe(true);
  if (waived.ok) expect(waived.outputs.length).toBeGreaterThan(0);
});

test("an explicit success decodes without any waiver", () => {
  const outcome = decode("success", false);
  expect(outcome.ok).toBe(true);
  if (outcome.ok) expect(outcome.outputs.length).toBeGreaterThan(0);
});
