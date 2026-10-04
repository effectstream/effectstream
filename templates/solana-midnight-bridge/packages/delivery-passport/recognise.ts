// Is this contract a Passport account the bridge may deliver into? (plan 00058 Interfaces D-3,
// questions Q2 A: the owner-independent part of Night Market's `checkMarketAccount`,
// packages/core/src/passport/account-chain.ts). Read-only; it never signs anything.
//
//   1. a contract state exists                       else retry (missing) → not-a-contract after grace
//   2. its operations are EXACTLY the pinned circuits
//      with the pinned verifier-key digests          else not-mine (→ not-a-passport-account)
//   3. its maintenance authority is retired
//      (committee 0, threshold ≥ 1)                  else refuse(authority-live)
//   4. enc_key is a usable X25519 public key          else refuse(bad-enc-key)
//   5. its network salt is keccak256("midnight:" ‖ networkId)   else refuse(wrong-network)
//   6. round < 2^48 and inbox_count < 2^48           else refuse(counters)
// Not checked (Q2): `booted`, the device set, provenance — Night Market checks those before it
// builds a lock.
import { createHash, randomBytes } from "node:crypto";
import { x25519 } from "@noble/curves/ed25519.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { Recognition } from "@solana-midnight-bridge/delivery";
import type { PassportPin } from "./pin.ts";

/** Night Market's COUNTER_BOUND: far above any real use, far below the 2^64 that freezes the account. */
export const COUNTER_BOUND = 1n << 48n;

/** What the rules read of an account (decoded from its on-chain state). */
export type AccountView = {
  /** circuit → SHA-256 of its deployed verifier key ("" when the operation has none). */
  operations: Record<string, string>;
  authority: { committee: number; threshold: number };
  encKey: Uint8Array;
  /** 64 lowercase hex. */
  networkSalt: string;
  round: bigint;
  inboxCount: bigint;
};

/** The parts of an onchain-runtime ContractState the decoder reads. */
export type ContractStateLike = {
  operations(): Iterable<string | Uint8Array>;
  operation(op: string | Uint8Array): { verifierKey?: Uint8Array } | undefined;
  maintenanceAuthority: { committee: unknown[]; threshold: number | bigint };
  data: unknown;
};

/** The Passport account module's `ledger()` fields the rules use. */
export type AccountLedgerLike = {
  enc_key: Uint8Array;
  evm_domain_salt: Uint8Array;
  round: bigint;
  inbox_count: bigint;
};

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const opName = (op: string | Uint8Array) => (typeof op === "string" ? op : new TextDecoder().decode(op));

/** circuit → SHA-256 of the operation's deployed verifier key ("" when it has none). */
export function operationDigests(state: Pick<ContractStateLike, "operations" | "operation">): Record<string, string> {
  const operations: Record<string, string> = {};
  for (const op of state.operations()) {
    const vk = state.operation(op)?.verifierKey;
    operations[opName(op)] = vk && vk.length > 0 ? createHash("sha256").update(vk).digest("hex") : "";
  }
  return operations;
}

/** Decodes a contract state with the account module's `ledger`; null when it is not a Passport ledger. */
export function decodeAccountView(state: ContractStateLike, ledger: (data: unknown) => AccountLedgerLike): AccountView | null {
  const operations = operationDigests(state);
  // The compiled module's `ledger()` is lazy: each field is read from the state on access, and a
  // field another contract's state does not have throws THEN. Read every field here.
  let fields: { encKey: Uint8Array; networkSalt: string; round: bigint; inboxCount: bigint };
  try {
    const l = ledger(state.data);
    const encKey = l.enc_key;
    const salt = l.evm_domain_salt;
    if (!(encKey instanceof Uint8Array) || !(salt instanceof Uint8Array)) return null;
    fields = { encKey: Uint8Array.from(encKey), networkSalt: hex(salt), round: BigInt(l.round), inboxCount: BigInt(l.inbox_count) };
  } catch {
    return null;
  }
  return {
    operations,
    authority: { committee: state.maintenanceAuthority.committee.length, threshold: Number(state.maintenanceAuthority.threshold) },
    ...fields,
  };
}

/** Every pinned circuit present with the same digest, and nothing else. */
export function compareVerifierKeys(deployed: Record<string, string>, pinned: Record<string, string>) {
  const missing: string[] = [];
  const different: string[] = [];
  for (const [c, d] of Object.entries(pinned)) {
    if (deployed[c] === undefined) missing.push(c);
    else if (deployed[c] !== d.toLowerCase()) different.push(c);
  }
  const extra = Object.keys(deployed).filter((c) => pinned[c] === undefined).sort();
  return { equal: missing.length + different.length + extra.length === 0, missing, different, extra };
}

/** keccak256("midnight:" ‖ networkId): the salt a Passport account of that network seals. */
export const networkSaltFor = (networkId: string) => hex(keccak_256(new TextEncoder().encode(`midnight:${networkId}`)));

/** Rule 4: 32 bytes, not all-zero, and an X25519 exchange with it is not all-zero (no low-order point). */
export function encKeyProblem(encKey: Uint8Array): string | null {
  if (encKey.length !== 32) return `enc_key is ${encKey.length} bytes, not 32`;
  if (encKey.every((b) => b === 0)) return "enc_key is all-zero";
  try {
    const shared = x25519.getSharedSecret(new Uint8Array(randomBytes(32)), encKey);
    if (shared.every((b) => b === 0)) return "enc_key is a low-order point (the shared secret is zero)";
  } catch (e) {
    return `enc_key is not a usable X25519 public key (${e instanceof Error ? e.message : String(e)})`;
  }
  return null;
}

/** Rules 2–6 over a decoded account (rule 1 is the caller's: the state exists). */
export function passportRules(view: AccountView, pin: PassportPin, networkId: string): Recognition {
  const keys = compareVerifierKeys(view.operations, pin.circuits);
  if (!keys.equal) {
    const parts = [
      keys.different.length ? `different: ${keys.different.join(", ")}` : "",
      keys.missing.length ? `missing: ${keys.missing.join(", ")}` : "",
      keys.extra.length ? `extra: ${keys.extra.join(", ")}` : "",
    ].filter(Boolean);
    return { verdict: "not-mine", detail: `not a Passport account of key set ${pin.keySet.slice(0, 8)} (${parts.join("; ")})` };
  }
  if (!(view.authority.committee === 0 && view.authority.threshold >= 1)) {
    return {
      verdict: "refuse",
      code: "authority-live",
      message: `its maintenance authority is not retired (committee ${view.authority.committee}, threshold ${view.authority.threshold}): it could replace the account's circuits after the delivery`,
    };
  }
  const ek = encKeyProblem(view.encKey);
  if (ek) return { verdict: "refuse", code: "bad-enc-key", message: ek };
  const salt = networkSaltFor(networkId);
  if (view.networkSalt !== salt) {
    return { verdict: "refuse", code: "wrong-network", message: `its network salt ${view.networkSalt} is not ${networkId}'s (${salt})` };
  }
  if (view.round >= COUNTER_BOUND || view.inboxCount >= COUNTER_BOUND) {
    return {
      verdict: "refuse",
      code: "counters",
      message: `its counters are at the bound 2^48 (round ${view.round}, inbox_count ${view.inboxCount}): deposit_shielded's checked increment would fail`,
    };
  }
  return {
    verdict: "deliverable",
    facts: { encKey: hex(view.encKey), inboxCount: view.inboxCount.toString(), round: view.round.toString() },
  };
}
