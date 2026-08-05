/**
 * Client helpers for the e2e test program. Mirrors the shape template
 * `contracts-*` packages expose, so a template can crib from this directly.
 */
import {
  PublicKey,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import {
  DISCRIMINANT_EMIT,
  EVENT_PREFIX,
  TEST_EVENT_PROGRAM_ID,
} from "./program-id.ts";

export { DISCRIMINANT_EMIT, EVENT_PREFIX, TEST_EVENT_PROGRAM_ID };

export const TEST_EVENT_PROGRAM = new PublicKey(TEST_EVENT_PROGRAM_ID);

/**
 * `emit(value)` — the program logs `E2E_SOLANA_EVENT|<authority>|<value>`.
 * The authority signs; no state accounts are involved.
 */
export function createEmitInstruction(
  authority: PublicKey,
  value: bigint | number,
): TransactionInstruction {
  const data = Buffer.alloc(9);
  data[0] = DISCRIMINANT_EMIT;
  data.writeBigUInt64LE(BigInt(value), 1);

  const keys: AccountMeta[] = [
    { pubkey: authority, isSigner: true, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: TEST_EVENT_PROGRAM,
    data,
  });
}

/** Parse a log line the program emitted. Returns null if it isn't one. */
export function parseEventLog(
  line: string,
): { authority: string; value: number } | null {
  const idx = line.indexOf(EVENT_PREFIX);
  if (idx === -1) return null;
  const [, authority, value] = line.slice(idx).split("|");
  if (!authority || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return { authority, value: parsed };
}
