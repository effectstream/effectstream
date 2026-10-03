// The three CLI commands. Arguments are fully validated by args.ts BEFORE any
// of these functions touches a chain; amounts are re-validated against the
// mint's decimals once the deployment file is read (still before any RPC).
//
//   to-midnight  lock SPL in the Solana program for a Midnight shielded
//                address, then wait until the relayer's mint is seen by sync
//   to-solana    burn bridge-colour coins in the Midnight contract
//                (lockForSolana) for a Solana wallet, then wait for the release
//   status       a table of transfers from the node's API
//
// Keys: local mode uses the local dev keys (refused off-loopback); live mode
// reads ~/.config/effectstream-00050/ (or an explicit --keypair / --seed-file
// with 600 permissions). Nothing here prints key material.
import fs from "node:fs";
import { Connection, PublicKey, type Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as Rx from "rxjs";
import {
  readDeployment,
  deploymentPath,
  type SolanaDeployment,
} from "@solana-midnight-bridge/contracts-solana/deployments";
import { DEV_SOLANA_RPC_URL, LOCAL_DEPLOYMENT } from "@solana-midnight-bridge/contracts-solana/dev-config";
import {
  assertLocalRpc,
  isLocalOnlyKey,
  isLoopbackRpcUrl,
  liveKeyPaths,
  loadLiveKeypair,
  loadLocalUser,
  readKeypairFile,
  redactRpcUrl,
} from "@solana-midnight-bridge/contracts-solana/keys";
import { createLockInstruction, parseBridgeLogs } from "@solana-midnight-bridge/contracts-solana/instructions";
import { sendTx } from "@solana-midnight-bridge/contracts-solana/chain";
import type { MidnightDeployment } from "@solana-midnight-bridge/contracts-midnight/deploy";
import { midnightUrls } from "@solana-midnight-bridge/contracts-midnight/network";
import { buildBridgeWallet, resolveSeed } from "@solana-midnight-bridge/contracts-midnight/wallets";
import { hexToBytes } from "@solana-midnight-bridge/contracts-midnight/signing";
import { bridgeProviders, lockForSolana } from "@solana-midnight-bridge/contracts-midnight/client";
import {
  CliArgError,
  formatAmount,
  parseAmount,
  type CliMode,
  type StatusArgs,
  type ToMidnightArgs,
  type ToSolanaArgs,
} from "./args.ts";
import { defaultApiUrl, getTransfer, listTransfers, waitForCompleted, type TransferView } from "./api-client.ts";

const out = (...a: unknown[]) => console.log(...a);

function deploymentName(mode: CliMode): string {
  return mode === "local" ? LOCAL_DEPLOYMENT : (process.env.BRIDGE_DEPLOYMENT ?? "devnet-stagenet");
}

function loadDeployment(mode: CliMode, need: "solana" | "both"): { solana: SolanaDeployment; midnight?: MidnightDeployment } {
  const name = deploymentName(mode);
  const d = readDeployment(name);
  if (!d?.solana) throw new Error(`no "solana" section in ${deploymentPath(name)} (start the local stack, or deploy)`);
  if (need === "both" && !d.midnight) throw new Error(`no "midnight" section in ${deploymentPath(name)}`);
  return { solana: d.solana, midnight: d.midnight as unknown as MidnightDeployment | undefined };
}

function solanaRpcUrl(mode: CliMode): string {
  return mode === "local" ? DEV_SOLANA_RPC_URL : (process.env.SOLANA_DEVNET_RPC_URL ?? "https://api.devnet.solana.com");
}

function loadDepositor(mode: CliMode, rpcUrl: string, keypairPath?: string): Keypair {
  if (keypairPath) {
    const st = fs.statSync(keypairPath);
    if ((st.mode & 0o077) !== 0) throw new Error(`${keypairPath} is readable by group/other; chmod 600 it`);
    const kp = readKeypairFile(keypairPath);
    if (!isLoopbackRpcUrl(rpcUrl) && isLocalOnlyKey(keypairPath, kp.publicKey)) {
      throw new Error(`refusing the local-only key ${kp.publicKey.toBase58()} on ${redactRpcUrl(rpcUrl)} (FR-009)`);
    }
    return kp;
  }
  if (mode === "local") {
    assertLocalRpc(rpcUrl, "bridge:to-midnight");
    return loadLocalUser();
  }
  return loadLiveKeypair(liveKeyPaths().user, "user");
}

function describe(t: TransferView | null, decimals?: number, apiError?: string): string {
  if (apiError !== undefined) return `node API did not answer (${apiError}); retrying`;
  if (!t) return "not yet observed by sync";
  const amt = decimals === undefined ? t.amount : `${formatAmount(BigInt(t.amount), decimals)} (${t.amount} base units)`;
  const r = t.relayer;
  return `${t.status}; amount ${amt}` +
    (r ? `; relayer attempts ${r.attempts}${r.lastTx ? `, last tx ${r.lastTx}` : ""}${r.lastError ? `, last error: ${r.lastError}` : ""}` : "");
}

// ── bridge:to-midnight ──────────────────────────────────────────────────────

export async function toMidnight(args: ToMidnightArgs): Promise<void> {
  const { solana } = loadDeployment(args.mode, "solana");
  const raw = parseAmount(args.amountText, solana.mintDecimals);
  const rpcUrl = solanaRpcUrl(args.mode);
  const user = loadDepositor(args.mode, rpcUrl, args.keypairPath);
  const conn = new Connection(rpcUrl, "confirmed");
  const programId = new PublicKey(solana.programId);
  const mint = new PublicKey(solana.mint);
  const source = getAssociatedTokenAddressSync(mint, user.publicKey);

  const bal = await conn.getTokenAccountBalance(source, "confirmed").catch(() => null);
  const have = bal ? BigInt(bal.value.amount) : 0n;
  if (have < raw) {
    throw new Error(`${user.publicKey.toBase58()} holds ${formatAmount(have, solana.mintDecimals)} of mint ${solana.mint}; cannot lock ${args.amountText}`);
  }
  out(`Locking ${args.amountText} (${raw} base units) from ${user.publicKey.toBase58()} for ${args.recipientAddress}`);
  const ix = createLockInstruction({
    programId, depositor: user.publicKey, source, mint, amount: raw, midnightRecipient: args.midnightRecipient,
  });
  const sent = await sendTx(conn, [ix], [user]);
  if (sent.err) throw new Error(`the lock transaction ${sent.signature} failed: ${JSON.stringify(sent.err)}`);
  const lock = parseBridgeLogs(sent.logs).find((l) => l.kind === "LOCK");
  if (!lock || lock.kind !== "LOCK") throw new Error(`no LOCK log in ${sent.signature}`);
  const id = `s2m:${lock.nonce}`;
  out(`Solana lock:   ${sent.signature} (slot ${sent.slot}), lock nonce ${lock.nonce}, transfer ${id}`);
  if (!args.wait) return;
  const api = args.api ?? defaultApiUrl();
  out(`Waiting for the mint on Midnight (API ${api})...`);
  const t = await waitForCompleted(api, id, {
    timeoutMs: args.timeoutSeconds * 1000,
    onChange: (x, error) => out(`  ${id}: ${describe(x, solana.mintDecimals, error)}`),
  });
  out(`Completed.     Solana lock ${sent.signature}; Midnight mint ${t.relayer?.lastTx ?? "(see relayer)"} (sync ${t.dstRef})`);
}

// ── bridge:to-solana ────────────────────────────────────────────────────────

export async function toSolana(args: ToSolanaArgs): Promise<void> {
  const { solana, midnight } = loadDeployment(args.mode, "both");
  const raw = parseAmount(args.amountText, solana.mintDecimals);
  const mmode = args.mode === "local" ? "local" : "stagenet";
  const urls = midnightUrls(mmode);
  const seed = resolveSeed(mmode, "user", urls, args.seedFile);
  const colorHex = midnight!.tokenColor;

  out(`Building the Midnight wallet (${urls.id}; DUST prover ${new URL(urls.proofServer).host}, contract prover ${new URL(urls.contractProofServer).host})...`);
  const w = await buildBridgeWallet(urls, seed);
  try {
    const state: any = await Rx.firstValueFrom((w.wallet as any).state());
    const have = BigInt(state?.shielded?.balances?.[colorHex] ?? 0n);
    if (have < raw) {
      throw new Error(`the wallet holds ${formatAmount(have, solana.mintDecimals)} of the bridge colour; cannot burn ${args.amountText}`);
    }
    out(`Burning ${args.amountText} (${raw} base units) of colour ${colorHex.slice(0, 16)}… for ${args.recipient.toBase58()}`);
    const providers = await bridgeProviders(w, urls, `bridge-cli-${urls.id}`);
    const r = await lockForSolana(providers, midnight!.contractAddress, {
      color: hexToBytes(colorHex, 32, "token colour"),
      amount: raw,
      solanaRecipient: args.recipient.toBytes(),
    });
    const id = `m2s:${r.result}`;
    out(`Midnight burn: ${r.txHash ?? r.txId} (block ${r.blockHeight}), withdrawal id ${r.result}, transfer ${id}`);
    if (!args.wait) return;
    const api = args.api ?? defaultApiUrl();
    out(`Waiting for the release on Solana (API ${api})...`);
    const t = await waitForCompleted(api, id, {
      timeoutMs: args.timeoutSeconds * 1000,
      onChange: (x, error) => out(`  ${id}: ${describe(x, solana.mintDecimals, error)}`),
    });
    out(`Completed.     Midnight burn ${r.txHash ?? r.txId}; Solana release ${t.relayer?.lastTx ?? "(see relayer)"} (sync ${t.dstRef})`);
  } finally {
    await w.wallet.stop().catch(() => {});
  }
}

// ── bridge:status ───────────────────────────────────────────────────────────

const short = (s: string | null | undefined, n: number) =>
  !s ? "-" : s.length <= n ? s : `${s.slice(0, Math.max(1, n - 1))}…`;

export function renderTable(rows: TransferView[], decimals?: number): string {
  const head = ["ID", "AMOUNT", "STATUS", "RECIPIENT", "SOURCE", "COUNTERPART", "TRIES", "LAST TX", "LAST ERROR"];
  const body = rows.map((t) => [
    t.id,
    decimals === undefined ? t.amount : formatAmount(BigInt(t.amount), decimals),
    t.status,
    short(t.recipient, 18),
    t.srcRef ?? "-",
    t.dstRef ?? "-",
    String(t.relayer?.attempts ?? 0),
    short(t.relayer?.lastTx, 18),
    short(t.relayer?.lastError, 40),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((r) => r[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();
  return [line(head), line(widths.map((w) => "-".repeat(w))), ...body.map(line)].join("\n");
}

export async function status(args: StatusArgs): Promise<void> {
  const api = args.api ?? defaultApiUrl();
  let decimals: number | undefined;
  try {
    decimals = loadDeployment(args.mode, "solana").solana.mintDecimals;
  } catch {
    decimals = undefined; // amounts shown in base units
  }
  for (;;) {
    let rows: TransferView[];
    if (args.id) {
      const t = await getTransfer(api, args.id);
      if (!t && !args.watch) throw new Error(`transfer ${args.id} not found (yet)`);
      rows = t ? [t] : [];
    } else {
      rows = await listTransfers(api, { direction: args.direction, status: args.status });
    }
    out(`${new Date().toISOString()}  ${api}  (${rows.length} transfer${rows.length === 1 ? "" : "s"})`);
    out(renderTable(rows, decimals));
    if (!args.watch) return;
    if (args.id && rows[0]?.status === "completed") return;
    await Bun.sleep(3_000);
    out("");
  }
}

export { CliArgError };
