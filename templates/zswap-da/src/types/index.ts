// src/types/index.ts
export type { TokenLeg as MipTokenLeg, TokenKind } from '@effectstream/mip-zswap-offer/mip6';

export interface KnownToken {
  token_color: string;
  name: string;
  kind: 'shielded' | 'unshielded';
  /**
   * Base units per whole coin: 1 coin = 10^decimals base units.
   *
   * Off-chain metadata from the kernel registry (`known_tokens.decimals`) — the
   * ledger itself has no decimals notion, so this is the ONLY thing that says
   * how an on-chain integer should be read. `useTokens` fills in
   * DEFAULT_DECIMALS when a node predates the field, and TokenPicker does the
   * same for a wallet-held colour that is in no registry.
   */
  decimals: number;
  /** Market asset the node prices this token against, when it has one. */
  asset_id?: string | null;
}

/**
 * A MIP-0006 TokenLeg as the node serves it.
 *
 * Legs are LAYER-TAGGED: the same `token` colour at different `type` is a
 * different asset for netting purposes — never merge them.
 *
 * `amount` is a decimal string, not a number: token amounts are u128 on-chain
 * and do not survive an IEEE double. Parse with BigInt for anything exact.
 */
export interface TokenEntry {
  token: string;
  amount: string;
  type: 'SHIELDED' | 'UNSHIELDED';
  /** Display name resolved client-side from /v1/known-tokens; never from the wire. */
  name?: string;
}

/** Server-side offer lifecycle.
 *  - `live`      — on the book, takeable
 *  - `consumed`  — all inputs spent in ONE settlement tx: a genuine fill
 *  - `cancelled` — inputs spent across different txs / partially, i.e. the maker
 *                  spent the coins elsewhere. Settlement is atomic, so this is
 *                  definitive, not ambiguous.
 *  - `expired`   — TTL elapsed before anyone took it
 */
export type OfferStatus = 'live' | 'consumed' | 'cancelled' | 'expired';
/** `not_found` only ever comes back from a lookup, never as a stored state. */
export type OfferStatusLookup = OfferStatus | 'not_found';

/** Indexer-derived fields. Nothing in here is maker-supplied. */
export interface OfferComputed {
  gives: TokenEntry[];
  wants: TokenEntry[];
  /**
   * Conservative FLOOR on the expiry, not an exact deadline — for shielded
   * offers the chain can keep the offer fillable past this (the proof-root
   * window refreshes while the chain is quiet). Render as "expires ≥ …" and
   * treat the status flipping to expired/consumed as the authority.
   */
  expiresAt?: string | null;
  inputNullifiers: string[];
  firstSeenAt?: string | null;
  status: OfferStatus;
}

/**
 * MIP-0006 OffchainOfferPayload, as returned by `GET /v1/offers`.
 *
 * `offerBech32` is deliberately ABSENT from list rows — a blob is 16-25 KB, so
 * a page of them would be megabytes. Fetch it per offer via
 * `GET /v1/offers/:offerId` when the user actually acts on one.
 */
export interface ZSwapOffer {
  version: 1;
  /** Content hash: lowercase-hex sha256 of the offer's RAW TRANSACTION BYTES
   *  (not of the bech32m string). Identical on every node; safe as a URL
   *  segment, dedup key and React key. */
  offerId: string | null;
  /** Size of the blob served by the detail endpoint. Display only. */
  blobChars?: number;
  celestiaHeight?: string;
  computed: OfferComputed;
}

/** `GET /v1/offers/:offerId` — the only response that carries the blob. */
export interface OfferDetail extends ZSwapOffer {
  offerId: string;
  offerBech32: string;
  ttlSeconds?: string;
}

/** `GET /v1/offers` — keyset-paginated envelope (was a bare array pre-/v1). */
export interface OffersPage {
  offers: ZSwapOffer[];
  /** Feed back as `after_hash`. `null` means the last page — note a FULL page
   *  can still be the last one, so trust this, not the row count. */
  nextCursor: string | null;
}

/**
 * SSE frame from `GET /v1/offers/stream`. Frames are `data:`-only (no `event:`
 * field) — dispatch on `type`.
 *
 * WART: `offerId` here is the node's INTERNAL NUMERIC ROW ID, not the content
 * hash — the hash is `offerHash`. Correlate with REST via `offerHash` only.
 */
export interface AppEvent {
  type:
    | 'connected'
    | 'offer_indexed'
    | 'offer_rejected'
    | 'offer_consumed'
    | 'offer_expired'
    | 'token_minted';
  timestamp: number;
  /** Internal numeric row id — NOT the content hash. Do not correlate on it. */
  offerId?: number;
  /** Content hash. The only field safe to correlate with REST responses. */
  offerHash?: string;
  /** Rejection code on offer_rejected, e.g. 'DUPLICATE_OFFER'. */
  code?: string;
  reason?: string;
  celestiaHeight?: number | string;
  gives?: unknown[];
  wants?: unknown[];
  nullifier?: string;
  name?: string;
  color?: string;
  kind?: 'SHIELDED' | 'UNSHIELDED';
}
