import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const HOST = "127.0.0.1";
const PORT = Number(Bun.env.DASHBOARD_PORT ?? 4173);
const DATABASE_URL = Bun.env.DATABASE_URL;
const CKB_RPC_URL = Bun.env.DASHBOARD_CKB_RPC_URL ?? "http://127.0.0.1:8114";
const EVM_RPC_URL = Bun.env.DASHBOARD_EVM_RPC_URL ?? "http://127.0.0.1:8545";
const CKB_PROTOCOL = Bun.env.DASHBOARD_CKB_PROTOCOL ?? "ckbRelayEvents";
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, max: 3, connectionTimeoutMillis: 1500 }) : null;

export function loopback(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase()) || url.username || url.password || url.search || url.hash) {
    throw new Error("Dashboard RPC endpoints must be unauthenticated loopback HTTP URLs.");
  }
  return url;
}
loopback(CKB_RPC_URL); loopback(EVM_RPC_URL);

async function rpc(url: string, method: string, params: unknown[] = []): Promise<any> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(1800) });
  const body = await response.json() as any;
  if (!response.ok || body.error) throw new Error(body.error?.message ?? `RPC HTTP ${response.status}`);
  return body.result;
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Unavailable"; }
function json(data: unknown, status = 200): Response { return Response.json(data, { status, headers: { "cache-control": "no-store" } }); }
export function validEventId(value: string): boolean { return /^ckb-cell-created:[0-9a-f]{64}$/.test(value); }
export function parsePagination(url: URL): { page: number; pageSize: number; query: string } | null {
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (!Number.isInteger(page) || page < 1 || page > 100000 ||
    !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || query.length > 160) return null;
  return { page, pageSize, query };
}
function safeEvent(row: any) {
  return { ...row, destination_rpc_url: undefined, destination_contract: undefined, source_event: row.source_event };
}
const SELECT = `event_id, destination_chain_id::text, source_event, status, attempts,
  next_attempt_at, lease_until, transaction_hash, payload_hash, receipt_status,
  receipt_block_number::text, last_error, created_at, processed_at, submitted_at,
  confirmed_at, updated_at`;

async function status() {
  const checks = await Promise.allSettled([
    rpc(CKB_RPC_URL, "get_tip_header"), rpc(CKB_RPC_URL, "get_block_by_number", ["0x0"]),
    rpc(EVM_RPC_URL, "eth_chainId"), pool?.query(`SELECT status, count(*)::int AS count, max(updated_at) AS last_update FROM effectstream.ckb_evm_relay_outbox GROUP BY status`),
    pool?.query(`SELECT page_number, page FROM effectstream.sync_protocol_pagination WHERE protocol_name = $1 ORDER BY page_number DESC LIMIT 1`, [CKB_PROTOCOL]),
  ]);
  const get = (index: number) => checks[index]?.status === "fulfilled" ? (checks[index] as PromiseFulfilledResult<any>).value : null;
  const failure = (index: number) => checks[index]?.status === "rejected" ? errorMessage((checks[index] as PromiseRejectedResult).reason) : null;
  const tip = get(0); const genesis = get(1); const rows = get(3)?.rows ?? [];
  const cursorRow = get(4)?.rows?.[0];
  const cursorPage = cursorRow?.page;
  const ownPage = cursorPage?.own ?? cursorPage;
  const ckbStatus = tip ? (genesis ? "connected" : "degraded") : "unavailable";
  return {
    generatedAt: new Date().toISOString(),
    source: { status: ckbStatus, rpc: "loopback CKB RPC", tipHeight: tip?.number ? Number(BigInt(tip.number)) : null, tipHash: tip?.hash ?? null, genesisHash: genesis?.header?.hash ?? null, error: !tip ? "Unable to reach the configured local CKB RPC." : !genesis ? "The CKB genesis block could not be read." : null },
    cursor: { protocol: CKB_PROTOCOL, persistedPageNumber: cursorRow?.page_number ?? null, height: ownPage?.height ?? null, available: cursorPage != null },
    destination: { status: get(2) === "0x7a69" ? "connected" : get(2) ? "wrong-chain" : "unavailable", chainId: get(2) ? Number(BigInt(get(2))) : null, expectedChainId: 31337, error: get(2) === "0x7a69" ? null : get(2) ? "Connected EVM reports a chain ID other than 31337." : "Unable to reach the configured local EVM RPC." },
    database: { status: !pool || failure(3) ? "unavailable" : "connected", error: !pool ? "DATABASE_URL is not configured." : failure(3) ? "The EffectStream database is unavailable or its schema is not initialized." : null },
    worker: { status: !pool || failure(3) ? "unknown" : rows.some((row: any) => row.status === "submitting" && row.count > 0) ? "activity-observed" : "liveness-unavailable", counts: rows, lastObservedUpdate: rows.reduce((latest: string | null, row: any) => !latest || row.last_update > latest ? row.last_update : latest, null) },
    runtimeHealth: { status: "unavailable", reason: "EffectStream health is process-local and no safe dashboard endpoint is configured." },
  };
}

async function events(url: URL) {
  const pagination = parsePagination(url);
  if (!pagination) return json({ error: "invalid_query", message: "page must be >= 1, pageSize 1–100, and q at most 160 characters." }, 400);
  if (!pool) return json({ error: "database_unavailable", message: "DATABASE_URL is required for persisted event data." }, 503);
  const { page, pageSize, query } = pagination;
  const result = await pool.query(`SELECT ${SELECT}, count(*) OVER()::int AS total FROM effectstream.ckb_evm_relay_outbox WHERE ($1 = '' OR event_id ILIKE '%' || $1 || '%' OR source_event->>'eventId' ILIKE '%' || $1 || '%' OR transaction_hash ILIKE '%' || $1 || '%') ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [query, pageSize, (page - 1) * pageSize]);
  return json({ items: result.rows.map(safeEvent), page, pageSize, total: result.rows[0]?.total ?? 0 });
}

async function eventDetail(eventId: string) {
  if (!validEventId(eventId)) return json({ error: "invalid_event_id" }, 400);
  if (!pool) return json({ error: "database_unavailable" }, 503);
  const result = await pool.query(`SELECT ${SELECT}, destination_contract FROM effectstream.ckb_evm_relay_outbox WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1`, [eventId]);
  if (!result.rowCount) return json({ error: "not_found", eventId }, 404);
  const row = result.rows[0];
  return json({ event: safeEvent(row), execution: executionFor(row) });
}

function executionFor(row: any) {
  const status = row.status;
  const stages = [
    { name: "Observed", state: "recorded", at: row.source_event?.observation?.observedAt ?? row.processed_at, evidence: row.source_event?.eventId },
    { name: "Processed", state: "recorded", at: row.processed_at, evidence: "EffectStream persisted relay intent" },
    { name: "Outbox", state: "recorded", at: row.created_at, evidence: `attempt ${row.attempts}` },
    { name: "Submitted", state: row.transaction_hash ? "recorded" : status === "failed" ? "failed" : "waiting", at: row.submitted_at, evidence: row.transaction_hash },
    { name: "Receipt", state: row.receipt_status === "success" ? "success" : row.receipt_status === "reverted" ? "failed" : "waiting", at: row.updated_at, evidence: row.receipt_status },
    { name: "Confirmation", state: status === "confirmed" ? "confirmed" : status === "failed" ? "failed" : "waiting", at: row.confirmed_at, evidence: row.receipt_block_number },
  ];
  return { outbox: { status, attempts: row.attempts, leaseUntil: row.lease_until, nextAttemptAt: row.next_attempt_at, lastError: row.last_error }, destination: { chainId: Number(row.destination_chain_id), contract: row.destination_contract, transactionHash: row.transaction_hash, receiptStatus: row.receipt_status, receiptBlockNumber: row.receipt_block_number, payloadHash: row.payload_hash }, stages };
}

export const handler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url); const path = url.pathname;
  try {
    if (request.method === "GET" && path === "/api/v1/status") return json(await status());
    if (request.method === "GET" && path === "/api/v1/events") return await events(url);
    const detail = path.match(/^\/api\/v1\/events\/([^/]+)$/);
    if (request.method === "GET" && detail) return await eventDetail(decodeURIComponent(detail[1]!));
    const execution = path.match(/^\/api\/v1\/executions\/([^/]+)$/);
    if (request.method === "GET" && execution) {
      const result = await eventDetail(decodeURIComponent(execution[1]!));
      if (result.status !== 200) return result;
      const data = await result.json() as any; return json(data.execution);
    }
    if (path.startsWith("/api/")) return json({ error: "not_found" }, 404);
    return new Response(await readFile(join(import.meta.dir, "../public/index.html")), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch { return json({ error: "data_unavailable", message: "The requested live service or persisted data is unavailable." }, 503); }
};

if (import.meta.main) {
  Bun.serve({ hostname: HOST, port: PORT, fetch: handler, error(error) { return json({ error: "internal_error", message: errorMessage(error) }, 500); } });
  console.log(`CKB relay dashboard listening at http://${HOST}:${PORT}`);
}
