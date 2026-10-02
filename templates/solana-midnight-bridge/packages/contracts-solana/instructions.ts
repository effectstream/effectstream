// Instruction builders, PDA derivations, account decoders and the shared log
// parser for the bridge program. Byte layouts must match
// programs/bridge/src/lib.rs.
//
// Every builder takes the program id explicitly: local mode uses
// LOCAL_BRIDGE_PROGRAM_ID, live mode the id from deployments/<mode>.json.
// `parseBridgeLog` is pure (no RPC) and is shared with the state machine.
import { Buffer } from "node:buffer";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  AUTHORITY_SEED,
  BRIDGE_LOG_PREFIX,
  CONFIG_LEN,
  CONFIG_SEED,
  IX_INITIALIZE,
  IX_LOCK,
  IX_RELEASE,
  MIDNIGHT_RECIPIENT_LEN,
  RECEIPT_LEN,
  RELEASE_SEED,
  VAULT_SEED,
} from "./program-id.ts";

const U64_MAX = 0xffff_ffff_ffff_ffffn;

/** Little-endian u64, refusing anything outside [0, 2^64). */
export function u64le(v: bigint): Buffer {
  if (v < 0n || v > U64_MAX) throw new RangeError(`not a u64: ${v}`);
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}

// ── PDAs ─────────────────────────────────────────────────────────────────────

/** `["config"]` — operator, mint, lock_nonce, bumps. */
export function findConfigAddress(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
}

/** `["authority"]` — no data; SPL owner of the vault, signs releases. */
export function findAuthorityAddress(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([AUTHORITY_SEED], programId);
}

/** `["vault", mint]` — a plain PDA token account (not an ATA). */
export function findVaultAddress(
  programId: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_SEED, mint.toBuffer()], programId);
}

/** `["release", withdrawal_id u64 LE]` — exists once that withdrawal is released. */
export function findReceiptAddress(
  programId: PublicKey,
  withdrawalId: bigint,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([RELEASE_SEED, u64le(withdrawalId)], programId);
}

/** Every address one deployment needs, derived from (programId, mint). */
export function deriveBridgeAddresses(programId: PublicKey, mint: PublicKey) {
  const [config] = findConfigAddress(programId);
  const [authority] = findAuthorityAddress(programId);
  const [vault] = findVaultAddress(programId, mint);
  return { config, authority, vault };
}

// ── Instructions ─────────────────────────────────────────────────────────────

/**
 * 0 Initialize { operator } (33 B). Accounts: payer (s,w) · config (w) ·
 * authority · vault (w) · mint · token program · system program.
 *
 * First caller wins: deploy scripts must send this right after the program is
 * deployed and then check the stored operator.
 */
export function createInitializeInstruction(args: {
  programId: PublicKey;
  payer: PublicKey;
  mint: PublicKey;
  operator: PublicKey;
}): TransactionInstruction {
  const { config, authority, vault } = deriveBridgeAddresses(args.programId, args.mint);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([IX_INITIALIZE]), args.operator.toBuffer()]),
  });
}

/**
 * 1 Lock { amount u64, midnight_recipient [64] } (73 B). Accounts: depositor (s) ·
 * source token account (w) · config (w) · vault (w) · token program.
 *
 * `midnightRecipient` is the 64-byte payload of a `mn_shield-addr_…` address:
 * coin public key ‖ encryption public key.
 */
export function createLockInstruction(args: {
  programId: PublicKey;
  depositor: PublicKey;
  source: PublicKey;
  mint: PublicKey;
  amount: bigint;
  midnightRecipient: Uint8Array;
}): TransactionInstruction {
  if (args.midnightRecipient.length !== MIDNIGHT_RECIPIENT_LEN) {
    throw new RangeError(
      `midnightRecipient must be ${MIDNIGHT_RECIPIENT_LEN} bytes, got ${args.midnightRecipient.length}`,
    );
  }
  const [config] = findConfigAddress(args.programId);
  const [vault] = findVaultAddress(args.programId, args.mint);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: args.depositor, isSigner: true, isWritable: false },
      { pubkey: args.source, isSigner: false, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([IX_LOCK]),
      u64le(args.amount),
      Buffer.from(args.midnightRecipient),
    ]),
  });
}

/**
 * 2 Release { withdrawal_id u64, amount u64 } (17 B). Accounts: operator (s) ·
 * payer (s,w; may equal the operator) · config · authority · vault (w) ·
 * destination token account (w) · receipt (w) · token program · system program.
 */
export function createReleaseInstruction(args: {
  programId: PublicKey;
  operator: PublicKey;
  payer: PublicKey;
  mint: PublicKey;
  destination: PublicKey;
  withdrawalId: bigint;
  amount: bigint;
}): TransactionInstruction {
  const { config, authority, vault } = deriveBridgeAddresses(args.programId, args.mint);
  const [receipt] = findReceiptAddress(args.programId, args.withdrawalId);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: args.operator, isSigner: true, isWritable: false },
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: args.destination, isSigner: false, isWritable: true },
      { pubkey: receipt, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([IX_RELEASE]),
      u64le(args.withdrawalId),
      u64le(args.amount),
    ]),
  });
}

/**
 * The ATA-idempotent prelude: creates `owner`'s associated token account for
 * `mint` if it does not exist yet (a no-op otherwise), paid by `payer`.
 */
export function createAtaIdempotentPrelude(args: {
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
}): { ata: PublicKey; instruction: TransactionInstruction } {
  const ata = getAssociatedTokenAddressSync(args.mint, args.owner, true);
  return {
    ata,
    instruction: createAssociatedTokenAccountIdempotentInstruction(
      args.payer,
      ata,
      args.owner,
      args.mint,
    ),
  };
}

/**
 * A complete release for the relayer: `[ATA idempotent create, Release]` paying
 * into `recipientOwner`'s associated token account. Operator and payer sign
 * (they may be the same key).
 */
export function createReleaseWithAtaInstructions(args: {
  programId: PublicKey;
  operator: PublicKey;
  payer: PublicKey;
  mint: PublicKey;
  recipientOwner: PublicKey;
  withdrawalId: bigint;
  amount: bigint;
}): { destination: PublicKey; instructions: TransactionInstruction[] } {
  const prelude = createAtaIdempotentPrelude({
    payer: args.payer,
    owner: args.recipientOwner,
    mint: args.mint,
  });
  return {
    destination: prelude.ata,
    instructions: [
      prelude.instruction,
      createReleaseInstruction({
        programId: args.programId,
        operator: args.operator,
        payer: args.payer,
        mint: args.mint,
        destination: prelude.ata,
        withdrawalId: args.withdrawalId,
        amount: args.amount,
      }),
    ],
  };
}

// ── Account decoders ─────────────────────────────────────────────────────────

export type BridgeConfig = {
  version: number;
  configBump: number;
  authorityBump: number;
  vaultBump: number;
  operator: string;
  mint: string;
  lockNonce: bigint;
};

/** Config account: `version | config_bump | authority_bump | vault_bump | operator[32] | mint[32] | lock_nonce u64`. */
export function decodeConfig(data: Uint8Array): BridgeConfig {
  const b = Buffer.from(data);
  if (b.length < CONFIG_LEN || b[0] !== 1) throw new Error("bridge config not initialized");
  return {
    version: b[0]!,
    configBump: b[1]!,
    authorityBump: b[2]!,
    vaultBump: b[3]!,
    operator: new PublicKey(b.subarray(4, 36)).toBase58(),
    mint: new PublicKey(b.subarray(36, 68)).toBase58(),
    lockNonce: b.readBigUInt64LE(68),
  };
}

export type BridgeReceipt = {
  version: number;
  withdrawalId: bigint;
  recipientOwner: string;
  amount: bigint;
};

/** Receipt account: `version | withdrawal_id u64 | recipient_owner[32] | amount u64`. */
export function decodeReceipt(data: Uint8Array): BridgeReceipt {
  const b = Buffer.from(data);
  if (b.length < RECEIPT_LEN || b[0] !== 1) throw new Error("not a bridge release receipt");
  return {
    version: b[0]!,
    withdrawalId: b.readBigUInt64LE(1),
    recipientOwner: new PublicKey(b.subarray(9, 41)).toBase58(),
    amount: b.readBigUInt64LE(41),
  };
}

// ── Logs ─────────────────────────────────────────────────────────────────────

export type BridgeLog =
  | { kind: "INIT"; operator: string; mint: string; vault: string }
  | {
      kind: "LOCK";
      nonce: bigint;
      depositor: string;
      mint: string;
      amount: bigint;
      /** 128 lowercase hex chars: coin public key ‖ encryption public key. */
      recipientHex: string;
    }
  | { kind: "RELEASE"; withdrawalId: bigint; recipientOwner: string; amount: bigint };

const U64_RE = /^(0|[1-9][0-9]{0,19})$/;
const B58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HEX128_RE = /^[0-9a-f]{128}$/;
const PROGRAM_LOG_PREFIX = "Program log: ";

function parseU64(s: string | undefined): bigint | null {
  if (s === undefined || !U64_RE.test(s)) return null;
  const v = BigInt(s);
  return v <= U64_MAX ? v : null;
}

/**
 * Parses one program log line, with or without the `Program log: ` prefix:
 * - `EFFECTSTREAM_BRIDGE|INIT|<operator>|<mint>|<vault>`
 * - `EFFECTSTREAM_BRIDGE|LOCK|<nonce>|<depositor>|<mint>|<amount>|<recipientHex128>`
 * - `EFFECTSTREAM_BRIDGE|RELEASE|<withdrawal_id>|<recipient_owner>|<amount>`
 *
 * Returns null for anything that is not a well-formed bridge line, including
 * unknown kinds, so callers can feed it every line of a transaction.
 */
export function parseBridgeLog(raw: string): BridgeLog | null {
  const line = raw.startsWith(PROGRAM_LOG_PREFIX) ? raw.slice(PROGRAM_LOG_PREFIX.length) : raw;
  const parts = line.split("|");
  if (parts[0] !== BRIDGE_LOG_PREFIX) return null;
  switch (parts[1]) {
    case "INIT": {
      if (parts.length !== 5) return null;
      const [, , operator, mint, vault] = parts as [string, string, string, string, string];
      if (![operator, mint, vault].every((p) => B58_RE.test(p))) return null;
      return { kind: "INIT", operator, mint, vault };
    }
    case "LOCK": {
      if (parts.length !== 7) return null;
      const [, , nonceS, depositor, mint, amountS, recipientHex] = parts as [
        string, string, string, string, string, string, string,
      ];
      const nonce = parseU64(nonceS);
      const amount = parseU64(amountS);
      if (nonce === null || amount === null) return null;
      if (!B58_RE.test(depositor) || !B58_RE.test(mint) || !HEX128_RE.test(recipientHex)) {
        return null;
      }
      return { kind: "LOCK", nonce, depositor, mint, amount, recipientHex };
    }
    case "RELEASE": {
      if (parts.length !== 5) return null;
      const [, , idS, recipientOwner, amountS] = parts as [string, string, string, string, string];
      const withdrawalId = parseU64(idS);
      const amount = parseU64(amountS);
      if (withdrawalId === null || amount === null || !B58_RE.test(recipientOwner)) return null;
      return { kind: "RELEASE", withdrawalId, recipientOwner, amount };
    }
    default:
      return null;
  }
}

/**
 * Every bridge line of one transaction, in order. A transaction may hold
 * several Locks (or Releases), so consumers must loop over all of them.
 */
export function parseBridgeLogs(lines: readonly string[]): BridgeLog[] {
  const out: BridgeLog[] = [];
  for (const l of lines) {
    const parsed = parseBridgeLog(l);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Splits a LOCK's `recipientHex` into the Midnight coin and encryption public keys. */
export function splitRecipientHex(recipientHex: string): {
  coinPublicKey: Uint8Array;
  encryptionPublicKey: Uint8Array;
} {
  if (!HEX128_RE.test(recipientHex)) {
    throw new RangeError("recipientHex must be 128 lowercase hex chars");
  }
  const bytes = Buffer.from(recipientHex, "hex");
  return {
    coinPublicKey: new Uint8Array(bytes.subarray(0, 32)),
    encryptionPublicKey: new Uint8Array(bytes.subarray(32, 64)),
  };
}
