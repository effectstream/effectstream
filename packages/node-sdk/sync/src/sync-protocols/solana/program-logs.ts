/**
 * Attributing Solana log lines to the program that actually emitted them.
 *
 * A transaction's `meta.logMessages` is a flat, structured stream covering every
 * program the transaction touched:
 *
 * ```
 * Program A invoke [1]
 * Program log: from A
 * Program B invoke [2]          ← A calls B (CPI)
 * Program log: from B
 * Program B consumed 1234 of 200000 compute units
 * Program B success
 * Program log: from A again
 * Program A success
 * ```
 *
 * Two things follow, and the naive `accountKeys.includes(programId)` +
 * substring-match approach gets both wrong:
 *
 *  1. **Presence in `accountKeys` does not mean invocation.** Any transaction
 *     may list an arbitrary account key without calling it. Only an
 *     `invoke [N]` line proves the program ran — which is why this module is
 *     the authorization boundary for the `SOLANA:ProgramLog` primitive. Without
 *     it, an attacker names the watched program as a bare account key, has
 *     their *own* program emit the expected text, and the primitive reports it
 *     as the watched program's event with an attacker-chosen payload.
 *  2. **Log lines belong to the innermost frame.** Forwarding every line in the
 *     transaction hands the state machine other programs' output under the
 *     watched program's name.
 *
 * Reading the stream also fixes an ALT blind spot for free: a program invoked
 * via an address lookup table is absent from `message.accountKeys` (which holds
 * static keys only) but always appears in its `invoke` line.
 */

/** `Program <id> invoke [<depth>]` — pushes a frame. */
const INVOKE_RE = /^Program (\S+) invoke \[\d+\]$/;
/** `Program <id> success` — pops a frame. */
const SUCCESS_RE = /^Program (\S+) success$/;
/** `Program <id> failed: <reason>` — pops a frame. */
const FAILED_RE = /^Program (\S+) failed: /;
/** `Program <id> consumed <n> of <m> compute units` — metering noise, not output. */
const CONSUMED_RE = /^Program (\S+) consumed \d+ of \d+ compute units$/;

/**
 * The log lines `programId` itself emitted in this transaction, or `null` if it
 * was never invoked.
 *
 * An empty array is meaningful and distinct from `null`: the program ran but
 * emitted no output of its own (the System Program, for instance, logs only its
 * `invoke`/`success` framing). Callers that care about *invocation* should check
 * for `null`; callers that need *content* should also check `.length`.
 */
export function extractProgramLogs(
  logMessages: readonly string[],
  programId: string,
): string[] | null {
  // Frames currently open, innermost last. Truncated logs can leave this
  // unbalanced, so pops are tolerant of an empty stack.
  const frames: string[] = [];
  const collected: string[] = [];
  let invoked = false;

  for (const line of logMessages) {
    const invoke = INVOKE_RE.exec(line);
    if (invoke) {
      frames.push(invoke[1]);
      if (invoke[1] === programId) invoked = true;
      continue;
    }
    if (SUCCESS_RE.test(line) || FAILED_RE.test(line)) {
      frames.pop();
      continue;
    }
    if (CONSUMED_RE.test(line)) continue;

    if (frames[frames.length - 1] === programId) {
      collected.push(line);
    }
  }

  return invoked ? collected : null;
}
