/**
 * The batcher's schema identity in a shared database (spec Addendum A, FR-013).
 *
 * Several batchers share ONE database — in development that is the launcher's
 * single PgLite instance behind its pg-gateway, in production a real Postgres.
 * Target names are not unique across products (`paimaL2` is used by four of
 * them), so two batchers sharing a database without isolation would fetch each
 * other's queue rows and share one global replay-key space. A schema per
 * batcher is what makes sharing safe, and it behaves identically on both.
 *
 * The operator supplies a SUFFIX and the code applies a fixed `batcher_`
 * prefix. That is not decoration: it makes two rules true by construction —
 * the effective schema can never be `public` (where the engine's own tables
 * live) and it can never collide with another component's schema — and it
 * spends 8 of Postgres' 63-character identifier budget, which is why the
 * suffix is capped at 55.
 *
 * SECURITY NOTE: a schema name cannot be a bind parameter. `CREATE SCHEMA` and
 * `SET search_path` take it as literal SQL text, so the pattern below is the
 * only barrier between an environment variable and arbitrary statements. It is
 * a whitelist, anchored at both ends, and nothing here tries to sanitise a
 * value that fails it — a bad name is refused, never repaired.
 */

export const BATCHER_SCHEMA_PREFIX = "batcher_";

/**
 * Lowercase letters, digits and underscores only, 1–55 characters.
 *
 * Anchored deliberately: an unanchored pattern would accept
 * `ok\nDROP SCHEMA public` because `RegExp.test` is happy to match a single
 * line of a multi-line string.
 *
 * Lowercase-only because Postgres folds unquoted identifiers to lowercase but
 * keeps quoted ones verbatim — accepting `Chess` would make the name in the
 * operator's config and the name of the schema the batcher owns two different
 * things depending on how a later statement spells it.
 */
export const BATCHER_SCHEMA_VALUE_PATTERN = /^[a-z0-9_]{1,55}$/;

/** The same rule applied to an already-prefixed, effective schema name. */
const EFFECTIVE_SCHEMA_PATTERN = /^batcher_[a-z0-9_]{1,55}$/;

export interface BatcherSchemaResolution {
  /** The effective schema name: `batcher_` + the supplied value. */
  schema: string;
  /** Non-fatal operator advice, to be logged by the caller. */
  warning?: string;
}

/**
 * Validate a supplied schema suffix and return the schema this batcher owns.
 *
 * Throws on anything the pattern rejects — that is the FR-013 fail-closed
 * boot: a batcher told to isolate itself and unable to do so must not start,
 * because the operator believes tracking is on and isolated.
 *
 * @param value the SUFFIX, as supplied by the operator (not prefixed).
 * @param source what to call the setting in the refusal, so the message points
 * at the thing the reader can actually change.
 */
export function resolveBatcherSchema(
  value: string,
  source: string = "BATCHER_DB_SCHEMA",
): BatcherSchemaResolution {
  if (!BATCHER_SCHEMA_VALUE_PATTERN.test(value)) {
    throw new Error(
      `Invalid ${source} value ${JSON.stringify(value)}: a batcher schema ` +
        `suffix must match ^[a-z0-9_]{1,55}$ (lowercase letters, digits and ` +
        `underscores; 55 characters is Postgres' 63-character identifier ` +
        `budget minus the fixed "${BATCHER_SCHEMA_PREFIX}" prefix the batcher ` +
        `applies). Refusing to start rather than running with an isolation ` +
        `boundary that was asked for and not established. Unset ${source} ` +
        `entirely to run queue-only on FileStorage (development only).`,
    );
  }

  const schema = `${BATCHER_SCHEMA_PREFIX}${value}`;

  // Harmless — `batcher_batcher_x` is a perfectly good schema — but it is
  // nearly always someone pasting the EFFECTIVE name back into the setting,
  // and the symptom (an empty-looking batcher pointing at a schema nobody
  // else uses) is indistinguishable from a fresh deployment.
  const warning = value.startsWith(BATCHER_SCHEMA_PREFIX)
    ? `⚠️ [Storage] ${source}=${JSON.stringify(value)} already starts with ` +
      `"${BATCHER_SCHEMA_PREFIX}", so this batcher owns the schema ` +
      `"${schema}" (the prefix is applied by the code). If you meant the ` +
      `schema "${value}", set ${source}=${
        JSON.stringify(value.slice(BATCHER_SCHEMA_PREFIX.length))
      }.`
    : undefined;

  return warning === undefined ? { schema } : { schema, warning };
}

/**
 * Quote an effective schema name for interpolation into DDL.
 *
 * Re-validates rather than trusting its caller: this is the last thing between
 * a schema name and a statement, and the cost of the second check is one regex
 * per connection against the cost of the first check having been skipped on
 * some future code path.
 */
export function quoteSchemaIdentifier(schema: string): string {
  if (!EFFECTIVE_SCHEMA_PATTERN.test(schema)) {
    throw new Error(
      `Refusing to interpolate ${JSON.stringify(schema)} as a schema ` +
        `identifier: an effective batcher schema is "${BATCHER_SCHEMA_PREFIX}" ` +
        `followed by ^[a-z0-9_]{1,55}$.`,
    );
  }
  return `"${schema}"`;
}
