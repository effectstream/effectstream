// api-examples/config.ts
// Run any script: bun run api-examples/<script>.ts
// Override env vars to point at a different environment.

export type NetworkId = "undeployed" | "preview" | "mainnet";

export interface EnvConfig {
  nodeUrl: string;
  batcherUrl: string;
  networkId: NetworkId;
  /** Hex wallet seed (64 chars). Required for wallet / offer / settle scripts. */
  walletSeed: string;
  /** Optional second wallet seed for taker-side settlement demo. */
  takerSeed: string;
}

const PRESETS: Record<NetworkId, Pick<EnvConfig, "nodeUrl" | "batcherUrl" | "networkId">> = {
  undeployed: {
    networkId: "undeployed",
    nodeUrl:   "http://localhost:9999",
    batcherUrl:"http://localhost:3334",
  },
  preview: {
    networkId: "preview",
    nodeUrl:   "https://api-zswap.zkdojo.com",
    batcherUrl:"https://api-zswap.zkdojo.com:3334",
  },
  mainnet: {
    networkId: "mainnet",
    nodeUrl:   "https://api-zswap.zkdojo.com",   // update for mainnet deployment
    batcherUrl:"https://api-zswap.zkdojo.com:3334",
  },
};

const network = (process.env.MIDNIGHT_NETWORK_ID ?? "preview") as NetworkId;
const preset  = PRESETS[network] ?? PRESETS.preview;

export const config: EnvConfig = {
  ...preset,
  nodeUrl:    process.env.NODE_URL    ?? preset.nodeUrl,
  batcherUrl: process.env.BATCHER_URL ?? preset.batcherUrl,
  // Preview genesis wallet (seed 0x…0001) — has funds on undeployed only.
  // On preview/mainnet set WALLET_SEED to your own funded hex seed, or set
  // MIDNIGHT_WALLET_MNEMONIC and run mnemonic-to-seed.ts to derive it.
  walletSeed: process.env.WALLET_SEED ?? "0000000000000000000000000000000000000000000000000000000000000001",
  takerSeed:  process.env.TAKER_SEED  ?? "0000000000000000000000000000000000000000000000000000000000000002",
};

// ── helpers ──────────────────────────────────────────────────────────────────

export async function get<T = unknown>(path: string): Promise<T> {
  const url = `${config.nodeUrl}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function post<T = unknown>(path: string, body: unknown, base = config.nodeUrl): Promise<T> {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: string;
    try { detail = JSON.stringify(await res.json()); } catch { detail = await res.text(); }
    throw new Error(`POST ${url} → ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export function print(label: string, data: unknown) {
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 60 - label.length))}`);
  console.log(JSON.stringify(data, null, 2));
}

export function header(title: string) {
  const line = "═".repeat(64);
  console.log(`\n${line}\n  ${title}\n${line}`);
}
