// Pure planning for the bridge state machine: chain inputs -> idempotent
// row operations. No database, no I/O; state-machine.ts applies the ops with
// World.resolve, and the unit tests drive both over recorded P0 payloads.
//
// Mapping (sub-plan T3.3):
//   Solana LOCK log            -> s2m observed     (lock nonce)
//   Solana RELEASE log         -> m2s completed    (withdrawal id)
//   Midnight snapshot
//     every mintedLocks key    -> s2m completed    (lock nonce)
//     every withdrawals entry  -> m2s observed     (withdrawal id)
// A snapshot carries the FULL ledger, so it is reconciled entry by entry:
// several locks or withdrawals between two snapshots (or coalesced into one)
// are all picked up, and replaying a snapshot changes nothing.
import bs58 from "bs58";
import { parseBridgeLogs } from "@solana-midnight-bridge/contracts-solana/instructions";

export type StfOp =
  | {
      kind: "lock-observed";
      nonce: bigint;
      amount: bigint;
      /** 128 lowercase hex: Midnight coin public key || encryption public key. */
      recipientHex: string;
      depositor: string;
      slot: number;
    }
  | { kind: "release-completed"; withdrawalId: bigint; amount: bigint; recipientOwner: string; slot: number }
  | { kind: "mint-completed"; nonce: bigint; amount: bigint }
  | { kind: "withdrawal-observed"; withdrawalId: bigint; amount: bigint; solanaRecipient: string };

const U64_MAX = 0xffff_ffff_ffff_ffffn;
const DEC_RE = /^(0|[1-9][0-9]{0,19})$/;
const HEX32_RE = /^(0x)?[0-9a-fA-F]{64}$/;

function u64(v: unknown): bigint | null {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v !== "string" || !DEC_RE.test(v)) return null;
  const b = BigInt(v);
  return b <= U64_MAX ? b : null;
}

export type SolanaLogInput = { slot: number; programId: string; logMessages: string[] };

/**
 * Bridge lines of one Solana transaction, in order. Inputs from another
 * program, or LOCKs of another mint (when `expectedMint` is given), are
 * ignored. INIT lines carry nothing to settle.
 */
export function planSolanaLogs(
  input: SolanaLogInput,
  opts: { programId: string; expectedMint?: string },
): StfOp[] {
  if (input.programId !== opts.programId) return [];
  const ops: StfOp[] = [];
  for (const log of parseBridgeLogs(input.logMessages)) {
    if (log.kind === "LOCK") {
      if (opts.expectedMint && log.mint !== opts.expectedMint) continue;
      ops.push({
        kind: "lock-observed",
        nonce: log.nonce,
        amount: log.amount,
        recipientHex: log.recipientHex,
        depositor: log.depositor,
        slot: input.slot,
      });
    } else if (log.kind === "RELEASE") {
      ops.push({
        kind: "release-completed",
        withdrawalId: log.withdrawalId,
        amount: log.amount,
        recipientOwner: log.recipientOwner,
        slot: input.slot,
      });
    }
  }
  return ops;
}

const strip0x = (h: string) => (h.startsWith("0x") ? h.slice(2) : h).toLowerCase();

/**
 * Every entry of one Midnight:Generic snapshot. Malformed entries are skipped
 * and reported in `rejected` (they cannot come from the bridge contract's own
 * ledger, so they are never settled). A snapshot whose sealed `sourceMint`
 * differs from `expectedSourceMint` (32-byte hex) is rejected whole.
 */
export function planMidnightSnapshot(
  payload: unknown,
  opts: { expectedSourceMint?: string } = {},
): { ops: StfOp[]; rejected: string[] } {
  const ops: StfOp[] = [];
  const rejected: string[] = [];
  if (!payload || typeof payload !== "object") return { ops, rejected: ["payload is not an object"] };
  const p = payload as Record<string, unknown>;
  if (opts.expectedSourceMint !== undefined) {
    const sm = typeof p.sourceMint === "string" ? strip0x(p.sourceMint) : null;
    if (sm !== strip0x(opts.expectedSourceMint)) {
      return { ops, rejected: [`sourceMint ${String(p.sourceMint)} is not the deployment's mint`] };
    }
  }
  const minted = p.mintedLocks;
  if (minted && typeof minted === "object") {
    for (const [k, v] of Object.entries(minted as Record<string, unknown>)) {
      const nonce = u64(k);
      const amount = u64(v);
      if (nonce === null || amount === null) {
        rejected.push(`mintedLocks[${k}]`);
        continue;
      }
      ops.push({ kind: "mint-completed", nonce, amount });
    }
  } else if (minted !== undefined) {
    rejected.push("mintedLocks is not a map");
  }
  const withdrawals = p.withdrawals;
  if (withdrawals && typeof withdrawals === "object") {
    for (const [k, v] of Object.entries(withdrawals as Record<string, unknown>)) {
      const id = u64(k);
      const w = v as { solanaRecipient?: unknown; amount?: unknown } | null;
      const amount = u64(w?.amount);
      const hex = typeof w?.solanaRecipient === "string" && HEX32_RE.test(w.solanaRecipient)
        ? strip0x(w.solanaRecipient)
        : null;
      if (id === null || amount === null || hex === null) {
        rejected.push(`withdrawals[${k}]`);
        continue;
      }
      ops.push({
        kind: "withdrawal-observed",
        withdrawalId: id,
        amount,
        solanaRecipient: bs58.encode(Buffer.from(hex, "hex")),
      });
    }
  } else if (withdrawals !== undefined) {
    rejected.push("withdrawals is not a map");
  }
  return { ops, rejected };
}
