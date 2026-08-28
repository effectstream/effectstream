import { until } from "effection";

// This import causes a circular dependency with the sync package.
// import type { AllSyncProtocols } from "@effectstream/sync";
import type { PoolClient } from "pg";
import type { VersionInfo } from "../migrations/system-version.ts";
import { applyMigrations } from "../scripts/apply-migrations.ts";
import { findMigrationByName } from "./sql/system.queries.ts";
import {
  type MaterializedViewStrategy,
  plainViewStrategy,
} from "./MaterializedViewStrategy.ts";

/**
 * Creates dynamic tables for the given sync protocols.
 * This is used to create the read-side relations (incrementally maintained
 * via pg_ivm when available, otherwise plain SQL views) for each primitive's
 * intermediate state.
 *
 * For example for ERC20 it creates a table that holds the balance for each address.
 * For ERC721 it creates a table that holds the token id for each address.
 *
 * @param dbConn - The database connection.
 * @param syncProtocols - The sync protocols.
 * @param strategy - How to publish the read-side view. Defaults to the plain
 *   view fallback so callers that haven't probed capabilities yet stay safe
 *   on managed Postgres without pg_ivm. The runtime detects the extension
 *   and passes `pgIvmStrategy` explicitly when available.
 */
export function* createDynamicTables(
  versionInfo: VersionInfo,
  lastBlockHeight: number,
  dbConn: Pick<PoolClient, "query">,
  syncProtocols: any[], // AllSyncProtocols[],
  strategy: MaterializedViewStrategy = plainViewStrategy,
) {
  for (const syncProtocol of syncProtocols) {
    for (const primitive of syncProtocol.config.primitives) {
      yield* createDynamicTableForPrimitive(
        primitive,
        lastBlockHeight,
        dbConn,
        strategy,
      );
    }
  }
}

function* createDynamicTableForPrimitive(
  p: {
    primitive: {
      type: string;
      name: string;
    };
  },
  lastBlockHeight: number,
  dbConn: Pick<PoolClient, "query">,
  strategy: MaterializedViewStrategy,
) {
  const type = p.primitive.type;
  const name = p.primitive.name;

  // const primitive = PrimitiveRegistry.getPrimitive(name);
  const primitive = (globalThis as any).EFFECTSTREAM_REGISTRY[name];
  if (!primitive) {
    // This should never happen.
    console.error(`Cannot find primitive ${name} in the registry. If this is custom primitive, ensure it's registered.`);
    throw new Error(`Primitive ${name} not found`);
  }
  const sqlFunction = primitive.getDynamicTables;

  // This primitive does not have dynamic tables.
  if (!sqlFunction) return;
  const code = sqlFunction(name, strategy);
  if (!code) return;

  // pgIvmStrategy uses the legacy unsuffixed name so existing deployments
  // upgrading from a pre-strategy build keep matching their previously-
  // applied migration rows. plainViewStrategy uses a `-view` suffix to keep
  // its history distinct, so a deployment that later gains or loses pg_ivm
  // re-applies the correct view-creation DDL.
  const migrationName = `dynamic-tables-${type}-${name}${strategy.migrationSuffix}`;
  const [migration] = yield* until(findMigrationByName.run({
    name: migrationName,
    isSystemMigration: true,
  }, dbConn));

  // This particular migration has been applied, so we can skip it.
  if (migration) return;

  yield* until(applyMigrations(
    dbConn as any, // Client,
    lastBlockHeight,
    migrationName,
    code,
    true,
  ));
}

/**
 * Returns the prefix for the given primitive name.
 * This is useful to query the table given you know the primitive name.
 * @param primitiveType - The type of the primitive.
 * @returns The prefix for the given primitive name.
 */
export function getPrimitivePrefix(
  primitiveType: string,
): string[] {
  const expectedPrimitive: any = Object.values(
    (globalThis as any).EFFECTSTREAM_REGISTRY,
  ).find((primitive: any) => primitive.internalTypeName === primitiveType);
  return expectedPrimitive?.getViewPrefix() || [];
}

/**
 * The intermediate prefix is used to query the intermediate table for the given primitive type.
 * The intermediate table is used to store the intermediate data for the given primitive type.
 *
 * For example for ERC20 it stores the balance for each address.
 * For ERC721 it stores the token id for each address.
 *
 * @param primitiveType - The type of the primitive.
 * @returns The intermediate prefix for the given primitive type.
 */
export function getPrimitiveIntermediatePrefix(
  primitiveType: string,
): string[] {
  const expectedPrimitive: any = Object.values(
    (globalThis as any).EFFECTSTREAM_REGISTRY,
  ).find((primitive: any) => primitive.internalTypeName === primitiveType);
  return expectedPrimitive?.getIntermediatePrefix() || [];
}
