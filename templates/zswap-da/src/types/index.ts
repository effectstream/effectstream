// src/types/index.ts
export type { TokenLeg, TokenKind } from '@effectstream/mip-zswap-offer/mip6';

export interface KnownToken {
  token_color: string;
  name: string;
  kind: 'shielded' | 'unshielded';
}

// Indexer API still returns untagged {token,amount}; MIP-0006 derive adds
// type: SHIELDED|UNSHIELDED. Keep both shapes acceptable at the UI boundary.
export interface TokenEntry {
  token: string;
  amount: string;
  type?: string;
  name?: string;
}

/**
 * A row from `GET /api/zswaps`. The list is blob-free — a single offer blob is
 * 16-25 KB, so a 100-row page carrying blobs would be megabytes. Fetch the blob
 * per offer via `GET /api/zswaps/:hash` (api.getOfferByHash) only when the user
 * actually selects it.
 */
export interface ZSwapOffer {
  /** Local row bookkeeping. Differs between backend deployments — never use it
   *  as a cross-system key or persist it. `offer_hash` is the stable identity. */
  id: number;
  /** Content hash: hex sha256 of the raw MIP-0005 transaction bytes. Identical
   *  on every node indexing the same offer. `null` only for legacy rows indexed
   *  before the content-addressing migration. */
  offer_hash: string | null;
  /** Length of the bech32m blob served by `GET /api/zswaps/:hash`. */
  blob_chars?: number;
  gives: TokenEntry[];
  wants: TokenEntry[];
  celestia_height?: number;
  metadata_created_at?: string | null;
  metadata_expires_at?: string | null;
  metadata_maker_note?: string | null;
  ttl_seconds?: number | null;
  created_at?: string;
}

/** Server-side offer lifecycle. `not_found` is only ever a lookup result. */
export type OfferStatus = 'open' | 'completed' | 'expired';
export type OfferStatusLookup = OfferStatus | 'not_found';

/** `GET /api/zswaps/:hash` — the only endpoint that returns the blob. */
export interface OfferDetail {
  offer_hash: string;
  status: OfferStatus;
  blob: string;
  celestia_height?: number;
  created_at?: string;
  metadata_created_at?: string | null;
  metadata_expires_at?: string | null;
  metadata_maker_note?: string | null;
  ttl_seconds?: number | null;
  gives: TokenEntry[];
  wants: TokenEntry[];
}

export interface AppEvent {
  type:
    | 'connected'
    | 'offer_indexed'
    | 'offer_rejected'
    | 'offer_consumed'
    | 'offer_expired'
    | 'token_minted';
  timestamp: number;
  /** Local row id — display only. Key live book updates on `offerHash`. */
  offerId?: number;
  /** Content hash; present on offer_indexed, and on offer_rejected when the
   *  blob decoded far enough to hash it. */
  offerHash?: string;
  /** Rejection code, e.g. 'DUPLICATE_OFFER'. Only on offer_rejected. */
  code?: string;
  reason?: string;
  celestiaHeight?: number | string;
  gives?: unknown[];
  wants?: unknown[];
  nullifier?: string;
  name?: string;
  color?: string;
  kind?: 'shielded' | 'unshielded';
}
