/**
 * Strategy for publishing the read-side relation that primitives query
 * (e.g. `primitives.erc20_balances_view_<name>`).
 *
 * The intermediate table and the maintenance trigger are identical in both
 * modes — only how the view itself is created differs. The query API
 * (`SELECT * FROM primitives.<viewName>`) is unchanged across strategies.
 */
export interface MaterializedViewStrategy {
  /**
   * Stable identifier used to namespace migration rows per strategy.
   * Empty string for the legacy pg_ivm strategy, so its migration rows keep
   * the same names that existing deployments already have in their
   * `effectstream_migration_history`. Only the new fallback strategy uses a
   * suffixed name. This avoids re-applying dynamic-table DDL (which would
   * fail on already-existing triggers/IMMVs) when an existing app upgrades.
   */
  readonly migrationSuffix: "" | "-view";
  /** Emit DDL that publishes `viewName` as a queryable relation backed by `selectSql`. */
  createView(viewName: string, selectSql: string): string;
}

/**
 * Uses the `pg_ivm` extension to create an incrementally maintained
 * materialized view. Requires the extension to be installed in the database.
 *
 * Migration rows for this strategy use the historical unsuffixed name
 * (`dynamic-tables-<type>-<name>`) so deployments that were already running
 * the engine before the strategy pattern existed keep matching their
 * previously-applied rows on upgrade — no re-application, no DDL conflicts.
 */
export const pgIvmStrategy: MaterializedViewStrategy = {
  migrationSuffix: "",
  createView: (viewName, selectSql) =>
    `SELECT pgivm.create_immv('${viewName}', $IVM$${selectSql}$IVM$);`,
};

/**
 * Fallback: a plain SQL view computed on read. The intermediate table is
 * still trigger-maintained, so the only extra cost is re-applying the
 * (typically cheap) WHERE filter at query time.
 *
 * Migration rows use a `-view` suffix to keep this strategy's history
 * distinct from the pg_ivm strategy's.
 */
export const plainViewStrategy: MaterializedViewStrategy = {
  migrationSuffix: "-view",
  createView: (viewName, selectSql) =>
    `CREATE OR REPLACE VIEW ${viewName} AS ${selectSql};`,
};
