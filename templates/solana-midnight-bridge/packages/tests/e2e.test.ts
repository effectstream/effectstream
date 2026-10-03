// End-to-end bridge suite on the full local stack (sub-plan T6; spec US1, US2,
// US4, SC-001, SC-003, T-NEG). It needs the stack of start.test.ts running —
// `bun run test` (run-tests.ts) starts it, runs this file, then stops it.
// Without a running stack the suite is SKIPPED and says why.
//
//   US1   bridge:to-midnight --amount 10 (the CLI, as a user runs it) → the
//         transfer reaches `completed` in < 5 min; vault +10, the user's SPL −10,
//         the recipient wallet's shielded balance of the bridge colour +10.
//   US2   bridge:to-solana --amount 4 → `completed` in < 5 min; the user's SPL +4,
//         the vault ends at 6, the wallet keeps 6, `withdrawals` gains 1 entry
//         (SC-001: SPL −6 net, Midnight +6, vault 6, 4 burned).
//   T-NEG each refused at its layer, and nothing changes on chain:
//         a forged mint signature (circuit), a mint for an already-minted lock
//         (circuit, US1.3), a signature replayed against a SECOND bridge
//         instance (circuit), a wrong-colour burn (circuit), a non-operator
//         release (program), a re-sent release (program, US2.3), bad CLI
//         arguments (CLI, before any chain call).
//   US4b  the node is stopped, PGLite is wiped (it is in-memory: restarting it
//         empties it) and the node restarts from the deployment start heights:
//         every transfer comes back `completed` and nothing is sent on chain.
//         It runs early: the local validator purges its old blocks about 24
//         minutes after it starts (questions file Q22).
//   US4a  the relayer (the `sync` process) is killed with SIGKILL after the
//         transfer is `submitted` and before it is `completed`, then restarted:
//         (1) killed while the mint is still being proved, (2) killed after the
//         mint landed on chain but before sync saw it, (3) a burn → release to a
//         fresh Solana address (its token account is created in the release
//         transaction, US2.2). Each settles exactly once.
//   SC-003 on chain: mintedLocks size = Solana locks (each for its lock's
//         amount), release receipts = withdrawals, the vault = locks − releases,
//         and the contract's transaction list is exactly the deploy, one mint
//         per lock and one burn per withdrawal. The program's own transaction
//         list is checked too while the validator still has it (Q22).
//
// A JSON report (timings, balances, transaction ids) goes to
// $BRIDGE_E2E_LOG_DIR/e2e-report.json (default logs/e2e/).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { WalletResult } from "@effectstream/midnight-contracts";
import {
  buildBridgeWallet,
  bytesToHex,
  hexToBytes,
  localDevSeed,
  midnightUrls,
  shieldedAddressFromSeed,
  shieldedKeysFromSeed,
  shieldedRecipient,
  signMint,
  verifyMintSignature,
} from "@solana-midnight-bridge/contracts-midnight";
import type { MidnightDeployment } from "@solana-midnight-bridge/contracts-midnight/deploy";
import { bridgeProviders, lockForSolana, mintFromSolana } from "@solana-midnight-bridge/contracts-midnight/client";
import { readDeployment, writeDeploymentSection, type SolanaDeployment } from "@solana-midnight-bridge/contracts-solana/deployments";
import { DEV_SOLANA_RPC_URL } from "@solana-midnight-bridge/contracts-solana/dev-config";
import { loadLocalOperator } from "@solana-midnight-bridge/contracts-solana/keys";
import { BridgeError } from "@solana-midnight-bridge/contracts-solana/program-id";
import { createReleaseWithAtaInstructions, findReceiptAddress } from "@solana-midnight-bridge/contracts-solana/instructions";
import { airdropAtLeast, customErrorOf, sendTx } from "@solana-midnight-bridge/contracts-solana/chain";
import { defaultApiUrl, getTransfer, listTransfers, type TransferView } from "@solana-midnight-bridge/cli/api-client";
import { Orchestrator, TEMPLATE_ROOT, waitForNodeApi } from "./helpers/stack.ts";
import {
  ataOf,
  colorBalance,
  contractTransactions,
  countKinds,
  lockNonce,
  programTransactions,
  readLedger,
  receipt,
  shieldedBalances,
  tokenBalance,
  waitColorBalance,
  type LedgerView,
} from "./helpers/bridge-state.ts";

const API = defaultApiUrl();
const LEG_LIMIT_MS = 5 * 60_000; // SC-001
const LOG_DIR = process.env.BRIDGE_E2E_LOG_DIR ?? path.join(TEMPLATE_ROOT, "logs", "e2e");
const orch = new Orchestrator();
const urls = midnightUrls("local");
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (t: number) => new Date(t).toISOString();

async function stackUnavailableReason(): Promise<string | null> {
  if (!(await orch.isUp())) return `no orchestrator on :${orch.port}`;
  const sync = await orch.proc("sync").catch(() => null);
  if (!sync) return "the orchestrator has no `sync` process (start packages/tests/start.test.ts)";
  if (sync.critical) return "`sync` is critical here; the restart tests need start.test.ts (sync non-critical)";
  const d = readDeployment("local");
  if (!d?.solana || !d?.midnight) return "deployments/local.json is missing a section";
  return null;
}

const skipReason = await stackUnavailableReason();
if (skipReason) {
  console.warn(`[e2e.test] SKIPPED: ${skipReason}. Run \`bun run test\` (run-tests.ts starts the stack).`);
}

// ── report ──────────────────────────────────────────────────────────────────

const report: Record<string, any> = { startedAt: iso(Date.now()), api: API };
function writeReport() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const replacer = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
    fs.writeFileSync(path.join(LOG_DIR, "e2e-report.json"), JSON.stringify(report, replacer, 2) + "\n");
  } catch (e) {
    console.error("[e2e] cannot write the report:", e);
  }
}
const log = (...a: unknown[]) => console.log("[e2e]", ...a);

// ── CLI runner (timestamped lines) ──────────────────────────────────────────

type CliRun = { code: number; ms: number; lines: { t: number; line: string }[]; stderr: string };

async function runCli(name: string, args: string[], timeoutMs: number): Promise<CliRun> {
  const t0 = Date.now();
  const proc = Bun.spawn(["bun", "packages/cli/main.ts", ...args], {
    cwd: TEMPLATE_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env } as Record<string, string>,
  });
  const lines: { t: number; line: string }[] = [];
  const readOut = (async () => {
    const dec = new TextDecoder();
    let buf = "";
    for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
      buf += dec.decode(chunk, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        lines.push({ t: Date.now(), line });
        console.log(`[cli ${name}] ${line}`);
      }
    }
    if (buf) lines.push({ t: Date.now(), line: buf });
  })();
  const stderr = new Response(proc.stderr as ReadableStream<Uint8Array>).text();
  const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
  const code = await proc.exited;
  clearTimeout(timer);
  await readOut;
  const err = await stderr;
  if (err.trim()) console.log(`[cli ${name}] stderr: ${err.trim()}`);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(LOG_DIR, `cli-${name}.log`),
      `$ bun packages/cli/main.ts ${args.join(" ")}\n` +
        lines.map((l) => `${iso(l.t)} ${l.line}`).join("\n") + `\n--- stderr ---\n${err}\n--- exit ${code} in ${Date.now() - t0} ms\n`,
    );
  } catch {
    /* evidence only */
  }
  return { code, ms: Date.now() - t0, lines, stderr: err };
}

function lineMatch(r: CliRun, re: RegExp): { t: number; m: RegExpExecArray } {
  for (const l of r.lines) {
    const m = re.exec(l.line);
    if (m) return { t: l.t, m };
  }
  throw new Error(`no CLI line matches ${re}: ${r.lines.map((l) => l.line).join(" | ")} ${r.stderr}`);
}

// ── API watchers ────────────────────────────────────────────────────────────

/** Polls GET /transfers/:id every second and records each status change with its time. */
function watchTransfer(id: string) {
  const changes: { at: string; status: string; attempts: number; lastError: string | null }[] = [];
  let last = "";
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      try {
        const t = await getTransfer(API, id);
        const key = t ? `${t.status}|${t.relayer?.attempts ?? 0}|${t.relayer?.lastError ?? ""}` : "unseen";
        if (key !== last) {
          last = key;
          changes.push({ at: iso(Date.now()), status: t?.status ?? "unseen", attempts: t?.relayer?.attempts ?? 0, lastError: t?.relayer?.lastError ?? null });
        }
      } catch {
        /* the node may be down on purpose (US4) */
      }
      await delay(1_000);
    }
  })();
  return {
    changes,
    stop: async () => {
      stopped = true;
      await loop;
    },
  };
}

async function waitTransfer(
  id: string,
  ok: (t: TransferView) => boolean,
  timeoutMs: number,
  pollMs = 1_000,
): Promise<TransferView> {
  const t0 = Date.now();
  let seen: TransferView | null = null;
  while (Date.now() - t0 < timeoutMs) {
    try {
      seen = await getTransfer(API, id);
      if (seen && ok(seen)) return seen;
    } catch {
      /* node restarting */
    }
    await delay(pollMs);
  }
  throw new Error(`transfer ${id} did not reach the expected state within ${timeoutMs / 1000} s (last: ${JSON.stringify(seen)})`);
}

// ── refusals ────────────────────────────────────────────────────────────────

function errorChain(e: unknown): string {
  const parts: string[] = [];
  let cur: any = e;
  for (let i = 0; cur && i < 8; i++) {
    parts.push(String(cur?.message ?? cur));
    cur = cur?.cause;
  }
  return parts.join(" <- ");
}

async function refusal(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return errorChain(e);
  }
}

// ── suite ───────────────────────────────────────────────────────────────────

describe.skipIf(skipReason !== null)("solana-midnight-bridge end to end (local stack)", () => {
  let solana: SolanaDeployment;
  let midnight: MidnightDeployment;
  let conn: Connection;
  let programId: PublicKey;
  let mint: PublicKey;
  let vault: PublicKey;
  let user: PublicKey; // the dev user's Solana wallet (depositor and release recipient)
  let userAta: PublicKey;
  let unit: bigint;
  let colorHex: string;
  let userWallet: WalletResult; // observer of the dev seed 0x…02 (the recipient)
  const userSeed = localDevSeed("user");
  const userAddress = shieldedAddressFromSeed(userSeed, urls.id);
  const userKeys = shieldedKeysFromSeed(userSeed);
  let s0: Snapshot; // before US1

  type Snapshot = { vault: bigint; userSpl: bigint; userColor: bigint; ledger: LedgerView; lockNonce: bigint; at: string };

  async function snap(): Promise<Snapshot> {
    const [v, u, c, L, n] = await Promise.all([
      tokenBalance(conn, vault),
      tokenBalance(conn, userAta),
      colorBalance(userWallet, colorHex),
      readLedger(urls, midnight.contractAddress),
      lockNonce(conn, programId),
    ]);
    if (!L) throw new Error("the bridge contract is not on the indexer");
    return { vault: v, userSpl: u, userColor: c, ledger: L, lockNonce: n, at: iso(Date.now()) };
  }

  const summary = (s: Snapshot) => ({
    at: s.at,
    vault: s.vault,
    userSpl: s.userSpl,
    userColor: s.userColor,
    lockNonce: s.lockNonce,
    mintedLocks: Object.fromEntries([...s.ledger.mintedLocks].map(([k, v]) => [k.toString(), v])),
    withdrawals: Object.fromEntries([...s.ledger.withdrawals].map(([k, v]) => [k.toString(), v])),
    withdrawalNonce: s.ledger.withdrawalNonce,
  });

  /**
   * The bridge's on-chain state on both sides, for "nothing was sent" checks:
   * the program's lock counter, the vault, the release receipts up to a few ids
   * past the contract's counter, the contract ledger, and every transaction with
   * a contract action on the bridge (the indexer keeps the full history; the
   * local Solana validator does not, Q22).
   */
  async function chainState() {
    const L = (await readLedger(urls, midnight.contractAddress))!;
    const receipts: Record<string, string | null> = {};
    for (let id = 0n; id < L.withdrawalNonce + 3n; id++) {
      const rc = await receipt(conn, programId, id);
      receipts[id.toString()] = rc ? `${rc.recipientOwner}:${rc.amount}` : null;
    }
    const txs = await contractTransactions(urls.indexer, midnight.contractAddress, Math.max(0, midnight.startBlockHeight - 1));
    return {
      lockNonce: (await lockNonce(conn, programId)).toString(),
      vault: (await tokenBalance(conn, vault)).toString(),
      receipts,
      mintedLocks: Object.fromEntries([...L.mintedLocks].map(([k, v]) => [k.toString(), v.toString()])),
      withdrawals: Object.fromEntries([...L.withdrawals].map(([k, v]) => [k.toString(), `${v.solanaRecipient}:${v.amount}`])),
      withdrawalNonce: L.withdrawalNonce.toString(),
      midnightContractTxs: txs.map((t) => t.hash),
    };
  }

  beforeAll(async () => {
    const d = readDeployment("local")!;
    solana = d.solana!;
    midnight = d.midnight as unknown as MidnightDeployment;
    conn = new Connection(DEV_SOLANA_RPC_URL, "confirmed");
    programId = new PublicKey(solana.programId);
    mint = new PublicKey(solana.mint);
    vault = new PublicKey(solana.vault);
    user = new PublicKey(solana.user!);
    userAta = ataOf(mint, user);
    unit = 10n ** BigInt(solana.mintDecimals);
    colorHex = midnight.tokenColor;
    report.deployment = { solana, midnight };
    log(`building the observer wallet for the dev user (${userAddress.slice(0, 32)}…)`);
    const t0 = Date.now();
    userWallet = await buildBridgeWallet(urls, userSeed);
    report.observerWalletSyncMs = Date.now() - t0;
    s0 = await snap();
    report.s0 = summary(s0);
    log("s0", JSON.stringify(report.s0, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    writeReport();
  }, 1_800_000);

  afterAll(async () => {
    report.finishedAt = iso(Date.now());
    writeReport();
    await userWallet?.wallet.stop().catch(() => {});
  });

  // ── US1 ───────────────────────────────────────────────────────────────────

  let us1Nonce = -1n;

  test("US1 / SC-001 leg 1: bridge:to-midnight 10 → completed in < 5 min; vault +10, wallet +10", async () => {
    const before = await snap();
    const nonce = before.lockNonce; // the next lock gets this nonce
    const id = `s2m:${nonce}`;
    const w = watchTransfer(id);
    const r = await runCli("us1-to-midnight", ["to-midnight", "--amount", "10", "--recipient", userAddress, "--timeout", "900"], 1_000_000);
    await w.stop();
    expect(r.code).toBe(0);
    const lock = lineMatch(r, /^Solana lock:\s+(\S+) \(slot (\d+)\), lock nonce (\d+), transfer (\S+)/);
    expect(BigInt(lock.m[3]!)).toBe(nonce);
    const done = lineMatch(r, /^Completed\.\s+Solana lock (\S+); Midnight mint (\S+)/);
    const t = (await getTransfer(API, id))!;
    expect(t.status).toBe("completed");
    expect(t.amount).toBe((10n * unit).toString());
    expect(t.recipient).toBe(userKeys.coinPublicKey + userKeys.encryptionPublicKey);
    expect(t.sender).toBe(user.toBase58());
    const after = await snap();
    const walletColor = await waitColorBalance(userWallet, colorHex, before.userColor + 10n * unit, 300_000);
    us1Nonce = nonce;
    report.us1 = {
      transfer: t,
      solanaLockTx: lock.m[1],
      lockSlot: Number(lock.m[2]),
      midnightMintTx: done.m[2],
      cliMs: r.ms,
      legMs: done.t - lock.t,
      statusChanges: w.changes,
      before: summary(before),
      after: { ...summary(after), userColor: walletColor },
    };
    writeReport();
    log(`US1 leg: lock → completed in ${((done.t - lock.t) / 1000).toFixed(1)} s (CLI ${(r.ms / 1000).toFixed(1)} s)`);
    expect(after.vault - before.vault).toBe(10n * unit);
    expect(before.userSpl - after.userSpl).toBe(10n * unit);
    expect(walletColor - before.userColor).toBe(10n * unit);
    expect(after.ledger.mintedLocks.get(nonce)).toBe(10n * unit);
    expect(after.ledger.mintedLocks.size).toBe(before.ledger.mintedLocks.size + 1);
    expect(t.relayer?.attempts).toBe(1);
    expect(r.ms).toBeLessThan(LEG_LIMIT_MS);
  }, 1_200_000);

  // ── US2 ───────────────────────────────────────────────────────────────────

  let us2Withdrawal = -1n;

  test("US2 / SC-001 leg 2: bridge:to-solana 4 → completed in < 5 min; SPL +4, vault 6, wallet keeps 6", async () => {
    const before = await snap();
    const wid = before.ledger.withdrawalNonce;
    const id = `m2s:${wid}`;
    const w = watchTransfer(id);
    const r = await runCli("us2-to-solana", ["to-solana", "--amount", "4", "--recipient", user.toBase58(), "--timeout", "900"], 1_500_000);
    await w.stop();
    expect(r.code).toBe(0);
    const burn = lineMatch(r, /^Midnight burn: (\S+) \(block (\S+)\), withdrawal id (\d+), transfer (\S+)/);
    expect(BigInt(burn.m[3]!)).toBe(wid);
    const done = lineMatch(r, /^Completed\.\s+Midnight burn (\S+); Solana release (\S+)/);
    const t = (await getTransfer(API, id))!;
    expect(t.status).toBe("completed");
    const after = await snap();
    const walletColor = await waitColorBalance(userWallet, colorHex, before.userColor - 4n * unit, 300_000);
    const rc = await receipt(conn, programId, wid);
    us2Withdrawal = wid;
    report.us2 = {
      transfer: t,
      midnightBurnTx: burn.m[1],
      burnBlock: burn.m[2],
      solanaReleaseTx: done.m[2],
      cliMs: r.ms,
      walletAndBurnMs: burn.t - (r.lines[0]?.t ?? burn.t),
      legMs: done.t - burn.t,
      statusChanges: w.changes,
      receipt: rc,
      before: summary(before),
      after: { ...summary(after), userColor: walletColor },
    };
    // SC-001, from before US1.
    report.sc001 = {
      userSplNet: after.userSpl - s0.userSpl,
      userColorNet: walletColor - s0.userColor,
      vaultNet: after.vault - s0.vault,
      burned: after.ledger.withdrawals.get(wid)?.amount,
    };
    writeReport();
    log(`US2 leg: burn → completed in ${((done.t - burn.t) / 1000).toFixed(1)} s (CLI ${(r.ms / 1000).toFixed(1)} s incl. wallet sync)`);
    expect(after.userSpl - before.userSpl).toBe(4n * unit);
    expect(after.vault - before.vault).toBe(-4n * unit);
    expect(walletColor).toBe(before.userColor - 4n * unit);
    expect(after.ledger.withdrawals.size).toBe(before.ledger.withdrawals.size + 1);
    expect(after.ledger.withdrawals.get(wid)).toEqual({ solanaRecipient: bytesToHex(user.toBytes()), amount: 4n * unit });
    expect(rc).toEqual({ version: 1, withdrawalId: wid, recipientOwner: user.toBase58(), amount: 4n * unit });
    expect(t.relayer?.attempts).toBe(1);
    // SC-001 exact reconciliation.
    expect(after.userSpl - s0.userSpl).toBe(-6n * unit);
    expect(walletColor - s0.userColor).toBe(6n * unit);
    expect(after.vault - s0.vault).toBe(6n * unit);
    expect(after.ledger.withdrawals.get(wid)!.amount).toBe(4n * unit);
    expect(done.t - burn.t).toBeLessThan(LEG_LIMIT_MS);
  }, 1_800_000);

  // ── T-NEG ─────────────────────────────────────────────────────────────────

  describe("T-NEG: refused at the expected layer, nothing changes on chain", () => {
    let user2: WalletResult;
    let user2Providers: any;
    let userProviders: any;
    const user2Seed = localDevSeed("user2");
    const user2Keys = shieldedKeysFromSeed(user2Seed);
    const user2Recipient = shieldedRecipient(hexToBytes(user2Keys.coinPublicKey, 32));
    const user2Mapping: [string, string] = [user2Keys.coinPublicKey, user2Keys.encryptionPublicKey];
    const neg: Record<string, any> = {};
    let second: { contractAddress: string; tokenColor: string } | null = null;
    let tmp = "";

    beforeAll(async () => {
      report.neg = neg;
      const t0 = Date.now();
      user2 = await buildBridgeWallet(urls, user2Seed);
      user2Providers = await bridgeProviders(user2, urls, `bridge-e2e-user2-${Date.now()}`);
      userProviders = await bridgeProviders(userWallet, urls, `bridge-e2e-user-${Date.now()}`);
      neg.walletSetupMs = Date.now() - t0;
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-e2e-"));
      fs.chmodSync(tmp, 0o700);
    }, 1_200_000);

    afterAll(async () => {
      await user2?.wallet.stop().catch(() => {});
      writeReport();
    });

    const contractBytes = () => hexToBytes(midnight.contractAddress, 32, "contract");
    const tag = () => hexToBytes(midnight.networkTag, 32, "network tag");
    const unusedNonce = () => (1n << 40n) + BigInt(randomBytes(4).readUInt32LE(0));

    test("a mint signed by another key is refused in-circuit ('bad signature')", async () => {
      const L0 = (await readLedger(urls, midnight.contractAddress))!;
      const forger = nacl.sign.keyPair();
      const lockNonce = unusedNonce();
      const { sig } = signMint(forger.secretKey, { contractAddress: contractBytes(), networkTag: tag(), lockNonce, recipient: user2Recipient, amount: unit });
      const err = await refusal(mintFromSolana(user2Providers, midnight.contractAddress, { lockNonce, recipient: user2Recipient, amount: unit, sig, mapping: user2Mapping }));
      neg.forgedSignature = { lockNonce, refused: err?.slice(0, 400) ?? null };
      expect(err).toContain("bad signature");
      const L1 = (await readLedger(urls, midnight.contractAddress))!;
      expect(L1.mintedLocks.size).toBe(L0.mintedLocks.size);
    }, 600_000);

    test("a second mint for an already-minted lock is refused in-circuit ('lock already minted', US1.3)", async () => {
      expect(us1Nonce).toBeGreaterThanOrEqual(0n);
      const operator = loadLocalOperator();
      const before = await colorBalance(userWallet, colorHex);
      const userRecipient = shieldedRecipient(hexToBytes(userKeys.coinPublicKey, 32));
      const { sig } = signMint(operator.secretKey, { contractAddress: contractBytes(), networkTag: tag(), lockNonce: us1Nonce, recipient: userRecipient, amount: 10n * unit });
      const err = await refusal(mintFromSolana(user2Providers, midnight.contractAddress, {
        lockNonce: us1Nonce, recipient: userRecipient, amount: 10n * unit, sig,
        mapping: [userKeys.coinPublicKey, userKeys.encryptionPublicKey],
      }));
      neg.replayedLock = { lockNonce: us1Nonce, refused: err?.slice(0, 400) ?? null };
      expect(err).toContain("lock already minted");
      const L = (await readLedger(urls, midnight.contractAddress))!;
      expect(L.mintedLocks.get(us1Nonce)).toBe(10n * unit);
      await delay(5_000);
      expect(await colorBalance(userWallet, colorHex)).toBe(before);
    }, 600_000);

    test("an operator signature for this bridge is refused by a SECOND bridge instance (cross-contract replay)", async () => {
      // Deploy a second instance sealing the SAME operator key, mint and network
      // (deploy.ts --out), paid by the dev seed 0x…03 so the relayer's wallet
      // (0x…01) is never used concurrently.
      const file = path.join(tmp, "second-bridge.json");
      writeDeploymentSection(file, "solana", solana);
      const seedFile = path.join(tmp, "deployer.seed");
      fs.writeFileSync(seedFile, user2Seed, { mode: 0o600 });
      const t0 = Date.now();
      const p = Bun.spawn(["bun", "run", "deploy.ts", "--mode", "local", "--out", file, "--seed-file", seedFile], {
        cwd: path.join(TEMPLATE_ROOT, "packages/contracts-midnight"),
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env } as Record<string, string>,
      });
      const [out, errText, code] = await Promise.all([
        new Response(p.stdout as ReadableStream<Uint8Array>).text(),
        new Response(p.stderr as ReadableStream<Uint8Array>).text(),
        p.exited,
      ]);
      fs.writeFileSync(path.join(LOG_DIR, "neg-deploy-second-instance.log"), `${out}\n--- stderr ---\n${errText}\n--- exit ${code}\n`);
      expect(code).toBe(0);
      const d2 = readDeployment(file)!.midnight as unknown as MidnightDeployment;
      second = { contractAddress: d2.contractAddress, tokenColor: d2.tokenColor };
      expect(d2.contractAddress).not.toBe(midnight.contractAddress);
      expect(d2.operator).toBe(midnight.operator);
      expect(d2.networkTag).toBe(midnight.networkTag);
      expect(d2.sourceMint).toBe(midnight.sourceMint);

      const operator = loadLocalOperator();
      const lockNonce = unusedNonce();
      const authA = { contractAddress: contractBytes(), networkTag: tag(), lockNonce, recipient: user2Recipient, amount: unit };
      const { signature, sig } = signMint(operator.secretKey, authA);
      // Valid for the first bridge (so the refusal below is the address binding, nothing else) …
      expect(verifyMintSignature(operator.publicKey.toBytes(), authA, signature)).toBe(true);
      expect(verifyMintSignature(operator.publicKey.toBytes(), { ...authA, contractAddress: hexToBytes(d2.contractAddress, 32) }, signature)).toBe(false);
      // … refused by the second.
      const err = await refusal(mintFromSolana(user2Providers, d2.contractAddress, { lockNonce, recipient: user2Recipient, amount: unit, sig, mapping: user2Mapping }));
      const L2 = (await readLedger(urls, d2.contractAddress))!;
      neg.crossContractReplay = {
        secondContract: d2.contractAddress,
        secondColour: d2.tokenColor,
        deployMs: Date.now() - t0,
        lockNonce,
        refused: err?.slice(0, 400) ?? null,
        secondMintedLocks: L2.mintedLocks.size,
      };
      expect(err).toContain("bad signature");
      expect(L2.mintedLocks.size).toBe(0);
    }, 1_200_000);

    test("a burn of another colour is refused in-circuit ('not the bridge colour')", async () => {
      // The second instance's colour: a real bridge colour, just not this bridge's.
      const other = second?.tokenColor ?? bytesToHex(randomBytes(32));
      const balances = await shieldedBalances(userWallet);
      const L0 = (await readLedger(urls, midnight.contractAddress))!;
      const err = await refusal(lockForSolana(userProviders, midnight.contractAddress, {
        color: hexToBytes(other, 32), amount: unit, solanaRecipient: user.toBytes(),
      }));
      neg.wrongColourBurn = { colour: other, walletColours: Object.keys(balances), refused: err?.slice(0, 400) ?? null };
      expect(err).toContain("not the bridge colour");
      const L1 = (await readLedger(urls, midnight.contractAddress))!;
      expect(L1.withdrawals.size).toBe(L0.withdrawals.size);
      expect(L1.withdrawalNonce).toBe(L0.withdrawalNonce);
    }, 600_000);

    test("a release signed by a non-operator is refused by the program (Unauthorized)", async () => {
      const attacker = Keypair.generate();
      await airdropAtLeast(conn, attacker.publicKey, 1);
      const L = (await readLedger(urls, midnight.contractAddress))!;
      const id = L.withdrawalNonce; // the NEXT real withdrawal id: a front-run attempt
      const vaultBefore = await tokenBalance(conn, vault);
      const { instructions } = createReleaseWithAtaInstructions({
        programId, operator: attacker.publicKey, payer: attacker.publicKey, mint,
        recipientOwner: attacker.publicKey, withdrawalId: id, amount: unit,
      });
      const sent = await sendTx(conn, instructions, [attacker], { skipPreflight: true });
      neg.nonOperatorRelease = { withdrawalId: id, signature: sent.signature, err: sent.err };
      expect(customErrorOf(sent.err)).toEqual({ index: 1, code: BridgeError.Unauthorized });
      expect(await tokenBalance(conn, vault)).toBe(vaultBefore);
      expect(await conn.getAccountInfo(findReceiptAddress(programId, id)[0], "confirmed")).toBeNull();
    }, 300_000);

    test("a re-sent release for an already-released withdrawal is refused by the program (AlreadyReleased, US2.3)", async () => {
      expect(us2Withdrawal).toBeGreaterThanOrEqual(0n);
      const operator = loadLocalOperator();
      const vaultBefore = await tokenBalance(conn, vault);
      const userBefore = await tokenBalance(conn, userAta);
      const { instructions } = createReleaseWithAtaInstructions({
        programId, operator: operator.publicKey, payer: operator.publicKey, mint,
        recipientOwner: user, withdrawalId: us2Withdrawal, amount: 4n * unit,
      });
      const sent = await sendTx(conn, instructions, [operator], { skipPreflight: true });
      neg.resentRelease = { withdrawalId: us2Withdrawal, signature: sent.signature, err: sent.err };
      expect(customErrorOf(sent.err)).toEqual({ index: 1, code: BridgeError.AlreadyReleased });
      expect(await tokenBalance(conn, vault)).toBe(vaultBefore);
      expect(await tokenBalance(conn, userAta)).toBe(userBefore);
    }, 300_000);

    test("bad CLI arguments are refused before any chain call (exit 2)", async () => {
      const zero = await runCli("neg-zero-amount", ["to-midnight", "--amount", "0", "--recipient", userAddress], 120_000);
      const bad = await runCli("neg-bad-recipient", ["to-solana", "--amount", "1", "--recipient", "not-a-pubkey"], 120_000);
      const net = await runCli("neg-wrong-network", ["to-midnight", "--amount", "1", "--recipient", shieldedAddressFromSeed(userSeed, "preview")], 120_000);
      neg.cli = { zeroAmount: zero.code, badRecipient: bad.code, wrongNetwork: net.code, messages: [zero.stderr, bad.stderr, net.stderr].map((s) => s.split("\n")[0]) };
      expect(zero.code).toBe(2);
      expect(zero.stderr).toContain("--amount must be greater than zero");
      expect(bad.code).toBe(2);
      expect(bad.stderr).toContain("--recipient is not a base58 Solana public key");
      expect(net.code).toBe(2);
      expect(net.stderr).toContain('not a shielded address for network "undeployed"');
    }, 300_000);
  });

  // ── US4 (b): wipe PGLite and re-sync ──────────────────────────────────────
  // Runs BEFORE the kill/restart tests: the local validator purges its old
  // blocks about 24 minutes after it starts (default --limit-ledger-size, Q22),
  // after which the deployment's start slot can no longer be re-read.

  test("US4 (b): node stopped, PGLite wiped, re-sync from the deployment start heights → every transfer completed, nothing sent", async () => {
    const firstAvailable = await conn.getFirstAvailableBlock();
    if (firstAvailable > solana.startSlot) {
      throw new Error(`the local validator already purged the start slot ${solana.startSlot} (first available ${firstAvailable}); a full re-sync is impossible (questions file Q22)`);
    }
    const rowsBefore = await listTransfers(API, { limit: 500 });
    expect(rowsBefore.length).toBeGreaterThan(0);
    expect(rowsBefore.every((t) => t.status === "completed")).toBe(true);
    const chainBefore = await chainState();
    await orch.stop("sync");
    await orch.restart("pglite"); // in-memory (PGLITE_DATA_DIR memory://): a restart is a wipe
    await orch.waitFor("pglite", { timeoutMs: 120_000 });
    // wait for the port, then start the node on the empty database
    const t0 = Date.now();
    for (;;) {
      const ok = await Bun.connect({ hostname: "127.0.0.1", port: 5432, socket: { data() {}, open(s) { s.end(); } } }).then(() => true, () => false);
      if (ok) break;
      if (Date.now() - t0 > 120_000) throw new Error("PGLite did not come back on :5432");
      await delay(500);
    }
    const restartedAt = Date.now();
    await orch.restart("sync");
    await orch.waitFor("sync", { timeoutMs: 300_000 });
    await waitForNodeApi(API, 900_000);
    const apiUpMs = Date.now() - restartedAt;
    const afterBoot = await listTransfers(API, { limit: 500 });
    let rows: TransferView[] = [];
    while (Date.now() - restartedAt < 3_600_000) {
      rows = await listTransfers(API, { limit: 500 }).catch(() => []);
      if (rows.length === rowsBefore.length && rows.every((t) => t.status === "completed")) break;
      await delay(2_000);
    }
    const resyncMs = Date.now() - restartedAt;
    await delay(20_000); // four relayer polls over the re-synced set: it must find nothing to do
    // If the relayer did start an attempt while a transfer was briefly `observed`
    // during the catch-up, wait for that attempt's outcome before judging it.
    let rowsFinal = await listTransfers(API, { limit: 500 });
    for (const t2 = Date.now(); Date.now() - t2 < 600_000; await delay(5_000)) {
      rowsFinal = await listTransfers(API, { limit: 500 });
      if (rowsFinal.every((t) => !t.relayer || t.relayer.lastError || t.relayer.lastTx)) break;
    }
    const chainAfter = await chainState();
    report.us4b = {
      firstAvailableSolanaBlockBefore: firstAvailable,
      startSlot: solana.startSlot,
      restartedAt: iso(restartedAt),
      apiUpMs,
      transfersRightAfterApiUp: afterBoot.length,
      resyncMs,
      before: rowsBefore.map((t) => ({ id: t.id, status: t.status, dstRef: t.dstRef, attempts: t.relayer?.attempts ?? 0 })),
      after: rowsFinal.map((t) => ({ id: t.id, status: t.status, dstRef: t.dstRef, relayer: t.relayer })),
      chainBefore,
      chainAfter,
    };
    writeReport();
    expect(rowsFinal.map((t) => t.id).sort()).toEqual(rowsBefore.map((t) => t.id).sort());
    expect(rowsFinal.every((t) => t.status === "completed")).toBe(true);
    for (const t of rowsFinal) {
      const b = rowsBefore.find((x) => x.id === t.id)!;
      expect(t.amount).toBe(b.amount);
      expect(t.recipient).toBe(b.recipient);
      // The relayer may only have tried a transfer whose counterpart is on chain, and
      // then only to be refused before anything was sent (or to find the receipt).
      if (t.relayer) expect(t.relayer.lastError ?? "").toMatch(/already settled on chain|receipt exists/);
    }
    // Nothing was sent: neither chain's bridge state nor the contract's transaction list moved.
    expect(chainAfter).toEqual(chainBefore);
  }, 5_400_000);

  // ── US4 (a): kill the relayer between submitted and completed ─────────────

  describe("US4 (a): the relayer is killed between `submitted` and `completed`, then restarted", () => {
    const us4: Record<string, any> = {};
    beforeAll(() => {
      report.us4a = us4;
    });

    async function restartSync(): Promise<number> {
      const t0 = Date.now();
      await orch.restart("sync");
      await orch.waitFor("sync", { timeoutMs: 300_000 });
      await waitForNodeApi(API, 600_000);
      return Date.now() - t0;
    }

    /**
     * Waits until the relayer's last attempt on `id` has an outcome (a landed
     * transaction or an error). The relayer never re-attempts a `completed`
     * transfer, so a re-send could only have started before completion; this
     * makes sure such an attempt is judged by its outcome, not caught in flight.
     */
    async function waitAttemptSettled(id: string): Promise<TransferView> {
      let t = (await getTransfer(API, id))!;
      for (const t0 = Date.now(); Date.now() - t0 < 600_000; await delay(2_000)) {
        t = (await getTransfer(API, id))!;
        if (!t.relayer || t.relayer.lastTx || t.relayer.lastError) break;
      }
      return t;
    }

    test("(1) killed while the mint is being proved: exactly one mint after the restart", async () => {
      const before = await snap();
      const nonce = before.lockNonce;
      const id = `s2m:${nonce}`;
      const w = watchTransfer(id);
      const r = await runCli("us4a1-to-midnight", ["to-midnight", "--amount", "3", "--recipient", userAddress, "--no-wait"], 300_000);
      expect(r.code).toBe(0);
      const submitted = await waitTransfer(id, (t) => t.status === "submitted" || t.status === "completed", 900_000, 250);
      expect(submitted.status).toBe("submitted");
      const killed = await orch.killHard("sync");
      const killedAt = Date.now();
      const atKill = (await readLedger(urls, midnight.contractAddress))!;
      const restartMs = await restartSync();
      const t = await waitTransfer(id, (x) => x.status === "completed", 1_200_000, 2_000);
      const walletColor = await waitColorBalance(userWallet, colorHex, before.userColor + 3n * unit, 300_000);
      await delay(10_000); // nothing else may arrive
      const after = await snap();
      await w.stop();
      us4.killedWhileProving = {
        transfer: t,
        killedPid: killed.pid,
        killExit: killed.exitCode,
        killedAt: iso(killedAt),
        mintedOnChainAtKill: atKill.mintedLocks.has(nonce),
        restartMs,
        completedAfterKillMs: Date.now() - killedAt,
        statusChanges: w.changes,
        before: summary(before),
        after: summary(after),
      };
      writeReport();
      expect(after.ledger.mintedLocks.get(nonce)).toBe(3n * unit);
      expect(after.ledger.mintedLocks.size).toBe(before.ledger.mintedLocks.size + 1);
      expect(walletColor).toBe(before.userColor + 3n * unit);
      expect(after.userColor).toBe(before.userColor + 3n * unit);
      expect(after.vault - before.vault).toBe(3n * unit);
    }, 2_400_000);

    test("(2) killed after the mint landed but before sync saw it: exactly one mint, no re-send", async () => {
      let attempt = 0;
      let result: Record<string, any> | null = null;
      while (attempt < 2 && !result?.killedInWindow) {
        attempt++;
        const before = await snap();
        const nonce = before.lockNonce;
        const id = `s2m:${nonce}`;
        const w = watchTransfer(id);
        const r = await runCli(`us4a2-to-midnight-${attempt}`, ["to-midnight", "--amount", "2", "--recipient", userAddress, "--no-wait"], 300_000);
        expect(r.code).toBe(0);
        await waitTransfer(id, (t) => t.status !== "observed", 900_000, 500);
        // Watch the ledger (not the node) until the mint is on chain.
        const t0 = Date.now();
        let landedAt = 0;
        while (Date.now() - t0 < 900_000) {
          const L = await readLedger(urls, midnight.contractAddress).catch(() => null);
          if (L?.mintedLocks.has(nonce)) {
            landedAt = Date.now();
            break;
          }
          await delay(300);
        }
        expect(landedAt).toBeGreaterThan(0);
        const apiBefore = await getTransfer(API, id).catch(() => null);
        const inWindow = apiBefore?.status !== "completed";
        let killed = null;
        if (inWindow) killed = await orch.killHard("sync");
        const killedAt = Date.now();
        const restartMs = inWindow ? await restartSync() : 0;
        const t = await waitTransfer(id, (x) => x.status === "completed", 1_200_000, 2_000);
        const walletColor = await waitColorBalance(userWallet, colorHex, before.userColor + 2n * unit, 300_000);
        const t2 = await waitAttemptSettled(id);
        const after = await snap();
        await w.stop();
        result = {
          attempt,
          killedInWindow: inWindow,
          apiStatusAtKill: apiBefore?.status ?? null,
          killedPid: killed?.pid ?? null,
          mintLandedToKillMs: killedAt - landedAt,
          restartMs,
          transfer: t2,
          statusChanges: w.changes,
          walletColor,
          before: summary(before),
          after: summary(after),
        };
        us4[`killedAfterLanding${attempt}`] = result;
        writeReport();
        expect(after.ledger.mintedLocks.get(nonce)).toBe(2n * unit);
        expect(after.ledger.mintedLocks.size).toBe(before.ledger.mintedLocks.size + 1);
        expect(after.userColor).toBe(before.userColor + 2n * unit);
        // The landed mint is completed by sync, not re-sent. A re-attempt can only
        // happen if the restart outlasted the 120 s backoff, and must then be
        // refused before proving (nothing sent).
        const attempts = t2.relayer?.attempts ?? 0;
        expect(attempts).toBeGreaterThanOrEqual(1);
        if (attempts > 1) expect(t2.relayer?.lastError ?? "").toMatch(/already settled on chain|lock already minted/);
      }
      expect(result?.killedInWindow).toBe(true);
    }, 3_600_000);

    test("(3) burn → release to a fresh address, killed after `submitted`: exactly one release, ATA created in the same tx", async () => {
      const before = await snap();
      const wid = before.ledger.withdrawalNonce;
      const id = `m2s:${wid}`;
      const fresh = Keypair.generate().publicKey;
      const freshAta = ataOf(mint, fresh);
      expect(await conn.getAccountInfo(freshAta, "confirmed")).toBeNull();
      const w = watchTransfer(id);
      const r = await runCli("us4a3-to-solana", ["to-solana", "--amount", "1", "--recipient", fresh.toBase58(), "--no-wait"], 1_500_000);
      expect(r.code).toBe(0);
      const burn = lineMatch(r, /^Midnight burn: (\S+) \(block (\S+)\), withdrawal id (\d+)/);
      expect(BigInt(burn.m[3]!)).toBe(wid);
      await waitTransfer(id, (t) => t.status === "submitted" || t.status === "completed", 900_000, 250);
      const apiAtKill = await getTransfer(API, id).catch(() => null);
      const killed = await orch.killHard("sync");
      const killedAt = Date.now();
      const receiptAtKill = await receipt(conn, programId, wid);
      const restartMs = await restartSync();
      const t = await waitTransfer(id, (x) => x.status === "completed", 1_200_000, 2_000);
      const settled = await waitAttemptSettled(id);
      const after = await snap();
      const rc = await receipt(conn, programId, wid);
      // Informational: the local validator may already have purged it (Q22).
      const txs = await programTransactions(conn, programId);
      const releasesOfThisId = txs.filter((x) => x.logs.some((l) => l.kind === "RELEASE" && l.withdrawalId === wid));
      await w.stop();
      us4.burnReleaseKilled = {
        transfer: settled,
        midnightBurnTx: burn.m[1],
        fresh: fresh.toBase58(),
        apiStatusAtKill: apiAtKill?.status ?? null,
        releasedOnChainAtKill: receiptAtKill !== null,
        killedPid: killed.pid,
        restartMs,
        completedAfterKillMs: Date.now() - killedAt,
        statusChanges: w.changes,
        receipt: rc,
        before: summary(before),
        after: summary(after),
        releaseTxsForThisId: releasesOfThisId.map((x) => x.signature),
      };
      writeReport();
      expect(t.status).toBe("completed");
      // A second attempt could only find the receipt (or be refused): never a second release.
      if ((settled.relayer?.attempts ?? 0) > 1) expect(settled.relayer?.lastError ?? "").toMatch(/receipt exists|already settled on chain/);
      expect(await tokenBalance(conn, freshAta)).toBe(unit);
      expect(rc).toEqual({ version: 1, withdrawalId: wid, recipientOwner: fresh.toBase58(), amount: unit });
      // Exactly one release: the vault moved by exactly 1, the fresh account holds exactly 1.
      expect(after.vault - before.vault).toBe(-unit);
      expect(after.ledger.withdrawals.get(wid)).toEqual({ solanaRecipient: bytesToHex(fresh.toBytes()), amount: unit });
    }, 2_400_000);
  });

  // ── SC-003: the chains hold exactly one counterpart per transfer ──────────

  test("SC-003: mintedLocks = Solana locks, release receipts = withdrawals, no extra transactions on either chain", async () => {
    const L = (await readLedger(urls, midnight.contractAddress))!;
    const locks = await lockNonce(conn, programId);
    // Informational only: the local validator purges old blocks (Q22), so the
    // program's transaction history may be incomplete. The assertions below use
    // on-chain state instead, which no purge removes.
    const firstAvailable = await conn.getFirstAvailableBlock();
    const progTxs = await programTransactions(conn, programId);
    const kinds = countKinds(progTxs);
    const lockAmounts = (await listTransfers(API, { direction: "s2m", limit: 500 })).map((t) => BigInt(t.amount));
    const contractTxs = await contractTransactions(urls.indexer, midnight.contractAddress, Math.max(0, midnight.startBlockHeight - 1));
    const receipts: Record<string, unknown> = {};
    let released = 0n;
    for (let id = 0n; id < L.withdrawalNonce; id++) {
      const rc = await receipt(conn, programId, id);
      receipts[id.toString()] = rc;
      expect(rc).not.toBeNull();
      expect(rc!.amount).toBe(L.withdrawals.get(id)!.amount);
      expect(bytesToHex(new PublicKey(rc!.recipientOwner).toBytes())).toBe(L.withdrawals.get(id)!.solanaRecipient);
      released += rc!.amount;
    }
    // Nothing beyond the last withdrawal id was ever released (the negatives used ids ≥ withdrawalNonce at their time).
    for (let id = L.withdrawalNonce; id < L.withdrawalNonce + 3n; id++) expect(await receipt(conn, programId, id)).toBeNull();
    const minted = [...L.mintedLocks.values()].reduce((a, b) => a + b, 0n);
    const vaultNow = await tokenBalance(conn, vault);
    const finalStatus = await runCli("final-status", ["status"], 120_000);
    report.sc003 = {
      solanaLocks: locks,
      mintedLocks: L.mintedLocks.size,
      withdrawals: L.withdrawals.size,
      withdrawalNonce: L.withdrawalNonce,
      receipts,
      solanaFirstAvailableBlock: firstAvailable,
      solanaHistoryComplete: firstAvailable <= solana.startSlot,
      programTxKinds: kinds,
      failedProgramTxs: progTxs.filter((t) => !t.ok).map((t) => ({ signature: t.signature, err: t.err })),
      lockAmountsFromSync: lockAmounts,
      midnightContractTxs: contractTxs,
      minted,
      released,
      vault: vaultNow,
      statusExit: finalStatus.code,
    };
    writeReport();
    expect(BigInt(L.mintedLocks.size)).toBe(locks);
    for (let n = 0n; n < locks; n++) expect(L.mintedLocks.has(n)).toBe(true);
    expect(BigInt(L.withdrawals.size)).toBe(L.withdrawalNonce);
    // Every lock the node saw was minted once, for its own amount.
    expect(BigInt(lockAmounts.length)).toBe(locks);
    expect(minted).toBe(lockAmounts.reduce((a, b) => a + b, 0n));
    // deploy + one mint per lock + one burn per withdrawal, nothing else
    expect(contractTxs.length).toBe(1 + L.mintedLocks.size + L.withdrawals.size);
    // The vault holds exactly locks − releases: no release beyond the receipts.
    expect(vaultNow - s0.vault).toBe(minted - released);
    if (firstAvailable <= solana.startSlot) {
      // The full program history is still on the validator: check it too.
      expect(kinds.INIT).toBe(1);
      expect(BigInt(kinds.LOCK!)).toBe(locks);
      expect(BigInt(kinds.RELEASE!)).toBe(L.withdrawalNonce);
      expect(kinds.failed).toBe(2); // exactly the two refused negatives (non-operator, re-sent)
      expect(kinds.other).toBe(0);
    }
    expect(finalStatus.code).toBe(0);
  }, 900_000);
});
