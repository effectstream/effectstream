/**
 * The acceptance window for a signed input (spec FR-011).
 *
 * WHY THIS EXISTS. Retention and replay protection share fate. The dedup gate
 * can only recognise a replay while the original request's record still exists,
 * so "the batcher never pays twice" holds exactly as long as records are kept.
 * Keeping them forever is not an option (FR-007 caps retention at a TTL), so
 * the other side has to be bounded too: the batcher must refuse a signature
 * older than the window it can still remember. Before this, no such bound
 * existed anywhere in core — `batchInput` never compared `input.timestamp` to
 * the clock — which made FR-007's "TTL much larger than the window" a statement
 * about a quantity that did not exist.
 *
 * Kept separate from `batcher.ts` so the parse rule can be tested as a pure
 * function, and so nothing has to construct a Batcher to reason about a string.
 */

import { InputValidationError } from "./errors.ts";

/**
 * How far ahead of our clock a signed timestamp may be.
 *
 * Client clocks are not synchronised with ours, and a wallet running a minute
 * fast is submitting a correct request. Five minutes is the usual allowance for
 * this class of check (it is what NTP-unsynchronised consumer clocks drift to
 * in practice) and it is small next to the one-hour default window, so it
 * widens the replay surface by ~8% rather than doubling it.
 */
export const MAX_FUTURE_SKEW_MS = 300_000;

/** The signed timestamp is older than the batcher will accept. */
export const INPUT_TIMESTAMP_EXPIRED = "INPUT_TIMESTAMP_EXPIRED";
/**
 * The signed timestamp is further ahead of our clock than skew allows.
 *
 * Deliberately NOT the same code as EXPIRED, though the brief permitted
 * sharing: the remedies point in opposite directions. "Expired" means re-sign;
 * this means the client's clock is wrong, and telling that caller their request
 * was too OLD would send them looking the wrong way.
 */
export const INPUT_TIMESTAMP_IN_FUTURE = "INPUT_TIMESTAMP_IN_FUTURE";
/** The signed timestamp is not a time we can read in any supported format. */
export const INPUT_TIMESTAMP_UNREADABLE = "INPUT_TIMESTAMP_UNREADABLE";

/**
 * Read a signed `timestamp` field into epoch milliseconds, or `undefined` when
 * it is not a time at all.
 *
 * TWO FORMATS, and the ORDER MATTERS. The repo does not sign one shape: most
 * producers use `Date.now().toString()`, some send `Date.now()` as a JSON
 * number that ajv coerces to a string, and two — `e2e/bitcoin/run-tests.ts`
 * (where the timestamp is part of the SIGNED message) and
 * `templates/zswap-da/src/services/api.ts` — sign ISO-8601. A gate that
 * accepted only epoch-ms would have refused both, silently, at admission.
 *
 * Digits are tried FIRST because `Date.parse` misreads short numeric strings as
 * calendar years: `Date.parse("1755")` is the year 1755 and `Date.parse("0")`
 * is the year 2000. Trying ISO first would therefore place a small epoch value
 * three centuries away, and read `"0"` as recent — the wrong answer in the
 * dangerous direction.
 *
 * No trimming. The exact bytes are what the wallet signed and what the request
 * id hashes; accepting a padded variant here would mean the gate and the
 * signature disagreed about what the request IS.
 */
export function parseInputTimestamp(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : undefined;
  }
  if (typeof raw !== "string" || raw.length === 0) return undefined;

  if (/^[0-9]+$/.test(raw)) {
    const epochMs = Number(raw);
    return Number.isFinite(epochMs) ? epochMs : undefined;
  }

  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Refuse an input whose signed timestamp is outside the acceptance window.
 *
 * Throws {@link InputValidationError} with a stable code and `retryable: false`
 * — for an expired input, re-sending the identical bytes only ever gets older,
 * so advising a retry would be advice that can never come true.
 *
 * The window is inclusive at its far edge: an input whose age is exactly
 * `maxInputAgeMs` is still accepted. A boundary has to fall on one side, and
 * accepting it means a client that signs and submits in the same instant at the
 * limit is not refused by a millisecond of our own scheduling.
 */
export function assertInputIsFresh(
  timestamp: unknown,
  maxInputAgeMs: number,
  now: number = Date.now(),
): void {
  const signedAt = parseInputTimestamp(timestamp);
  if (signedAt === undefined) {
    throw new InputValidationError(
      `Input timestamp is unreadable. Expected epoch milliseconds ` +
        `(e.g. "${now}") or an ISO-8601 instant ` +
        `(e.g. "${new Date(now).toISOString()}").`,
      400,
      INPUT_TIMESTAMP_UNREADABLE,
      false,
    );
  }

  const age = now - signedAt;
  if (age > maxInputAgeMs) {
    throw new InputValidationError(
      `Input timestamp is too old: signed ${age} ms ago, and this batcher ` +
        `accepts inputs up to ${maxInputAgeMs} ms old. Sign a fresh request.`,
      400,
      INPUT_TIMESTAMP_EXPIRED,
      false,
    );
  }

  if (age < -MAX_FUTURE_SKEW_MS) {
    throw new InputValidationError(
      `Input timestamp is ${-age} ms in the future, beyond the ` +
        `${MAX_FUTURE_SKEW_MS} ms clock skew this batcher tolerates. ` +
        `Check the signing client's clock.`,
      400,
      INPUT_TIMESTAMP_IN_FUTURE,
      false,
    );
  }
}
