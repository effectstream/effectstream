import {
  Lucid,
  type LucidEvolution,
  Constr,
  Data,
  SLOT_CONFIG_NETWORK,
} from "@lucid-evolution/lucid";
import { Blockfrost } from "@lucid-evolution/provider";
import {
  generateSeedPhrase,
  getAddressDetails,
  PROTOCOL_PARAMETERS_DEFAULT,
  mintingPolicyToId,
  paymentCredentialOf,
  toUnit,
} from "@lucid-evolution/utils";
import fs from "node:fs";
import path from "node:path";

const DOLOS_BLOCKFROST_URL = "http://localhost:3000";
const YACI_ADMIN_URL = "http://localhost:10000";

import { CARDANO_PAYMENT_ADDRESS } from "./constants.ts";
export { CARDANO_PAYMENT_ADDRESS };

let cachedLucid: LucidEvolution | null = null;
let cachedAddress: string | null = null;
let cachedSeed: string | null = null;
// Reference to the active Blockfrost provider so buyItemsCardano can set a mint ex-units budget.
let activeProvider: any = null;

export interface FreshLucidResult {
  lucid: LucidEvolution;
  address: string;
  seedPhrase: string;
}

export async function createFreshLucid(): Promise<FreshLucidResult> {
  const provider = new Blockfrost(DOLOS_BLOCKFROST_URL, "dev");
  activeProvider = provider;
  provider.evaluateTx = async (_tx: string, _utxos?: any) => {
    return [{ redeemer_tag: "spend", redeemer_index: 0, ex_units: { mem: 10_000_000, steps: 5_000_000_000 } }];
  };
  provider.submitTx = async (tx: string): Promise<string> => {
    const res = await fetch(`${YACI_ADMIN_URL}/local-cluster/api/tx/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor" },
      body: Buffer.from(tx, "hex"),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`YACI tx submit failed (${res.status}): ${text}`);
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

  return { lucid, address, seedPhrase: seed };
}

async function topup(address: string, adaAmount: number): Promise<void> {
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const res = await fetch(`${YACI_ADMIN_URL}/local-cluster/api/addresses/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, adaAmount }),
      });
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Topup failed for ${address}`);
}

async function waitForUtxos(lucid: LucidEvolution, address: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const utxos = await lucid.utxosAt(address);
    if (utxos.length > 0) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for UTxOs");
}

export async function initLucid(): Promise<LucidEvolution> {
  if (cachedLucid) return cachedLucid;

  const provider = new Blockfrost(DOLOS_BLOCKFROST_URL, "dev");
  activeProvider = provider;
  provider.evaluateTx = async (_tx: string, _utxos?: any) => {
    return [{ redeemer_tag: "spend", redeemer_index: 0, ex_units: { mem: 10_000_000, steps: 5_000_000_000 } }];
  };
  provider.submitTx = async (tx: string): Promise<string> => {
    const res = await fetch(`${YACI_ADMIN_URL}/local-cluster/api/tx/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor" },
      body: Buffer.from(tx, "hex"),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`YACI tx submit failed (${res.status}): ${text}`);
    }
    const result = await res.text();
    return result.replace(/^"|"$/g, "");
  };
  const lucid = await Lucid(provider, "Custom", {
    presetProtocolParameters: PROTOCOL_PARAMETERS_DEFAULT,
  });

  cachedSeed = generateSeedPhrase();
  lucid.selectWallet.fromSeed(cachedSeed);

  cachedAddress = await lucid.wallet().address();
  console.log(`[Lucid] Wallet address: ${cachedAddress}`);

  await topup(cachedAddress, 10_000);
  console.log("[Lucid] Topup submitted, waiting for UTxOs...");

  await waitForUtxos(lucid, cachedAddress);
  console.log("[Lucid] UTxOs available, wallet ready.");

  cachedLucid = lucid;
  return lucid;
}

export function getTestAddress(): string {
  if (!cachedAddress) throw new Error("Call initLucid first");
  return cachedAddress;
}

// A fresh referrer { pkh, address } for tests — the address's payment credential is the pkh,
// so the validator's `pays_to(output, referrer_pkh)` check matches the reward output.
export async function makeReferrer(): Promise<{ pkh: string; address: string }> {
  const r = await createFreshLucid();
  return { pkh: paymentCredentialOf(r.address).hash, address: r.address };
}

export async function sendAdaPayment(
  lucid: LucidEvolution,
  toAddress: string,
  lovelace: bigint,
  metadata?: { sender: string; items: [number, number][] },
): Promise<{ txHash: string }> {
  let tx = lucid.newTx().pay.ToAddress(toAddress, { lovelace });
  if (metadata) {
    const sender = metadata.sender;
    const w = sender.length > 64
      ? [sender.slice(0, 64), sender.slice(64)]
      : [sender];
    tx = tx.attachMetadata(42, {
      p: "preorder",
      w,
      i: metadata.items.map(([id, qty]) => [id, qty]),
    });
  }
  const signed = await (await tx.complete()).sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log(`[Lucid] ADA payment TX submitted: ${txHash} (${lovelace} lovelace to ${toAddress})`);
  await lucid.awaitTx(txHash);
  return { txHash };
}

let slotConfigInitialized = false;

/** Seed Lucid's "Custom" slot config from YACI so validFrom/validTo map to correct slots. */
export async function ensureYaciSlotConfig(force = false): Promise<void> {
  if (slotConfigInitialized && !force) return;
  const res = await fetch(`${YACI_ADMIN_URL}/local-cluster/api/admin/devnet`);
  const devnet = await res.json();
  SLOT_CONFIG_NETWORK["Custom"] = {
    zeroTime: devnet.startTime * 1000,
    zeroSlot: 0,
    slotLength: 1000,
  };
  slotConfigInitialized = true;
}

function loadReceiptPolicy() {
  const __dirname = import.meta.dirname!;
  const appliedScript = fs
    .readFileSync(path.resolve(__dirname, "temp/receipt-applied-script.txt"), "utf-8")
    .trim();
  const policy = { type: "PlutusV3" as const, script: appliedScript };
  return { policy, policyId: mintingPolicyToId(policy) };
}

// Referrer reward bps baked into the validator (build-validator.ts writes it to receipt-params.json).
function loadReferrerRewardBps(): bigint {
  try {
    const params = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname!, "temp/receipt-params.json"), "utf-8"),
    );
    return BigInt(params.referrerRewardBps ?? 500);
  } catch {
    return 500n;
  }
}

/**
 * Build & submit a purchase: mint 1 receipt token (assetName = buyer pkh), pay `payLovelace`
 * to the launchpad address, attach label-42 metadata for the STM.
 *
 * `claimedLovelace` is what the on-chain validator checks (paid >= claimed).
 * `payLovelace` lets tests underpay (payLovelace < claimedLovelace) to prove on-chain rejection.
 */
export async function buyItemsCardano(
  lucid: LucidEvolution,
  items: [number, number][],
  claimedLovelace: bigint,
  payLovelace: bigint = claimedLovelace,
  // Optional referrer (mirrors the EVM `referrer`): { pkh, address }. When present the validator
  // requires an output paying it `claimed * REFERRER_REWARD_BPS / 10000` and that it isn't the buyer.
  referrer?: { pkh: string; address: string },
): Promise<{ txHash: string; policyId: string; buyerPkh: string }> {
  await ensureYaciSlotConfig(true);
  const { policy, policyId } = loadReceiptPolicy();

  const buyerAddr = await lucid.wallet().address();
  const buyerPkh = paymentCredentialOf(buyerAddr).hash; // 28-byte hex
  const unit = toUnit(policyId, buyerPkh); // assetName = buyer pkh

  const referrerPkh = referrer?.pkh ?? "";
  const referrerReward = referrer ? (claimedLovelace * loadReferrerRewardBps()) / 10000n : 0n;

  // Redeemer PurchaseRedeemer { buyer, referrer, claimed_lovelace } -> Constr(0, [...])
  const redeemer = Data.to(new Constr(0, [buyerPkh, referrerPkh, claimedLovelace]));

  // metadata `w` (sender) is chunked to <=64 chars like the existing sendAdaPayment()
  const chunk = (s: string) => (s.length > 64 ? [s.slice(0, 64), s.slice(64)] : [s]);
  const w = chunk(buyerPkh);

  // With localUPLCEval:false, Lucid asks the provider for redeemer ex_units. The default stub
  // returns a "spend" entry, but this is a Plutus *minting* policy with a redeemer — so we point
  // evaluateTx at a generous "mint" budget (under protocol max, well above the tiny script's real
  // cost). Real script validation still happens on-chain at YACI submit.
  if (activeProvider) {
    activeProvider.evaluateTx = async () => [
      { redeemer_tag: "mint", redeemer_index: 0, ex_units: { mem: 10_000_000, steps: 5_000_000_000 } },
    ];
  }

  const now = Date.now();
  const meta: Record<string, unknown> = {
    p: "preorder",
    w,
    i: items.map(([id, qty]) => [id, qty]),
  };
  if (referrer) meta.r = chunk(referrerPkh);

  let tx = lucid
    .newTx()
    .mintAssets({ [unit]: 1n }, redeemer)
    .attach.MintingPolicy(policy)
    .pay.ToAddress(CARDANO_PAYMENT_ADDRESS, { lovelace: payLovelace })
    .attachMetadata(42, meta)
    .validFrom(now - 10_000)
    .validTo(now + 60_000)
    .addSigner(buyerAddr);

  // Referrer reward output (mirrors the EVM launchpad paying the referrer their cut).
  if (referrer && referrerReward > 0n) {
    tx = tx.pay.ToAddress(referrer.address, { lovelace: referrerReward });
  }

  // localUPLCEval:false -> use provider.evaluateTx (mint budget above); real validation at YACI submit.
  const signed = await (await tx.complete({ localUPLCEval: false })).sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log(`[Lucid] Purchase TX submitted: ${txHash} (policy=${policyId}, buyer=${buyerPkh})`);
  await lucid.awaitTx(txHash);
  return { txHash, policyId, buyerPkh };
}
