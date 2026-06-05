// Off-chain NFT mint dispatcher.
//
// Drains `nft_mints` (enqueued by the `mint-nfts` admin command) by submitting one
// job per NFT to the batcher's /send-input endpoint. The batcher holds funds, signs,
// and submits the actual mint, returning a tx hash; we record the minted token in
// `minted_nfts` and mark the job. The dispatcher itself holds NO keys.
//
// Runs as an effection task spawned from main.dev.ts BEFORE start() (start() enters an
// infinite block loop and never returns). DB access is wrapped in the runtime's global
// mutex (PGLite-safe; no-op on real Postgres) and never held across the network call.

import { sleep, call, type Operation } from "effection";
import { createPublicClient, http, decodeEventLog, type Hex } from "viem";
import { hardhat } from "viem/chains";
import { getConnection, acquireDBMutex, releaseDBMutex } from "@effectstream/db";
import type { Pool } from "pg";

const BATCHER_URL = process.env.BATCHER_URL ?? "http://localhost:3334";
const EVM_RPC = process.env.EVM_RPC ?? "http://localhost:8545";
const POLL_MS = 3000;
const MUTEX = "nft-dispatch";

const mintedEventAbi = [
  {
    type: "event",
    name: "Minted",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "minter", type: "address", indexed: true },
      { name: "userTokenId", type: "uint256", indexed: true },
    ],
  },
] as const;

let pub: ReturnType<typeof createPublicClient> | null = null;
function getPub() {
  if (!pub) pub = createPublicClient({ chain: hardhat, transport: http(EVM_RPC) });
  return pub;
}

type NftMint = {
  campaign_id: string;
  chain: string;
  wallet: string;
  item_id: number;
  quantity: number;
};

function* dbOp<T>(fn: () => Promise<T>): Operation<T> {
  yield* acquireDBMutex(MUTEX);
  try {
    return yield* call(fn);
  } finally {
    releaseDBMutex(MUTEX);
  }
}

// Submit one job to the batcher and block until it returns the tx hash.
async function submitJob(
  target: string,
  address: string,
  input: unknown,
  timeoutMs: number,
): Promise<string> {
  const body = {
    data: {
      address,
      addressType: 1, // informational; the adapters here don't verify per-user signatures
      input: JSON.stringify(input),
      timestamp: String(Date.now()),
      target,
    },
    confirmationLevel: "wait-receipt",
    timeoutMs,
  };
  const res = await fetch(`${BATCHER_URL}/send-input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`batcher ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { transactionHash?: string };
  if (!j.transactionHash) throw new Error(`batcher returned no tx hash: ${JSON.stringify(j)}`);
  return j.transactionHash;
}

async function tokenIdFromReceipt(txHash: string): Promise<string> {
  const receipt = await getPub().getTransactionReceipt({ hash: txHash as Hex });
  for (const lg of receipt.logs) {
    try {
      const d = decodeEventLog({ abi: mintedEventAbi, data: lg.data, topics: lg.topics });
      if (d.eventName === "Minted") return String((d.args as { tokenId: bigint }).tokenId);
    } catch { /* not the Minted event */ }
  }
  return "";
}

function* setStatus(
  pool: Pool,
  job: NftMint,
  status: string,
  txHash: string | null,
  error: string | null,
): Operation<void> {
  yield* dbOp(() =>
    pool.query(
      `UPDATE nft_mints SET status = $5, tx_hash = $6, error = $7
       WHERE campaign_id = $1 AND chain = $2 AND wallet = $3 AND item_id = $4`,
      [job.campaign_id, job.chain, job.wallet, job.item_id, status, txHash, error],
    ),
  );
}

function* processEvmJob(pool: Pool, job: NftMint): Operation<void> {
  // Claim the row so a slow mint isn't re-picked next tick.
  yield* setStatus(pool, job, "submitted", null, null);

  let lastTx = "";
  for (let i = 0; i < job.quantity; i++) {
    const txHash = yield* call(() => submitJob("evmNft", job.wallet, { method: "mint", args: [job.wallet] }, 60_000));
    lastTx = txHash;
    const tokenId = (yield* call(() => tokenIdFromReceipt(txHash))) || `${txHash}-${i}`;
    yield* dbOp(() =>
      pool.query(
        `INSERT INTO minted_nfts (campaign_id, chain, wallet, item_id, token_id, policy_id, tx_hash)
         VALUES ($1, 'evm', $2, $3, $4, NULL, $5)
         ON CONFLICT (campaign_id, chain, token_id) DO NOTHING`,
        [job.campaign_id, job.wallet, job.item_id, tokenId, txHash],
      ),
    );
    console.log(`[nft-dispatch] EVM minted token=${tokenId} item=${job.item_id} -> ${job.wallet}`);
  }
  yield* setStatus(pool, job, "minted", lastTx, null);
}

function* processCardanoJob(pool: Pool, job: NftMint): Operation<void> {
  yield* setStatus(pool, job, "submitted", null, null);

  let lastTx = "";
  for (let i = 0; i < job.quantity; i++) {
    // Asset name must be <= 32 bytes + unique per (item, unit, buyer). token_id = its hex.
    const assetName = `IT${job.item_id}N${i}-${job.wallet.slice(-16)}`;
    const tokenId = Buffer.from(assetName, "utf-8").toString("hex");
    // First Cardano mint funds a fresh server wallet via the faucet — allow extra time.
    const txHash = yield* call(() => submitJob("cardanoNft", job.wallet, { to: job.wallet, assetName }, 120_000));
    lastTx = txHash;
    yield* dbOp(() =>
      pool.query(
        `INSERT INTO minted_nfts (campaign_id, chain, wallet, item_id, token_id, policy_id, tx_hash)
         VALUES ($1, 'cardano', $2, $3, $4, NULL, $5)
         ON CONFLICT (campaign_id, chain, token_id) DO NOTHING`,
        [job.campaign_id, job.wallet, job.item_id, tokenId, txHash],
      ),
    );
    console.log(`[nft-dispatch] Cardano minted ${assetName} item=${job.item_id} -> ${job.wallet}`);
  }
  yield* setStatus(pool, job, "minted", lastTx, null);
}

function* tick(pool: Pool): Operation<void> {
  let rows: NftMint[];
  try {
    const r = yield* dbOp(() =>
      pool.query<NftMint>(
        // EVM first ('evm' > 'cardano' under DESC): EVM mints are fast, whereas the first
        // Cardano mint blocks on a faucet top-up — don't let it stall the EVM jobs.
        `SELECT campaign_id, chain, wallet, item_id, quantity FROM nft_mints WHERE status = 'pending' ORDER BY chain DESC, item_id`,
      ),
    );
    rows = r.rows;
  } catch (err) {
    // nft_mints doesn't exist until migrations apply — stay quiet about that.
    const m = err instanceof Error ? err.message : String(err);
    if (!m.includes("does not exist")) console.error("[nft-dispatch] poll error:", m);
    return;
  }
  for (const job of rows) {
    try {
      if (job.chain === "cardano") {
        yield* processCardanoJob(pool, job);
      } else {
        yield* processEvmJob(pool, job);
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[nft-dispatch] job failed (${job.wallet} item ${job.item_id}):`, m);
      try {
        yield* setStatus(pool, job, "failed", null, m.slice(0, 500));
      } catch { /* best effort */ }
    }
  }
}

/// Effection task: poll loop. Spawn from main.dev.ts (before `start()`).
export function* startNftDispatch(): Operation<void> {
  const pool = getConnection();
  console.log("[nft-dispatch] started (polling nft_mints)");
  while (true) {
    yield* sleep(POLL_MS);
    yield* tick(pool);
  }
}
