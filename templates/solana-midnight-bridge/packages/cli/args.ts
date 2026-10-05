// CLI argument parsing and validation. Pure: no RPC, no files, no network.
// Every command validates ALL of its arguments here before it touches a chain
// (sub-plan T5 tests): zero or malformed amounts, malformed recipients and
// recipients for another network are refused up front.
import { PublicKey } from "@solana/web3.js";
import { parseShieldedAddress, ShieldedAddressError } from "@effectstream/midnight-contracts/shielded-address";
import { liveMidnightNetworkId } from "@solana-midnight-bridge/contracts-midnight/network";

export class CliArgError extends Error {
  override name = "CliArgError";
}

export type CliMode = "local" | "live";

const U64_MAX = 0xffff_ffff_ffff_ffffn;

/**
 * The early check of `--amount`, made before the deployment file (and so the mint's decimals) is
 * read: its SYNTAX only — present, a positive decimal number, not zero. The u64 range and the
 * number of fractional digits are checked once, by `parseAmount` with the mint's real decimals,
 * right after the deployment file is read and still before any chain call. (Until 00058 this check
 * ran `parseAmount` with 18 decimals, which refused every amount above 18.44 tokens whatever the
 * mint's decimals.)
 */
export function checkAmountSyntax(text: string | undefined): void {
  if (text === undefined || text === "") throw new CliArgError("--amount is required");
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) throw new CliArgError(`--amount must be a positive decimal number, got "${text}"`);
  if (/^0+$/.test(m[1]!) && /^0*$/.test(m[2] ?? "")) throw new CliArgError("--amount must be greater than zero");
}

/** Midnight network id the CLI expects recipients for, per mode (live: MIDNIGHT_NETWORK_ID, default stagenet). */
export function midnightNetworkFor(mode: CliMode): string {
  return mode === "local" ? "undeployed" : liveMidnightNetworkId();
}

/**
 * Parses a token amount in WHOLE tokens ("10", "0.5") into raw base units
 * (`decimals` fractional digits). Refuses zero, negatives, exponents, more
 * fractional digits than the mint has, and anything above u64.
 */
export function parseAmount(text: string | undefined, decimals: number): bigint {
  if (text === undefined || text === "") throw new CliArgError("--amount is required");
  const t = text.trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) throw new CliArgError(`--amount must be a positive decimal number, got "${text}"`);
  const [, whole, frac = ""] = m;
  if (frac.length > decimals) {
    throw new CliArgError(`--amount has ${frac.length} decimals; the mint has ${decimals}`);
  }
  const raw = BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  if (raw === 0n) throw new CliArgError("--amount must be greater than zero");
  if (raw > U64_MAX) throw new CliArgError("--amount does not fit in a u64 of base units");
  return raw;
}

/** Raw base units → "10.5" style whole tokens. */
export function formatAmount(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** A `mn_shield-addr_<network>1…` recipient → its 64-byte payload (cpk ‖ epk). */
export function parseMidnightRecipient(address: string | undefined, mode: CliMode): Uint8Array {
  if (!address) throw new CliArgError("--recipient is required (a mn_shield-addr_… address)");
  const expected = midnightNetworkFor(mode);
  try {
    const p = parseShieldedAddress(address, expected);
    return Uint8Array.from(Buffer.from(p.coinPublicKey + p.encryptionPublicKey, "hex"));
  } catch (e) {
    if (e instanceof ShieldedAddressError) {
      throw new CliArgError(`--recipient is not a shielded address for network "${expected}": ${e.message}`);
    }
    throw e;
  }
}

/**
 * A Midnight CONTRACT address for `--account` (plan 00058 I-2): 64 hex characters
 * (an optional `0x` prefix), not all-zero. Returned lowercase, with its 32 bytes.
 */
export function parseContractAccount(text: string | undefined): { hex: string; bytes: Uint8Array } {
  if (!text) throw new CliArgError("--account is required (a Midnight contract address: 64 hex characters)");
  const h = text.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(h)) {
    throw new CliArgError(`--account must be a Midnight contract address (64 hex characters), got "${text}"`);
  }
  const lower = h.toLowerCase();
  if (/^0+$/.test(lower)) throw new CliArgError("--account must not be the all-zero address");
  return { hex: lower, bytes: Uint8Array.from(Buffer.from(lower, "hex")) };
}

/** A base58 Solana public key (the release recipient's wallet). */
export function parseSolanaRecipient(text: string | undefined): PublicKey {
  if (!text) throw new CliArgError("--recipient is required (a base58 Solana public key)");
  let pk: PublicKey;
  try {
    pk = new PublicKey(text.trim());
  } catch {
    throw new CliArgError(`--recipient is not a base58 Solana public key: "${text}"`);
  }
  if (pk.toBase58() !== text.trim()) throw new CliArgError(`--recipient is not canonical base58: "${text}"`);
  return pk;
}

export type ParsedFlags = Record<string, string | true>;

/** `--flag value` / `--flag=value` / boolean `--flag`; refuses unknown flags and stray words. */
export function parseFlags(argv: string[], known: { value: string[]; bool: string[] }): ParsedFlags {
  const out: ParsedFlags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) throw new CliArgError(`unexpected argument "${a}"`);
    const eq = a.indexOf("=");
    const name = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    if (known.bool.includes(name)) {
      if (eq >= 0) throw new CliArgError(`--${name} takes no value`);
      out[name] = true;
    } else if (known.value.includes(name)) {
      const v = eq >= 0 ? a.slice(eq + 1) : argv[++i];
      if (v === undefined || v.startsWith("--")) throw new CliArgError(`--${name} needs a value`);
      out[name] = v;
    } else {
      throw new CliArgError(`unknown option --${name}`);
    }
  }
  return out;
}

export function parseMode(v: string | true | undefined): CliMode {
  if (v === undefined) return (process.env.BRIDGE_MODE as CliMode | undefined) === "live" ? "live" : "local";
  if (v === "local" || v === "live") return v;
  throw new CliArgError(`--mode must be local or live`);
}

export function parseTimeoutSeconds(v: string | true | undefined, dflt: number): number {
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 86_400) throw new CliArgError("--timeout must be 1..86400 seconds");
  return n;
}

const COMMON_VALUE = ["mode", "api", "timeout"];
const COMMON_BOOL = ["no-wait"];

export type ToMidnightArgs = {
  mode: CliMode;
  amountText: string;
  /** `wallet` (--recipient, a Lock) or `contract` (--account, a LockToContract). */
  recipientKind: "wallet" | "contract";
  /** The --recipient address, or the --account contract address (64 lowercase hex). */
  recipientAddress: string;
  /** The wallet's 64-byte payload (cpk ‖ epk); empty for a contract recipient. */
  midnightRecipient: Uint8Array;
  /** The contract's 32 bytes, for `--account` only. */
  contract?: Uint8Array;
  keypairPath?: string;
  api?: string;
  wait: boolean;
  timeoutSeconds: number;
};

/**
 * bridge:to-midnight --amount <n> --recipient <mn_shield-addr_…> [--keypair <path>]
 * bridge:to-midnight --amount <n> --account <64 hex contract address> [--keypair <path>]
 * (--recipient and --account are mutually exclusive).
 */
export function parseToMidnightArgs(argv: string[]): ToMidnightArgs & { amountText: string } {
  const f = parseFlags(argv, { value: ["amount", "recipient", "account", "keypair", ...COMMON_VALUE], bool: COMMON_BOOL });
  const mode = parseMode(f.mode);
  if (f.recipient !== undefined && f.account !== undefined) {
    throw new CliArgError("--recipient and --account are mutually exclusive (a wallet or a contract recipient)");
  }
  let recipientKind: ToMidnightArgs["recipientKind"] = "wallet";
  let recipientAddress = typeof f.recipient === "string" ? f.recipient : "";
  let midnightRecipient = new Uint8Array(0);
  let contract: Uint8Array | undefined;
  if (f.account !== undefined) {
    const c = parseContractAccount(typeof f.account === "string" ? f.account : undefined);
    recipientKind = "contract";
    recipientAddress = c.hex;
    contract = c.bytes;
  } else {
    if (!recipientAddress) {
      throw new CliArgError("--recipient is required (a mn_shield-addr_… address), or --account <64 hex> for a contract recipient");
    }
    midnightRecipient = parseMidnightRecipient(recipientAddress, mode);
  }
  // The amount is parsed with the mint's decimals (and its u64 range checked) once the deployment
  // is read; check its syntax (and that it is not zero) here already.
  const amountText = typeof f.amount === "string" ? f.amount : "";
  checkAmountSyntax(amountText || undefined);
  return {
    mode,
    amountText,
    recipientKind,
    recipientAddress,
    midnightRecipient,
    ...(contract ? { contract } : {}),
    keypairPath: typeof f.keypair === "string" ? f.keypair : undefined,
    api: typeof f.api === "string" ? f.api : undefined,
    wait: !f["no-wait"],
    timeoutSeconds: parseTimeoutSeconds(f.timeout, 600),
  };
}

export type ToSolanaArgs = {
  mode: CliMode;
  amountText: string;
  recipient: PublicKey;
  seedFile?: string;
  api?: string;
  wait: boolean;
  timeoutSeconds: number;
};

/** bridge:to-solana --amount <n> --recipient <base58 pubkey> [--seed-file <path>] */
export function parseToSolanaArgs(argv: string[]): ToSolanaArgs {
  const f = parseFlags(argv, { value: ["amount", "recipient", "seed-file", ...COMMON_VALUE], bool: COMMON_BOOL });
  const mode = parseMode(f.mode);
  const recipient = parseSolanaRecipient(typeof f.recipient === "string" ? f.recipient : undefined);
  const amountText = typeof f.amount === "string" ? f.amount : "";
  checkAmountSyntax(amountText || undefined);
  return {
    mode,
    amountText,
    recipient,
    seedFile: typeof f["seed-file"] === "string" ? f["seed-file"] : undefined,
    api: typeof f.api === "string" ? f.api : undefined,
    wait: !f["no-wait"],
    timeoutSeconds: parseTimeoutSeconds(f.timeout, 900),
  };
}

export type StatusArgs = {
  id?: string;
  direction?: "s2m" | "m2s";
  status?: "observed" | "submitted" | "completed" | "undeliverable";
  watch: boolean;
  api?: string;
  mode: CliMode;
};

/** bridge:status [--id <s2m:n|m2s:n>] [--direction s2m|m2s] [--status …] [--watch] */
export function parseStatusArgs(argv: string[]): StatusArgs {
  const f = parseFlags(argv, { value: ["id", "direction", "status", "api", "mode"], bool: ["watch"] });
  const id = typeof f.id === "string" ? f.id : undefined;
  if (id !== undefined && !/^(s2m|m2s):(0|[1-9][0-9]{0,19})$/.test(id)) {
    throw new CliArgError('--id must be "s2m:<lock nonce>" or "m2s:<withdrawal id>"');
  }
  const direction = f.direction;
  if (direction !== undefined && direction !== "s2m" && direction !== "m2s") {
    throw new CliArgError("--direction must be s2m or m2s");
  }
  const status = f.status;
  if (status !== undefined && status !== "observed" && status !== "submitted" && status !== "completed" && status !== "undeliverable") {
    throw new CliArgError("--status must be observed, submitted, completed or undeliverable");
  }
  return {
    id,
    direction: direction as StatusArgs["direction"],
    status: status as StatusArgs["status"],
    watch: f.watch === true,
    api: typeof f.api === "string" ? f.api : undefined,
    mode: parseMode(f.mode),
  };
}

export type RecordArgs = {
  mode: CliMode;
  api: string;
  name?: string;
  symbol?: string;
  out?: string;
};

/**
 * bridge:record [--mode local|live] --api <origin> [--name <s>] [--symbol <s>] [--out <path>]
 * (plan 00058 I-3 (c)). The values are checked again, with the chains, by the record builder.
 */
export function parseRecordArgs(argv: string[]): RecordArgs {
  const f = parseFlags(argv, { value: ["mode", "api", "name", "symbol", "out"], bool: [] });
  if (typeof f.api !== "string" || f.api === "") {
    throw new CliArgError("--api is required: the bridge node API's public origin (e.g. https://bridge-x.example.org)");
  }
  let api: URL;
  try {
    api = new URL(f.api);
  } catch {
    throw new CliArgError(`--api must be an http(s) origin, got "${f.api}"`);
  }
  if (api.protocol !== "http:" && api.protocol !== "https:") throw new CliArgError(`--api must be an http(s) origin, got "${f.api}"`);
  if (typeof f.symbol === "string" && !/^[\x21-\x7e]{1,8}$/.test(f.symbol)) {
    throw new CliArgError(`--symbol must be 1–8 printable ASCII characters with no space, got "${f.symbol}"`);
  }
  if (typeof f.name === "string" && (!/^[\x20-\x7e]{1,64}$/.test(f.name) || f.name.trim() !== f.name)) {
    throw new CliArgError(`--name must be 1–64 printable ASCII characters, no leading or trailing space`);
  }
  return {
    mode: parseMode(f.mode),
    api: f.api,
    ...(typeof f.name === "string" ? { name: f.name } : {}),
    ...(typeof f.symbol === "string" ? { symbol: f.symbol } : {}),
    ...(typeof f.out === "string" ? { out: f.out } : {}),
  };
}
