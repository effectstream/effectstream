// Keypair files and the FR-009 guards.
//
// Two kinds of keys exist:
// - LOCAL keys live in this package's `keypair/` directory. Only
//   `keypair/bridge-program.json` is committed (its secret is public); the
//   local operator and dev user are generated on first use and gitignored.
//   They are for the local validator only and are refused on any RPC that is
//   not local.
// - LIVE keys live only in the live secrets directory, by default
//   `~/.config/solana-midnight-bridge/` (`BRIDGE_SECRETS_DIR` overrides it;
//   dir 700, files 600), never inside this template, and are never committed
//   or printed.
//
// Nothing here ever logs secret key bytes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { LOCAL_BRIDGE_PROGRAM_ID } from "./program-id.ts";

export const PACKAGE_DIR = import.meta.dirname!;
export const TEMPLATE_ROOT = path.resolve(PACKAGE_DIR, "../..");
export const LOCAL_KEY_DIR = path.join(PACKAGE_DIR, "keypair");

/** Local-only key files. Only `program` is committed. */
export const LOCAL_KEYS = {
  program: path.join(LOCAL_KEY_DIR, "bridge-program.json"),
  operator: path.join(LOCAL_KEY_DIR, "local-operator.json"),
  user: path.join(LOCAL_KEY_DIR, "local-user.json"),
} as const;

/**
 * Live secrets directory: `$BRIDGE_SECRETS_DIR` when set (a leading `~/` is
 * expanded), else `~/.config/solana-midnight-bridge/`. It must never be inside
 * this template: live keys never live in the repository.
 */
export function liveSecretsDir(env: Record<string, string | undefined> = process.env): string {
  const raw = env.BRIDGE_SECRETS_DIR?.trim();
  const home = os.homedir();
  const dir = raw
    ? path.resolve(raw === "~" ? home : raw.startsWith("~/") ? path.join(home, raw.slice(2)) : raw)
    : path.join(home, ".config", "solana-midnight-bridge");
  if (isInside(realOrResolved(dir), realOrResolved(TEMPLATE_ROOT))) {
    throw new Error(`BRIDGE_SECRETS_DIR ${dir} is inside the template; live secrets must live outside the repository`);
  }
  return dir;
}

/** Live key files, by role. */
export function liveKeyPaths() {
  const dir = liveSecretsDir();
  return {
    dir,
    operator: path.join(dir, "solana-operator.json"),
    user: path.join(dir, "solana-user.json"),
    program: path.join(dir, "solana-bridge-program.json"),
  };
}

// ── Keypair files ────────────────────────────────────────────────────────────

/** Reads a Solana CLI keypair file (JSON array of 64 bytes). */
export function readKeypairFile(file: string): Keypair {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`cannot read keypair file ${file}: ${(e as Error).message}`);
  }
  if (!Array.isArray(raw) || raw.length !== 64 || !raw.every((n) => Number.isInteger(n) && n >= 0 && n < 256)) {
    throw new Error(`keypair file ${file} is not a 64-byte JSON array`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(raw as number[]));
}

/** Writes a keypair file with mode 600. Refuses to overwrite. */
export function writeKeypairFile(file: string, kp: Keypair): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(Array.from(kp.secretKey)), {
    mode: 0o600,
    flag: "wx",
  });
}

/** Loads `file`, or generates a fresh keypair there (mode 600) if it is absent. */
export function loadOrCreateKeypair(file: string): { keypair: Keypair; created: boolean } {
  if (fs.existsSync(file)) return { keypair: readKeypairFile(file), created: false };
  const keypair = Keypair.generate();
  writeKeypairFile(file, keypair);
  return { keypair, created: true };
}

/** The local operator (mint authority, payer, bridge operator) for the local validator. */
export function loadLocalOperator(): Keypair {
  return loadOrCreateKeypair(LOCAL_KEYS.operator).keypair;
}

/** The local dev user (depositor) for the local validator. */
export function loadLocalUser(): Keypair {
  return loadOrCreateKeypair(LOCAL_KEYS.user).keypair;
}

// ── RPC classification ───────────────────────────────────────────────────────

function hostOf(rpcUrl: string): string {
  let u: URL;
  try {
    u = new URL(rpcUrl);
  } catch {
    throw new Error(`not a valid RPC URL: ${redactRpcUrl(rpcUrl)}`);
  }
  return u.hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
}

/** True for localhost, 127.0.0.0/8 and ::1. */
export function isLoopbackRpcUrl(rpcUrl: string): boolean {
  const h = hostOf(rpcUrl);
  return h === "localhost" || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}

const PRIVATE_IPV4 = [/^10(\.\d{1,3}){3}$/, /^192\.168(\.\d{1,3}){2}$/, /^172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}$/];

/**
 * Extra hosts that count as local, from `BRIDGE_LOCAL_RPC_HOSTS` (comma list).
 * Meant for Docker layouts where the validator is a sibling service
 * (`http://validator:8899`). Only single-label names (no dot) and private IPv4
 * addresses are accepted, so a public cluster can never be allow-listed.
 */
export function extraLocalRpcHosts(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.BRIDGE_LOCAL_RPC_HOSTS ?? "";
  const hosts = raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  for (const h of hosts) {
    const singleLabel = /^[a-z0-9][a-z0-9-]*$/.test(h);
    if (!singleLabel && !PRIVATE_IPV4.some((re) => re.test(h))) {
      throw new Error(
        `BRIDGE_LOCAL_RPC_HOSTS entry "${h}" is not a single-label hostname or a private IPv4 address`,
      );
    }
  }
  return hosts;
}

/** Loopback, or explicitly allow-listed through BRIDGE_LOCAL_RPC_HOSTS. */
export function isLocalRpcUrl(
  rpcUrl: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return isLoopbackRpcUrl(rpcUrl) || extraLocalRpcHosts(env).includes(hostOf(rpcUrl));
}

/** Throws unless `rpcUrl` is local. Used before any local (dev) key signs. */
export function assertLocalRpc(
  rpcUrl: string,
  what: string,
  env: Record<string, string | undefined> = process.env,
): void {
  if (!isLocalRpcUrl(rpcUrl, env)) {
    throw new Error(
      `${what} uses local-only dev keys and refuses the non-local RPC ${redactRpcUrl(rpcUrl)} (FR-009). ` +
        `Use the live scripts with keys from ${liveSecretsDir()} instead.`,
    );
  }
}

/** `protocol//host[:port]` only: keyed RPC URLs carry API keys in the path or query. */
/** Live mode's default Solana RPC: the public devnet endpoint (rate-limited; fine for a try, not for a node). */
export const DEFAULT_DEVNET_RPC_URL = "https://api.devnet.solana.com";

/**
 * Live mode's Solana RPC URL, in this order:
 * 1. the first line of the file `SOLANA_DEVNET_RPC_URL_FILE` (mode 600, like the keys): for a
 *    provider URL that carries an API key, so the key never sits in an environment variable, a
 *    compose file or a log;
 * 2. `SOLANA_DEVNET_RPC_URL`;
 * 3. {@link DEFAULT_DEVNET_RPC_URL}.
 * The value is never printed by this template: logs use {@link redactRpcUrl} (the origin only).
 */
export function liveSolanaRpcUrl(env: Record<string, string | undefined> = process.env): string {
  const file = env.SOLANA_DEVNET_RPC_URL_FILE?.trim();
  if (file) {
    if (!fs.existsSync(file)) throw new Error(`SOLANA_DEVNET_RPC_URL_FILE: ${file} does not exist`);
    assertPrivatePermissions(file);
    const url = (fs.readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.trim() !== "") ?? "").trim();
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new Error(`SOLANA_DEVNET_RPC_URL_FILE: ${file} does not hold an http(s) URL`);
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`SOLANA_DEVNET_RPC_URL_FILE: ${file} does not hold an http(s) URL`);
    return url;
  }
  return env.SOLANA_DEVNET_RPC_URL?.trim() || DEFAULT_DEVNET_RPC_URL;
}

export function redactRpcUrl(rpcUrl: string): string {
  try {
    const u = new URL(rpcUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "<unparseable RPC URL>";
  }
}

// ── Local-key detection ──────────────────────────────────────────────────────

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function realOrResolved(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** Public keys of every local key that exists on disk, plus the committed program id. */
export function localPublicKeys(): Set<string> {
  const out = new Set<string>([LOCAL_BRIDGE_PROGRAM_ID]);
  for (const file of Object.values(LOCAL_KEYS)) {
    if (!fs.existsSync(file)) continue;
    try {
      out.add(readKeypairFile(file).publicKey.toBase58());
    } catch {
      /* not a keypair; ignore */
    }
  }
  return out;
}

/**
 * True when a key must be treated as local-only: its file lives inside this
 * template (committed or gitignored), or its public key is the committed
 * program id or one of the local dev keys.
 */
export function isLocalOnlyKey(file: string, publicKey: PublicKey): boolean {
  if (isInside(realOrResolved(file), realOrResolved(TEMPLATE_ROOT))) return true;
  return localPublicKeys().has(publicKey.toBase58());
}

// ── Live secrets ─────────────────────────────────────────────────────────────

/** Refuses a live secret that group/other can read (dir must be 700, files 600). */
export function assertPrivatePermissions(p: string): void {
  const st = fs.statSync(p);
  if ((st.mode & 0o077) !== 0) {
    throw new Error(
      `${p} is accessible to group/other (mode ${(st.mode & 0o777).toString(8)}); ` +
        `run: chmod ${st.isDirectory() ? "700" : "600"} ${p}`,
    );
  }
}

/**
 * Loads a live key from the live secrets directory (`liveSecretsDir()`) after
 * checking its permissions and that it is not a local (committed or template) key.
 */
export function loadLiveKeypair(file: string, role: string): Keypair {
  const dir = liveSecretsDir();
  if (!isInside(realOrResolved(file), realOrResolved(dir))) {
    throw new Error(`${role} key must live in ${dir}; refusing ${file}`);
  }
  if (!fs.existsSync(file)) {
    throw new Error(`${role} key not found at ${file}`);
  }
  assertPrivatePermissions(dir);
  assertPrivatePermissions(file);
  const kp = readKeypairFile(file);
  if (isLocalOnlyKey(file, kp.publicKey)) {
    throw new Error(`${role} key ${kp.publicKey.toBase58()} is a local-only dev key; refusing it for a live deploy (FR-009)`);
  }
  return kp;
}

/**
 * The checks `deploy-devnet.ts` runs before any transaction, as a pure function
 * so the tests can exercise them without a cluster:
 * - the program key is never the committed local program key (on ANY RPC:
 *   its secret is public, so anyone could claim the address first);
 * - no local key is used on a non-loopback RPC;
 * - operator and program keys differ.
 */
export function checkLiveDeployKeys(args: {
  rpcUrl: string;
  operator: { file: string; publicKey: PublicKey };
  program: { file: string; publicKey: PublicKey };
}): void {
  if (args.program.publicKey.toBase58() === LOCAL_BRIDGE_PROGRAM_ID) {
    throw new Error(
      `refusing to deploy with the committed local program key ${LOCAL_BRIDGE_PROGRAM_ID}; ` +
        `use a fresh program keypair in ${liveSecretsDir()}`,
    );
  }
  const remote = !isLoopbackRpcUrl(args.rpcUrl);
  for (const [role, k] of [["operator", args.operator], ["program", args.program]] as const) {
    if (remote && isLocalOnlyKey(k.file, k.publicKey)) {
      throw new Error(
        `refusing the local-only ${role} key ${k.publicKey.toBase58()} on the non-loopback RPC ${redactRpcUrl(args.rpcUrl)} (FR-009)`,
      );
    }
  }
  if (args.operator.publicKey.equals(args.program.publicKey)) {
    throw new Error("the operator key and the program key must differ");
  }
}

// ── Live cluster ─────────────────────────────────────────────────────────────

/** Genesis hashes of the public Solana clusters. */
export const SOLANA_GENESIS = {
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
} as const;

/**
 * The cluster check `deploy-devnet.ts` runs before any transaction; returns the
 * cluster label written to the deployment file:
 * - mainnet-beta is always refused (this bridge is a proof of concept);
 * - with `expectedGenesis` (SOLANA_EXPECTED_GENESIS_HASH) the cluster must have
 *   exactly that genesis: this is how live mode targets a cluster other than
 *   devnet, e.g. a separately started test validator standing in for devnet
 *   (PR-2 T7). The label is the public cluster's name, else "custom";
 * - otherwise devnet is required, except on a loopback RPC (the test seam,
 *   labelled "unknown").
 */
export function checkDeployCluster(args: { rpcUrl: string; genesis: string; expectedGenesis?: string }): string {
  const known = (Object.keys(SOLANA_GENESIS) as (keyof typeof SOLANA_GENESIS)[]).find((k) => SOLANA_GENESIS[k] === args.genesis);
  if (known === "mainnet-beta") throw new Error("refusing to deploy the POC bridge to mainnet-beta");
  const expected = args.expectedGenesis?.trim();
  if (expected) {
    if (args.genesis !== expected) {
      throw new Error(`SOLANA_EXPECTED_GENESIS_HASH is ${expected}, but ${redactRpcUrl(args.rpcUrl)} has genesis ${args.genesis}`);
    }
    return known ?? "custom";
  }
  if (known !== "devnet" && !isLoopbackRpcUrl(args.rpcUrl)) {
    throw new Error(
      `expected Solana devnet (genesis ${SOLANA_GENESIS.devnet}), got ${args.genesis}; ` +
        `set SOLANA_EXPECTED_GENESIS_HASH to deploy to another cluster`,
    );
  }
  return known ?? "unknown";
}
