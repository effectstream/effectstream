// Midnight wallet seeds and wallet construction for the bridge.
//
// LOCAL mode uses the public dev seeds the `undeployed` dev preset prefunds
// with NIGHT (and DUST registered at genesis):
//   0x…01  operator — deploys the contract and pays the relayer's mint fees
//   0x…02  user     — the default bridge:to-midnight recipient and
//                     bridge:to-solana sender
//   0x…03  user2    — a second test user; ALSO the default local `delivery`
//                     wallet (00058 D-7: it pays for deliveries into contracts,
//                     and only exists while a delivery adapter is configured;
//                     the 00050 suite runs without one)
// They are public, so they are refused on anything but loopback endpoints
// (FR-009).
//
// LIVE mode reads seeds ONLY from the live secrets directory,
// `~/.config/solana-midnight-bridge/` by default (`BRIDGE_SECRETS_DIR`
// overrides it; dir 700, files 600; the same directory as the Solana keys):
//   midnight-operator.seed, midnight-user.seed, midnight-delivery.seed (00058)
// or from an explicit `--seed-file` with the same permission rules. A seed file
// holds a hex seed of 32 to 64 bytes (the dev seeds are 32-byte; Lace and the
// shared test wallets use 64-byte BIP-39 seeds), a BIP-39 mnemonic, or either on
// a `WALLET=` / `SEED=` / `MNEMONIC=` line (see `parseSeedText`).
//
// A seed is never logged, echoed or written anywhere by this module. Never use
// the engine's `buildWalletAndWaitForFunds` here: before PR-1's E7 it logged the
// seed, and `deployMidnightContract` stops a wallet handed to it, so callers
// rebuild after a deploy.
import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import { pbkdf2Sync } from "node:crypto";
import { HDWallet, Roles, validateMnemonic } from "@midnightntwrk/wallet-sdk-hd";
import { ZswapSecretKeys } from "@midnightntwrk/ledger-v9";
import {
  buildWalletFacade,
  syncAndWaitForFunds,
  type WalletResult,
} from "@effectstream/midnight-contracts";
import { formatShieldedAddress } from "@effectstream/midnight-contracts/shielded-address";
import { liveSecretsDir } from "@solana-midnight-bridge/contracts-solana/keys";
import { isLoopbackUrl, type BridgeMidnightMode, type BridgeMidnightUrls } from "./network.ts";

export type MidnightRole = "operator" | "user" | "user2" | "delivery";

const DEV_SEEDS: Record<MidnightRole, string> = {
  operator: "0".repeat(63) + "1",
  user: "0".repeat(63) + "2",
  user2: "0".repeat(63) + "3",
  // 00058 D-7: the delivery wallet (pays composed mint + deposit transactions). Locally it is
  // user2's prefunded dev seed: do not use user2 in another process while the node delivers.
  delivery: "0".repeat(63) + "3",
};
const DEV_SEED_SET = new Set(Object.values(DEV_SEEDS));

export function isDevSeed(seed: string): boolean {
  return DEV_SEED_SET.has(seed.toLowerCase());
}

/** The public dev seed for a local role. */
export function localDevSeed(role: MidnightRole): string {
  return DEV_SEEDS[role];
}

/** The live secrets directory (shared with the Solana keys; `BRIDGE_SECRETS_DIR` overrides it). */
export function liveMidnightSecretsDir(): string {
  return liveSecretsDir();
}

export function liveSeedPath(role: Exclude<MidnightRole, "user2">): string {
  return path.join(liveMidnightSecretsDir(), `midnight-${role}.seed`);
}

function assertPrivate(p: string): void {
  const st = fs.statSync(p);
  if ((st.mode & 0o077) !== 0) {
    throw new Error(
      `${p} is accessible to group/other (mode ${(st.mode & 0o777).toString(8)}); run: chmod ${st.isDirectory() ? "700" : "600"} ${p}`,
    );
  }
}

/** The BIP-39 seed of a mnemonic with an empty passphrase: PBKDF2-HMAC-SHA512(NFKD(mnemonic),
 *  "mnemonic", 2048 iterations, 64 bytes), what `@scure/bip39`'s `mnemonicToSeedSync(m, "")` returns. */
function mnemonicToSeedHex(mnemonic: string): string {
  return pbkdf2Sync(Buffer.from(mnemonic.normalize("NFKD"), "utf8"), Buffer.from("mnemonic", "utf8"), 2048, 64, "sha512").toString("hex");
}

/** The word counts of a BIP-39 mnemonic. */
const MNEMONIC_WORDS = [12, 15, 18, 21, 24];

/**
 * A Midnight wallet seed (lowercase hex) from the text of a seed file. The same forms as Night
 * Market's `parseSponsorSeed` (00057 Q13 A):
 * - a hex seed of 32 to 64 bytes (64 to 128 hex characters, an even number), with or without
 *   `0x`: this template's 32-byte seeds and the 64-byte BIP-39 seeds of Lace and the shared test
 *   wallets. The HD wallet is derived from these bytes directly (`HDWallet.fromSeed`), so a 64-byte
 *   seed gives the same addresses as the wallet that made it;
 * - a BIP-39 mnemonic of 12, 15, 18, 21 or 24 English words (checksum checked): its BIP-39 seed
 *   with an empty passphrase (64 bytes);
 * - either of them on a `WALLET=`, `SEED=` or `MNEMONIC=` line (optionally `export`ed, optionally
 *   quoted), the format of the shared test wallets; the last such line wins.
 * Throws otherwise. An error never contains the value.
 */
export function parseSeedText(text: string): string {
  let value = text.trim();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?(WALLET|SEED|MNEMONIC)\s*=\s*(.*)$/.exec(line);
    if (m) value = (m[2] ?? "").trim().replace(/^['"]|['"]$/g, "");
  }
  const hex = value.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]+$/.test(hex)) {
    if (hex.length < 64 || hex.length > 128 || hex.length % 2 !== 0) {
      throw new Error(`a hex seed must be 32 to 64 bytes (64 to 128 hex characters, an even number), got ${hex.length} characters`);
    }
    return hex.toLowerCase();
  }
  const words = value.split(/\s+/).filter(Boolean);
  if (MNEMONIC_WORDS.includes(words.length)) {
    const mnemonic = words.join(" ").toLowerCase();
    if (!validateMnemonic(mnemonic)) throw new Error(`it holds ${words.length} words that are not a valid BIP-39 mnemonic (English wordlist, checksum)`);
    return mnemonicToSeedHex(mnemonic);
  }
  throw new Error("it must hold a hex seed (32 to 64 bytes), a BIP-39 mnemonic (12 to 24 words), or one of them on a WALLET=, SEED= or MNEMONIC= line");
}

/** Reads a seed from a private file (the file and its directory must be 600/700); see `parseSeedText`. */
export function readSeedFile(file: string): string {
  if (!fs.existsSync(file)) throw new Error(`seed file not found: ${file}`);
  assertPrivate(path.dirname(path.resolve(file)));
  assertPrivate(file);
  try {
    return parseSeedText(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`seed file ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * The seed for `role` in `mode`:
 * - local: `seedFile` if given, else the public dev seed;
 * - live (`stagenet` mode): `seedFile` if given, else <live secrets dir>/midnight-<role>.seed.
 * Dev seeds are refused unless every endpoint is loopback.
 */
export function resolveSeed(
  mode: BridgeMidnightMode,
  role: MidnightRole,
  urls: BridgeMidnightUrls,
  seedFile?: string,
): string {
  let seed: string;
  if (seedFile) {
    seed = readSeedFile(seedFile);
  } else if (mode === "local") {
    seed = localDevSeed(role);
  } else {
    if (role === "user2") throw new Error("live mode has no user2 seed; pass --seed-file");
    seed = readSeedFile(liveSeedPath(role));
  }
  assertSeedAllowed(seed, urls);
  return seed;
}

/** Refuses a public dev seed on any non-loopback Midnight endpoint (FR-009). */
export function assertSeedAllowed(seed: string, urls: Pick<BridgeMidnightUrls, "id" | "indexer" | "node">): void {
  if (!isDevSeed(seed)) return;
  const local = urls.id === "undeployed" && isLoopbackUrl(urls.indexer) && isLoopbackUrl(urls.node);
  if (!local) {
    throw new Error(
      `refusing a public local dev seed on network "${urls.id}" (${new URL(urls.indexer).host}); use a seed from ${liveMidnightSecretsDir()} (FR-009)`,
    );
  }
}

function deriveRoleSeed(seed: string, role: (typeof Roles)[keyof typeof Roles]): Uint8Array {
  const hd = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hd.type !== "seedOk") throw new Error(`cannot derive an HD wallet from the seed (${hd.type})`);
  const r = hd.hdWallet.selectAccount(0).selectRole(role).deriveKeyAt(0);
  if (r.type === "keyOutOfBounds") throw new Error("key derivation out of bounds");
  const key = Uint8Array.from(r.key);
  hd.hdWallet.clear();
  return key;
}

/** The wallet's shielded public keys (lowercase hex), without starting a wallet. */
export function shieldedKeysFromSeed(seed: string): { coinPublicKey: string; encryptionPublicKey: string } {
  const keys = ZswapSecretKeys.fromSeed(deriveRoleSeed(seed, Roles.Zswap));
  return {
    coinPublicKey: String(keys.coinPublicKey).toLowerCase(),
    encryptionPublicKey: String(keys.encryptionPublicKey).toLowerCase(),
  };
}

/** `mn_shield-addr_<network>1…` for a seed. */
export function shieldedAddressFromSeed(seed: string, networkId: string): string {
  return formatShieldedAddress(shieldedKeysFromSeed(seed), networkId);
}

/**
 * Builds a wallet whose facade proves DUST/zswap on `urls.proofServer`, then
 * waits until it is synced. The caller must `wallet.stop()` it.
 */
export async function buildBridgeWallet(
  urls: BridgeMidnightUrls,
  seed: string,
  opts: { timeoutMs?: number } = {},
): Promise<WalletResult> {
  assertSeedAllowed(seed, urls);
  const result = await buildWalletFacade(
    { id: urls.id, indexer: urls.indexer, indexerWS: urls.indexerWS, node: urls.node, proofServer: urls.proofServer },
    seed,
    urls.id,
  );
  await syncAndWaitForFunds(result.wallet, { timeoutMs: opts.timeoutMs ?? 900_000 });
  return result;
}
