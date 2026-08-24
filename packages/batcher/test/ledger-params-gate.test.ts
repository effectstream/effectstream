// The intake gate for live ledger parameters.
//
// Validating against parameters we know to be wrong is worse than admitting we
// cannot validate — so when the cache has nothing usable, intake fails CLOSED.
// The status matters as much as the refusal: the input was never judged, so
// reporting 400 would tell the caller their transaction is malformed when in
// fact our indexer is down.

import { expect, test } from "bun:test";
import { ledgerParamsGateVerdict } from "../adapters/midnight-balancing-adapter.ts";
import type { LedgerParamsLookup } from "../adapters/ledger-params-cache.ts";
import { LedgerParameters } from "@midnight-ntwrk/ledger-v8";

test("usable parameters produce no verdict — intake continues", () => {
  const ok: LedgerParamsLookup = {
    ok: true,
    params: LedgerParameters.initialParameters(),
    height: 42,
    ageMs: 1_000,
  };
  expect(ledgerParamsGateVerdict(ok)).toBeUndefined();
});

test("never-fetched fails closed with 503, not 400", () => {
  const verdict = ledgerParamsGateVerdict({
    ok: false,
    reason: "never-fetched",
  })!;
  expect(verdict.valid).toBe(false);
  expect(verdict.statusCode).toBe(503);
  expect(verdict.errorCode).toBe("LEDGER_PARAMS_UNAVAILABLE");
  // Retryable: the transaction may well be fine; we simply could not say.
  expect(verdict.retryable).toBe(true);
  expect(verdict.error).toContain("never-fetched");
});

test("stale parameters are refused, not used", () => {
  // The tempting bug is to serve the last known snapshot. Parameters we KNOW
  // to be out of date are exactly what the cache exists to avoid.
  const verdict = ledgerParamsGateVerdict({
    ok: false,
    reason: "stale",
    ageMs: 900_000,
  })!;
  expect(verdict.valid).toBe(false);
  expect(verdict.statusCode).toBe(503);
  expect(verdict.error).toContain("stale");
});

test("the reason reaches the caller, so a 503 is diagnosable", () => {
  const a = ledgerParamsGateVerdict({ ok: false, reason: "never-fetched" })!;
  const b = ledgerParamsGateVerdict({ ok: false, reason: "stale", ageMs: 1 })!;
  expect(a.error).not.toEqual(b.error);
});
