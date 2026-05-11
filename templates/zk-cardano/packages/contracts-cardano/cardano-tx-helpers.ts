import {
  Lucid,
  type LucidEvolution,
} from "@lucid-evolution/lucid";
import { Blockfrost } from "@lucid-evolution/provider";
import {
  generateSeedPhrase,
  getAddressDetails,
  PROTOCOL_PARAMETERS_DEFAULT,
} from "@lucid-evolution/utils";

const DOLOS_BLOCKFROST_URL = "http://localhost:3000";
const YACI_ADMIN_URL = "http://localhost:10000";

export const YACI_GENESIS_POOL_HASH =
  "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57";
export const YACI_GENESIS_POOL_BECH32 =
  "pool1wvqhvyrgwch4jq9aa84hc8q4kzvyq2z3xr6mpafkqmx9wce39zy";

let cachedLucid: LucidEvolution | null = null;
let cachedAddress: string | null = null;
let cachedSeed: string | null = null;

export interface FreshLucidResult {
  lucid: LucidEvolution;
  address: string;
  stakingCredential: string;
  seedPhrase: string;
}

export function getStakingCredential(address: string): string {
  const details = getAddressDetails(address);
  if (!details.stakeCredential) {
    throw new Error("Address has no stake credential");
  }
  return details.stakeCredential.hash;
}

export async function createFreshLucid(): Promise<FreshLucidResult> {
  const provider = new Blockfrost(DOLOS_BLOCKFROST_URL, "dev");
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
  const stakingCredential = getStakingCredential(address);

  await topup(address, 10_000);
  await waitForUtxos(lucid, address);

  return { lucid, address, stakingCredential, seedPhrase: seed };
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

  cachedAddress = (await lucid.wallet().address());
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

export async function delegateToPool(
  lucid: LucidEvolution,
  poolId: string,
): Promise<{ txHash: string }> {
  const address = await lucid.wallet().address();
  const details = getAddressDetails(address);
  if (!details.stakeCredential) {
    throw new Error("Wallet address has no stake credential — use a Base address");
  }

  const rewardAddress = (await lucid.wallet().rewardAddress())!;
  if (!rewardAddress) {
    throw new Error("No reward address available from wallet");
  }

  const tx = lucid
    .newTx()
    .registerAndDelegate.ToPool(rewardAddress, poolId);

  const signed = await (await tx.complete()).sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log(`[Lucid] Delegation TX submitted: ${txHash} (pool=${poolId})`);

  await lucid.awaitTx(txHash);
  return { txHash };
}
