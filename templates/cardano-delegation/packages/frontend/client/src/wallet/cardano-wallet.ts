import { Lucid, type LucidEvolution } from "@lucid-evolution/lucid";
import { Blockfrost } from "@lucid-evolution/provider";
import {
  generateSeedPhrase,
  getAddressDetails,
  PROTOCOL_PARAMETERS_DEFAULT,
} from "@lucid-evolution/utils";
import { YACI_BASE, DOLOS_BASE } from "../config.ts";

export interface DelegationRecord {
  id: number;
  block_height: number;
  address: string;
  pool: string;
  epoch: string;
  tx_hash: string | null;
  created_at: string;
}

export interface WalletState {
  id: number;
  lucid: LucidEvolution;
  seedPhrase: string;
  address: string;
  rewardAddress: string;
  stakingCredential: string;
  balanceAda: number;
  delegated: boolean;
  delegatedPool?: string;
  delegating: boolean;
  funding: boolean;
  delegationHistory?: DelegationRecord[];
  checkingDelegation?: boolean;
}

let walletCounter = 0;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function createProvider(): Blockfrost {
  const provider = new Blockfrost(
    `${window.location.origin}${DOLOS_BASE}`,
    "dev",
  );
  provider.evaluateTx = async () => {
    return [{
      redeemer_tag: "spend",
      redeemer_index: 0,
      ex_units: { mem: 10_000_000, steps: 5_000_000_000 },
    }];
  };
  provider.submitTx = async (tx: string): Promise<string> => {
    const res = await fetch(`${YACI_BASE}/tx/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor" },
      body: hexToBytes(tx),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`YACI tx submit failed (${res.status}): ${text}`);
    }
    const result = await res.text();
    return result.replace(/^"|"$/g, "");
  };
  return provider;
}

export async function createWallet(): Promise<WalletState> {
  const provider = createProvider();
  const lucid = await Lucid(provider, "Custom", {
    presetProtocolParameters: PROTOCOL_PARAMETERS_DEFAULT,
  });
  const seedPhrase = generateSeedPhrase();
  lucid.selectWallet.fromSeed(seedPhrase);

  const address = await lucid.wallet().address();
  const rewardAddress = (await lucid.wallet().rewardAddress())!;
  const details = getAddressDetails(address);
  const stakingCredential = details.stakeCredential?.hash ?? "";

  return {
    id: ++walletCounter,
    lucid,
    seedPhrase,
    address,
    rewardAddress,
    stakingCredential,
    balanceAda: 0,
    delegated: false,
    delegating: false,
    funding: false,
  };
}

export async function fundWallet(
  wallet: WalletState,
  adaAmount: number = 1000,
): Promise<void> {
  const res = await fetch(`${YACI_BASE}/addresses/topup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: wallet.address, adaAmount }),
  });
  if (!res.ok) throw new Error(`Faucet failed (${res.status})`);

  const start = Date.now();
  while (Date.now() - start < 30_000) {
    const utxos = await wallet.lucid.utxosAt(wallet.address);
    if (utxos.length > 0) {
      const balance = utxos.reduce((sum, u) => sum + u.assets.lovelace, 0n);
      wallet.balanceAda = Number(balance / 1_000_000n);
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for UTxOs after faucet");
}

export async function delegateWallet(
  wallet: WalletState,
  poolBech32: string,
): Promise<string> {
  const tx = wallet.delegated
    ? wallet.lucid.newTx().delegate.ToPool(wallet.rewardAddress, poolBech32)
    : wallet.lucid.newTx().registerAndDelegate.ToPool(wallet.rewardAddress, poolBech32);

  const signed = await (await tx.complete()).sign.withWallet().complete();
  const txHash = await signed.submit();
  wallet.delegated = true;
  wallet.delegatedPool = poolBech32;

  const start = Date.now();
  while (Date.now() - start < 15_000) {
    const utxos = await wallet.lucid.utxosAt(wallet.address);
    const balance = utxos.reduce((sum, u) => sum + u.assets.lovelace, 0n);
    const newBalance = Number(balance / 1_000_000n);
    if (newBalance !== wallet.balanceAda) {
      wallet.balanceAda = newBalance;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  return txHash;
}

export async function fetchDelegationHistory(
  wallet: WalletState,
): Promise<DelegationRecord[]> {
  const res = await fetch(
    `${window.location.origin}/api/delegations/by-address/${wallet.stakingCredential}`,
  );
  if (!res.ok) return [];
  return res.json();
}

export async function refreshBalance(wallet: WalletState): Promise<number> {
  try {
    const utxos = await wallet.lucid.utxosAt(wallet.address);
    const balance = utxos.reduce((sum, u) => sum + u.assets.lovelace, 0n);
    wallet.balanceAda = Number(balance / 1_000_000n);
  } catch {
    // ignore balance fetch errors
  }
  return wallet.balanceAda;
}
