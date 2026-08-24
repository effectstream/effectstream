/**
 * What a `new Batcher(config)` gets when it is not handed a storage backend
 * (spec Addendum A, FR-012 / FR-012b).
 *
 * A default is not a detail here: almost nothing passes `storage` explicitly,
 * so whatever this function returns is what every template, every dev loop and
 * every deployment actually runs.
 *
 * The ladder has exactly two rungs and one refusal:
 *
 *   BATCHER_DB_SCHEMA set    → connected `DatabaseStorage`, built from the
 *                              engine's own DB_* keys, owning the schema
 *                              `batcher_<value>`. Request tracking, replay
 *                              protection and `/input-status` all work.
 *   BATCHER_DB_SCHEMA unset  → `FileStorage` at ./batcher-data — byte-for-byte
 *                              the pre-#873 default, so a bare `new Batcher()`
 *                              still boots with no environment at all. Queue
 *                              only: no tracking, no replay protection, no
 *                              polling. DEVELOPMENT ONLY by policy, and said
 *                              out loud at startup.
 *   set but unusable         → refuse to boot. Never fall back: the key is a
 *                              statement of intent, and an operator who
 *                              believes tracking is on must not be quietly
 *                              running without it.
 *
 * The environment is consulted ONLY when no storage argument was passed. An
 * explicit `new Batcher(config, new FileStorage(...))` means exactly what it
 * says, everywhere.
 */

import { ENV } from "@effectstream/utils/node-env";

import type { DefaultBatcherInput } from "./types.ts";
import type { BatcherStorage } from "./storage.ts";
import { FileStorage } from "./storage.ts";
import { DatabaseStorage } from "./database-storage.ts";

/** Where the queue-only fallback keeps its file — the pre-#873 location. */
export const FALLBACK_DATA_DIRECTORY = "./batcher-data";

/** The one key that turns request tracking on. */
export const SCHEMA_ENV_KEY = "BATCHER_DB_SCHEMA";

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
      `${line}\n`,
  );
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
 * Throws when `BATCHER_DB_SCHEMA` is set to something that cannot be a schema
 * suffix — that is FR-013's fail-closed boot, and it happens here, at
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
