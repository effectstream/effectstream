import { BASE_URL_API } from "./config.ts";

export interface CardanoUtxo {
  tx_hash: string;
  output_index: number;
  lovelace: string;
}

export interface CardanoWalletInfo {
  address: string;
  staking_credential: string;
  seed_phrase: string;
  balance_lovelace: string;
  balance_ada: number;
  utxo_count: number;
  utxos: CardanoUtxo[];
}

export interface CardanoWalletStatus {
  connected: boolean;
  address?: string;
  staking_credential?: string;
  seed_phrase?: string;
  balance_lovelace?: string;
  balance_ada?: number;
  utxo_count?: number;
  delegated?: boolean;
  pool_id?: string | null;
}

export interface DelegationResult {
  txHash: string;
  poolId: string;
}

export async function connectCardanoWallet(): Promise<CardanoWalletInfo> {
  const res = await fetch(`${BASE_URL_API}/api/cardano/connect`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to connect Cardano wallet");
  }
  return res.json();
}

export async function getCardanoWalletStatus(): Promise<CardanoWalletStatus> {
  const res = await fetch(`${BASE_URL_API}/api/cardano/wallet`);
  if (!res.ok) throw new Error("Failed to get wallet status");
  return res.json();
}

export async function delegateToPool(): Promise<DelegationResult> {
  const res = await fetch(`${BASE_URL_API}/api/cardano/delegate`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to delegate");
  }
  return res.json();
}
