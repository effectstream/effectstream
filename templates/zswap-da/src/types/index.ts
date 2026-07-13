// src/types/index.ts
export type { TokenLeg, TokenKind } from '../lib/mip6-p2p-swaps';

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

export interface ZSwapOffer {
  id: number;
  gives: TokenEntry[];
  wants: TokenEntry[];
  celestia_height?: number;
  transaction_hex?: string;
}

export interface AppEvent {
  type: 'connected' | 'offer_indexed' | 'offer_consumed' | 'offer_expired' | 'token_minted';
  timestamp: number;
  offerId?: number;
  celestiaHeight?: number | string;
  gives?: unknown[];
  wants?: unknown[];
  nullifier?: string;
  name?: string;
  color?: string;
  kind?: 'shielded' | 'unshielded';
}
