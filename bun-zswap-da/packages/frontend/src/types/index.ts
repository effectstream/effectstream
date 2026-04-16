// src/types/index.ts
import type { TokenLeg } from 'mip-zswap-offer';
export type { TokenLeg } from 'mip-zswap-offer';

export interface KnownToken {
  token_color: string;
  name: string;
}

// UI-layer entry: extends the MIP TokenLeg with a local `type`
// field distinguishing shielded vs unshielded at the wallet layer.
export interface TokenEntry extends TokenLeg {
  type: string;
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
  wallet?: string;
}
