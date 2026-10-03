// Read-only views of both chains for the end-to-end suite: SPL balances, the
// program's config and release receipts, the contract's ledger (mintedLocks,
// withdrawals), a Midnight wallet's shielded balance of a colour, and the full
// list of bridge transactions on each chain (so a test can prove that a
// restart or a re-sync sent nothing extra).
import { Connection, PublicKey, type ConfirmedSignatureInfo } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as Rx from "rxjs";
import type { WalletResult } from "@effectstream/midnight-contracts";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { bridgeLedger } from "@solana-midnight-bridge/contracts-midnight/contract";
import { bytesToHex } from "@solana-midnight-bridge/contracts-midnight/signing";
import type { BridgeMidnightUrls } from "@solana-midnight-bridge/contracts-midnight/network";
import { fetchBridgeConfig, fetchReceipt } from "@solana-midnight-bridge/contracts-solana/chain";
import { parseBridgeLogs, type BridgeLog } from "@solana-midnight-bridge/contracts-solana/instructions";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Solana ──────────────────────────────────────────────────────────────────

export async function tokenBalance(conn: Connection, account: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(conn, account, "confirmed")).amount;
  } catch {
    return 0n; // no account yet
  }
}

export function ataOf(mint: PublicKey, owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true);
}

export async function lockNonce(conn: Connection, programId: PublicKey): Promise<bigint> {
  const c = await fetchBridgeConfig(conn, programId);
  if (!c) throw new Error("the bridge program is not initialized");
  return c.lockNonce;
}

export async function receipt(conn: Connection, programId: PublicKey, id: bigint) {
  return fetchReceipt(conn, programId, id);
}

export type ProgramTx = {
  signature: string;
  slot: number;
  ok: boolean;
  /** INIT / LOCK / RELEASE lines this transaction logged (success only). */
  kinds: string[];
  /** The parsed bridge lines (success only). */
  logs: BridgeLog[];
  /** For a failed transaction: its `meta.err`. */
  err: unknown;
};

/**
 * Every transaction that touched the bridge program (newest first from the
 * RPC, returned oldest first), classified by the bridge lines it logged.
 */
export async function programTransactions(conn: Connection, programId: PublicKey): Promise<ProgramTx[]> {
  const sigs: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await conn.getSignaturesForAddress(programId, { before, limit: 1000 }, "confirmed");
    sigs.push(...page);
    if (page.length < 1000) break;
    before = page[page.length - 1]!.signature;
  }
  const out: ProgramTx[] = [];
  for (const s of sigs.reverse()) {
    let logs: string[] = [];
    for (let i = 0; i < 10; i++) {
      const tx = await conn.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (tx) {
        logs = tx.meta?.logMessages ?? [];
        break;
      }
      await delay(300);
    }
    const parsed = s.err ? [] : parseBridgeLogs(logs);
    const kinds = parsed.map((l) => l.kind);
    out.push({ signature: s.signature, slot: s.slot, ok: !s.err, kinds, logs: parsed, err: s.err ?? null });
  }
  return out;
}

export function countKinds(txs: ProgramTx[]): Record<string, number> {
  const c: Record<string, number> = { INIT: 0, LOCK: 0, RELEASE: 0, failed: 0, other: 0 };
  for (const t of txs) {
    if (!t.ok) c.failed!++;
    else if (t.kinds.length === 0) c.other!++;
    for (const k of t.kinds) c[k] = (c[k] ?? 0) + 1;
  }
  return c;
}

// ── Midnight ────────────────────────────────────────────────────────────────

export type LedgerView = {
  mintedLocks: Map<bigint, bigint>;
  withdrawals: Map<bigint, { solanaRecipient: string; amount: bigint }>;
  withdrawalNonce: bigint;
};

const providers = new Map<string, ReturnType<typeof indexerPublicDataProvider>>();

/** The bridge contract's ledger as the indexer serves it (no wallet needed). */
export async function readLedger(urls: BridgeMidnightUrls, contractAddress: string): Promise<LedgerView | null> {
  let pdp = providers.get(urls.indexer);
  if (!pdp) {
    pdp = indexerPublicDataProvider(urls.indexer, urls.indexerWS);
    providers.set(urls.indexer, pdp);
  }
  const st = await pdp.queryContractState(contractAddress);
  if (!st) return null;
  const L = bridgeLedger(st.data as never);
  const mintedLocks = new Map<bigint, bigint>();
  for (const [k, v] of L.mintedLocks) mintedLocks.set(k, v);
  const withdrawals = new Map<bigint, { solanaRecipient: string; amount: bigint }>();
  for (const [k, v] of L.withdrawals) withdrawals.set(k, { solanaRecipient: bytesToHex(v.solanaRecipient), amount: v.amount });
  return { mintedLocks, withdrawals, withdrawalNonce: L.withdrawalNonce };
}

/** The shielded balance of `colorHex` in a wallet's current state. */
export async function colorBalance(w: WalletResult, colorHex: string): Promise<bigint> {
  const s: any = await Rx.firstValueFrom((w.wallet as any).state());
  return BigInt(s.shielded?.balances?.[colorHex] ?? 0n);
}

/** Every shielded colour the wallet holds (hex → amount). */
export async function shieldedBalances(w: WalletResult): Promise<Record<string, bigint>> {
  const s: any = await Rx.firstValueFrom((w.wallet as any).state());
  const out: Record<string, bigint> = {};
  for (const [k, v] of Object.entries(s.shielded?.balances ?? {})) out[k] = BigInt(v as any);
  return out;
}

/** Waits until the wallet's balance of `colorHex` equals `want`. */
export async function waitColorBalance(
  w: WalletResult,
  colorHex: string,
  want: bigint,
  timeoutMs = 300_000,
): Promise<bigint> {
  const s: any = await Rx.firstValueFrom(
    (w.wallet as any).state().pipe(
      Rx.filter((st: any) => BigInt(st.shielded?.balances?.[colorHex] ?? 0n) === want),
      Rx.timeout({
        each: timeoutMs,
        with: () => Rx.throwError(() => new Error(`wallet balance of ${colorHex.slice(0, 12)}… never reached ${want}`)),
      }),
    ),
  );
  return BigInt(s.shielded.balances[colorHex]);
}

async function gql(indexer: string, query: string): Promise<any> {
  const res = await fetch(indexer, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = (await res.json()) as { data?: any; errors?: unknown };
  if (j.errors) throw new Error(`indexer query failed: ${JSON.stringify(j.errors).slice(0, 500)}`);
  return j.data;
}

export async function indexerTip(indexer: string): Promise<number> {
  const d = await gql(indexer, "query { block { height } }");
  return d.block.height as number;
}

export type ContractTx = { height: number; hash: string };

/**
 * Every transaction in blocks [from, to] with a contract action on
 * `contractAddress` (the deploy, every mint and every burn), oldest first.
 * Blocks are fetched 25 at a time through GraphQL aliases.
 */
export async function contractTransactions(
  indexer: string,
  contractAddress: string,
  from: number,
  to?: number,
): Promise<ContractTx[]> {
  const end = to ?? (await indexerTip(indexer));
  const want = contractAddress.toLowerCase();
  const out: ContractTx[] = [];
  for (let h = Math.max(0, from); h <= end; h += 25) {
    const heights = Array.from({ length: Math.min(25, end - h + 1) }, (_, i) => h + i);
    const q = `query { ${heights
      .map((n) => `b${n}: block(offset: { height: ${n} }) { height transactions { hash contractActions { address } } }`)
      .join(" ")} }`;
    const d = await gql(indexer, q);
    for (const n of heights) {
      const b = d[`b${n}`];
      for (const tx of b?.transactions ?? []) {
        if ((tx.contractActions ?? []).some((a: any) => String(a.address).toLowerCase() === want)) {
          out.push({ height: n, hash: tx.hash });
        }
      }
    }
  }
  return out;
}
