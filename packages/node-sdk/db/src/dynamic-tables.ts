import { until } from "effection";
import { ConfigPrimitiveType } from "@paima/config";
import {
  ERC20_INTERMEDIATE_PREFIX,
  ERC20_VIEW_PREFIX,
  erc20Ivm,
} from "./ivm/erc20-ivm.ts";

// This import causes a circular dependency with the sync package.
// import type { AllSyncProtocols } from "@paima/sync";
import type { PoolClient } from "pg";
import type { VersionInfo } from "../migrations/system-version.ts";
import { applyMigrations } from "../scripts/apply-migrations.ts";
import { findMigrationByName } from "./sql/system.queries.ts";

/**
 * Creates dynamic tables for the given sync protocols.
 * This is used to create the IVMs for the given sync protocols.
 *
 * For example for ERC20 it creates a table that holds the balance for each address.
 * For ERC721 it creates a table that holds the token id for each address.
 *
 * @param dbConn - The database connection.
 * @param syncProtocols - The sync protocols.
 */
export function* createDynamicTables(
  versionInfo: VersionInfo,
  lastBlockHeight: number,
  dbConn: PoolClient,
  syncProtocols: any[], // AllSyncProtocols[],
) {
  for (const syncProtocol of syncProtocols) {
    for (const primitive of syncProtocol.config.primitives) {
      yield* createDynamicTableForPrimitive(primitive, lastBlockHeight, dbConn);
    }
  }
}

import { PaimaPrimitiveRegistry } from "@e2e/data-types";

const primitiveTypeFunctionMap: Record<string, (name: string) => string> = {
  [ConfigPrimitiveType.EvmRpcERC20]: erc20Ivm,
  // [ConfigPrimitiveType.EvmRpcERC721]: erc721Ivm,
};

function* createDynamicTableForPrimitive(
  p: {
    primitive: {
      type: ConfigPrimitiveType;
      name: string;
    };
  },
  lastBlockHeight: number,
  dbConn: PoolClient,
) {
  const type = p.primitive.type;
  const name = p.primitive.name;

  const primitive = PaimaPrimitiveRegistry.getPrimitive(name);
  const sqlFunction = primitive?.getDynamicTables ?? primitiveTypeFunctionMap[type];
  if (!sqlFunction) {
    // This primitive does not have dynamic tables.
    return;
  }

  const migrationName = `dynamic-tables-${type}-${name}`;
  const [migration] = yield* until(findMigrationByName.run({
    name: migrationName,
    isSystemMigration: true,
  }, dbConn));
  // This particular migration has been applied, so we can skip it.
  if (migration) return;
  const code = sqlFunction(name);
  if (!code) return;

  yield* until(applyMigrations(
    dbConn,
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
  primitiveType: ConfigPrimitiveType,
): string | undefined {

  const primitive = PaimaPrimitiveRegistry.getPrimitiveByType(primitiveType);
  if (primitive) {
    const viewPrefix = primitive.getViewPrefix();
    return viewPrefix[0]; 
  }

  // TODO Remove:
  // Old way of doing it, when the primitive was not a class.
  switch (primitiveType) {
    case ConfigPrimitiveType.EvmRpcERC20:
      return ERC20_VIEW_PREFIX;
    default:
      return undefined;
  }
  
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
  primitiveType: ConfigPrimitiveType,
): string | undefined {
  const primitive = PaimaPrimitiveRegistry.getPrimitiveByType(primitiveType);
  if (primitive) {
    const intermediatePrefix = primitive.getIntermediatePrefix();
    return intermediatePrefix[0];
  }

  // TODO Remove:
  // Old way of doing it, when the primitive was not a class.
  switch (primitiveType) {
    case ConfigPrimitiveType.EvmRpcERC20:
      return ERC20_INTERMEDIATE_PREFIX;
    default:
      return undefined;
  }
}
