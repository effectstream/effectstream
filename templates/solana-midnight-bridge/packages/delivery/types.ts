// The contract-delivery adapter interface (plan 00058 Interfaces D-1).
//
// A lock whose Midnight recipient is a CONTRACT is delivered by ONE Midnight transaction: the
// bridge's `mintFromSolana(…, right(contract), …)` plus the contract's own receiving call(s), as root
// calls of one intent (Compact contracts cannot call each other here). Which receiving call, and
// whether a contract can receive at all, depends on the contract: that is an adapter's job.
//
// Trust boundary: an adapter never holds the operator's key. The ROUTER signs the mint, and only
// after an adapter said `deliverable`; the adapter receives the signed arguments.

/** Why a contract recipient is undeliverable (closed set; I-3 (a)). */
export type UndeliverableCode =
  | "no-adapter"
  | "not-a-contract"
  | "not-a-passport-account"
  | "authority-live"
  | "bad-enc-key"
  | "wrong-network"
  | "counters";

export const UNDELIVERABLE_CODES: readonly UndeliverableCode[] = [
  "no-adapter", "not-a-contract", "not-a-passport-account", "authority-live", "bad-enc-key", "wrong-network", "counters",
];

/** Compact `Either<ZswapCoinPublicKey, ContractAddress>` naming a contract. */
export type ContractRecipient = {
  is_left: false;
  left: { bytes: Uint8Array };
  right: { bytes: Uint8Array };
};

/** `mintFromSolana`'s arguments, signed by the operator: produced by the ROUTER, never an adapter. */
export interface SignedMint {
  lockNonce: bigint;
  amount: bigint;
  recipient: ContractRecipient;
  mintNonce: Uint8Array;
  sig: { r: { x: bigint; y: bigint }; s: bigint };
}

/** An adapter's answer about one contract address. */
export type Recognition =
  /** It can deliver; `facts` are logged only (every attempt recognises again). */
  | { verdict: "deliverable"; facts: Record<string, string> }
  /** Not this adapter's kind of contract: ask the next one. */
  | { verdict: "not-mine"; detail?: string }
  /** This adapter's kind, but it must not receive (an UndeliverableCode). */
  | { verdict: "refuse"; code: UndeliverableCode; message: string }
  /** Cannot tell now (indexer down, state not indexed yet). `missing`: no contract state at all. */
  | { verdict: "retry"; message: string; missing?: boolean };

/** The minted coin, as the transfer view reports it (hex, hex, decimal). */
export type DeliveredCoin = { nonce: string; colour: string; value: string };

export interface DeliveryResult {
  /** The Midnight transaction that landed. */
  tx: string;
  coin: DeliveredCoin;
}

/** Called by `deliver` once the coin is known and before submitting (so it can be recorded). */
export type DeliveryHooks = { onComposed?: (coin: DeliveredCoin) => void | Promise<void> };

/** What the deployment record lists for an adapter (I-3 (c) `delivery.adapters`). */
export type DeliveryAdapterInfo = { id: string; keySet: string; passportCommit: string };

export interface ContractDeliveryAdapter {
  /** E.g. "passport-ed25519@21493588". */
  readonly id: string;
  readonly info: DeliveryAdapterInfo;
  /** Self-check at node start; throws → the node refuses to start. */
  init(): Promise<void>;
  /** Read-only; never signs. */
  recognise(contract: string): Promise<Recognition>;
  /** ONE Midnight transaction: the signed mint plus the receiving call(s). */
  deliver(contract: string, mint: SignedMint, hooks?: DeliveryHooks): Promise<DeliveryResult>;
}
