/**
 * What a `new Batcher(config)` gets when it is not handed a storage backend
 * (spec Addendum A FR-012/FR-012b, as amended by Addendum B FR-018/FR-019).
 *
 * A default is not a detail here: almost nothing passes `storage` explicitly,
 * so whatever this function returns is what every template, every dev loop and
 * every deployment actually runs.
 *
 * The ladder has three rungs and two refusals:
 *
 *   BATCHER_PGLITE=true      → this batcher's OWN embedded PgLite database at
 *                              BATCHER_PGLITE_DATA_DIR. Full request tracking,
 *                              nothing to install, nothing to connect to.
 *                              DEVELOPMENT ONLY by policy.
 *   BATCHER_DB_SCHEMA set    → connected `DatabaseStorage`, built from the
 *                              engine's own DB_* keys, owning the schema
 *                              `batcher_<value>`. Request tracking, replay
 *                              protection and `/input-status` all work.
 *   neither                  → `FileStorage` at ./batcher-data — byte-for-byte
 *                              the pre-#873 default, so a bare `new Batcher()`
 *                              still boots with no environment at all. Queue
 *                              only: no tracking, no replay protection, no
 *                              polling. DEVELOPMENT ONLY by policy, and said
 *                              out loud at startup.
 *   BOTH set                 → refuse to boot. They are two different answers
 *                              to "where does this batcher keep its records",
 *                              and guessing between them is how a stray dev
 *                              flag moves a production batcher off its real
 *                              database onto a local file nobody watches.
 *   set but unusable         → refuse to boot. Never fall back: the key is a
 *                              statement of intent, and an operator who
 *                              believes tracking is on must not be quietly
 *                              running without it.
 *
 * Why embedded exists at all, given Addendum A said "never embed": Phase 6
 * MEASURED that the launcher's development gateway multiplexes every TCP
 * client onto ONE PgLite session, so a batcher pinning `search_path` there
 * repoints the ENGINE's connections and breaks its queries. Development
 * tracking cannot come from that server by any mechanism. A private in-process
 * instance can't touch it, because there is nothing to touch it WITH: the
 * embedded engine is a WASM library, it binds no socket and opens no port, and
 * two of them are separated by nothing more exotic than two directories.
 *
 * The engine's own `PGLITE` key takes NO part in this decision. It describes
 * the ENGINE's database and is `true` by default in development, so reading it
 * here would hand an embedded database to every batcher that never asked for
 * one. It appears below exactly once, in the shape of the CONNECTED rung's
 * pool (mirroring `getConnection()`, FR-012) — never in the choice of rung.
 *
 * The environment is consulted ONLY when no storage argument was passed. An
 * explicit `new Batcher(config, new FileStorage(...))` means exactly what it
 * says, everywhere — including when the environment here would have refused.
 */

import { ENV } from "@effectstream/utils/node-env";

import type { DefaultBatcherInput } from "./types.ts";
import type { BatcherStorage } from "./storage.ts";
import { FileStorage } from "./storage.ts";
import { DatabaseStorage } from "./database-storage.ts";

/** Where the queue-only fallback keeps its file — the pre-#873 location. */
export const FALLBACK_DATA_DIRECTORY = "./batcher-data";

/** The key that turns on connected request tracking, in dev and in production. */
export const SCHEMA_ENV_KEY = "BATCHER_DB_SCHEMA";

/** The key that gives this batcher its own embedded database (development). */
export const EMBEDDED_ENV_KEY = "BATCHER_PGLITE";

/** Where that embedded database lives — and the only thing isolating two of them. */
export const EMBEDDED_DATA_DIR_ENV_KEY = "BATCHER_PGLITE_DATA_DIR";

/** Why this batcher cannot answer "what happened to request X". */
export type TrackingDisabledReason = "queue-only-storage";

export interface RequestTrackingInfo {
  enabled: boolean;
  /** Machine-readable, present only when disabled. */
  reason?: TrackingDisabledReason;
  /** The single setting that would enable it. */
  enableWith?: string;
  /** What is not available, so an operator does not have to infer it. */
  disabled?: string[];
}

/** What the fallback costs, in the operator's terms rather than the code's. */
export const TRACKING_DISABLED_CAPABILITIES = [
  "durable request tracking (GET /input-status/:requestId)",
  "replay/dedup protection against paying twice for one signed request",
  "status retention and boot reconciliation",
];

/**
 * Said once, at startup, and deliberately hard to scroll past.
 *
 * The alternative is discovering it one 501 at a time, which is how an
 * operator concludes the feature is broken rather than switched off.
 */
function announceFallback(): void {
  const line = "═".repeat(78);
  console.warn(
    `\n${line}\n` +
      `⚠️  BATCHER REQUEST TRACKING IS OFF — DEVELOPMENT-ONLY QUEUE MODE\n` +
      `${line}\n` +
      `${SCHEMA_ENV_KEY} is not set, so this batcher is running on FileStorage\n` +
      `in ${FALLBACK_DATA_DIRECTORY}. Inputs are still queued, batched, retried and\n` +
      `submitted exactly as before — but the following do NOT work:\n` +
      TRACKING_DISABLED_CAPABILITIES.map((item) => `  • ${item}\n`).join("") +
      `\n` +
      `Production deployments MUST set ${SCHEMA_ENV_KEY}. Set it to a short name\n` +
      `for this batcher (lowercase letters, digits, underscores) and it will\n` +
      `connect to the database described by DB_HOST/DB_PORT/DB_USER/DB_NAME and\n` +
      `own the schema "batcher_<value>" there. Example: ${SCHEMA_ENV_KEY}=chess_v2\n` +
      `\n` +
      `In DEVELOPMENT, ${EMBEDDED_ENV_KEY}=true instead gives this batcher its own\n` +
      `embedded database in ${EMBEDDED_DATA_DIR_ENV_KEY} (default\n` +
      `${FALLBACK_DATA_DIRECTORY}) — same tracking, no server, no port. Set one or\n` +
      `the other, never both.\n` +
      `${line}\n`,
  );
}

/**
 * Where the embedded engine lives.
 *
 * An explicitly empty value is NOT the default: `ENV.getString` is
 * `value ?? default`, and "" is not nullish, so `BATCHER_PGLITE_DATA_DIR=`
 * arrives here as "" — which PgLite would read as the process's working
 * directory, where `initdb` refuses to initialise anything it did not create.
 * The resulting error names a WASM exit code, not the variable that caused it,
 * so the empty case is resolved here instead.
 */
function embeddedDataDirectory(): string {
  const configured = ENV.BATCHER_PGLITE_DATA_DIR.trim();
  return configured === "" ? FALLBACK_DATA_DIRECTORY : configured;
}

/**
 * Build the connection the same way the engine's `getConnection()` does, so a
 * batcher inside a deployment needs no configuration of its own beyond the one
 * key: same host, same database, same credentials as every other component.
 */
function connectionFromEnvironment() {
  return {
    host: ENV.DB_HOST,
    port: ENV.DB_PORT,
    user: ENV.DB_USER,
    database: ENV.DB_NAME,
    // Mirrors getConnection(): the development gateway authenticates with
    // `trust` and serialises everything through one WASM backend, so it takes
    // no password and there is nothing to gain from a second connection.
    password: ENV.PGLITE ? undefined : ENV.DB_PW,
    max: ENV.PGLITE ? 1 : 10,
  };
}

/**
 * Resolve the default backend from the environment.
 *
 * Throws when the two selection keys contradict each other, and when
 * `BATCHER_DB_SCHEMA` is set to something that cannot be a schema suffix —
 * that is FR-013's and FR-019's fail-closed boot, and it happens here, at
 * construction, for the same reason the config validator refuses a bad
 * retention ratio there: the earliest honest moment.
 */
export function resolveDefaultStorage<
  T extends DefaultBatcherInput = DefaultBatcherInput,
>(): BatcherStorage<T> {
  // "" and "unset" are the same answer from the ENV class (a key with no
  // default returns "" when absent, and an explicitly empty value is not
  // nullish either), which is exactly the semantics FR-012 asks for.
  const schema = ENV.BATCHER_DB_SCHEMA;
  const embedded = ENV.BATCHER_PGLITE;

  if (embedded && schema) {
    // FR-019. Not a precedence rule, deliberately: whichever way a precedence
    // rule fell, one of the two operators who set these keys would be running
    // something other than what they asked for, and would have no way to tell.
    throw new Error(
      `${EMBEDDED_ENV_KEY} and ${SCHEMA_ENV_KEY} are both set, and they ask ` +
        `for different databases: ${EMBEDDED_ENV_KEY}=true means this batcher ` +
        `keeps its records in its OWN embedded database at ` +
        `${embeddedDataDirectory()}, while ${SCHEMA_ENV_KEY}=${JSON.stringify(schema)} ` +
        `means it keeps them in the schema "batcher_${schema}" of the shared ` +
        `database at DB_HOST/DB_PORT/DB_USER/DB_NAME. Refusing to guess which ` +
        `one you meant. Unset ${EMBEDDED_ENV_KEY} to use the shared database ` +
        `(the production configuration), or unset ${SCHEMA_ENV_KEY} to use the ` +
        `embedded one (development only, and note that its records are not ` +
        `visible to anything else).`,
    );
  }

  if (embedded) {
    // The EXISTING embedded engine, unchanged since Phase 1: the database
    // lives in the directory's "pglite" subdirectory and a legacy
    // pending-inputs.jsonl sitting beside it is imported once. No schema is
    // passed, because a private database has nothing to isolate itself from
    // (FR-015's reasoning, now reached by environment as well as by argument).
    return new DatabaseStorage<T>({ dataDirectory: embeddedDataDirectory() });
  }

  if (!schema) {
    announceFallback();
    return new FileStorage<T>(FALLBACK_DATA_DIRECTORY);
  }

  return new DatabaseStorage<T>({
    connection: connectionFromEnvironment(),
    schema,
    schemaSource: SCHEMA_ENV_KEY,
    // No dataDirectory, deliberately (FR-016): a connected batcher has no
    // embedded engine to house and no legacy queue to go looking for.
  });
}

/**
 * Describe the tracking capability of a backend, for health surfaces and for
 * the 501 the polling route answers when there is nothing to poll.
 */
export function describeRequestTracking(enabled: boolean): RequestTrackingInfo {
  if (enabled) return { enabled: true };
  return {
    enabled: false,
    reason: "queue-only-storage",
    enableWith: SCHEMA_ENV_KEY,
    disabled: [...TRACKING_DISABLED_CAPABILITIES],
  };
}
