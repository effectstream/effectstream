import { until } from "effection";
import { ConfigPrimitiveType } from "@paima/config";
import {
  ERC20_INTERMEDIATE_PREFIX,
  ERC20_VIEW_PREFIX,
  erc20Ivm,
} from "./ivm/erc20-ivm.ts";
import {
  ERC721_INTERMEDIATE_PREFIX,
  ERC721_VIEW_PREFIX,
  erc721Ivm,
} from "./ivm/erc721-ivm.ts";
import type { AllSyncProtocols } from "@paima/sync";
import type { PoolClient } from "pg";
import { applyMigrations } from "@paima/db/apply-migrations";
import type { VersionInfo } from "@paima/db/version";

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
  syncProtocols: AllSyncProtocols[],
) {
  // TODO We need to check the database if the dynamic tables already exist.
  //      This is for when the node restarts, but continues executing from the last block height.

  for (const syncProtocol of syncProtocols) {
    for (const primitive of syncProtocol.config.primitives) {
      switch (primitive.primitive.type) {
        case ConfigPrimitiveType.EvmRpcERC20:
          yield* until(applyMigrations(
            dbConn,
            lastBlockHeight,
            `dynamic-tables-${primitive.primitive.type}-${primitive.primitive.name}`,
            erc20Ivm(primitive.primitive.name),
            true,
          ));
          break;
        case ConfigPrimitiveType.EvmRpcERC721:
          yield* until(applyMigrations(
            dbConn,
            lastBlockHeight,
            `dynamic-tables-${primitive.primitive.type}-${primitive.primitive.name}`,
            erc721Ivm(primitive.primitive.name),
            true,
          ));
          break;
        default:
          // No IVM for this primitive type
      }
    }
  }
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
  switch (primitiveType) {
    case ConfigPrimitiveType.EvmRpcERC20:
      return ERC20_VIEW_PREFIX;
    case ConfigPrimitiveType.EvmRpcERC721:
      return ERC721_VIEW_PREFIX;
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
  switch (primitiveType) {
    case ConfigPrimitiveType.EvmRpcERC20:
      return ERC20_INTERMEDIATE_PREFIX;
    case ConfigPrimitiveType.EvmRpcERC721:
      return ERC721_INTERMEDIATE_PREFIX;
    default:
      return undefined;
  }
}
