// @solana-midnight-bridge/database — migrations and pgtyped queries.
//
// - bridge_transfers: owned by the state machine (observed -> completed,
//   idempotent upserts keyed by (direction, source_id)).
// - relayer_jobs: owned by the relayer (attempts, last tx, last error).
//
// Regenerate sql/queries.queries.ts after editing sql/queries.sql:
//   bun run pgtyped:update   (starts an in-process PGLite on a random port)
export * from "./sql/queries.queries.ts";
export { migrationTable } from "./migration-order.ts";
