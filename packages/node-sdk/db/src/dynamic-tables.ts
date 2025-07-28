import { until } from "effection";
import { ConfigPrimitiveType } from "@paima/config";
import { erc20Ivm } from "./ivm/erc20-ivm.ts";
import { erc721Ivm } from "./ivm/erc721-ivm.ts";
// import type { AllSyncProtocols } from "@paima/sync";
import type { PoolClient } from "pg";
import { aquireDBMutex, releaseDBMutex } from "@paima/db";

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
  dbConn: PoolClient,
  syncProtocols: any[], //AllSyncProtocols[],
) {
  try {
    yield* aquireDBMutex("creating-dynamic-tables");
    for (const syncProtocol of syncProtocols) {
      for (const primitive of syncProtocol.config.primitives) {
        switch (primitive.primitive.type) {
          case ConfigPrimitiveType.EvmRpcERC20:
            // TODO These dynamic queries can be improved.
            yield* until(dbConn.query(erc20Ivm(primitive.primitive.name)));
            break;
          case ConfigPrimitiveType.EvmRpcERC721:
            yield* until(dbConn.query(erc721Ivm(primitive.primitive.name)));
            break;
          default:
            // No IVM for this primitive type
        }
      }
    }
  } finally {
    releaseDBMutex();
  }
}

// TODO The prefix should be part defined in the ivm/*.ts files.
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
      return "erc20_balances_view_";
    case ConfigPrimitiveType.EvmRpcERC721:
      return "erc721_ownership_view_";
    default:
      return undefined;
  }
}
