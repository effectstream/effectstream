// 00058 FR-011 (native; no chain): `bridge:to-midnight --account <contract>`.
//   - bad --account values, and --account with --recipient, are refused before any chain call;
//   - the CLI asks the node (`GET /recipients/contract/:address`) first and refuses unless the
//     verdict is `deliverable`: with a stub API answering `undeliverable` it exits non-zero and never
//     even connects to Solana (the RPC is a dead port), so no Solana transaction can be sent;
//   - with `deliverable` it gets past the check (the next failure is the dead Solana RPC).
//
// Run: bun test ./cli-account.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { formatShieldedAddress } from "@effectstream/midnight-contracts/shielded-address";
import { CliArgError, parseToMidnightArgs, parseStatusArgs } from "@solana-midnight-bridge/cli";
import { parseContractAccount } from "@solana-midnight-bridge/cli/args";
import { getRecipientVerdict, waitForSettled } from "@solana-midnight-bridge/cli/api-client";

const hex = (n: number) => Buffer.from(randomBytes(n)).toString("hex");
const LOCAL_ADDR = formatShieldedAddress({ coinPublicKey: hex(32), encryptionPublicKey: hex(32) }, "undeployed");
const ACCOUNT = hex(32);

describe("--account parsing (before any chain call)", () => {
  test("a 64-hex contract address, 0x optional, upper case accepted and lowered", () => {
    const a = parseToMidnightArgs(["--amount", "5", "--account", ACCOUNT]);
    expect(a.recipientKind).toBe("contract");
    expect(a.recipientAddress).toBe(ACCOUNT);
    expect(Buffer.from(a.contract!).toString("hex")).toBe(ACCOUNT);
    expect(a.midnightRecipient.length).toBe(0);
    expect(parseContractAccount(`0x${ACCOUNT.toUpperCase()}`).hex).toBe(ACCOUNT);
    // A wallet recipient keeps the 00050 shape.
    const w = parseToMidnightArgs(["--amount", "5", "--recipient", LOCAL_ADDR]);
    expect(w.recipientKind).toBe("wallet");
    expect(w.midnightRecipient.length).toBe(64);
    expect(w.contract).toBeUndefined();
  });

  test("refused: wrong length, not hex, all-zero, missing value, and together with --recipient", () => {
    for (const bad of [ACCOUNT.slice(2), `${ACCOUNT}ab`, `zz${ACCOUNT.slice(2)}`, "0".repeat(64), `0x${"0".repeat(64)}`]) {
      expect(() => parseToMidnightArgs(["--amount", "5", "--account", bad])).toThrow(CliArgError);
    }
    expect(() => parseToMidnightArgs(["--amount", "5", "--account"])).toThrow(/needs a value/);
    expect(() => parseToMidnightArgs(["--amount", "5", "--account", ACCOUNT, "--recipient", LOCAL_ADDR])).toThrow(/mutually exclusive/);
    expect(() => parseToMidnightArgs(["--amount", "0", "--account", ACCOUNT])).toThrow(/greater than zero/);
    expect(() => parseToMidnightArgs(["--amount", "5"])).toThrow(/recipient is required/);
  });

  test("bridge:status accepts --status undeliverable", () => {
    expect(parseStatusArgs(["--status", "undeliverable"])).toMatchObject({ status: "undeliverable" });
  });
});

describe("the CLI asks the node before it locks", () => {
  const MAIN = path.resolve(import.meta.dirname!, "../cli/main.ts");
  let tmp: string;
  let deployment: string;
  let server: ReturnType<typeof Bun.serve> | null = null;
  let verdict: "deliverable" | "undeliverable" | "retry" = "undeliverable";
  const asked: string[] = [];

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cli-account-test-"));
    deployment = path.join(tmp, "standin.json");
    const pk = () => Keypair.generate().publicKey.toBase58();
    fs.writeFileSync(deployment, JSON.stringify({
      solana: {
        cluster: "localnet", rpcUrl: "http://127.0.0.1", programId: pk(), mint: pk(), mintDecimals: 6,
        config: pk(), authority: pk(), vault: pk(), operator: pk(), startSlot: 0, signatures: {}, updatedAt: new Date().toISOString(),
      },
    }));
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        asked.push(u.pathname);
        const m = /^\/recipients\/contract\/([0-9a-f]{64})$/.exec(u.pathname);
        if (!m) return Response.json({ error: "not found" }, { status: 404 });
        return Response.json({
          address: m[1], verdict,
          adapter: verdict === "deliverable" ? "passport-ed25519@21493588" : null,
          code: verdict === "undeliverable" ? "not-a-passport-account" : null,
          message: verdict === "undeliverable" ? "the contract is not a Passport account of key set 21493588" : null,
          checkedAt: new Date().toISOString(),
        });
      },
    });
  });
  afterAll(() => {
    server?.stop(true);
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  // Live mode, a stand-in deployment file, the stub API, and a DEAD Solana RPC: any Solana call
  // fails loudly, so a refusal that names the node's verdict and no connection error proves that no
  // Solana transaction was even attempted.
  // Async spawn: the stub API runs in THIS process, so a blocking spawnSync would starve it.
  const run = async (args: string[]) => {
    const p = Bun.spawn(["bun", MAIN, "to-midnight", "--mode", "live", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        BRIDGE_DEPLOYMENT: deployment,
        BRIDGE_API_URL: `http://127.0.0.1:${server!.port}`,
        SOLANA_DEVNET_RPC_URL: "http://127.0.0.1:9",
        SOLANA_RPC_URL: "http://127.0.0.1:9",
        BRIDGE_SECRETS_DIR: path.join(tmp, "no-secrets"),
      },
    });
    const [code, err, out] = await Promise.all([p.exited, new Response(p.stderr).text(), new Response(p.stdout).text()]);
    return { code, err, out };
  };

  test("500 tokens of a 6-decimal mint get past the amount check (00058 Q7): the node is asked", async () => {
    verdict = "undeliverable";
    asked.length = 0;
    const r = await run(["--amount", "500", "--account", ACCOUNT]);
    expect(r.code).toBe(1);
    expect(r.err).not.toMatch(/u64/);
    expect(r.err).toMatch(/refusing to lock/);
    expect(asked).toEqual([`/recipients/contract/${ACCOUNT}`]);
  });

  test("an amount above u64 at the mint's decimals is refused before the node is even asked", async () => {
    asked.length = 0;
    const r = await run(["--amount", "18446744073710", "--account", ACCOUNT]);
    expect(r.code).toBe(2); // an argument error, found once the mint's decimals are known
    expect(r.err).toMatch(/does not fit in a u64 of base units/);
    expect(asked).toEqual([]);
  });

  test("bridge:to-solana: 500 tokens get past the amount check; above u64 at 6 decimals is refused (00058 Q7)", async () => {
    const both = path.join(tmp, "standin-both.json");
    const d = JSON.parse(fs.readFileSync(deployment, "utf8"));
    d.midnight = { networkId: "undeployed", contractAddress: hex(32), tokenColor: hex(32) };
    fs.writeFileSync(both, JSON.stringify(d));
    const toSolana = async (amount: string) => {
      const p = Bun.spawn(["bun", MAIN, "to-solana", "--mode", "live", "--amount", amount, "--recipient", Keypair.generate().publicKey.toBase58()], {
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          BRIDGE_DEPLOYMENT: both,
          MIDNIGHT_NETWORK_ID: "undeployed",
          MIDNIGHT_INDEXER_HTTP: "http://127.0.0.1:9/api/v4/graphql", MIDNIGHT_INDEXER_WS: "ws://127.0.0.1:9/api/v4/graphql/ws",
          MIDNIGHT_NODE_HTTP: "http://127.0.0.1:9",
          BRIDGE_SECRETS_DIR: path.join(tmp, "no-secrets"),
        },
      });
      const [code, err] = await Promise.all([p.exited, new Response(p.stderr).text()]);
      return { code, err };
    };
    const ok = await toSolana("500");
    expect(ok.code).toBe(1);
    expect(ok.err).not.toMatch(/u64/);
    expect(ok.err).toMatch(/seed file not found/); // the next step: the live user seed
    const big = await toSolana("18446744073710");
    expect(big.code).toBe(2); // an argument error, found once the mint's decimals are known
    expect(big.err).toMatch(/does not fit in a u64 of base units/);
  });

  test("undeliverable → exit 1 with the node's reason, before any Solana call", async () => {
    verdict = "undeliverable";
    asked.length = 0;
    const r = await run(["--amount", "1", "--account", ACCOUNT]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/refusing to lock: the bridge node cannot deliver to [0-9a-f]{64} \(not-a-passport-account/);
    expect(r.err).toMatch(/nothing was sent/);
    expect(r.err + r.out).not.toMatch(/ECONNREFUSED|Unable to connect|fetch failed|keypair|secrets/i);
    expect(asked).toEqual([`/recipients/contract/${ACCOUNT}`]);
  });

  test("retry (the node cannot read the contract yet) → refused too", async () => {
    verdict = "retry";
    const r = await run(["--amount", "1", "--account", ACCOUNT]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/cannot read the contract yet/);
  });

  test("deliverable → past the check: the next step needs the depositor's key (none here)", async () => {
    verdict = "deliverable";
    const r = await run(["--amount", "1", "--account", ACCOUNT]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("passport-ed25519@21493588");
    expect(r.err).not.toMatch(/refusing to lock/);
  });

  test("a malformed --account is refused with exit 2 and the node is never asked", async () => {
    asked.length = 0;
    const r = await run(["--amount", "1", "--account", "abc"]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/--account must be a Midnight contract address/);
    expect(asked).toEqual([]);
  });
});

describe("api-client: /recipients and waitForSettled", () => {
  test("getRecipientVerdict passes 503 and 400 on as errors", async () => {
    let status = 503;
    const s = Bun.serve({ port: 0, fetch: () => Response.json({ error: "x" }, { status }) });
    try {
      await expect(getRecipientVerdict(`http://127.0.0.1:${s.port}`, ACCOUNT)).rejects.toThrow(/503/);
      status = 400;
      await expect(getRecipientVerdict(`http://127.0.0.1:${s.port}`, ACCOUNT)).rejects.toThrow(/400/);
    } finally {
      s.stop(true);
    }
  });

  test("waitForSettled returns at undeliverable (and at completed)", async () => {
    const base = { id: "s2m:4", direction: "s2m", sourceId: "4", amount: "1", recipient: ACCOUNT, sender: null, srcRef: null, dstRef: null, observedBlock: 1, completedBlock: null, relayer: null };
    let n = 0;
    const s = Bun.serve({
      port: 0,
      fetch() {
        n++;
        if (n === 1) return Response.json({ error: "transfer not found" }, { status: 404 });
        if (n === 2) return Response.json({ transfer: { ...base, status: "observed" } });
        return Response.json({ transfer: { ...base, status: "undeliverable", recipientKind: "contract", reason: { code: "not-a-contract", message: "no contract", at: "x" }, delivery: null } });
      },
    });
    try {
      const t = await waitForSettled(`http://127.0.0.1:${s.port}`, "s2m:4", { timeoutMs: 10_000, pollMs: 10 });
      expect(t.status).toBe("undeliverable");
      expect(t.reason?.code).toBe("not-a-contract");
    } finally {
      s.stop(true);
    }
  });
});
