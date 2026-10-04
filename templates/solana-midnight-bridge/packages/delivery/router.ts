// The delivery router (plan 00058 Interfaces D-1, D-2): consults the adapters in order and owns
// the ONLY call that signs a mint for a contract recipient.
//
// Verdicts, in adapter order — the first answer that is not `not-mine` decides:
//   deliverable → deliver through that adapter;
//   refuse      → undeliverable(code);
//   retry       → retry with backoff; when the contract is MISSING (no state) for longer than the
//                 grace window since the transfer was first seen → undeliverable(not-a-contract);
//   (none)      → no adapters: undeliverable(no-adapter); every adapter said not-mine:
//                 undeliverable(not-a-passport-account) — while Passport is the only adapter that
//                 code means "not a recognised contract".
// An adapter that throws (an infrastructure error) is a retry, never undeliverable.
import type {
  ContractDeliveryAdapter,
  ContractRecipient,
  DeliveryHooks,
  DeliveryResult,
  SignedMint,
  UndeliverableCode,
} from "./types.ts";

export type RouterDecision =
  | { kind: "deliverable"; adapter: ContractDeliveryAdapter; facts: Record<string, string> }
  | { kind: "undeliverable"; code: UndeliverableCode; message: string }
  | { kind: "retry"; message: string; missing: boolean };

/** What the router asks its signer to sign: the recipient is always `right(contract)`. */
export type MintToSign = { lockNonce: bigint; amount: bigint; recipient: ContractRecipient };
/** Signs `mintFromSolana` with the operator key (the node's signing.ts); the router's alone. */
export type MintSigner = (m: MintToSign) => SignedMint;

export const DEFAULT_NOT_FOUND_GRACE_MS = 600_000;

const HEX64 = /^[0-9a-f]{64}$/;

/** A contract address (64 hex, 0x optional) → lowercase; throws otherwise. */
export function normaliseContract(address: string): string {
  const h = address.replace(/^0x/i, "").toLowerCase();
  if (!HEX64.test(h)) throw new Error(`not a 32-byte contract address: ${JSON.stringify(address)}`);
  return h;
}

/** `right(contract)` for `mintFromSolana`. */
export function contractRecipientOf(address: string): ContractRecipient {
  const h = normaliseContract(address);
  return { is_left: false, left: { bytes: new Uint8Array(32) }, right: { bytes: Uint8Array.from(Buffer.from(h, "hex")) } };
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class DeliveryRouter {
  private readonly now: () => number;
  private readonly graceMs: number;

  constructor(
    readonly adapters: readonly ContractDeliveryAdapter[],
    private readonly opts: { signMint: MintSigner; graceMs?: number; now?: () => number },
  ) {
    this.now = opts.now ?? Date.now;
    this.graceMs = opts.graceMs ?? DEFAULT_NOT_FOUND_GRACE_MS;
  }

  /** Read-only: never signs. `firstSeenAt` (ms) enables the not-a-contract grace window. */
  async recognise(address: string, o: { firstSeenAt?: number } = {}): Promise<RouterDecision> {
    const contract = normaliseContract(address);
    if (this.adapters.length === 0) {
      return { kind: "undeliverable", code: "no-adapter", message: "no contract-delivery adapter is configured on this node" };
    }
    const notMine: string[] = [];
    for (const a of this.adapters) {
      let r;
      try {
        r = await a.recognise(contract);
      } catch (e) {
        return { kind: "retry", message: `${a.id}: ${errText(e)}`, missing: false };
      }
      if (r.verdict === "deliverable") return { kind: "deliverable", adapter: a, facts: r.facts };
      if (r.verdict === "refuse") return { kind: "undeliverable", code: r.code, message: `${a.id}: ${r.message}` };
      if (r.verdict === "retry") {
        const missing = r.missing === true;
        if (missing && o.firstSeenAt !== undefined && this.now() - o.firstSeenAt >= this.graceMs) {
          return {
            kind: "undeliverable",
            code: "not-a-contract",
            message: `no contract at ${contract} on this network ${Math.round((this.now() - o.firstSeenAt) / 1000)} s after the lock was seen`,
          };
        }
        return { kind: "retry", message: `${a.id}: ${r.message}`, missing };
      }
      notMine.push(r.detail ? `${a.id}: ${r.detail}` : a.id);
    }
    return {
      kind: "undeliverable",
      code: "not-a-passport-account",
      message: `no delivery adapter recognises the contract (${notMine.join("; ")})`,
    };
  }

  /** Signs the mint for `right(contract)` — the router's only signature — and delivers it. */
  async deliver(
    adapter: ContractDeliveryAdapter,
    address: string,
    job: { lockNonce: bigint; amount: bigint },
    hooks?: DeliveryHooks,
  ): Promise<DeliveryResult> {
    const contract = normaliseContract(address);
    const signed = this.opts.signMint({ lockNonce: job.lockNonce, amount: job.amount, recipient: contractRecipientOf(contract) });
    return adapter.deliver(contract, signed, hooks);
  }

  /** The record's `delivery.adapters`. */
  infos() {
    return this.adapters.map((a) => a.info);
  }
}
