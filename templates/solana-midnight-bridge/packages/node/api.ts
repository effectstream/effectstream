// Read-only HTTP API (Q4: only what the CLI and the tests need).
//
//   GET /transfers[?direction=s2m|m2s][&status=observed|submitted|completed][&limit=1..500]
//   GET /transfers/:id          id = "<direction>:<source_id>", e.g. "s2m:0" or "m2s:3"
//
// `status` is derived: "completed" (sync saw the counterpart on chain),
// "submitted" (the relayer has sent at least one attempt), else "observed".
// GET /health is the runtime's own (it reports sync liveness), so it is not
// registered again here (Fastify refuses duplicate routes).
import { runPreparedQuery } from "@effectstream/db";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import { getTransfer, listTransfers, type IListTransfersResult } from "@solana-midnight-bridge/database";

export type TransferView = {
  id: string;
  direction: "s2m" | "m2s";
  sourceId: string;
  amount: string;
  recipient: string | null;
  sender: string | null;
  status: "observed" | "submitted" | "completed";
  srcRef: string | null;
  dstRef: string | null;
  observedBlock: number;
  completedBlock: number | null;
  relayer: {
    attempts: number;
    submittedAt: string | null;
    lastAttemptAt: string | null;
    lastTx: string | null;
    lastError: string | null;
  } | null;
};

const DIRECTIONS = new Set(["s2m", "m2s"]);
const STATES = new Set(["observed", "submitted", "completed"]);

const iso = (d: Date | string | null | undefined) =>
  d == null ? null : d instanceof Date ? d.toISOString() : String(d);

export function toTransferView(r: IListTransfersResult): TransferView {
  return {
    id: `${r.direction}:${r.source_id}`,
    direction: r.direction as "s2m" | "m2s",
    sourceId: String(r.source_id),
    amount: String(r.amount),
    recipient: r.recipient ?? null,
    sender: r.sender ?? null,
    status: (r.state ?? r.status) as TransferView["status"],
    srcRef: r.src_ref ?? null,
    dstRef: r.dst_ref ?? null,
    observedBlock: r.observed_block,
    completedBlock: r.completed_block ?? null,
    relayer: r.attempts == null
      ? null
      : {
          attempts: r.attempts,
          submittedAt: iso(r.submitted_at),
          lastAttemptAt: iso(r.last_attempt_at),
          lastTx: r.last_tx ?? null,
          lastError: r.last_error ?? null,
        },
  };
}

/** Parses "<direction>:<source_id>"; null when malformed. */
export function parseTransferId(id: string): { direction: "s2m" | "m2s"; sourceId: string } | null {
  const m = /^(s2m|m2s):(0|[1-9][0-9]{0,19})$/.exec(id);
  if (!m) return null;
  if (BigInt(m[2]!) > 0xffff_ffff_ffff_ffffn) return null;
  return { direction: m[1] as "s2m" | "m2s", sourceId: m[2]! };
}

// The runtime's own Fastify/pg types (a template-local fastify copy would not match).
type ApiServer = Parameters<StartConfigApiRouter>[0];
type DbPool = Parameters<StartConfigApiRouter>[1];

/**
 * `runPreparedQuery(query.run(...))`, made safe for the node's start.
 *
 * The runtime serves this API before it applies the template's migrations (they
 * run with the first processed block), and `runPreparedQuery` gets a query that
 * has ALREADY started, then waits for the PGLite mutex. A query that fails
 * during that wait (`bridge_transfers` does not exist yet) had no handler, and
 * the runtime's unhandledRejection handler exits the process: a client polling
 * the API while the node started (the CLI, `bridge:status --watch`) killed the
 * node (PR-2 T6, F-T6.2). Observing the promise first stops that;
 * `runPreparedQuery` still rethrows the error to the route.
 */
async function runQuery<T>(query: Promise<T[]>, name: string): Promise<T[]> {
  query.catch(() => {});
  return runPreparedQuery(query, name);
}

/** Postgres 42P01 (undefined_table): the runtime has not applied the migrations yet. */
const isNotMigrated = (e: unknown): boolean => (e as { code?: unknown } | null)?.code === "42P01";
export const NOT_MIGRATED_ERROR = "the node is starting: its database tables are not created yet; retry";

export const apiRouter: StartConfigApiRouter = async function (
  server: ApiServer,
  dbConn: DbPool,
): Promise<void> {
  server.get<{ Querystring: { direction?: string; status?: string; limit?: string } }>(
    "/transfers",
    async (request, reply) => {
      const { direction, status } = request.query;
      if (direction !== undefined && !DIRECTIONS.has(direction)) {
        return reply.code(400).send({ error: "direction must be s2m or m2s" });
      }
      if (status !== undefined && !STATES.has(status)) {
        return reply.code(400).send({ error: "status must be observed, submitted or completed" });
      }
      const requested = Number(request.query.limit ?? "100");
      const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 500) : 100;
      let rows: IListTransfersResult[];
      try {
        rows = await runQuery(
          listTransfers.run({ direction: direction ?? null, state: status ?? null, limit }, dbConn),
          "/transfers",
        );
      } catch (e) {
        if (isNotMigrated(e)) return reply.code(503).send({ error: NOT_MIGRATED_ERROR });
        throw e;
      }
      return reply.send({ transfers: rows.map(toTransferView) });
    },
  );

  server.get<{ Params: { id: string } }>("/transfers/:id", async (request, reply) => {
    const parsed = parseTransferId(request.params.id);
    if (!parsed) {
      return reply.code(400).send({ error: 'id must be "s2m:<lock nonce>" or "m2s:<withdrawal id>"' });
    }
    let rows: unknown[];
    try {
      rows = await runQuery(
        getTransfer.run({ direction: parsed.direction, source_id: parsed.sourceId }, dbConn),
        "/transfers/:id",
      );
    } catch (e) {
      if (isNotMigrated(e)) return reply.code(503).send({ error: NOT_MIGRATED_ERROR });
      throw e;
    }
    if (rows.length === 0) return reply.code(404).send({ error: "transfer not found", id: request.params.id });
    return reply.send({ transfer: toTransferView(rows[0] as IListTransfersResult) });
  });
};

