// T-CLI (native; no chain): every bad argument is refused BEFORE any chain
// call — zero or malformed amounts, malformed recipients and recipients for
// the wrong network — both through the pure parsers and through the real CLI
// entry point run as a subprocess with every endpoint pointed at a dead port.
//
// Run: bun test ./cli-args.test.ts
import { describe, expect, test } from "bun:test";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { formatShieldedAddress } from "@effectstream/midnight-contracts/shielded-address";
import {
  CliArgError,
  formatAmount,
  midnightNetworkFor,
  parseAmount,
  parseMidnightRecipient,
  parseSolanaRecipient,
  parseStatusArgs,
  parseToMidnightArgs,
  parseToSolanaArgs,
} from "@solana-midnight-bridge/cli";
import { renderTable } from "@solana-midnight-bridge/cli/commands";
import { waitForCompleted } from "@solana-midnight-bridge/cli/api-client";

const hex = (n: number) => Buffer.from(randomBytes(n)).toString("hex");
const keys = { coinPublicKey: hex(32), encryptionPublicKey: hex(32) };
const LOCAL_ADDR = formatShieldedAddress(keys, "undeployed");
const STAGENET_ADDR = formatShieldedAddress(keys, "stagenet");
const SOL = Keypair.generate().publicKey.toBase58();

describe("amounts", () => {
  test("whole and fractional tokens become base units", () => {
    expect(parseAmount("10", 6)).toBe(10_000_000n);
    expect(parseAmount("0.5", 6)).toBe(500_000n);
    expect(parseAmount(" 4 ", 6)).toBe(4_000_000n);
    expect(parseAmount("0.000001", 6)).toBe(1n);
    expect(formatAmount(10_500_000n, 6)).toBe("10.5");
    expect(formatAmount(4_000_000n, 6)).toBe("4");
  });

  test("zero, negative, exponent, too many decimals and u64 overflow are refused", () => {
    for (const [v, msg] of [
      ["0", /greater than zero/], ["0.000000", /greater than zero/], ["-1", /positive decimal/],
      ["1e3", /positive decimal/], ["abc", /positive decimal/], ["1.1234567", /7 decimals; the mint has 6/],
      ["18446744073710", /u64/], ["", /required/],
    ] as const) {
      expect(() => parseAmount(v || undefined, 6)).toThrow(msg);
    }
  });
});

describe("recipients", () => {
  test("a shielded address for the active network gives its 64 bytes", () => {
    const b = parseMidnightRecipient(LOCAL_ADDR, "local");
    expect(Buffer.from(b).toString("hex")).toBe(keys.coinPublicKey + keys.encryptionPublicKey);
    expect(parseMidnightRecipient(STAGENET_ADDR, "live").length).toBe(64);
  });

  test("the wrong network prefix, a corrupted checksum, or another address kind is refused", () => {
    expect(() => parseMidnightRecipient(STAGENET_ADDR, "local")).toThrow(/not a shielded address for network "undeployed".*stagenet/);
    expect(() => parseMidnightRecipient(LOCAL_ADDR, "live")).toThrow(/not a shielded address for network "stagenet"/);
    const corrupted = LOCAL_ADDR.slice(0, -1) + (LOCAL_ADDR.endsWith("q") ? "p" : "q");
    expect(() => parseMidnightRecipient(corrupted, "local")).toThrow(CliArgError);
    expect(() => parseMidnightRecipient("mn_addr_undeployed1qqqqqq", "local")).toThrow(CliArgError);
    expect(() => parseMidnightRecipient(undefined, "local")).toThrow(/required/);
  });

  test("live mode expects recipients for MIDNIGHT_NETWORK_ID (default stagenet; PR-2 T7 stand-ins)", () => {
    const saved = process.env.MIDNIGHT_NETWORK_ID;
    try {
      delete process.env.MIDNIGHT_NETWORK_ID;
      expect(midnightNetworkFor("live")).toBe("stagenet");
      process.env.MIDNIGHT_NETWORK_ID = "undeployed";
      expect(midnightNetworkFor("live")).toBe("undeployed");
      expect(midnightNetworkFor("local")).toBe("undeployed");
      expect(parseMidnightRecipient(LOCAL_ADDR, "live").length).toBe(64);
      expect(() => parseMidnightRecipient(STAGENET_ADDR, "live")).toThrow(/not a shielded address for network "undeployed"/);
    } finally {
      if (saved === undefined) delete process.env.MIDNIGHT_NETWORK_ID;
      else process.env.MIDNIGHT_NETWORK_ID = saved;
    }
  });

  test("Solana recipients must be canonical base58 public keys", () => {
    expect(parseSolanaRecipient(SOL).toBase58()).toBe(SOL);
    expect(() => parseSolanaRecipient("not-base58-0OIl")).toThrow(/not a base58/);
    expect(() => parseSolanaRecipient("1111")).toThrow(CliArgError);
    expect(() => parseSolanaRecipient(undefined)).toThrow(/required/);
  });
});

describe("command argument sets", () => {
  test("bridge:to-midnight", () => {
    const a = parseToMidnightArgs(["--amount", "10", "--recipient", LOCAL_ADDR]);
    expect(a).toMatchObject({ mode: "local", amountText: "10", wait: true, timeoutSeconds: 600 });
    expect(a.midnightRecipient.length).toBe(64);
    expect(() => parseToMidnightArgs(["--amount", "0", "--recipient", LOCAL_ADDR])).toThrow(/greater than zero/);
    expect(() => parseToMidnightArgs(["--amount", "10", "--recipient", STAGENET_ADDR])).toThrow(/network/);
    expect(() => parseToMidnightArgs(["--amount", "10"])).toThrow(/recipient is required/);
    expect(() => parseToMidnightArgs(["--amount", "10", "--recipient", LOCAL_ADDR, "--bogus", "1"])).toThrow(/unknown option --bogus/);
    expect(() => parseToMidnightArgs(["10", LOCAL_ADDR])).toThrow(/unexpected argument/);
    expect(() => parseToMidnightArgs(["--amount", "10", "--recipient", LOCAL_ADDR, "--mode", "prod"])).toThrow(/--mode/);
  });

  test("bridge:to-solana", () => {
    const a = parseToSolanaArgs(["--amount=4", `--recipient=${SOL}`, "--no-wait"]);
    expect(a).toMatchObject({ amountText: "4", wait: false });
    expect(a.recipient.toBase58()).toBe(SOL);
    expect(() => parseToSolanaArgs(["--amount", "-4", "--recipient", SOL])).toThrow(/positive decimal/);
    expect(() => parseToSolanaArgs(["--amount", "4", "--recipient", LOCAL_ADDR])).toThrow(/base58/);
    expect(() => parseToSolanaArgs(["--amount", "4", "--recipient", SOL, "--timeout", "0"])).toThrow(/--timeout/);
  });

  test("bridge:status", () => {
    expect(parseStatusArgs(["--id", "s2m:3", "--watch"])).toMatchObject({ id: "s2m:3", watch: true });
    expect(() => parseStatusArgs(["--id", "3"])).toThrow(/--id/);
    expect(() => parseStatusArgs(["--direction", "x"])).toThrow(/--direction/);
    expect(() => parseStatusArgs(["--status", "failed"])).toThrow(/--status/);
  });
});

describe("the CLI entry point refuses bad arguments before any chain call", () => {
  const MAIN = path.resolve(import.meta.dirname!, "../cli/main.ts");
  // Every endpoint points at a dead local port, and the deployment does not exist:
  // a refusal must come from validation, never from a connection attempt.
  const DEAD = {
    SOLANA_RPC_URL: "http://127.0.0.1:9", SOLANA_DEVNET_RPC_URL: "http://127.0.0.1:9",
    MIDNIGHT_INDEXER_HTTP: "http://127.0.0.1:9", MIDNIGHT_NODE_HTTP: "http://127.0.0.1:9",
    MIDNIGHT_PROOF_SERVER_URL: "http://127.0.0.1:9", MIDNIGHT_CONTRACT_PROOF_SERVER_URL: "http://127.0.0.1:9",
    BRIDGE_API_URL: "http://127.0.0.1:9", BRIDGE_DEPLOYMENT: "/nonexistent/none.json",
  };
  const run = (args: string[]) => {
    const started = Date.now();
    const p = Bun.spawnSync(["bun", MAIN, ...args], { env: { ...process.env, ...DEAD } });
    return { code: p.exitCode, err: p.stderr.toString(), out: p.stdout.toString(), ms: Date.now() - started };
  };

  for (const [name, args, msg] of [
    ["zero amount", ["to-midnight", "--amount", "0", "--recipient", LOCAL_ADDR], /greater than zero/],
    ["malformed recipient", ["to-midnight", "--amount", "1", "--recipient", "mn_shield-addr_undeployed1xyz"], /not a shielded address for network "undeployed"/],
    ["wrong network prefix", ["to-midnight", "--amount", "1", "--recipient", STAGENET_ADDR], /network "stagenet", expected "undeployed"/],
    ["zero amount (to-solana)", ["to-solana", "--amount", "0.0", "--recipient", SOL], /greater than zero/],
    ["malformed Solana recipient", ["to-solana", "--amount", "1", "--recipient", "abc"], /not a base58/],
    ["unknown command", ["bridge-everything"], /unknown command/],
  ] as const) {
    test(`${name}: exit 2 with the validation message, no connection attempted`, () => {
      const r = run([...args]);
      expect(r.code).toBe(2);
      expect(r.err).toMatch(msg);
      expect(r.err + r.out).not.toMatch(/ECONNREFUSED|Unable to connect|fetch failed/);
    });
  }

  test("valid arguments get past validation (the next refusal is the missing deployment file)", () => {
    const r = run(["to-midnight", "--mode", "live", "--amount", "1", "--recipient", STAGENET_ADDR]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('no "solana" section in /nonexistent/none.json');
  });
});

describe("status table", () => {
  test("renders amounts in whole tokens and truncates long fields", () => {
    const t = renderTable([
      {
        id: "s2m:0", direction: "s2m", sourceId: "0", amount: "10500000", recipient: "ab".repeat(64), sender: "dep",
        status: "completed", srcRef: "solana-slot:5", dstRef: "midnight-block:9", observedBlock: 1, completedBlock: 9,
        relayer: { attempts: 1, submittedAt: null, lastAttemptAt: null, lastTx: "00".repeat(32), lastError: null },
      },
    ], 6);
    const lines = t.split("\n");
    expect(lines[0]).toMatch(/^ID\s+AMOUNT\s+STATUS/);
    expect(lines[2]).toContain("s2m:0");
    expect(lines[2]).toContain("10.5");
    expect(lines[2]).toContain("completed");
    expect(lines[2]).toContain("…");
  });
});

// T6 F-T6.6: while the node was busy (or starting: 503) the CLI's API request
// failed, and waitForCompleted reported it as `onChange(null)`, which the CLI
// prints as "not yet observed by sync" — right after it had printed
// "submitted". An API error must be reported as an API error.
describe("waitForCompleted reports API errors as errors (F-T6.6)", () => {
  test("a 503 is passed on as an error, not as an unseen transfer; a 404 is unseen", async () => {
    const transfer = { id: "s2m:0", direction: "s2m", sourceId: "0", amount: "1", recipient: null, sender: null, status: "completed", srcRef: null, dstRef: "midnight-block:1", observedBlock: 1, completedBlock: 2, relayer: null };
    let n = 0;
    const server = Bun.serve({
      port: 0,
      fetch() {
        n++;
        if (n === 1) return Response.json({ error: "transfer not found" }, { status: 404 });
        if (n === 2) return Response.json({ error: "the node is starting" }, { status: 503 });
        return Response.json({ transfer });
      },
    });
    try {
      const seen: { t: unknown; error?: string }[] = [];
      const t = await waitForCompleted(`http://127.0.0.1:${server.port}`, "s2m:0", {
        timeoutMs: 10_000,
        pollMs: 10,
        onChange: (x, error) => seen.push({ t: x, error }),
      });
      expect(t.status).toBe("completed");
      expect(seen.length).toBe(3);
      expect(seen[0]).toEqual({ t: null, error: undefined }); // 404: not observed yet
      expect(seen[1]!.t).toBeNull();
      expect(seen[1]!.error).toContain("503");
      expect(seen[2]!.error).toBeUndefined();
    } finally {
      server.stop(true);
    }
  });
});

