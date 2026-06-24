// Per-protocol sync state for the /api/health/sync endpoint.
//
// NTP current block is read from effectstream.effectstream_blocks (exact).
// Parallel chain positions come from effectstream.sync_protocol_pagination:
//   MIN(page_number) = last merged native block (preserved as cursor by the merger)
//   MAX(page_number) = latest prefetched native block (furthest ahead in buffer)
// Chain tips are fetched externally and cached for 60 s to limit outbound calls.

import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { CELESTIA_RPC_URL } from "./env.ts";

const NTP_START_TIME_MS = 1774400742000; // Midnight Preview block-1 genesis (2026-03-25T01:05:42 UTC)
const NTP_BLOCK_TIME_MS = 600_000;       // must match config.preview.ts blockTimeMS

interface CachedTip {
  value: number | null;
  fetchedAt: number;
}
const TIP_TTL_MS = 60_000;
const tipCache: Record<string, CachedTip> = {};

async function cachedFetch(key: string, fn: () => Promise<number | null>): Promise<number | null> {
  const hit = tipCache[key];
  if (hit && Date.now() - hit.fetchedAt < TIP_TTL_MS) return hit.value;
  let value: number | null = null;
  try { value = await fn(); } catch { /* leave null */ }
  tipCache[key] = { value, fetchedAt: Date.now() };
  return value;
}

async function fetchMidnightTip(): Promise<number | null> {
  return cachedFetch("midnight", async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    try {
      const res = await fetch(midnightNetworkConfig.indexer, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "query { block { height } }" }),
        signal: ac.signal,
      });
      const json = await res.json();
      const h = json?.data?.block?.height;
      return typeof h === "number" ? h : null;
    } finally {
      clearTimeout(t);
    }
  });
}

async function fetchCelestiaTip(): Promise<number | null> {
  return cachedFetch("celestia", async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    try {
      const res = await fetch(CELESTIA_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "header.NetworkHead", params: [], id: 1 }),
        signal: ac.signal,
      });
      const json = await res.json();
      const h = parseInt(json?.result?.header?.height, 10);
      return Number.isFinite(h) ? h : null;
    } finally {
      clearTimeout(t);
    }
  });
}

function pct(current: number, tip: number | null): number | null {
  if (tip == null || tip <= 0) return null;
  const p = Math.round((current / tip) * 1000) / 10;
  // Never show 100 when there are still blocks to process.
  return current < tip ? Math.min(p, 99.9) : p;
}

// "ok"      — within 2 NTP blocks (≤ 20 min behind), serving live data.
// "syncing" — catching up; historical data only until lag clears.
// "error"   — no blocks finalized yet (migrations pending or node crash).
function deriveStatus(ntpCurrent: number, lagSeconds: number): "ok" | "syncing" | "error" {
  if (ntpCurrent === 0) return "error";
  if (lagSeconds > NTP_BLOCK_TIME_MS * 2 / 1000) return "syncing"; // > 2 blocks (20 min)
  return "ok";
}

export async function getSyncStatus(dbConn: any) {
  const [ntpRow, pageRow, blockRow, nullifierRow, rootRow, unshieldedRow, lastOfferRow, midnightTip, celestiaTip] = await Promise.all([
    dbConn.query("SELECT MAX(block_height) AS current FROM effectstream.effectstream_blocks"),
    dbConn.query(`
      SELECT protocol_name,
             MIN(page_number) AS merged,
             MAX(page_number) AS fetched
      FROM effectstream.sync_protocol_pagination
      GROUP BY protocol_name
    `),
    dbConn.query(`
      SELECT block_height, ms_timestamp, effectstream_block_hash, main_chain_block_hash
      FROM effectstream.effectstream_blocks
      ORDER BY block_height DESC
      LIMIT 1
    `),
    dbConn.query("SELECT COUNT(*)::int AS total, MAX(height) AS latest_height FROM nullifiers"),
    dbConn.query("SELECT COUNT(*)::int AS total, MAX(height) AS latest_height FROM known_roots"),
    dbConn.query("SELECT COUNT(*)::int AS total, MAX(height) AS latest_height FROM created_unshielded"),
    dbConn.query(`
      SELECT id, celestia_height, created_at
      FROM offer_file
      ORDER BY id DESC
      LIMIT 1
    `),
    fetchMidnightTip(),
    fetchCelestiaTip(),
  ]);

  const ntpCurrent = Number(ntpRow.rows[0]?.current ?? 0);
  const ntpTip = Math.floor((Date.now() - NTP_START_TIME_MS) / NTP_BLOCK_TIME_MS);

  const pages: Record<string, { merged: number; fetched: number }> = {};
  for (const row of pageRow.rows) {
    pages[row.protocol_name] = { merged: Number(row.merged), fetched: Number(row.fetched) };
  }

  const mn = pages["parallelMidnight"];
  const ce = pages["parallelCelestia"];

  const lagSeconds = Math.max(0, (ntpTip - ntpCurrent) * NTP_BLOCK_TIME_MS / 1000);

  const toHex = (v: unknown) =>
    v != null ? Buffer.from(v as Buffer).toString("hex") : null;
  const latestBlock = blockRow.rows[0] ?? null;
  const lastOffer   = lastOfferRow.rows[0] ?? null;

  return {
    ts: Date.now(),
    now: new Date().toISOString(),
    status: deriveStatus(ntpCurrent, lagSeconds),
    block: latestBlock
      ? {
          height: latestBlock.block_height,
          timestamp: latestBlock.ms_timestamp,
          block_hash: toHex(latestBlock.effectstream_block_hash),
          main_chain_block_hash: toHex(latestBlock.main_chain_block_hash),
        }
      : null,
    ntp: {
      current: ntpCurrent,
      tip: ntpTip,
      pct: pct(ntpCurrent, ntpTip),
      lag_blocks: Math.max(0, ntpTip - ntpCurrent),
      lag_seconds: lagSeconds,
    },

    midnight: {
      current: mn?.merged ?? null,
      fetched: mn?.fetched ?? null,
      tip: midnightTip,
      lag_blocks: mn && midnightTip != null ? Math.max(0, midnightTip - mn.merged) : null,
      pct: mn ? pct(mn.merged, midnightTip) : null,
    },
    celestia: {
      current: ce?.merged ?? null,
      fetched: ce?.fetched ?? null,
      tip: celestiaTip,
      lag_blocks: ce && celestiaTip != null ? Math.max(0, celestiaTip - ce.merged) : null,
      pct: ce ? pct(ce.merged, celestiaTip) : null,
    },
    sets: {
      nullifiers: {
        total: nullifierRow.rows[0]?.total ?? 0,
        latest_height: nullifierRow.rows[0]?.latest_height ?? null,
      },
      known_roots: {
        total: rootRow.rows[0]?.total ?? 0,
        latest_height: rootRow.rows[0]?.latest_height ?? null,
      },
      unshielded_utxos: {
        total: unshieldedRow.rows[0]?.total ?? 0,
        latest_height: unshieldedRow.rows[0]?.latest_height ?? null,
      },
      last_zswap: lastOffer
        ? {
            id: lastOffer.id,
            celestia_height: lastOffer.celestia_height,
            created_at: lastOffer.created_at,
          }
        : null,
    },
  };
}
