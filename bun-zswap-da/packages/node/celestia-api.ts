import {
    CELESTIA_AUTH_TOKEN,
    CELESTIA_FEE,
    CELESTIA_GAS,
    CELESTIA_GAS_LIMIT,
    CELESTIA_GAS_PRICE,
    CELESTIA_MAX_GAS_PRICE,
    CELESTIA_NAMESPACE,
    CELESTIA_NETWORK,
    CELESTIA_RPC_URL,
    CELESTIA_TX_PRIORITY,
  } from "./config.ts";

// ─── Celestia Submission Helper ───────────────────────────────────────────────

function namespaceToBase64(hex: string): string {
    const clean = hex.replace(/^0x/, "");
    const bytes = new Uint8Array(29); // 1-byte version prefix + 28-byte namespace ID
    const hexBytes = (clean.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16));
    bytes.set(hexBytes, 29 - hexBytes.length);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

function rpcHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (CELESTIA_AUTH_TOKEN) h["Authorization"] = `Bearer ${CELESTIA_AUTH_TOKEN}`;
  return h;
}

const RATE_LIMIT_PATTERNS = [
  "429",
  "Too Many Requests",
  "Unavailable",
  "ResourceExhausted",
];

function isRateLimit(msg: string): boolean {
  return RATE_LIMIT_PATTERNS.some((p) => msg.includes(p));
}

async function rpcCall<T = unknown>(
  method: string,
  params: unknown[],
  { retries = 4, baseDelayMs = 1500 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(CELESTIA_RPC_URL, {
        method: "POST",
        headers: rpcHeaders(),
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const json = await res.json();
      if (json.error) {
        const msg = JSON.stringify(json.error);
        if (attempt < retries && isRateLimit(msg)) {
          const delay = baseDelayMs * 2 ** attempt + Math.random() * 500;
          console.warn(
            `[Celestia] ${method} rate-limited (attempt ${attempt + 1}/${retries + 1}), retrying in ${Math.round(delay)}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(msg);
      }
      return json.result as T;
    } catch (e) {
      lastErr = e;
      const msg = (e as Error).message ?? String(e);
      if (attempt < retries && isRateLimit(msg)) {
        const delay = baseDelayMs * 2 ** attempt + Math.random() * 500;
        console.warn(
          `[Celestia] ${method} network-level rate-limit (attempt ${attempt + 1}/${retries + 1}), retrying in ${Math.round(delay)}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export async function getCelestiaHead(): Promise<number> {
  const head = await rpcCall<{ header: { height: string } }>("header.NetworkHead", []);
  return parseInt(head.header.height, 10);
}

function buildTxConfig(): Record<string, unknown> {
  if (CELESTIA_NETWORK !== "mainnet") {
    // Devnet path: legacy shape matches the local celestia-bridge config.
    return { fee: CELESTIA_FEE, gasLimit: CELESTIA_GAS_LIMIT };
  }
  // Mainnet: v0.30+ TxConfig. Every field we populate removes one consensus
  // gRPC call from the submit path. Omitted fields → node auto-estimates.
  const cfg: Record<string, unknown> = {};
  if (CELESTIA_GAS_PRICE !== undefined) cfg["gas_price"] = CELESTIA_GAS_PRICE;
  if (CELESTIA_GAS !== undefined) cfg["gas"] = CELESTIA_GAS;
  if (CELESTIA_MAX_GAS_PRICE !== undefined) cfg["max_gas_price"] = CELESTIA_MAX_GAS_PRICE;
  if (CELESTIA_TX_PRIORITY !== undefined) cfg["tx_priority"] = CELESTIA_TX_PRIORITY;
  return cfg;
}

const TX_CONFIG = buildTxConfig();

export async function submitToCelestia(
    data: string,
  ): Promise<{ txhash: string; height: string } | null> {
    const ns64 = namespaceToBase64(CELESTIA_NAMESPACE);
    const b64 = btoa(unescape(encodeURIComponent(data)));
    try {
      return await rpcCall("blob.Submit", [
        [{ namespace: ns64, data: b64, share_version: 0 }],
        TX_CONFIG,
      ]);
    } catch (e) {
      console.error("[Celestia submit error]", e);
      return null;
    }
  }
