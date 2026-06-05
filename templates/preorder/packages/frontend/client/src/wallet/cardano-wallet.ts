import { Lucid, Constr, Data, SLOT_CONFIG_NETWORK, type LucidEvolution } from "@lucid-evolution/lucid";
import { Blockfrost } from "@lucid-evolution/provider";
import {
  generateSeedPhrase,
  PROTOCOL_PARAMETERS_DEFAULT,
  mintingPolicyToId,
  paymentCredentialOf,
  toUnit,
} from "@lucid-evolution/utils";

const DOLOS_BLOCKFROST_URL = "http://localhost:3000";
const YACI_PROXY = "/yaci";

export interface CardanoDevWallet {
  lucid: LucidEvolution;
  address: string;
}

export async function createCardanoDevWallet(): Promise<CardanoDevWallet> {
  const provider = new Blockfrost(DOLOS_BLOCKFROST_URL, "dev");

  // The receipt is a PlutusV3 minting policy with a redeemer; point evaluateTx at a generous
  // mint budget (real script validation still runs at YACI submit). Mirrors the node-side
  // buyItemsCardano so the browser can build the on-chain-validated purchase.
  (provider as unknown as { evaluateTx: () => Promise<unknown> }).evaluateTx = async () => [
    { redeemer_tag: "mint", redeemer_index: 0, ex_units: { mem: 10_000_000, steps: 5_000_000_000 } },
  ];

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

let cachedScript: string | null = null;
async function getReceiptScript(): Promise<string> {
  if (cachedScript) return cachedScript;
  const cfg = await (await fetch("/api/config")).json();
  if (!cfg.cardanoReceiptScript) throw new Error("receipt script unavailable from /api/config");
  cachedScript = cfg.cardanoReceiptScript as string;
  return cachedScript;
}

let slotConfigDone = false;
async function ensureSlotConfig(): Promise<void> {
  if (slotConfigDone) return;
  const devnet = await (await fetch("/yaci/admin/devnet")).json();
  SLOT_CONFIG_NETWORK["Custom"] = { zeroTime: devnet.startTime * 1000, zeroSlot: 0, slotLength: 1000 };
  slotConfigDone = true;
}

const chunk64 = (s: string) => (s.length > 64 ? [s.slice(0, 64), s.slice(64)] : [s]);

/**
 * Cardano purchase: mint exactly one receipt token (assetName = buyer pkh) under the on-chain
 * `launchpad_receipt` policy, paying `lovelace` to the launchpad. The **receipt mint** is what
 * the sync node ingests (Utxorpc:Generic + mints_asset predicate) — a plain ADA transfer is NOT
 * picked up. Mirrors the node-side `buyItemsCardano` (no referrer from the UI).
 */
export async function sendPayment(
  lucid: LucidEvolution,
  toAddress: string,
  lovelace: bigint,
  senderAddress: string,
  items?: { id: number; qty: number }[],
): Promise<{ txHash: string }> {
  await ensureSlotConfig();
  const script = await getReceiptScript();
  const policy = { type: "PlutusV3" as const, script };
  const policyId = mintingPolicyToId(policy);
  const buyerPkh = paymentCredentialOf(senderAddress).hash;
  const unit = toUnit(policyId, buyerPkh);

  // PurchaseRedeemer { buyer, referrer, claimed_lovelace } -> Constr(0, [...]); UI has no referrer.
  const redeemer = Data.to(new Constr(0, [buyerPkh, "", lovelace]));

  const now = Date.now();
  const tx = lucid
    .newTx()
    .mintAssets({ [unit]: 1n }, redeemer)
    .attach.MintingPolicy(policy)
    .pay.ToAddress(toAddress, { lovelace })
    .attachMetadata(42, {
      p: "preorder",
      w: chunk64(buyerPkh),
      i: (items ?? []).map((it) => [it.id, it.qty]),
    })
    .validFrom(now - 10_000)
    .validTo(now + 60_000)
    .addSigner(senderAddress);

  const signed = await (await tx.complete({ localUPLCEval: false })).sign.withWallet().complete();
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
