/**
 * Validates .env for the zswap-da preview environment.
 * Reads .env from disk but never prints values — only ✓/✗ status.
 * Usage: bun check-env.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(ROOT, ".env");

// ── env file parser ────────────────────────────────────────────────────────────

function parseEnvFile(path: string): Map<string, string> {
  const map = new Map<string, string>();
  const content = readFileSync(path, "utf-8");
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Quoted values: keep as-is, strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      // Unquoted: strip inline comments (# preceded by whitespace)
      val = val.replace(/\s+#.*$/, "").trim();
    }
    if (key) map.set(key, val);
  }
  return map;
}

// ── helpers ────────────────────────────────────────────────────────────────────

const isHex = (s: string, exactBytes?: number) =>
  /^[0-9a-fA-F]+$/.test(s) && (exactBytes === undefined || s.length === exactBytes * 2);

const isPositiveInt = (s: string) => /^\d+$/.test(s) && parseInt(s, 10) > 0;

const isUrl = (s: string) => /^https?:\/\/.+/.test(s);

type Result = { label: string; ok: boolean; hint?: string };

const pass = (label: string): Result => ({ label, ok: true });
const fail = (label: string, hint?: string): Result => ({ label, ok: false, hint });

// ── file guard ─────────────────────────────────────────────────────────────────

if (!existsSync(ENV_PATH)) {
  console.error("✗  .env not found");
  console.error("   Run:  cp .env.preview.example .env  then fill in the required values");
  process.exit(1);
}

const env = parseEnvFile(ENV_PATH);
const get = (k: string) => env.get(k) ?? "";

// ── static checks ──────────────────────────────────────────────────────────────

const results: Result[] = [];

// Midnight
const networkId = get("MIDNIGHT_NETWORK_ID");
results.push(
  networkId === "preview"
    ? pass("MIDNIGHT_NETWORK_ID = preview")
    : fail("MIDNIGHT_NETWORK_ID", `expected "preview", got "${networkId || "(unset)"}"`),
);

const contractAddr = get("MIDNIGHT_CONTRACT_ADDRESS");
if (!contractAddr) {
  results.push(fail("MIDNIGHT_CONTRACT_ADDRESS", "not set — run deploy.ts with MIDNIGHT_NETWORK_ID=preview"));
} else if (!isHex(contractAddr, 32)) {
  results.push(fail("MIDNIGHT_CONTRACT_ADDRESS", "must be 64-char hex (32 bytes)"));
} else {
  // Cross-check against committed preview.json if it exists
  const previewJsonPath = resolve(ROOT, "packages/contracts-midnight/contract-offer-files.preview.json");
  if (existsSync(previewJsonPath)) {
    const committed = JSON.parse(readFileSync(previewJsonPath, "utf-8")).contractAddress as string;
    if (contractAddr.toLowerCase() !== committed.toLowerCase()) {
      results.push(fail(
        "MIDNIGHT_CONTRACT_ADDRESS",
        "does not match packages/contracts-midnight/contract-offer-files.preview.json — wrong address?",
      ));
    } else {
      results.push(pass("MIDNIGHT_CONTRACT_ADDRESS — matches preview.json ✓"));
    }
  } else {
    results.push(pass("MIDNIGHT_CONTRACT_ADDRESS — set, 64-char hex"));
  }
}

const midnightStart = get("MIDNIGHT_START_BLOCK");
if (midnightStart && !isPositiveInt(midnightStart)) {
  results.push(fail("MIDNIGHT_START_BLOCK", "must be a positive integer if set"));
} else {
  results.push(pass(`MIDNIGHT_START_BLOCK — ${midnightStart || "1 (default)"}`));
}

// Celestia
const celestiaNetwork = get("CELESTIA_NETWORK");
results.push(
  celestiaNetwork === "mocha"
    ? pass("CELESTIA_NETWORK = mocha")
    : fail("CELESTIA_NETWORK", `expected "mocha", got "${celestiaNetwork || "(unset)"}"`),
);

const namespace = get("CELESTIA_NAMESPACE");
results.push(
  isHex(namespace, 10)
    ? pass("CELESTIA_NAMESPACE — 20-char hex (10 bytes)")
    : fail("CELESTIA_NAMESPACE", "must be 20-char hex (10 bytes), e.g. 000000000000deadbeef"),
);

const rpcUrl = get("CELESTIA_RPC_URL");
results.push(
  isUrl(rpcUrl)
    ? pass("CELESTIA_RPC_URL — set")
    : fail("CELESTIA_RPC_URL", "not set or not a valid URL — paste your QuickNode Mocha-4 endpoint"),
);

const startHeight = get("CELESTIA_START_HEIGHT");
if (startHeight && !isPositiveInt(startHeight)) {
  results.push(fail("CELESTIA_START_HEIGHT", "must be a positive integer if set"));
} else {
  results.push(pass(`CELESTIA_START_HEIGHT — ${startHeight || "(default 1)"}`));
}

const pollMs = get("CELESTIA_POLLING_INTERVAL_MS");
if (pollMs && !isPositiveInt(pollMs)) {
  results.push(fail("CELESTIA_POLLING_INTERVAL_MS", "must be a positive integer if set"));
} else {
  results.push(pass(`CELESTIA_POLLING_INTERVAL_MS — ${pollMs || "3000 (default)"}`));
}

// Batcher wallet
const batcherSeed = get("BATCHER_WALLET_SEED");
const seedIsPlaceholder = batcherSeed.startsWith("<") || batcherSeed === "";
if (seedIsPlaceholder) {
  results.push(fail(
    "BATCHER_WALLET_SEED",
    "not set — batcher will use a dev seed (no real funds).\n       Run: MIDNIGHT_NETWORK_ID=preview bun mnemonic-to-seed.ts",
  ));
} else if (!isHex(batcherSeed) || (batcherSeed.length !== 64 && batcherSeed.length !== 128)) {
  results.push(fail("BATCHER_WALLET_SEED", `must be hex, 64 chars (32-byte key) or 128 chars (BIP39 64-byte seed); got ${batcherSeed.length} chars`));
} else {
  results.push(pass("BATCHER_WALLET_SEED — set, 64-char hex"));
}

// ── print static results ───────────────────────────────────────────────────────

let allOk = true;
for (const r of results) {
  const icon = r.ok ? "✓" : "✗";
  const line = `  ${icon}  ${r.label}`;
  console.log(r.hint ? `${line}\n       ↳ ${r.hint}` : line);
  if (!r.ok) allOk = false;
}

// ── live connectivity check ────────────────────────────────────────────────────

console.log("");
process.stdout.write("  ⋯  CELESTIA_RPC_URL live check … ");

if (!isUrl(rpcUrl)) {
  console.log("skipped (URL not set)");
  allOk = false;
} else {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "header.NetworkHead", params: [], id: 1 }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json() as any;
    const height = data?.result?.header?.height;
    if (height) {
      console.log(`✓  reachable, chain head = ${height}`);
    } else {
      console.log("✗  responded but unexpected format — wrong URL?");
      console.log(`       response: ${JSON.stringify(data).slice(0, 120)}`);
      allOk = false;
    }
  } catch (e: any) {
    console.log(`✗  ${e.message}`);
    allOk = false;
  }
}

// ── summary ────────────────────────────────────────────────────────────────────

console.log("");
if (allOk) {
  console.log("  ✓  All checks passed — ready for:  docker compose up --build");
} else {
  console.log("  ✗  Fix the issues above, then re-run:  bun check-env.ts");
  process.exit(1);
}
