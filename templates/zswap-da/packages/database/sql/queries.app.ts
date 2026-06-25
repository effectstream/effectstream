// Typed query wrappers for queries defined in queries.sql.
// These use dbConn.query() directly and mirror the PreparedQuery.run() interface
// so call sites are identical. Run `bun run pgtyped:update` when a live DB is
// available to regenerate queries.queries.ts with proper PreparedQuery objects,
// then move these exports there and delete this file.

import type { DateOrString, NumberOrString } from "./queries.queries.ts";

// Convert :param! style SQL to $N positional params and execute.
// Repeated occurrences of the same param reuse the same $N index.
async function runQ<P extends object, R>(
  sql: string,
  params: P,
  dbConn: any,
): Promise<R[]> {
  const seen = new Map<string, number>();
  let n = 0;
  const pgSql = sql.replace(/:(\w+)!/g, (_: string, name: string) => {
    if (!seen.has(name)) seen.set(name, ++n);
    return `$${seen.get(name)}`;
  });
  const values = [...seen.keys()].map((k) => (params as any)[k]);
  return (await dbConn.query(pgSql, values)).rows as R[];
}

async function runNoParams<R>(sql: string, dbConn: any): Promise<R[]> {
  return (await dbConn.query(sql)).rows as R[];
}

// ── Sync health — effectstream framework schema ────────────────────────────

export interface IGetNtpCurrentBlockResult {
  current: NumberOrString | null;
}
export const getNtpCurrentBlock = {
  run: (_: void, dbConn: any) =>
    runNoParams<IGetNtpCurrentBlockResult>(
      "SELECT MAX(block_height) AS current FROM effectstream.effectstream_blocks",
      dbConn,
    ),
};

export interface IGetSyncProtocolPaginationResult {
  protocol_name: string;
  merged: NumberOrString | null;
  fetched: NumberOrString | null;
}
export const getSyncProtocolPagination = {
  run: (_: void, dbConn: any) =>
    runNoParams<IGetSyncProtocolPaginationResult>(
      `SELECT protocol_name,
              MIN(page_number) AS merged,
              MAX(page_number) AS fetched
       FROM effectstream.sync_protocol_pagination
       GROUP BY protocol_name`,
      dbConn,
    ),
};

export interface IGetLatestEffectstreamBlockResult {
  block_height: NumberOrString;
  ms_timestamp: NumberOrString | null;
  effectstream_block_hash: Buffer | null;
  main_chain_block_hash: Buffer | null;
}
export const getLatestEffectstreamBlock = {
  run: (_: void, dbConn: any) =>
    runNoParams<IGetLatestEffectstreamBlockResult>(
      `SELECT block_height, ms_timestamp, effectstream_block_hash, main_chain_block_hash
       FROM effectstream.effectstream_blocks
       ORDER BY block_height DESC
       LIMIT 1`,
      dbConn,
    ),
};

export interface IGetNullifierStatsResult {
  total: number;
  latest_height: NumberOrString | null;
}
export const getNullifierStats = {
  run: (_: void, dbConn: any) =>
    runNoParams<IGetNullifierStatsResult>(
      "SELECT COUNT(*)::int AS total, MAX(height) AS latest_height FROM nullifiers",
      dbConn,
    ),
};

export interface IGetKnownRootStatsResult {
  total: number;
  latest_height: NumberOrString | null;
}
export const getKnownRootStats = {
  run: (_: void, dbConn: any) =>
    runNoParams<IGetKnownRootStatsResult>(
      "SELECT COUNT(*)::int AS total, MAX(height) AS latest_height FROM known_roots",
      dbConn,
    ),
};

export interface IGetUnshieldedStatsResult {
  total: number;
  latest_height: NumberOrString | null;
}
export const getUnshieldedStats = {
  run: (_: void, dbConn: any) =>
    runNoParams<IGetUnshieldedStatsResult>(
      "SELECT COUNT(*)::int AS total, MAX(height) AS latest_height FROM created_unshielded",
      dbConn,
    ),
};

export interface IGetLastOfferResult {
  id: number;
  celestia_height: NumberOrString;
  created_at: DateOrString | null;
}
export const getLastOffer = {
  run: (_: void, dbConn: any) =>
    runNoParams<IGetLastOfferResult>(
      `SELECT id, celestia_height, created_at
       FROM offer_file
       ORDER BY id DESC
       LIMIT 1`,
      dbConn,
    ),
};

// ── Trade history ──────────────────────────────────────────────────────────

export interface IGetTradeHistoryParams {
  base: string;
  quote: string;
}
export interface IGetTradeHistoryResult {
  at_ms: string;
  g_color: string;
  g_amt: string;
  w_color: string;
  w_amt: string;
}
export const getTradeHistory = {
  run: (params: IGetTradeHistoryParams, dbConn: any) =>
    runQ<IGetTradeHistoryParams, IGetTradeHistoryResult>(
      `SELECT (EXTRACT(EPOCH FROM h.archived_at) * 1000)::bigint AS at_ms,
              g.token_color AS g_color, g.amount AS g_amt,
              w.token_color AS w_color, w.amount AS w_amt
       FROM offer_file_history h
       JOIN offer_file_tokens_history g ON g.offer_file_id = h.id AND g.direction = 'GIVING'
       JOIN offer_file_tokens_history w ON w.offer_file_id = h.id AND w.direction = 'WANTING'
       WHERE h.archive_reason = 'CONSUMED'
         AND ((g.token_color = :base! AND w.token_color = :quote!)
           OR (g.token_color = :quote! AND w.token_color = :base!))
       ORDER BY h.archived_at DESC
       LIMIT 120`,
      params,
      dbConn,
    ),
};

export interface IGetOpenLegsParams {
  base: string;
  quote: string;
}
export interface IGetOpenLegsResult {
  g_color: string;
  g_amt: string;
  w_color: string;
  w_amt: string;
}
export const getOpenLegs = {
  run: (params: IGetOpenLegsParams, dbConn: any) =>
    runQ<IGetOpenLegsParams, IGetOpenLegsResult>(
      `SELECT g.token_color AS g_color, g.amount AS g_amt,
              w.token_color AS w_color, w.amount AS w_amt
       FROM offer_file o
       JOIN offer_file_tokens g ON g.offer_file_id = o.id AND g.direction = 'GIVING'
       JOIN offer_file_tokens w ON w.offer_file_id = o.id AND w.direction = 'WANTING'
       WHERE ((g.token_color = :base! AND w.token_color = :quote!)
           OR (g.token_color = :quote! AND w.token_color = :base!))`,
      params,
      dbConn,
    ),
};

// ── Token prices ───────────────────────────────────────────────────────────

export interface IGetTokenPriceParams { token_color: string }
export interface IGetTokenPriceResult { price_usd: string }
export const getTokenPrice = {
  run: (params: IGetTokenPriceParams, dbConn: any) =>
    runQ<IGetTokenPriceParams, IGetTokenPriceResult>(
      "SELECT price_usd FROM token_prices WHERE token_color = :token_color!",
      params,
      dbConn,
    ),
};

export interface IUpsertTokenPriceParams { token_color: string; price_usd: number }
export type IUpsertTokenPriceResult = void;
export const upsertTokenPrice = {
  run: (params: IUpsertTokenPriceParams, dbConn: any) =>
    runQ<IUpsertTokenPriceParams, IUpsertTokenPriceResult>(
      `INSERT INTO token_prices (token_color, price_usd)
       VALUES (:token_color!, :price_usd!)
       ON CONFLICT (token_color) DO NOTHING`,
      params,
      dbConn,
    ),
};

// ── Known tokens (duplicate-check queries) ─────────────────────────────────

export interface ICheckTokenNameExistsParams { name: string }
export interface ICheckTokenNameExistsResult { present: number }
export const checkTokenNameExists = {
  run: (params: ICheckTokenNameExistsParams, dbConn: any) =>
    runQ<ICheckTokenNameExistsParams, ICheckTokenNameExistsResult>(
      "SELECT 1 AS present FROM known_tokens WHERE name = :name! LIMIT 1",
      params,
      dbConn,
    ),
};

export interface IGetTokenByColorParams { token_color: string }
export interface IGetTokenByColorResult { name: string }
export const getTokenByColor = {
  run: (params: IGetTokenByColorParams, dbConn: any) =>
    runQ<IGetTokenByColorParams, IGetTokenByColorResult>(
      "SELECT name FROM known_tokens WHERE token_color = :token_color! LIMIT 1",
      params,
      dbConn,
    ),
};

// ── Pair stats ─────────────────────────────────────────────────────────────

export interface IUpsertPairStatsByOfferIdParams { offer_id: number }
export type IUpsertPairStatsByOfferIdResult = void;
export const upsertPairStatsByOfferId = {
  run: (params: IUpsertPairStatsByOfferIdParams, dbConn: any) =>
    runQ<IUpsertPairStatsByOfferIdParams, IUpsertPairStatsByOfferIdResult>(
      `INSERT INTO pair_stats (pair_key, base_color, quote_color, trade_count, last_price, last_traded_at)
       SELECT
           LEAST(g.token_color, w.token_color) || '|' || GREATEST(g.token_color, w.token_color),
           LEAST(g.token_color, w.token_color),
           GREATEST(g.token_color, w.token_color),
           1,
           w.amount::numeric / NULLIF(g.amount::numeric, 0),
           NOW()
       FROM offer_file_tokens_history g
       JOIN offer_file_tokens_history w ON w.offer_file_id = g.offer_file_id AND w.direction = 'WANTING'
       WHERE g.direction = 'GIVING' AND g.offer_file_id = :offer_id!
       ON CONFLICT (pair_key) DO UPDATE SET
           trade_count    = pair_stats.trade_count + 1,
           last_price     = EXCLUDED.last_price,
           last_traded_at = EXCLUDED.last_traded_at`,
      params,
      dbConn,
    ),
};

export interface IGetPairsResult {
  pair_key: string;
  base_color: string;
  quote_color: string;
  trade_count: number;
  last_price: string | null;
  last_traded_at: DateOrString | null;
  open_count: number;
}
export const getPairs = {
  run: (_: void, dbConn: any) =>
    runNoParams<IGetPairsResult>(
      `SELECT
           COALESCE(ps.pair_key, live.pair_key) AS pair_key,
           COALESCE(ps.base_color, split_part(live.pair_key, '|', 1)) AS base_color,
           COALESCE(ps.quote_color, split_part(live.pair_key, '|', 2)) AS quote_color,
           COALESCE(ps.trade_count, 0) AS trade_count,
           ps.last_price,
           ps.last_traded_at,
           COALESCE(live.open_count, 0) AS open_count
       FROM pair_stats ps
       FULL OUTER JOIN (
           SELECT
               LEAST(g.token_color, w.token_color) || '|' || GREATEST(g.token_color, w.token_color) AS pair_key,
               COUNT(*)::int AS open_count
           FROM offer_file_tokens g
           JOIN offer_file_tokens w ON w.offer_file_id = g.offer_file_id AND w.direction = 'WANTING'
           WHERE g.direction = 'GIVING'
           GROUP BY 1
       ) live ON live.pair_key = ps.pair_key
       ORDER BY open_count DESC, last_traded_at DESC NULLS LAST`,
      dbConn,
    ),
};

// ── ZSwap status (My Trades reconciliation) ────────────────────────────────

export interface IGetZswapStatusByBlobParams { blob: string }
export interface IGetZswapStatusByBlobResult {
  transaction_hex: string;
  status: string;
  archive_reason: string | null;
}
export const getZswapStatusByBlob = {
  run: (params: IGetZswapStatusByBlobParams, dbConn: any) =>
    runQ<IGetZswapStatusByBlobParams, IGetZswapStatusByBlobResult>(
      `SELECT transaction_hex, 'open' AS status, NULL::text AS archive_reason
       FROM offer_file
       WHERE transaction_hex = :blob!
       UNION ALL
       SELECT transaction_hex,
           CASE archive_reason WHEN 'CONSUMED' THEN 'completed' ELSE 'expired' END AS status,
           archive_reason
       FROM offer_file_history
       WHERE transaction_hex = :blob!`,
      params,
      dbConn,
    ),
};
