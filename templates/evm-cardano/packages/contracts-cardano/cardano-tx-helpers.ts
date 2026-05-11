import {
  Lucid,
  type LucidEvolution,
} from "@lucid-evolution/lucid";
import { Blockfrost } from "@lucid-evolution/provider";
import {
  generateSeedPhrase,
  PROTOCOL_PARAMETERS_DEFAULT,
} from "@lucid-evolution/utils";

const DOLOS_BLOCKFROST_URL = "http://localhost:3000";
const YACI_ADMIN_URL = "http://localhost:10000";

let cachedLucid: LucidEvolution | null = null;
let cachedAddress: string | null = null;

export interface FreshLucidResult {
  lucid: LucidEvolution;
  address: string;
  seedPhrase: string;
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

  const result = await createFreshLucid();
  cachedLucid = result.lucid;
  cachedAddress = result.address;
  console.log(`[Lucid] Wallet address: ${cachedAddress}`);
  return cachedLucid;
}

export function getTestAddress(): string {
  if (!cachedAddress) throw new Error("Call initLucid first");
  return cachedAddress;
}
