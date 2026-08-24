import type { DefaultBatcherInput } from "./types.ts";
import type {
  AcceptanceOutcome,
  BatcherStorage,
  ReconciliationReport,
  RequestState,
  RequestStatusRecord,
  RequestTransition,
  RequestTransitionDetail,
  TrackingStorage,
  TransitionOutcome,
} from "./storage.ts";
import { buildRequestKey, requestIdFromKey } from "./request-id.ts";
import { quoteSchemaIdentifier, resolveBatcherSchema } from "./storage-schema.ts";
import { mkdirSync } from "node:fs";
import { readFile, rename } from "node:fs/promises";
import { isNotFoundError } from "@effectstream/utils/runtime";
import type { IDatabaseConnection } from "@pgtyped/runtime";
import batcherStorageMigration from "./sql/migrations/00001-batcher-storage.sql" with {
  type: "text",
};
import {
  backfillPendingRequestId,
  clearPendingInputs,
  countOrphanedStatuses,
  countPendingInputs,
  deletePendingByContentKeys,
  deletePendingByIdentity,
  deleteReplayKeysByRequestIds,
  findPendingWithoutRequestId,
  getAllPendingPayloads,
  getPendingForRetry,
  getPendingInputCountAndSize,
  getPendingPayloadsByTarget,
  getStatus as getStatusQuery,
  getStatusByReplayKey,
  getStatusForUpdate,
  insertPendingInput,
  pruneTerminalByAge,
  pruneTerminalByCount,
  recordAccepted as recordAcceptedQuery,
  recordTransitions as recordTransitionsQuery,
  synthesizeQueuedStatuses,
  updatePendingRetry,
  updateRequestStatus,
} from "./sql/queries/database-storage.queries.ts";

/**
 * Database-backed batcher storage.
 *
 * Engine choice (plan Q-P1): the default is an EMBEDDED PgLite database in a
 * data directory, so "clone and run" keeps working exactly as it did with
 * `FileStorage` — no server to install, no connection string to invent. A real
 * Postgres is opt-in via `connectionString`, and runs the SAME SQL: PgLite is
 * Postgres compiled to WASM, so there is one dialect to reason about and one
 * set of statements to keep correct.
 *
 * Why a database at all: the queue alone is happy in a JSONL file, but request
 * tracking needs the queue, the per-request status and the replay/dedup owner
 * to move together or not at all. Two files cannot be written atomically; one
 * database statement can. The live status row owns its replay key so pruning
 * the record releases ownership in the same atomic fate.
 */

interface SqlDriver extends IDatabaseConnection {
  transaction<R>(fn: (tx: IDatabaseConnection) => Promise<R>): Promise<R>;
  migrate(sql: string): Promise<void>;
  close(): Promise<void>;
}

/** Embedded PgLite: file-backed, single-process, zero configuration. */
class PgliteDriver implements SqlDriver {
  private constructor(private readonly db: any) {}

  static async open(
    dataDirectory: string,
    schema?: string,
  ): Promise<PgliteDriver> {
    const { PGlite } = await import("@electric-sql/pglite");
    // relaxedDurability is left at its default (off): a committed input must
    // still be there after a kill -9, which is the entire point of journaling
    // it before the caller is told 200.
    const db = new PGlite(dataDirectory);
    await db.waitReady;
    if (schema) {
      // Not required here — an embedded database has exactly one tenant, so
      // there is nothing to isolate from (FR-015). Honoured anyway so that
      // `schema` never means "ignored on this backend": a silently dropped
      // isolation setting is the failure mode the whole feature exists to
      // avoid. One session, so one SET holds for the life of the process.
      const quoted = quoteSchemaIdentifier(schema);
      await db.exec(
        `CREATE SCHEMA IF NOT EXISTS ${quoted}; SET search_path TO ${quoted};`,
      );
    }
    return new PgliteDriver(db);
  }

  async query(sql: string, params: unknown[] = []) {
    const result = await this.db.query(sql, params);
    const rows = result?.rows ?? [];
    return {
      rows,
      rowCount: result?.rowCount ?? result?.affectedRows ?? rows.length,
    };
  }

  async transaction<R>(fn: (tx: IDatabaseConnection) => Promise<R>): Promise<R> {
    return await this.db.transaction(async (tx: any) =>
      await fn({
        query: async (sql: string, params: unknown[] = []) => {
          const result = await tx.query(sql, params);
          const rows = result?.rows ?? [];
          return {
            rows,
            rowCount: result?.rowCount ?? result?.affectedRows ?? rows.length,
          };
        },
      })
    );
  }

  async migrate(sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

/**
 * Does this server give each connection its own session?
 *
 * It has to be asked, because the answer is NO for the launcher's development
 * gateway: `start-pglite.ts` fronts ONE PgLite instance and forwards every
 * client's protocol messages into it, so all clients share a single Postgres
 * session. `SET search_path` there is not "my connection's schema", it is
 * "everybody's schema" — including the engine's, whose next unqualified query
 * then fails with `relation "..." does not exist`. Measured, not inferred.
 *
 * The canary is a custom GUC rather than `search_path` itself, deliberately:
 * a probe that used `search_path` would corrupt the very client it is trying
 * to protect in order to find out whether it can corrupt it. A namespaced GUC
 * is inert — nothing reads it — so a leak costs nothing and a non-leak costs
 * nothing.
 *
 * Two connections are held OPEN at the same time on purpose. Setting on one
 * and reading on the other after releasing it would read the same physical
 * connection back out of the pool and report a leak on a perfectly isolated
 * server.
 */
async function sessionStateLeaksAcrossConnections(
  Pool: new (config: Record<string, unknown>) => any,
  config: Record<string, unknown>,
): Promise<boolean> {
  const pool = new Pool({ ...config, max: 2, onConnect: undefined });
  pool.on("error", () => {});
  try {
    const [first, second] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      // Hex only — this value is interpolated, and the point of this whole
      // module is that identifiers and GUC values cannot be bind parameters.
      const token = Array.from(
        { length: 8 },
        () => Math.floor(Math.random() * 16).toString(16),
      ).join("");
      await first.query(`SET batcher_schema_probe.token = '${token}'`);
      const seen = await second.query(
        "SELECT current_setting('batcher_schema_probe.token', true) AS token",
      );
      return seen?.rows?.[0]?.token === token;
    } finally {
      first.release();
      second.release();
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

/** A connected Postgres: the engine's database in production, its pg-gateway in dev. */
class PostgresDriver implements SqlDriver {
  private constructor(private readonly pool: any) {}

  static async open(
    target: { connectionString?: string; connection?: DatabaseConnectionConfig },
    schema?: string,
  ): Promise<PostgresDriver> {
    // Imported lazily so an embedded (PgLite) deployment never loads the
    // driver.
    //
    // The specifier goes through a variable deliberately: `pg` ships no type
    // declarations and this repo does not carry `@types/pg`, so a literal
    // import makes the type checker demand one for every consumer — to describe
    // a module that only the connected path ever loads. The shape actually used
    // is one constructor and three methods, checked at the call sites below.
    const specifier = "pg";
    const pg: any = await import(specifier);
    const Pool = pg.Pool ?? pg.default?.Pool;
    if (!Pool) {
      throw new Error(
        "DatabaseStorage: a database connection was configured but the 'pg' driver could not be loaded.",
      );
    }

    const config: Record<string, unknown> = target.connectionString
      ? { connectionString: target.connectionString }
      : { ...target.connection };

    const quoted = schema ? quoteSchemaIdentifier(schema) : undefined;

    if (quoted) {
      // Refuse BEFORE pinning anything: on a session-multiplexing server the
      // pin would hit every other client of that server, and the batcher is
      // usually not the most important one connected to it.
      if (await sessionStateLeaksAcrossConnections(Pool, config)) {
        const where = target.connectionString ??
          `${target.connection?.host}:${target.connection?.port}`;
        throw new Error(
          `Refusing to own the schema ${JSON.stringify(schema)} on the ` +
            `database at ${where}: that server puts every client on ONE shared ` +
            `session (measured — a setting made on one connection was visible ` +
            `on another). This is what the development PgLite gateway does, ` +
            `and it means "SET search_path" would silently repoint every OTHER ` +
            `client of that database — including the engine, whose queries ` +
            `would then fail with 'relation does not exist'. Either unset ` +
            `BATCHER_DB_SCHEMA to run queue-only on FileStorage (development ` +
            `only: no request tracking, no replay protection, no ` +
            `/input-status), or point DB_HOST/DB_PORT at a real PostgreSQL ` +
            `server, where each connection has its own session and the schema ` +
            `isolation this key asks for is real.`,
        );
      }
    }

    if (quoted) {
      // `onConnect` runs on EVERY connection this pool opens — the first one,
      // the ones it grows into, and the replacements it makes after a
      // reconnect — and pg-pool AWAITS it before handing the client to the
      // caller, failing the checkout if it throws. That is what FR-014 needs:
      // a connection that could not be pinned to this batcher's schema never
      // serves a statement, rather than quietly serving it against `public`,
      // where the engine's own tables live.
      config.onConnect = async (client: { query: (sql: string) => Promise<unknown> }) => {
        await client.query(`SET search_path TO ${quoted}`);
      };
    }

    const pool = new Pool(config);
    // Idle clients emit errors when the server goes away (a launcher restart
    // drops every socket). Without a listener node treats that as unhandled
    // and takes the process down — during housekeeping, on a batcher that was
    // about to reconnect perfectly well.
    pool.on("error", (error: unknown) => {
      console.warn(
        "⚠️ [Storage] idle database connection error (will reconnect):",
        error instanceof Error ? error.message : error,
      );
    });

    if (quoted && schema) {
      try {
        await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoted}`);

        // Prove the pinning mechanism actually works with the driver that is
        // installed, instead of assuming it. `onConnect` is a pg-pool feature;
        // against a version without it every statement would silently land in
        // `public` and the first symptom would be two batchers sharing a
        // queue. Reading the answer back from the server costs one round trip
        // at boot and turns that into a refusal.
        const check = await pool.query("SELECT current_schema() AS schema");
        const effective = check?.rows?.[0]?.schema;
        if (effective !== schema) {
          throw new Error(
            `search_path was not applied to a pooled connection: unqualified ` +
              `statements would run against ${JSON.stringify(effective)} ` +
              `instead of ${JSON.stringify(schema)}. Refusing to start — this ` +
              `batcher would otherwise share tables with whatever else lives ` +
              `there.`,
          );
        }
      } catch (error) {
        await pool.end().catch(() => {});
        throw error;
      }
    }

    return new PostgresDriver(pool);
  }

  async query(sql: string, params: unknown[] = []) {
    const result = await this.pool.query(sql, params);
    return { rows: result?.rows ?? [], rowCount: result?.rowCount ?? 0 };
  }

  async transaction<R>(fn: (tx: IDatabaseConnection) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn({
        query: async (sql: string, params: unknown[] = []) => {
          const result = await client.query(sql, params);
          return { rows: result?.rows ?? [], rowCount: result?.rowCount ?? 0 };
        },
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // the original error is the one worth reporting
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async migrate(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * How to reach the database, in the engine's own terms (`getConnection()`).
 *
 * Field-by-field rather than a URL because that is what the rest of the
 * platform configures: `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_NAME`, with the
 * password omitted and the pool capped at one connection when the launcher's
 * single-instance PgLite gateway is what is listening.
 */
export interface DatabaseConnectionConfig {
  host: string;
  port: number;
  user: string;
  database: string;
  /** Omitted against the dev gateway, which authenticates with `trust`. */
  password?: string;
  /** Pool size. 1 against the gateway — PgLite serialises everything anyway. */
  max?: number;
}

export interface DatabaseStorageOptions {
  /**
   * Directory for the embedded PgLite database (standalone opt-in), and the
   * directory scanned for a legacy `pending-inputs.jsonl` to import.
   *
   * Defaults to `./batcher-data` ONLY when no connection is configured. A
   * connected storage never defaults it (spec FR-016): it has no embedded
   * engine to put anywhere, and probing a directory nobody asked about is how
   * a connected deployment ends up importing a stale queue it had forgotten.
   */
  dataDirectory?: string;
  /** Connect with a `postgres://` URL instead of the embedded engine. */
  connectionString?: string;
  /**
   * Connect with the engine's own connection fields (spec FR-012). Mutually
   * exclusive with `connectionString`.
   */
  connection?: DatabaseConnectionConfig;
  /**
   * Schema SUFFIX this storage owns; the fixed `batcher_` prefix is applied by
   * the code (spec FR-013). Set it and the storage creates
   * `batcher_<value>` and pins `search_path` to it on every pooled connection,
   * so several batchers can share one database without seeing each other.
   * Omit it and nothing about schemas changes — the connection's own
   * `search_path` applies, exactly as before.
   */
  schema?: string;
  /**
   * What to call the schema setting when refusing an invalid value. Defaults
   * to the environment variable, because that is where it comes from in every
   * deployment; a caller passing `schema` in code can name itself instead.
   */
  schemaSource?: string;
}

const LEGACY_QUEUE_FILE = "pending-inputs.jsonl";
const DEFAULT_DATA_DIRECTORY = "./batcher-data";
/**
 * The embedded database gets its OWN subdirectory of the data directory.
 *
 * Not cosmetic: PgLite runs `initdb`, which refuses to initialise a directory
 * that contains anything it did not put there. Pointing it at the batcher's
 * data directory would therefore fail on exactly the deployments that matter
 * most — the ones carrying a `pending-inputs.jsonl` to import.
 */
const EMBEDDED_DB_SUBDIR = "pglite";

/**
 * Content key for a row, byte-identical to `FileStorage.createInputKey`.
 *
 * The `?? target` fallback has the same meaning as there: a row that never
 * recorded its own target is read as belonging to whoever is asking. Rows
 * written by this backend are always stamped (see `addInput`), so the fallback
 * only ever applies to keys computed from a CALLER's input — which is exactly
 * what makes "remove the inputs I just processed" work when the caller passes
 * the raw payload it was handed.
 */
function contentKeyOf(input: DefaultBatcherInput, target: string): string {
  return buildRequestKey(input, target);
}

/**
 * The target a row belongs to: its own, or the one the caller routed it to.
 *
 * Throws rather than storing a targetless row — such a row is adopted by
 * whichever product reads it, which is exactly the multi-product collision the
 * stamp exists to prevent.
 */
function resolveRowTarget(
  input: DefaultBatcherInput,
  target?: string,
): string {
  const resolved = input.target ?? target;
  if (resolved === undefined) {
    throw new Error(
      "Cannot store input: no target on the input and no target supplied. " +
        "Every row must record the target it belongs to.",
    );
  }
  return resolved;
}

/** A `request_status` row as the driver hands it back. */
interface StatusRow {
  request_id: string | null;
  row_target: string | null;
  address: string | null;
  state: string | null;
  terminal: boolean | null;
  transaction_hash: string | null;
  block_number: string | number | null;
  error_code: string | null;
  message: string | null;
  retry_count: number | string | null;
  replay_key: string | null;
  accepted_at: string | Date | null;
  updated_at: string | Date | null;
}

function toStatusRecord(row: StatusRow): RequestStatusRecord {
  if (
    row.request_id === null || row.row_target === null || row.state === null ||
    row.terminal === null || row.retry_count === null ||
    row.accepted_at === null || row.updated_at === null
  ) {
    throw new Error("DatabaseStorage received an incomplete request_status row");
  }
  return {
    requestId: row.request_id,
    target: row.row_target,
    address: row.address ?? undefined,
    state: row.state as RequestState,
    terminal: row.terminal === true,
    transactionHash: row.transaction_hash ?? undefined,
    blockNumber: row.block_number === null || row.block_number === undefined
      ? undefined
      : BigInt(String(row.block_number)),
    errorCode: row.error_code ?? undefined,
    message: row.message ?? undefined,
    retryCount: Number(row.retry_count),
    replayKey: row.replay_key ?? undefined,
    acceptedAt: new Date(row.accepted_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * How far along the lifecycle a state is. Transitions may only move UP, and
 * nothing moves at all once a terminal state is reached.
 *
 * `confirmed` and `failed` share a rank because they are alternative endings,
 * not successive steps: neither may follow the other.
 */
const STATE_RANK: Record<RequestState, number> = {
  queued: 0,
  batching: 1,
  submitted: 2,
  confirmed: 3,
  failed: 3,
};

const TERMINAL_STATES: ReadonlySet<RequestState> = new Set<RequestState>([
  "confirmed",
  "failed",
]);

export class DatabaseStorage<
  T extends DefaultBatcherInput = DefaultBatcherInput,
> implements BatcherStorage<T>, TrackingStorage<T> {
  /**
   * Undefined when a connection is configured and no directory was asked for:
   * a connected storage has no embedded engine and no legacy queue to find
   * (spec FR-016).
   */
  private readonly dataDirectory?: string;
  private readonly connectionString?: string;
  private readonly connection?: DatabaseConnectionConfig;
  /** The effective, prefixed schema name — or undefined for "leave search_path alone". */
  private readonly schema?: string;
  private driver?: SqlDriver;
  /** Memoised so the two `init()` call sites in `Batcher` cannot double-import. */
  private initPromise?: Promise<void>;
  /** What the last `init()` had to repair; surfaced via `getReconciliationReport()`. */
  private lastReconciliation?: ReconciliationReport;

  /**
   * @param options a data directory (embedded PgLite), a `postgres://` URL, or
   * an options object. A bare string is read as a connection string when it
   * looks like one, and as a data directory otherwise.
   */
  constructor(options: string | DatabaseStorageOptions = DEFAULT_DATA_DIRECTORY) {
    const resolved: DatabaseStorageOptions = typeof options === "string"
      ? (/^postgres(ql)?:\/\//i.test(options)
        ? { connectionString: options }
        : { dataDirectory: options })
      : options;

    if (resolved.connectionString && resolved.connection) {
      throw new Error(
        "DatabaseStorage: pass either connectionString or connection, not both — " +
          "two descriptions of where the database is can disagree.",
      );
    }

    this.connectionString = resolved.connectionString;
    this.connection = resolved.connection;

    // FR-016. The directory is defaulted only for the embedded engine, which
    // needs somewhere to live. A connected storage that silently adopted
    // `./batcher-data` would probe it for a legacy queue on every boot, and
    // import one it was never told about.
    const isConnected = this.connectionString !== undefined ||
      this.connection !== undefined;
    this.dataDirectory = resolved.dataDirectory ??
      (isConnected ? undefined : DEFAULT_DATA_DIRECTORY);

    if (resolved.schema !== undefined) {
      // Throws on an invalid value: a batcher asked to isolate itself and
      // unable to do so must not start (FR-013).
      const { schema, warning } = resolveBatcherSchema(
        resolved.schema,
        resolved.schemaSource,
      );
      if (warning) console.warn(warning);
      this.schema = schema;
    }
  }

  /** The schema this storage owns, or undefined when it owns none. */
  getSchema(): string | undefined {
    return this.schema;
  }

  /**
   * What this storage's connection actually resolves to right now.
   *
   * Diagnostic, and the only honest way to answer "is the isolation real":
   * `schema` is what the NEXT unqualified statement would write to, read from
   * the server rather than from configuration, and `backendPid` identifies the
   * connection that answered — so N concurrent calls that report N pids and
   * one schema are evidence that every pooled connection is pinned, not just
   * the first one.
   */
  async describeConnection(): Promise<{
    schema: string | null;
    backendPid: number | null;
  }> {
    const result = await this.db.query(
      "SELECT current_schema() AS schema, pg_backend_pid() AS pid",
      [],
    );
    const row = (result.rows[0] ?? {}) as {
      schema?: string | null;
      pid?: number | string | null;
    };
    return {
      schema: row.schema ?? null,
      backendPid: row.pid === undefined || row.pid === null
        ? null
        : Number(row.pid),
    };
  }

  async init(defaultTarget?: string): Promise<void> {
    this.initPromise ??= this.doInit(defaultTarget);
    await this.initPromise;
  }

  private async doInit(defaultTarget?: string): Promise<void> {
    try {
      if (this.connectionString || this.connection) {
        this.driver = await PostgresDriver.open(
          {
            connectionString: this.connectionString,
            connection: this.connection,
          },
          this.schema,
        );
      } else {
        const directory = this.dataDirectory ?? DEFAULT_DATA_DIRECTORY;
        mkdirSync(directory, { recursive: true });
        this.driver = await PgliteDriver.open(
          `${directory}/${EMBEDDED_DB_SUBDIR}`,
          this.schema,
        );
      }
      await this.migrate();
      await this.importLegacyQueue(defaultTarget);
      await this.reconcile();
    } catch (error) {
      // A half-open storage is worse than none: the next call would report an
      // empty queue and the batcher would happily accept inputs into nothing.
      this.initPromise = undefined;
      await this.driver?.close().catch(() => {});
      this.driver = undefined;
      console.error("Error initializing database storage:", error);
      throw new Error(`Failed to initialize storage: ${error}`);
    }
  }

  private get db(): SqlDriver {
    if (!this.driver) {
      throw new Error(
        "DatabaseStorage used before init() — call init() before any queue operation.",
      );
    }
    return this.driver;
  }

  /** Apply the reviewed immutable schema/function migration as one asset. */
  private async migrate(): Promise<void> {
    await this.db.migrate(batcherStorageMigration);
    await this.backfillRequestIds();
  }

  /**
   * Give rows written before the column existed the id they always had.
   *
   * Done in TypeScript rather than in SQL on purpose: the hash has exactly one
   * implementation (`request-id.ts`), and a second one written in Postgres —
   * even a correct one — is a second thing to keep correct. Bounded by the
   * pending queue, which is small by construction.
   */
  private async backfillRequestIds(): Promise<void> {
    const stale = await findPendingWithoutRequestId.run(undefined, this.db);
    if (stale.length === 0) return;
    await this.db.transaction(async (tx) => {
      for (const row of stale) {
        await backfillPendingRequestId.run({
          request_id: requestIdFromKey(row.content_key),
          content_key: row.content_key,
          seq: row.seq,
        }, tx);
      }
    });
    console.log(
      `[Storage] Stamped ${stale.length} queue row(s) with their request id.`,
    );
  }

  /**
   * One-time import of a queue written by `FileStorage`.
   *
   * Guarded twice, because importing twice would resubmit every input in it:
   * the table must be empty, and the file is renamed to `.imported` once the
   * rows are committed. Rows without a target are stamped with `defaultTarget`
   * exactly as `FileStorage.stampLegacyRows` does; if there are such rows and
   * no default target is known, the import is REFUSED and the file left where
   * it is, so a later boot that knows its target can still recover the queue.
   */
  private async importLegacyQueue(defaultTarget?: string): Promise<void> {
    // FR-016: no directory configured means no filesystem, full stop. A
    // connected batcher does not go looking for queues it was not pointed at.
    if (this.dataDirectory === undefined) return;
    const legacyPath = `${this.dataDirectory}/${LEGACY_QUEUE_FILE}`;
    let raw: string;
    try {
      raw = await readFile(legacyPath, "utf-8");
    } catch (error) {
      if (isNotFoundError(error)) return;
      throw error;
    }

    const [{ count }] = await countPendingInputs.run(undefined, this.db);
    if (Number(count) > 0) {
      console.warn(
        `[Storage] Found ${LEGACY_QUEUE_FILE} in ${this.dataDirectory} but the ` +
          `queue table already holds ${count} row(s); skipping import to avoid ` +
          `resubmitting inputs. Move the file aside if it is genuinely unimported.`,
      );
      return;
    }

    const rows: DefaultBatcherInput[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line) as DefaultBatcherInput);
      } catch {
        console.warn("⚠️ Skipping corrupt line in legacy queue file:", line);
      }
    }

    const untargeted = rows.filter((row) => row.target === undefined).length;
    if (untargeted > 0 && defaultTarget === undefined) {
      console.error(
        `[Storage] Refusing to import ${LEGACY_QUEUE_FILE}: ${untargeted} row(s) ` +
          `carry no target and no default target is configured. The file is left ` +
          `in place; re-run once the batcher has an adapter so the rows can be stamped.`,
      );
      return;
    }

    if (rows.length > 0) {
      await this.db.transaction(async (tx) => {
        for (const row of rows) {
          await this.insertRow(tx, row, defaultTarget);
        }
      });
    }

    await rename(legacyPath, `${legacyPath}.imported`);
    console.log(
      `[Storage] Imported ${rows.length} input(s) from ${LEGACY_QUEUE_FILE} ` +
        `(${untargeted} stamped with target "${defaultTarget}"); ` +
        `renamed the file to ${LEGACY_QUEUE_FILE}.imported.`,
    );
  }

  /**
   * Make the queue and the status store agree about what is in flight.
   *
   * Acceptance writes both in one transaction, so they cannot drift apart
   * through the accept path. They still can through the OTHER paths: a legacy
   * queue imported from `FileStorage`, an input written with the untracked
   * `addInput`, or a row removed by a batch whose outcome was never recorded
   * because the process died first.
   *
   * The row wins. A row that exists WILL be batched, so a request with no
   * record gets the `queued` one it should always have had — otherwise the
   * batcher would send a transaction it cannot answer any question about.
   *
   * The reverse is deliberately NOT symmetrical. A non-terminal record whose
   * row is gone is left exactly as it is: the honest options are "the batch
   * confirmed and we lost the write" and "the row was dropped", and marking it
   * failed would report a verdict the chain never gave. It is counted and
   * logged so an operator can see it; Phase 3 removes the cause by recording
   * the verdict at its source.
   */
  private async reconcile(): Promise<void> {
    // GROUP BY, not one INSERT per row: duplicate submissions are two rows with
    // ONE identity, and inserting per row would collide on the primary key and
    // take the whole boot down.
    const synthesized = await synthesizeQueuedStatuses.run(undefined, this.db);

    const [orphans] = await countOrphanedStatuses.run(undefined, this.db);

    this.lastReconciliation = {
      synthesizedFromRows: synthesized.length,
      orphanedStatuses: Number(orphans?.count ?? 0),
    };

    if (synthesized.length > 0) {
      console.warn(
        `[Storage] Reconciled ${synthesized.length} queued request(s) that had no ` +
          `status record (imported or untracked rows); they are pollable now.`,
      );
    }
    if (this.lastReconciliation.orphanedStatuses > 0) {
      console.warn(
        `⚠️ [Storage] ${this.lastReconciliation.orphanedStatuses} in-flight request ` +
          `record(s) have no queue row: their batch's outcome was never recorded. ` +
          `Left as-is rather than marked failed — a verdict the chain never gave ` +
          `would be worse than none.`,
      );
    }
  }

  /**
   * Insert one row, stamping the resolved target.
   *
   * Stamping is not cosmetic: an unstamped row takes on the identity of
   * whichever product happens to read it, so another product's identical
   * payload would match it and remove or retry-charge the wrong request.
   */
  private async insertRow(
    tx: IDatabaseConnection,
    input: DefaultBatcherInput,
    target?: string,
  ): Promise<{ requestId: string; resolvedTarget: string }> {
    const resolvedTarget = resolveRowTarget(input, target);
    const row = input.target === undefined
      ? { ...input, target: resolvedTarget }
      : input;
    const payload = JSON.stringify(row);
    const contentKey = contentKeyOf(row, resolvedTarget);
    const requestId = requestIdFromKey(contentKey);
    await insertPendingInput.run({
      content_key: contentKey,
      request_id: requestId,
      row_target: resolvedTarget,
      address: row.address,
      address_type: row.addressType,
      ts: row.timestamp,
      signature: row.signature ?? "",
      input: row.input,
      retry_count: row.retryCount ?? 0,
      payload,
    }, tx);
    return { requestId, resolvedTarget };
  }

  async addInput(input: T, target?: string): Promise<void> {
    try {
      await this.db.transaction((tx) => this.insertRow(tx, input, target));
    } catch (error) {
      console.error("Error adding input to storage:", error);
      throw new Error(`Failed to add input: ${error}`);
    }
  }

  async getAllInputs(): Promise<T[]> {
    try {
      const rows = await getAllPendingPayloads.run(undefined, this.db);
      return rows.map((row) => JSON.parse(row.payload) as T);
    } catch (error) {
      console.error("Error reading inputs from storage:", error);
      throw new Error(`Failed to read inputs: ${error}`);
    }
  }

  async getInputsByTarget(target: string, defaultTarget: string): Promise<T[]> {
    try {
      // Mirrors `input.target || defaultTarget` — an empty string falls back
      // the same way the JavaScript does.
      const rows = await getPendingPayloadsByTarget.run({
        target,
        default_target: defaultTarget,
      }, this.db);
      return rows.map((row) => JSON.parse(row.payload) as T);
    } catch (error) {
      console.error("Error getting inputs by target:", error);
      throw new Error(`Failed to get inputs by target: ${error}`);
    }
  }

  async removeProcessedInputs(
    processedInputs: T[],
    target: string,
  ): Promise<void> {
    if (processedInputs.length === 0) return;
    try {
      const keys = [
        ...new Set(processedInputs.map((input) => contentKeyOf(input, target))),
      ];
      const { removed, total } = await this.db.transaction(async (tx) => {
        const [{ count }] = await countPendingInputs.run(undefined, tx);
        const deleted = await deletePendingByContentKeys.run({
          content_keys: keys,
        }, tx);
        return { removed: deleted.length, total: Number(count) };
      });

      if (removed !== processedInputs.length) {
        // Same judgement as FileStorage: an empty queue means a parallel batch
        // got there first, which is normal; anything else is worth a warning.
        if (total === 0) {
          console.log(
            `[Storage] Inputs already removed (concurrent batch). Expected ${processedInputs.length}, storage was empty.`,
          );
        } else {
          console.warn(
            `⚠️ Expected to remove ${processedInputs.length} inputs, but removed ${removed}. Some inputs may have been processed already.`,
          );
        }
      }
    } catch (error) {
      console.error("Error removing processed inputs:", error);
      throw new Error(`Failed to remove processed inputs: ${error}`);
    }
  }

  async getInputCountAndSize(): Promise<{ count: number; size: number }> {
    try {
      // `length()` counts characters; `JSON.stringify(...).length` counts UTF-16
      // units. They agree for every payload the batcher actually carries (hex,
      // base64, JSON of those) and differ only for astral-plane characters.
      const [row] = await getPendingInputCountAndSize.run(undefined, this.db);
      return { count: Number(row?.count ?? 0), size: Number(row?.size ?? 0) };
    } catch (error) {
      console.error("Error getting input count:", error);
      throw new Error(`Failed to get input count: ${error}`);
    }
  }

  async incrementRetryCount(
    inputs: T[],
    target: string,
    maxRetries: number,
  ): Promise<T[]> {
    if (inputs.length === 0) return [];
    try {
      const keys = [
        ...new Set(inputs.map((input) => contentKeyOf(input, target))),
      ];
      const dropped: T[] = [];
      await this.db.transaction(async (tx) => {
        const rows = await getPendingForRetry.run({ content_keys: keys }, tx);

        for (const row of rows) {
          // The charge is against the STORED count, not whatever the caller's
          // copy of the input happened to carry.
          const newRetryCount = Number(row.retry_count) + 1;
          if (newRetryCount >= maxRetries) {
            const parsed = JSON.parse(row.payload) as DefaultBatcherInput;
            // Always-visible: deleting a user's input must never be silent.
            console.warn(
              `[Storage] DROPPING input after ${newRetryCount} failed retries ` +
                `(address=${parsed.address}, target=${target}): ${
                  row.content_key.substring(0, 100)
                }...`,
            );
            await deletePendingByIdentity.run({
              content_key: row.content_key,
              seq: row.seq,
            }, tx);
            // Reported, not just logged: the caller waiting on this input can
            // only be told it is gone if something tells the batcher first.
            dropped.push({ ...parsed, retryCount: newRetryCount } as T);
            continue;
          }
          const parsed = JSON.parse(row.payload) as DefaultBatcherInput;
          const payload = JSON.stringify({
            ...parsed,
            retryCount: newRetryCount,
          });
          await updatePendingRetry.run({
            retry_count: newRetryCount,
            payload,
            content_key: row.content_key,
            seq: row.seq,
          }, tx);
        }
      });
      return dropped;
    } catch (error) {
      console.error("Error incrementing retry counts:", error);
      throw new Error(`Failed to increment retry counts: ${error}`);
    }
  }

  async clearAllInputs(): Promise<void> {
    try {
      await clearPendingInputs.run(undefined, this.db);
    } catch (error) {
      console.error("Error clearing inputs:", error);
      throw new Error(`Failed to clear inputs: ${error}`);
    }
  }

  /**
   * Retention primitive for terminal request records.
   *
   * Deletes terminal rows that are older than `ttlMs`, then trims what remains
   * to the newest `keepCount` by recency. Non-terminal rows are never touched —
   * they describe requests that are still in flight, and losing one would turn
   * a live request into a 404. Replay keys are deleted with the record they
   * belong to: a dedup key that outlived its status could refuse a resubmission
   * while having nothing to report about the original.
   *
   * Not on a timer yet — the caller that schedules it arrives with the
   * retention wiring.
   */
  async pruneTerminal(
    keepCount: number,
    ttlMs: number,
  ): Promise<{ prunedByAge: number; prunedByCount: number }> {
    if (!Number.isFinite(keepCount) || keepCount < 0) {
      throw new Error(`pruneTerminal: keepCount must be >= 0, got ${keepCount}`);
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error(`pruneTerminal: ttlMs must be > 0, got ${ttlMs}`);
    }
    try {
      return await this.db.transaction(async (tx) => {
        const aged = await pruneTerminalByAge.run({
          ttl_ms: Math.floor(ttlMs),
        }, tx);
        const overflow = await pruneTerminalByCount.run({
          keep_count: Math.floor(keepCount),
        }, tx);

        const removed = [...aged, ...overflow].map((row) => row.request_id);
        if (removed.length > 0) {
          await deleteReplayKeysByRequestIds.run({ request_ids: removed }, tx);
        }
        return { prunedByAge: aged.length, prunedByCount: overflow.length };
      });
    } catch (error) {
      console.error("Error pruning terminal request records:", error);
      throw new Error(`Failed to prune terminal records: ${error}`);
    }
  }

  // ────────────────────────────── request tracking ──────────────────────────

  /**
   * Queue the input and open its status record — one transaction, one fate.
   *
   * The caller is told "accepted" only after this returns, so the pair it
   * writes is what "accepted" MEANS: a queue row that will be batched, and a
   * status record that can answer for it. Splitting them across two writes
   * would leave a kill -9 window in which a request is queued but unpollable
   * (a 404 for an id we handed out) or pollable but unqueued (a request that
   * never goes anywhere).
   *
   * A request id that is already tracked is NOT reopened: ids are deterministic
   * (spec FR-006), so a byte-identical resubmission is the same request, and
   * resetting its record to `queued` would erase a verdict that already
   * happened. Where no replay key is supplied the queue still takes the second
   * row — `FileStorage` has always accepted duplicate rows and removes them
   * together.
   *
   * With a replay key, the key is CLAIMED first and an already-claimed key
   * aborts the acceptance: nothing is written and the claimant's record is
   * returned with `duplicate: true` (spec FR-006b). This atomic claim is the
   * whole replay gate: it survives concurrency and claiming first means the
   * abort costs no wasted queue/status insert.
   */
  async recordAccepted(
    requestId: string,
    input: T,
    target: string,
    replayKey?: string,
  ): Promise<AcceptanceOutcome> {
    try {
      const resolvedTarget = resolveRowTarget(input, target);
      const row = input.target === undefined
        ? { ...input, target: resolvedTarget }
        : input;
      const payload = JSON.stringify(row);
      const contentKey = contentKeyOf(row, resolvedTarget);
      const [outcome] = await recordAcceptedQuery.run({
        replay_key: replayKey ?? null,
        request_id: requestId,
        row_target: resolvedTarget,
        address: row.address,
        address_type: row.addressType,
        ts: row.timestamp,
        signature: row.signature ?? "",
        input: row.input,
        retry_count: row.retryCount ?? 0,
        payload,
        content_key: contentKey,
        queue_request_id: requestIdFromKey(contentKey),
      }, this.db);
      if (!outcome) {
        throw new Error("batcher_record_accepted returned no outcome");
      }

      const record = toStatusRecord(outcome);
      if (outcome.outcome_duplicate === true) {
        console.log(
          `[Storage] Replay key already claimed by request ` +
            `${record.requestId.substring(0, 12)}… (state=${record.state}); ` +
            `nothing queued for the resubmission.`,
        );
        return {
          requestId: record.requestId,
          created: false,
          record,
          duplicate: true,
        };
      }
      if (outcome.outcome_created !== true) {
        console.log(
          `[Storage] Request ${requestId.substring(0, 12)}… was already tracked ` +
            `(state=${record.state}); keeping its existing record.`,
        );
      }
      return { requestId, created: outcome.outcome_created === true, record };
    } catch (error) {
      console.error("Error recording accepted request:", error);
      throw new Error(`Failed to record accepted request: ${error}`);
    }
  }

  /**
   * Move a request forward, or refuse and say why.
   *
   * Refusals are returned rather than thrown because they are ANSWERS, not
   * faults: a re-picked input after a confirmed batch is normal operation, and
   * the correct handling is "the record already knows better", not an exception
   * that aborts a batch.
   */
  async recordTransition(
    requestId: string,
    state: RequestState,
    detail: RequestTransitionDetail = {},
  ): Promise<TransitionOutcome> {
    try {
      return await this.db.transaction(async (tx) => {
        // FOR UPDATE: two workers reporting on the same request must not both
        // read the pre-transition state and both decide they may write.
        const [currentRow] = await getStatusForUpdate.run({
          request_id: requestId,
        }, tx);
        if (!currentRow) {
          // Deliberately does NOT create the record: `recordAccepted` is the
          // only way one comes into existence, because a status with no queue
          // row behind it describes a request nobody will ever send.
          console.warn(
            `[Storage] Refusing transition → ${state} for unknown request ` +
              `${requestId.substring(0, 12)}…: no accepted record exists.`,
          );
          return { applied: false, refused: "unknown-request" as const };
        }

        const current = toStatusRecord(currentRow);
        if (current.terminal) {
          console.warn(
            `[Storage] Refusing transition ${current.state} → ${state} for request ` +
              `${requestId.substring(0, 12)}…: ${current.state} is terminal.`,
          );
          return {
            applied: false,
            refused: "already-terminal" as const,
            current,
          };
        }
        if (STATE_RANK[state] < STATE_RANK[current.state]) {
          // The crash-replay guard. Loud on purpose: it means a batch was
          // re-picked after its outcome was already known, which an operator
          // should see even though the store handled it correctly.
          console.warn(
            `⚠️ [Storage] Refusing BACKWARDS transition ${current.state} → ${state} ` +
              `for request ${requestId.substring(0, 12)}…: status is append-only. ` +
              `(A batch whose rows outlived its outcome was re-picked.)`,
          );
          return { applied: false, refused: "regression" as const, current };
        }

        const [updated] = await updateRequestStatus.run({
          request_id: requestId,
          state,
          terminal: TERMINAL_STATES.has(state),
          transaction_hash: detail.transactionHash ?? null,
          // Every detail field is COALESCEd: a transition that knows less
          // than its predecessor must not erase the hash a caller needs.
          block_number: detail.blockNumber === undefined
            ? null
            : String(detail.blockNumber),
          error_code: detail.errorCode ?? null,
          message: detail.message ?? null,
          retry_count: detail.retryCount ?? null,
        }, tx);
        if (!updated) {
          throw new Error(`request_status row ${requestId} disappeared while locked`);
        }
        return { applied: true as const, record: toStatusRecord(updated) };
      });
    } catch (error) {
      console.error("Error recording request transition:", error);
      throw new Error(`Failed to record request transition: ${error}`);
    }
  }

  /** Set-based counterpart to `recordTransition`; one statement, N outcomes. */
  async recordTransitions(
    transitions: readonly RequestTransition[],
  ): Promise<TransitionOutcome[]> {
    if (transitions.length === 0) return [];
    const seen = new Set<string>();
    for (const transition of transitions) {
      if (seen.has(transition.requestId)) {
        throw new Error(
          `recordTransitions received duplicate request id ${transition.requestId}; ` +
            `each target row may appear only once per bulk statement.`,
        );
      }
      seen.add(transition.requestId);
    }

    const encoded = JSON.stringify(
      transitions.map((transition) => ({
        requestId: transition.requestId,
        state: transition.state,
        detail: transition.detail === undefined
          ? undefined
          : {
            ...transition.detail,
            blockNumber: transition.detail.blockNumber === undefined
              ? undefined
              : String(transition.detail.blockNumber),
          },
      })),
    );

    try {
      const rows = await recordTransitionsQuery.run({ transitions: encoded }, this.db);

      return rows.map((row): TransitionOutcome => {
        if (row.applied === true) {
          return { applied: true, record: toStatusRecord(row) };
        }
        if (row.applied !== false) {
          throw new Error("Bulk transition returned an outcome without applied state");
        }
        if (row.refused === "unknown-request") {
          return { applied: false, refused: "unknown-request" };
        }
        if (row.refused !== "regression" && row.refused !== "already-terminal") {
          throw new Error(`Bulk transition returned invalid refusal: ${row.refused}`);
        }
        return {
          applied: false,
          refused: row.refused,
          current: toStatusRecord(row),
        };
      });
    } catch (error) {
      console.error("Error recording bulk request transitions:", error);
      throw new Error(`Failed to record bulk request transitions: ${error}`);
    }
  }

  async getStatus(requestId: string): Promise<RequestStatusRecord | undefined> {
    try {
      const [row] = await getStatusQuery.run({ request_id: requestId }, this.db);
      return row ? toStatusRecord(row) : undefined;
    } catch (error) {
      console.error("Error reading request status:", error);
      throw new Error(`Failed to read request status: ${error}`);
    }
  }

  async findByReplayKey(
    replayKey: string,
  ): Promise<RequestStatusRecord | undefined> {
    try {
      const [row] = await getStatusByReplayKey.run({
        replay_key: replayKey,
      }, this.db);
      return row ? toStatusRecord(row) : undefined;
    } catch (error) {
      console.error("Error reading request status by replay key:", error);
      throw new Error(`Failed to read request status by replay key: ${error}`);
    }
  }

  getReconciliationReport(): ReconciliationReport | undefined {
    return this.lastReconciliation;
  }

  async close(): Promise<void> {
    const driver = this.driver;
    this.driver = undefined;
    this.initPromise = undefined;
    await driver?.close();
  }
}
