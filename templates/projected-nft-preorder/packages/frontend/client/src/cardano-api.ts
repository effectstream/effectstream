import { BASE_URL_API } from "./config.ts";

export interface NftLock {
  id: number;
  owner_address: string;
  policy_id: string;
  asset_name: string;
  status: string;
  current_tx_id: string;
  current_output_index: string;
  for_how_long: string | null;
  block_height: number;
  created_at: string;
}

export async function getLocks(): Promise<NftLock[]> {
  const res = await fetch(`${BASE_URL_API}/api/locks`);
  if (!res.ok) throw new Error("Failed to fetch locks");
  return res.json();
}

export async function getLocksByOwner(address: string): Promise<NftLock[]> {
  const res = await fetch(`${BASE_URL_API}/api/locks/${address}`);
  if (!res.ok) throw new Error("Failed to fetch locks by owner");
  return res.json();
}

export async function getScriptHash(): Promise<string> {
  const res = await fetch(`${BASE_URL_API}/api/cardano/script-hash`);
  if (!res.ok) throw new Error("Failed to get script hash");
  const data = await res.json();
  return data.scriptHash;
}

export async function getScriptAddressFromApi(): Promise<string> {
  const res = await fetch(`${BASE_URL_API}/api/cardano/script-address`);
  if (!res.ok) throw new Error("Failed to get script address");
  const data = await res.json();
  return data.scriptAddress;
}
