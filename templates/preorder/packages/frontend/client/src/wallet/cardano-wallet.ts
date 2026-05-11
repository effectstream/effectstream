import { Lucid, type LucidEvolution } from "@lucid-evolution/lucid";
import { Blockfrost } from "@lucid-evolution/provider";
import {
  generateSeedPhrase,
  PROTOCOL_PARAMETERS_DEFAULT,
} from "@lucid-evolution/utils";

const DOLOS_BLOCKFROST_URL = "http://localhost:3000";
const YACI_PROXY = "/yaci";

export interface CardanoDevWallet {
  lucid: LucidEvolution;
  address: string;
}

export async function createCardanoDevWallet(): Promise<CardanoDevWallet> {
  const provider = new Blockfrost(DOLOS_BLOCKFROST_URL, "dev");

  provider.submitTx = async (tx: string): Promise<string> => {
    const res = await fetch(`${YACI_PROXY}/tx/submit`, {
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

  const lucid = await Lucid(provider, "Custom", {
    presetProtocolParameters: PROTOCOL_PARAMETERS_DEFAULT,
  });

  const seed = generateSeedPhrase();
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();

  await topup(address, 10_000);
  await waitForUtxos(lucid, address);

  return { lucid, address };
}

export async function getBalance(lucid: LucidEvolution, address: string): Promise<bigint> {
  const utxos = await lucid.utxosAt(address);
  return utxos.reduce((sum, u) => sum + (u.assets.lovelace || 0n), 0n);
}

export async function sendPayment(
  lucid: LucidEvolution,
  toAddress: string,
  lovelace: bigint,
  senderAddress: string,
  items?: { id: number; qty: number }[],
): Promise<{ txHash: string }> {
  let tx = lucid.newTx().pay.ToAddress(toAddress, { lovelace });

  if (items && items.length > 0) {
    const w = senderAddress.length > 64
      ? [senderAddress.slice(0, 64), senderAddress.slice(64)]
      : [senderAddress];
    tx = tx.attachMetadata(42, {
      p: "preorder",
      w,
      i: items.map((it) => [it.id, it.qty]),
    });
  }

  const signed = await (await tx.complete()).sign.withWallet().complete();
  const txHash = await signed.submit();
  return { txHash };
}

async function topup(address: string, adaAmount: number): Promise<void> {
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const res = await fetch(`${YACI_PROXY}/addresses/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, adaAmount }),
      });
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Topup failed");
}

async function waitForUtxos(
  lucid: LucidEvolution,
  address: string,
  timeoutMs = 60_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const utxos = await lucid.utxosAt(address);
    if (utxos.length > 0) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for UTxOs");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
