import {
  Lucid,
  SLOT_CONFIG_NETWORK,
  type LucidEvolution,
} from "@lucid-evolution/lucid";
import { Blockfrost } from "@lucid-evolution/provider";
import {
  generateSeedPhrase,
  getAddressDetails,
  PROTOCOL_PARAMETERS_DEFAULT,
} from "@lucid-evolution/utils";
import { DOLOS_URL, YACI_URL } from "../config.ts";

const STORAGE_KEY = "projected-nft-wallet-seed";

export interface WalletInfo {
  lucid: LucidEvolution;
  address: string;
  paymentCredential: string;
  stakingCredential: string;
  seedPhrase: string;
}

let cachedWallet: WalletInfo | null = null;
let cachedSystemStartMs = 0;
let slotConfigInitialized = false;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export async function ensureSlotConfig(force = false): Promise<void> {
  if (slotConfigInitialized && !force) return;
  const devnetRes = await fetch(`${YACI_URL}/local-cluster/api/admin/devnet`);
  const devnet = await devnetRes.json();
  const startTimeMs = devnet.startTime * 1000;
  SLOT_CONFIG_NETWORK["Custom"] = {
    zeroTime: startTimeMs,
    zeroSlot: 0,
    slotLength: 1000,
  };
  const genesisRes = await fetch(`${YACI_URL}/local-cluster/api/admin/devnet/genesis/shelley`);
  const genesis = await genesisRes.json();
  cachedSystemStartMs = Math.floor(new Date(genesis.systemStart).getTime());
  slotConfigInitialized = true;
}

export function getSystemStartMs(): number {
  return cachedSystemStartMs;
}

export function getEpochOffset(): number {
  if (!slotConfigInitialized) return 0;
  return cachedSystemStartMs - SLOT_CONFIG_NETWORK["Custom"].zeroTime;
}

export function cardanoPosixToWallClock(cardanoPosixMs: number): number {
  return cardanoPosixMs - getEpochOffset();
}

async function createLucidInstance(): Promise<LucidEvolution> {
  await ensureSlotConfig();

  const provider = new Blockfrost(DOLOS_URL, "dev");

  provider.evaluateTx = async () => {
    return [{ redeemer_tag: "spend", redeemer_index: 0, ex_units: { mem: 10_000_000, steps: 5_000_000_000 } }];
  };

  provider.submitTx = async (tx: string): Promise<string> => {
    const res = await fetch(`${YACI_URL}/local-cluster/api/tx/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor" },
      body: hexToBytes(tx),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`TX submit failed (${res.status}): ${text}`);
    }
    const result = await res.text();
    return result.replace(/^"|"$/g, "");
  };

  return Lucid(provider, "Custom", {
    presetProtocolParameters: PROTOCOL_PARAMETERS_DEFAULT,
  });
}

export async function requestFaucet(address: string, adaAmount = 10_000): Promise<void> {
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const res = await fetch(`${YACI_URL}/local-cluster/api/addresses/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, adaAmount }),
      });
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Faucet topup failed after retries");
}

export async function waitForUtxos(lucid: LucidEvolution, address: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const utxos = await lucid.utxosAt(address);
    if (utxos.length > 0) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for UTxOs");
}

export function getSavedSeed(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function clearSavedSeed(): void {
  localStorage.removeItem(STORAGE_KEY);
  cachedWallet = null;
}

export function getCachedWallet(): WalletInfo | null {
  return cachedWallet;
}

export async function connectLucidWallet(existingSeed?: string): Promise<WalletInfo> {
  if (cachedWallet) return cachedWallet;

  const lucid = await createLucidInstance();
  const seed = existingSeed || generateSeedPhrase();
  lucid.selectWallet.fromSeed(seed);

  const address = await lucid.wallet().address();
  const details = getAddressDetails(address);

  localStorage.setItem(STORAGE_KEY, seed);

  cachedWallet = {
    lucid,
    address,
    paymentCredential: details.paymentCredential?.hash ?? "",
    stakingCredential: details.stakeCredential?.hash ?? "",
    seedPhrase: seed,
  };

  return cachedWallet;
}

export async function connectCIP30Wallet(walletKey: string): Promise<WalletInfo> {
  const w = window.cardano?.[walletKey];
  if (!w) throw new Error(`Wallet "${walletKey}" not found`);

  const api = await w.enable();
  const lucid = await createLucidInstance();
  lucid.selectWallet.fromAPI(api);

  const address = await lucid.wallet().address();
  const details = getAddressDetails(address);

  cachedWallet = {
    lucid,
    address,
    paymentCredential: details.paymentCredential?.hash ?? "",
    stakingCredential: details.stakeCredential?.hash ?? "",
    seedPhrase: "",
  };

  return cachedWallet;
}
