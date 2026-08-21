import type { DefaultBatcherInput } from "./types.ts";
import type {
  AcceptanceOutcome,
  BatcherStorage,
  ReconciliationReport,
  RequestState,
  RequestStatusRecord,
  RequestTransitionDetail,
  TrackingStorage,
  TransitionOutcome,
} from "./storage.ts";
import { buildRequestKey, requestIdFromKey } from "./request-id.ts";
import { mkdirSync } from "node:fs";
import { readFile, rename } from "node:fs/promises";
import { isNotFoundError } from "@effectstream/utils/runtime";

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

/** Anything that can run a parameterised statement (a pool, or one transaction). */
interface SqlExecutor {
  query<R>(sql: string, params?: unknown[]): Promise<R[]>;
}

interface SqlDriver extends SqlExecutor {
  transaction<R>(fn: (tx: SqlExecutor) => Promise<R>): Promise<R>;
  close(): Promise<void>;
}

/** Embedded PgLite: file-backed, single-process, zero configuration. */
class PgliteDriver implements SqlDriver {
  private constructor(private readonly db: any) {}

  static async open(dataDirectory: string): Promise<PgliteDriver> {
    const { PGlite } = await import("@electric-sql/pglite");
    // relaxedDurability is left at its default (off): a committed input must
    // still be there after a kill -9, which is the entire point of journaling
    // it before the caller is told 200.
    const db = new PGlite(dataDirectory);
    await db.waitReady;
    return new PgliteDriver(db);
  }

  async query<R>(sql: string, params: unknown[] = []): Promise<R[]> {
    const result = await this.db.query(sql, params);
    return (result?.rows ?? []) as R[];
  }

  async transaction<R>(fn: (tx: SqlExecutor) => Promise<R>): Promise<R> {
    return await this.db.transaction(async (tx: any) =>
      await fn({
        query: async <Row>(sql: string, params: unknown[] = []) =>
          ((await tx.query(sql, params))?.rows ?? []) as Row[],
      })
    );
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

/** Opt-in: a real Postgres server, same statements. */
class PostgresDriver implements SqlDriver {
  private constructor(private readonly pool: any) {}

  static async open(connectionString: string): Promise<PostgresDriver> {
    // Imported lazily so a default (PgLite) deployment never loads the driver.
    //
    // The specifier goes through a variable deliberately: `pg` ships no type
    // declarations and this repo does not carry `@types/pg`, so a literal
    // import makes the type checker demand one for every consumer — to describe
    // a module that only the opt-in path ever loads. The shape actually used is
    // one constructor and three methods, checked at the call sites below.
    const specifier = "pg";
    const pg: any = await import(specifier);
    const Pool = pg.Pool ?? pg.default?.Pool;
    if (!Pool) {
      throw new Error(
        "DatabaseStorage: a connectionString was configured but the 'pg' driver could not be loaded.",
      );
    }
    return new PostgresDriver(new Pool({ connectionString }));
  }

  async query<R>(sql: string, params: unknown[] = []): Promise<R[]> {
    const result = await this.pool.query(sql, params);
    return (result?.rows ?? []) as R[];
  }

  async transaction<R>(fn: (tx: SqlExecutor) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn({
        query: async <Row>(sql: string, params: unknown[] = []) =>
          ((await client.query(sql, params))?.rows ?? []) as Row[],
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

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export interface DatabaseStorageOptions {
  /**
   * Directory for the embedded PgLite database (default engine), and the
   * directory scanned for a legacy `pending-inputs.jsonl` to import.
   * Defaults to `./batcher-data` — the same place `FileStorage` wrote, so an
   * existing queue is found without configuration.
   */
  dataDirectory?: string;
  /**
   * Opt-in: run against a real Postgres instead of the embedded engine.
   * `dataDirectory` is then used only to look for a legacy queue file.
   */
  connectionString?: string;
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

/** `$1, $2, …` for `count` values starting at `from`. */
function placeholders(count: number, from = 1): string {
  return Array.from({ length: count }, (_, i) => `$${from + i}`).join(", ");
}

interface PayloadRow {
  payload: string;
}

/** A `request_status` row as the driver hands it back. */
interface StatusRow {
  request_id: string;
  row_target: string;
  address: string | null;
  state: string;
  terminal: boolean;
  transaction_hash: string | null;
  block_number: string | number | null;
  error_code: string | null;
  message: string | null;
  retry_count: number | string;
  replay_key: string | null;
  accepted_at: string | Date;
  updated_at: string | Date;
}

function toStatusRecord(row: StatusRow): RequestStatusRecord {
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
  private readonly dataDirectory: string;
  private readonly connectionString?: string;
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
    this.dataDirectory = resolved.dataDirectory ?? DEFAULT_DATA_DIRECTORY;
    this.connectionString = resolved.connectionString;
  }

  async init(defaultTarget?: string): Promise<void> {
    this.initPromise ??= this.doInit(defaultTarget);
    await this.initPromise;
  }

  private async doInit(defaultTarget?: string): Promise<void> {
    try {
      if (this.connectionString) {
        this.driver = await PostgresDriver.open(this.connectionString);
      } else {
        mkdirSync(this.dataDirectory, { recursive: true });
        this.driver = await PgliteDriver.open(
          `${this.dataDirectory}/${EMBEDDED_DB_SUBDIR}`,
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

  /**
   * Schema. `CREATE TABLE IF NOT EXISTS` is the whole migration story for now:
   * these tables are new, so there is no earlier shape to migrate from.
   */
  private async migrate(): Promise<void> {
    // The queue. `content_key` + `seq` is the primary key rather than
    // `content_key` alone because two byte-identical submissions are two rows
    // today (FileStorage appends both, and removes both together) — collapsing
    // them into one row would silently drop a user's second request.
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS pending_inputs (
        content_key  text   NOT NULL,
        request_id   text   NOT NULL DEFAULT '',
        seq          bigserial NOT NULL,
        row_target   text   NOT NULL,
        address      text   NOT NULL,
        address_type integer NOT NULL,
        ts           text   NOT NULL,
        signature    text   NOT NULL DEFAULT '',
        input        text   NOT NULL,
        retry_count  integer NOT NULL DEFAULT 0,
        payload      text   NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (content_key, seq)
      )
    `);
    await this.db.query(
      `CREATE INDEX IF NOT EXISTS pending_inputs_target_seq_idx
         ON pending_inputs (row_target, seq)`,
    );
    // A row knows its own request id. Without it, matching a queue row back to
    // its status record after an unclean stop would mean re-hashing every row
    // in SQL — a second implementation of the identity that must not drift.
    // `IF NOT EXISTS` because a database created before this column exists in
    // the wild (this branch's own earlier phase) must migrate, not restart.
    await this.db.query(
      `ALTER TABLE pending_inputs
         ADD COLUMN IF NOT EXISTS request_id text NOT NULL DEFAULT ''`,
    );
    await this.db.query(
      `CREATE INDEX IF NOT EXISTS pending_inputs_request_idx
         ON pending_inputs (request_id)`,
    );
    await this.backfillRequestIds();

    // Per-request lifecycle. Written from the request-tracking phases; created
    // here so the queue and the status it belongs to live in one database and
    // can be written in one transaction.
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS request_status (
        request_id       text PRIMARY KEY,
        seq              bigserial NOT NULL,
        row_target       text NOT NULL,
        address          text,
        state            text NOT NULL,
        terminal         boolean NOT NULL DEFAULT false,
        transaction_hash text,
        block_number     bigint,
        error_code       text,
        message          text,
        retry_count      integer NOT NULL DEFAULT 0,
        replay_key       text,
        accepted_at      timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Retention sweeps read terminal rows by recency; nothing else does.
    await this.db.query(
      `CREATE INDEX IF NOT EXISTS request_status_terminal_recency_idx
         ON request_status (terminal, updated_at DESC, seq DESC)`,
    );
    // The live status row is the replay owner. This removes a redundant write
    // from acceptance while making retention reclaim ownership automatically.
    await this.db.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS request_status_replay_key_unique_idx
         ON request_status (replay_key) WHERE replay_key IS NOT NULL`,
    );

    // Replay/dedup keys: "have we already paid for this signed request?".
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS replay_keys (
        replay_key text PRIMARY KEY,
        request_id text NOT NULL,
        row_target text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.db.query(
      `CREATE INDEX IF NOT EXISTS replay_keys_request_idx
         ON replay_keys (request_id)`,
    );

    // One public query for the whole acceptance. Keeping this logic in a
    // VOLATILE database function is deliberate: after an INSERT waits on a
    // concurrent replay-key claimant, the following SELECT gets a fresh
    // command snapshot and can return that claimant's status. A writable CTE
    // was measured and was slightly slower for PgLite's durable write floor.
    await this.db.query(`
      CREATE OR REPLACE FUNCTION batcher_record_accepted(
        p_replay_key text,
        p_request_id text,
        p_row_target text,
        p_address text,
        p_address_type integer,
        p_ts text,
        p_signature text,
        p_input text,
        p_retry_count integer,
        p_payload text,
        p_content_key text,
        p_queue_request_id text
      ) RETURNS TABLE (
        request_id text,
        row_target text,
        address text,
        state text,
        terminal boolean,
        transaction_hash text,
        block_number bigint,
        error_code text,
        message text,
        retry_count integer,
        replay_key text,
        accepted_at timestamptz,
        updated_at timestamptz,
        outcome_created boolean,
        outcome_duplicate boolean
      ) LANGUAGE plpgsql VOLATILE AS $$
      DECLARE
        v_status request_status%ROWTYPE;
        v_created boolean := false;
      BEGIN
        INSERT INTO request_status
          (request_id, row_target, address, state, terminal, retry_count, replay_key)
        VALUES
          (p_request_id, p_row_target, p_address, 'queued', false,
           p_retry_count, p_replay_key)
        ON CONFLICT DO NOTHING
        RETURNING * INTO v_status;
        v_created := FOUND;

        IF NOT v_created THEN
          IF p_replay_key IS NOT NULL THEN
            SELECT s.* INTO v_status
              FROM request_status s
             WHERE s.replay_key = p_replay_key;
            IF FOUND THEN
              RETURN QUERY SELECT
                v_status.request_id, v_status.row_target, v_status.address,
                v_status.state, v_status.terminal,
                v_status.transaction_hash, v_status.block_number,
                v_status.error_code, v_status.message, v_status.retry_count,
                v_status.replay_key, v_status.accepted_at, v_status.updated_at,
                false, true;
              RETURN;
            END IF;
          END IF;
          SELECT s.* INTO STRICT v_status
            FROM request_status s
           WHERE s.request_id = p_request_id;
        END IF;

        INSERT INTO pending_inputs
          (content_key, request_id, row_target, address, address_type, ts,
           signature, input, retry_count, payload)
        VALUES
          (p_content_key, p_queue_request_id, p_row_target, p_address,
           p_address_type, p_ts, p_signature, p_input, p_retry_count, p_payload);

        RETURN QUERY SELECT
          v_status.request_id, v_status.row_target, v_status.address,
          v_status.state, v_status.terminal,
          v_status.transaction_hash, v_status.block_number,
          v_status.error_code, v_status.message, v_status.retry_count,
          v_status.replay_key, v_status.accepted_at, v_status.updated_at,
          v_created, false;
      END;
      $$
    `);
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
    const stale = await this.db.query<{ content_key: string; seq: string }>(
      "SELECT content_key, seq FROM pending_inputs WHERE request_id = ''",
    );
    if (stale.length === 0) return;
    await this.db.transaction(async (tx) => {
      for (const row of stale) {
        await tx.query(
          "UPDATE pending_inputs SET request_id = $1 WHERE content_key = $2 AND seq = $3",
          [requestIdFromKey(row.content_key), row.content_key, row.seq],
        );
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
    const legacyPath = `${this.dataDirectory}/${LEGACY_QUEUE_FILE}`;
    let raw: string;
    try {
      raw = await readFile(legacyPath, "utf-8");
    } catch (error) {
      if (isNotFoundError(error)) return;
      throw error;
    }

    const [{ count }] = await this.db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pending_inputs",
    );
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
    const synthesized = await this.db.query<{ request_id: string }>(
      `INSERT INTO request_status
         (request_id, row_target, address, state, terminal, retry_count, accepted_at, updated_at)
       SELECT p.request_id,
              min(p.row_target),
              min(p.address),
              'queued',
              false,
              min(p.retry_count),
              min(p.created_at),
              now()
         FROM pending_inputs p
         LEFT JOIN request_status s ON s.request_id = p.request_id
        WHERE s.request_id IS NULL
        GROUP BY p.request_id
       RETURNING request_id`,
    );

    const [orphans] = await this.db.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM request_status s
        WHERE NOT s.terminal
          AND NOT EXISTS (
            SELECT 1 FROM pending_inputs p WHERE p.request_id = s.request_id
          )`,
    );

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
    tx: SqlExecutor,
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
    await tx.query(
      `INSERT INTO pending_inputs
         (content_key, request_id, row_target, address, address_type, ts, signature, input, retry_count, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        contentKey,
        requestId,
        resolvedTarget,
        row.address,
        row.addressType,
        row.timestamp,
        row.signature ?? "",
        row.input,
        row.retryCount ?? 0,
        payload,
      ],
    );
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
      const rows = await this.db.query<PayloadRow>(
        "SELECT payload FROM pending_inputs ORDER BY seq",
      );
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
      const rows = await this.db.query<PayloadRow>(
        `SELECT payload FROM pending_inputs
          WHERE (CASE WHEN row_target IS NULL OR row_target = '' THEN $2 ELSE row_target END) = $1
          ORDER BY seq`,
        [target, defaultTarget],
      );
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
        const [{ count }] = await tx.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM pending_inputs",
        );
        const deleted = await tx.query<{ one: number }>(
          `DELETE FROM pending_inputs
            WHERE content_key IN (${placeholders(keys.length)})
            RETURNING 1 AS one`,
          keys,
        );
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
      const [row] = await this.db.query<{ count: number; size: string }>(
        `SELECT count(*)::int AS count,
                COALESCE(sum(length(payload)), 0)::bigint AS size
           FROM pending_inputs`,
      );
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
        const rows = await tx.query<
          { content_key: string; seq: string; retry_count: number; payload: string }
        >(
          `SELECT content_key, seq, retry_count, payload
             FROM pending_inputs
            WHERE content_key IN (${placeholders(keys.length)})
            ORDER BY seq
              FOR UPDATE`,
          keys,
        );

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
            await tx.query(
              "DELETE FROM pending_inputs WHERE content_key = $1 AND seq = $2",
              [row.content_key, row.seq],
            );
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
          await tx.query(
            `UPDATE pending_inputs SET retry_count = $1, payload = $2
              WHERE content_key = $3 AND seq = $4`,
            [newRetryCount, payload, row.content_key, row.seq],
          );
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
      await this.db.query("DELETE FROM pending_inputs");
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
        const aged = await tx.query<{ request_id: string }>(
          `DELETE FROM request_status
            WHERE terminal
              AND updated_at < now() - ($1::bigint * interval '1 millisecond')
            RETURNING request_id`,
          [Math.floor(ttlMs)],
        );
        const overflow = await tx.query<{ request_id: string }>(
          `DELETE FROM request_status rs
             USING (
               SELECT request_id,
                      row_number() OVER (ORDER BY updated_at DESC, seq DESC) AS rn
                 FROM request_status
                WHERE terminal
             ) ranked
            WHERE rs.request_id = ranked.request_id
              AND ranked.rn > $1
            RETURNING rs.request_id`,
          [Math.floor(keepCount)],
        );

        const removed = [...aged, ...overflow].map((row) => row.request_id);
        if (removed.length > 0) {
          await tx.query(
            `DELETE FROM replay_keys
              WHERE request_id IN (${placeholders(removed.length)})`,
            removed,
          );
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
      const [outcome] = await this.db.query<StatusRow & {
        outcome_created: boolean;
        outcome_duplicate: boolean;
      }>(
        `SELECT * FROM batcher_record_accepted(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )`,
        [
          replayKey ?? null,
          requestId,
          resolvedTarget,
          row.address,
          row.addressType,
          row.timestamp,
          row.signature ?? "",
          row.input,
          row.retryCount ?? 0,
          payload,
          contentKey,
          requestIdFromKey(contentKey),
        ],
      );

      const record = toStatusRecord(outcome);
      if (outcome.outcome_duplicate) {
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
      if (!outcome.outcome_created) {
        console.log(
          `[Storage] Request ${requestId.substring(0, 12)}… was already tracked ` +
            `(state=${record.state}); keeping its existing record.`,
        );
      }
      return { requestId, created: outcome.outcome_created, record };
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
        const [currentRow] = await tx.query<StatusRow>(
          "SELECT * FROM request_status WHERE request_id = $1 FOR UPDATE",
          [requestId],
        );
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

        const [updated] = await tx.query<StatusRow>(
          `UPDATE request_status SET
             state            = $2,
             terminal         = $3,
             transaction_hash = COALESCE($4, transaction_hash),
             block_number     = COALESCE($5::bigint, block_number),
             error_code       = COALESCE($6, error_code),
             message          = COALESCE($7, message),
             retry_count      = COALESCE($8::int, retry_count),
             updated_at       = now()
           WHERE request_id = $1
           RETURNING *`,
          [
            requestId,
            state,
            TERMINAL_STATES.has(state),
            detail.transactionHash ?? null,
            // Every detail field is COALESCEd: a transition that knows less
            // than its predecessor must not erase the hash a caller needs.
            detail.blockNumber === undefined
              ? null
              : String(detail.blockNumber),
            detail.errorCode ?? null,
            detail.message ?? null,
            detail.retryCount ?? null,
          ],
        );
        return { applied: true as const, record: toStatusRecord(updated) };
      });
    } catch (error) {
      console.error("Error recording request transition:", error);
      throw new Error(`Failed to record request transition: ${error}`);
    }
  }

  async getStatus(requestId: string): Promise<RequestStatusRecord | undefined> {
    try {
      const [row] = await this.db.query<StatusRow>(
        "SELECT * FROM request_status WHERE request_id = $1",
        [requestId],
      );
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
      const [row] = await this.db.query<StatusRow>(
        `SELECT s.* FROM request_status s WHERE s.replay_key = $1`,
        [replayKey],
      );
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
