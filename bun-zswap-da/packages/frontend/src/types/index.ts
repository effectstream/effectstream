// src/types/index.ts
export interface KnownToken {
  token_color: string;
  name: string;
}

export interface TokenEntry {
  type: string;
  token: string;
  amount: string;
}

export interface ZSwapOffer {
  id: number;
  gives: TokenEntry[];
  wants: TokenEntry[];
  celestia_height?: number;
  transaction_hex?: string;
}
