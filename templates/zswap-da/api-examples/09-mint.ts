// 09-mint.ts — Mint test tokens into the wallet via the on-chain OfferFiles contract.
//
// What this does:
//   1. Fetches /api/midnight/config (contract address, indexer, proof server).
//   2. Builds the maker wallet (WALLET_SEED) and connects to the deployed contract.
//   3. Calls mint_shielded twice (two distinct token colors, stable domain separators)
//      and mint_unshielded once.
//   4. Registers each color with /api/known-tokens for human-readable display.
//   5. Writes the minted colors to /tmp/zswap-minted-tokens.json so 10-submit-offer
//      and 11-settle-offer can consume them automatically.
//
// Domain separators are fixed → same token colors on every run; re-minting adds
// balance to the same coins rather than creating new identities. Nonces use Date.now()
// so each mint call creates a fresh coin commitment (required — duplicates are rejected).
//
// Env overrides:
//   WALLET_SEED=<64-hex>   maker wallet seed (must have NIGHT for dust fees)
//   MINT_AMOUNT=1000000000 amount to mint per token in base units

import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import {
  buildWalletFacade,
  registerNightForDust,
  configureMidnightNodeProviders,
} from "@effectstream/midnight-contracts";
import { OfferFilesContract, witnesses } from "@zswap-da/contract-offer-files";
import { config, get, post, header } from "./config.ts";

globalThis.WebSocket = WebSocket;

const toHex = (u: Uint8Array): string =>
  Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");

// ── ZK artifacts path ──────────────────────────────────────────────────────────
// Resolved relative to this script file so it works regardless of cwd.
const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const ZK_PATH = resolve(
  SCRIPT_DIR,
  "../packages/contracts-midnight/contract-offer-files/src/managed",
);
const PRIVATE_STATE_STORE = "offerFilesPrivateState";

const MINTED_FILE = "/tmp/zswap-minted-tokens.json";
const MINT_AMOUNT = BigInt(process.env.MINT_AMOUNT ?? "1000000000");

// Fixed domain separators → same token colors on every run.
const SEP_A = new Uint8Array(32).fill(0xa1);
const SEP_B = new Uint8Array(32).fill(0xb2);
const SEP_U = new Uint8Array(32).fill(0xc3);

header("Mint Test Tokens");
console.log(`Wallet seed : ${config.walletSeed.slice(0, 8)}…`);
console.log(`Mint amount : ${MINT_AMOUNT.toLocaleString()} base units`);
console.log(`ZK path     : ${ZK_PATH}\n`);

// ── 1. Midnight config ─────────────────────────────────────────────────────────
const midnightCfg = await get<{
  contractAddress: string;
  indexerUri: string;
  indexerWsUri: string;
  proofServerUri: string;
  networkId: string;
}>("/api/midnight/config");

setNetworkId(midnightCfg.networkId as any);

const networkUrls = {
  id:          midnightCfg.networkId as any,
  indexer:     midnightCfg.indexerUri,
  indexerWS:   midnightCfg.indexerWsUri,
  node:        midnightCfg.indexerUri,
  proofServer: midnightCfg.proofServerUri,
};

console.log(`Network     : ${midnightCfg.networkId}`);
console.log(`Contract    : ${midnightCfg.contractAddress}`);
console.log(`Proof server: ${midnightCfg.proofServerUri}\n`);

// ── 2. Build wallet ────────────────────────────────────────────────────────────
console.log("Building wallet + syncing (shielded + unshielded)…");
const wr = await buildWalletFacade(networkUrls, config.walletSeed, midnightCfg.networkId as any);

try {
  await registerNightForDust(wr as any);
} catch {
  console.log("  (NIGHT already registered for dust fees — continuing)");
}

// ── 3. Connect to contract ─────────────────────────────────────────────────────
const compiledContract = CompiledContract.make(
  "contract-offer-files",
  OfferFilesContract.Contract as any,
).pipe(
  CompiledContract.withWitnesses(witnesses as unknown as never),
  CompiledContract.withCompiledFileAssets(ZK_PATH),
);

const providers = (await configureMidnightNodeProviders(
  wr.wallet,
  wr.zswapSecretKeys,
  wr.walletZswapSecretKeys,
  wr.dustSecretKey,
  wr.walletDustSecretKey,
  { indexer: networkUrls.indexer, indexerWS: networkUrls.indexerWS, node: networkUrls.node, proofServer: networkUrls.proofServer },
  PRIVATE_STATE_STORE,
  ZK_PATH,
  wr.unshieldedKeystore,
)) as any;

console.log("Joining deployed contract…");
const deployed = await findDeployedContract(providers, {
  contractAddress: midnightCfg.contractAddress,
  compiledContract: compiledContract as any,
  privateStateId: PRIVATE_STATE_STORE,
  initialPrivateState: {},
});
console.log("  Joined.\n");

// ── 4. Mint tokens ─────────────────────────────────────────────────────────────
const nonceBase = BigInt(Date.now());
const minted: Record<string, string> = {};

for (const [label, sep, idx] of [
  ["shieldedA", SEP_A, 0n],
  ["shieldedB", SEP_B, 1n],
] as const) {
  console.log(`Minting ${label} (proving…)`);
  const tx = await (deployed.callTx as any).mint_shielded(sep, MINT_AMOUNT, nonceBase + idx);
  const coin = tx.private?.result;
  const colorRaw = coin?.color ?? coin?.type;
  if (colorRaw == null) throw new Error(`mint_shielded ${label}: no color in result`);
  const color = (colorRaw instanceof Uint8Array ? toHex(colorRaw) : String(colorRaw)).replace(/^0x/, "").toLowerCase();
  minted[label] = color;
  console.log(`  ✅ ${label}: ${color.slice(0, 16)}…`);
}

console.log("Minting unshielded (proving…)");
const recipientBytes = wr.unshieldedKeystore.getBech32Address
  ? (wr.unshieldedKeystore as any).getPublicKey?.() ?? SEP_U
  : SEP_U;
const utx = await (deployed.callTx as any).mint_unshielded(SEP_U, MINT_AMOUNT, { bytes: recipientBytes instanceof Uint8Array ? recipientBytes : SEP_U });
const ures = utx.private?.result;
minted.unshielded = (ures instanceof Uint8Array ? toHex(ures) : String(ures ?? toHex(SEP_U))).replace(/^0x/, "").toLowerCase();
console.log(`  ✅ unshielded: ${minted.unshielded.slice(0, 16)}…\n`);

// ── 5. Register names ──────────────────────────────────────────────────────────
const registrations = [
  { color: minted.shieldedA,  name: "TESTA", kind: "shielded"   },
  { color: minted.shieldedB,  name: "TESTB", kind: "shielded"   },
  { color: minted.unshielded, name: "TESTU", kind: "unshielded" },
];

console.log("Registering token names…");
for (const r of registrations) {
  try {
    await post("/api/known-tokens", r);
    console.log(`  ✅ ${r.name} registered`);
  } catch (e: any) {
    if (e.message?.includes("409") || e.message?.includes("already")) {
      console.log(`  ⚠️  ${r.name} already registered (OK)`);
    } else {
      console.warn(`  ⚠️  ${r.name}: ${e.message}`);
    }
  }
}

// ── 6. Write token file for downstream scripts ─────────────────────────────────
writeFileSync(MINTED_FILE, JSON.stringify(minted, null, 2));
console.log(`\nMinted colors written to ${MINTED_FILE}`);
console.log(JSON.stringify(minted, null, 2));

console.log("\n✅  Mint complete. Run 10-submit-offer.ts to place a ZSwap using these tokens.");

await wr.wallet.stop?.().catch(() => {});
