// Read-only HTTP API (Q4: only what the CLI and the tests need).
//
//   GET /transfers[?direction=s2m|m2s][&status=observed|submitted|completed|undeliverable]
//                 [&recipientKind=wallet|contract|solana][&limit=1..500]
//   GET /transfers/:id          id = "<direction>:<source_id>", e.g. "s2m:0" or "m2s:3"
//   GET /recipients/contract/:address   (00058) can this node deliver to that contract?
//   GET /deployment                     (00058) this deployment's record, once verified
//
// `status` is derived, in this precedence (00058 I-3 (a)): "completed" (sync saw
// the counterpart on chain), "undeliverable" (the delivery router refused a
// contract recipient before any signature), "submitted" (the relayer has sent
// at least one attempt), else "observed". The transfer view is version 2: the
// 00050 fields keep their meaning; recipientKind, reason and delivery are new.
// GET /health is the runtime's own (it reports sync liveness), so it is not
// registered again here (Fastify refuses duplicate routes).
import { runPreparedQuery } from "@effectstream/db";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import { getTransfer, listTransfers, type IListTransfersResult } from "@solana-midnight-bridge/database";
import type { DeploymentRecordV1 } from "./record.ts";

/** Why a contract recipient is undeliverable (plan 00058 Interfaces I-3 (a)). */
export type UndeliverableCode =
  | "no-adapter"
  | "not-a-contract"
  | "not-a-passport-account"
  | "authority-live"
  | "bad-enc-key"
  | "wrong-network"
  | "counters";
export const UNDELIVERABLE_CODES: ReadonlySet<UndeliverableCode> = new Set([
  "no-adapter", "not-a-contract", "not-a-passport-account", "authority-live", "bad-enc-key", "wrong-network", "counters",
]);

export type TransferView = {
  id: string;
  direction: "s2m" | "m2s";
  sourceId: string;
  amount: string;
  /**
   * s2m Lock → wallet, s2m LockToContract → contract, m2s → solana. Null only for an s2m
   * transfer that sync has seen on Midnight but whose Solana lock it has not observed yet
   * (a transient state of a re-sync; 00058 questions Q6).
   */
  recipientKind: "wallet" | "contract" | "solana" | null;
  recipient: string | null;
  sender: string | null;
  status: "observed" | "submitted" | "completed" | "undeliverable";
  /** Only when status is undeliverable. */
  reason: { code: UndeliverableCode; message: string; at: string } | null;
  /** s2m contract only, once an adapter attempted delivery. */
  delivery: {
    adapter: string;
    account: string;
    coin: { nonce: string; colour: string; value: string } | null;
    tx: string | null;
  } | null;
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
const STATES = new Set(["observed", "submitted", "completed", "undeliverable"]);
const RECIPIENT_KINDS = new Set(["wallet", "contract", "solana"]);

const iso = (d: Date | string | null | undefined) =>
  d == null ? null : d instanceof Date ? d.toISOString() : String(d);

type DeliveryJson = { adapter?: unknown; account?: unknown; coin?: unknown; tx?: unknown } | null;
function toDelivery(d: unknown): TransferView["delivery"] {
  const v = (typeof d === "string" ? JSON.parse(d) : d) as DeliveryJson;
  if (!v || typeof v !== "object" || typeof v.adapter !== "string" || typeof v.account !== "string") return null;
  const c = v.coin as { nonce?: unknown; colour?: unknown; value?: unknown } | null | undefined;
  return {
    adapter: v.adapter,
    account: v.account,
    coin: c && typeof c.nonce === "string" && typeof c.colour === "string" && c.value !== undefined && c.value !== null
      ? { nonce: c.nonce, colour: c.colour, value: String(c.value) }
      : null,
    tx: typeof v.tx === "string" ? v.tx : null,
  };
}

export function toTransferView(r: IListTransfersResult): TransferView {
  const status = (r.state ?? r.status) as TransferView["status"];
  const kind = (r.recipient_kind ?? null) as TransferView["recipientKind"];
  return {
    id: `${r.direction}:${r.source_id}`,
    direction: r.direction as "s2m" | "m2s",
    sourceId: String(r.source_id),
    amount: String(r.amount),
    recipientKind: kind,
    recipient: r.recipient ?? null,
    sender: r.sender ?? null,
    status,
    reason: status === "undeliverable" && r.undeliverable_code
      ? { code: r.undeliverable_code as UndeliverableCode, message: r.undeliverable_reason ?? "", at: iso(r.undeliverable_at) ?? "" }
      : null,
    delivery: r.direction === "s2m" && kind === "contract" ? toDelivery(r.delivery) : null,
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

/** A recognition verdict without the fields the API adds (address, checkedAt). */
export type Recognised = {
  verdict: "deliverable" | "undeliverable" | "retry";
  adapter: string | null;
  code: UndeliverableCode | null;
  message: string | null;
};
/** The relayer's delivery router `recognise` (00058 D-1): read-only, it never signs. */
export type RecipientRecogniser = (address: string) => Promise<Recognised>;
/** `GET /recipients/contract/:address`'s answer (00058 I-3 (b)). */
export type RecipientVerdict = Recognised & { address: string; checkedAt: string };

export type ApiOptions = {
  /** Injected by the relayer (00058 P4); without it /recipients answers 503. */
  recognise?: () => RecipientRecogniser | null;
  /** The deployment record once verified at start; null (503) until then. */
  deploymentRecord?: () => DeploymentRecordV1 | null;
  /** Cache time of a /recipients verdict per address (at most 30 s; I-3 (b)). */
  recipientCacheMs?: number;
  now?: () => number;
};

/** A 64-hex contract address (0x optional) → lowercase, or null. */
export function parseContractAddress(text: string): string | null {
  const h = text.replace(/^0x/i, "");
  return /^[0-9a-fA-F]{64}$/.test(h) ? h.toLowerCase() : null;
}

/** The API, with the 00058 routes wired to what the node provides. */
export function createApiRouter(opts: ApiOptions = {}): StartConfigApiRouter {
  const cacheMs = Math.min(opts.recipientCacheMs ?? 30_000, 30_000);
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; v: RecipientVerdict }>();
  return async function (server: ApiServer, dbConn: DbPool): Promise<void> {
    await registerTransferRoutes(server, dbConn);

    server.get<{ Params: { address: string } }>("/recipients/contract/:address", async (request, reply) => {
      const address = parseContractAddress(request.params.address);
      if (!address) return reply.code(400).send({ error: "address must be a 64-hex Midnight contract address (0x optional)" });
      const recognise = opts.recognise?.() ?? null;
      if (!recognise) {
        return reply.code(503).send({ error: "this node's relayer, and so its delivery router, is disabled: it cannot check contract recipients" });
      }
      const hit = cache.get(address);
      if (hit && now() - hit.at < cacheMs) return reply.send(hit.v);
      const r = await recognise(address);
      const v: RecipientVerdict = {
        address,
        verdict: r.verdict,
        adapter: r.verdict === "deliverable" ? r.adapter : null,
        code: r.verdict === "undeliverable" ? r.code : null,
        message: r.message,
        checkedAt: new Date(now()).toISOString(),
      };
      cache.set(address, { at: now(), v });
      return reply.send(v);
    });

    server.get("/deployment", async (_request, reply) => {
      const record = opts.deploymentRecord?.() ?? null;
      if (!record) return reply.code(503).send({ error: "the node has not verified its deployment record yet; retry" });
      return reply.send(record);
    });
  };
}

/** The 00050 routes only (the default export keeps its shape for callers and tests). */
export const apiRouter: StartConfigApiRouter = async function (
  server: ApiServer,
  dbConn: DbPool,
): Promise<void> {
  await registerTransferRoutes(server, dbConn);
};

async function registerTransferRoutes(server: ApiServer, dbConn: DbPool): Promise<void> {
  server.get<{ Querystring: { direction?: string; status?: string; recipientKind?: string; limit?: string } }>(
    "/transfers",
    async (request, reply) => {
      const { direction, status, recipientKind } = request.query;
      if (direction !== undefined && !DIRECTIONS.has(direction)) {
        return reply.code(400).send({ error: "direction must be s2m or m2s" });
      }
      if (status !== undefined && !STATES.has(status)) {
        return reply.code(400).send({ error: "status must be observed, submitted, completed or undeliverable" });
      }
      if (recipientKind !== undefined && !RECIPIENT_KINDS.has(recipientKind)) {
        return reply.code(400).send({ error: "recipientKind must be wallet, contract or solana" });
      }
      const requested = Number(request.query.limit ?? "100");
      const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 500) : 100;
      let rows: IListTransfersResult[];
      try {
        rows = await runQuery(
          listTransfers.run({ direction: direction ?? null, state: status ?? null, recipient_kind: recipientKind ?? null, limit }, dbConn),
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
}
