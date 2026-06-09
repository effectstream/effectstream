import { PrimitiveTypeEVMERC1155 } from "../builtin.ts";
import type { MaterializedViewStrategy } from "@effectstream/db";

/**
 * Creates a new IVM for the ERC1155 token with the given name.
 * This will track the current owner of each token.
 * @param name - The name of the ERC1155 token.
 * @param strategy - How to publish the read-side view (pg_ivm or plain VIEW).
 * @returns A string containing the SQL script to create the IVM.
 */
export function erc1155Ivm(name: string, strategy: MaterializedViewStrategy) {
  const lowerName = name.toLowerCase();
  const validSQLName = lowerName.replace(/[^a-zA-Z0-9_]/g, "");
  if (validSQLName !== lowerName) {
    throw new Error(`Invalid name: ${name}`);
  }

  const ownershipTable =
    `primitives.erc1155_ownership_intermediate_${validSQLName}`;
  const viewName = `primitives.erc1155_ownership_view_${validSQLName}`;
  const selectSql =
    `SELECT primitive_name, token_id, owner_address, amount FROM ${ownershipTable} WHERE amount > 0`;

  return `
  -- Intermediate table for current ERC1155 ownership (maintained by triggers)
  CREATE TABLE ${ownershipTable} (
      primitive_name TEXT NOT NULL,
      token_id TEXT NOT NULL,
      owner_address TEXT NOT NULL,
      amount BIGINT NOT NULL,
      last_transfer_block_height INTEGER NOT NULL,
      last_transfer_id INTEGER NOT NULL,
      PRIMARY KEY (primitive_name, token_id, owner_address)
  );

  -- Trigger function to maintain current ownership
  CREATE OR REPLACE FUNCTION update_erc1155_ownership_${validSQLName}() RETURNS TRIGGER AS $$
  BEGIN
      -- Only process ERC1155 transfers for this specific primitive
      IF NEW.payload_type = '${PrimitiveTypeEVMERC1155}' AND NEW.primitive_name = '${name}' THEN
          -- Decrease balance of the sender if it's not a mint operation
          IF NOT (NEW.payload->>'isMint')::boolean THEN
              UPDATE ${ownershipTable}
              SET amount = amount - (NEW.payload->>'amount')::bigint,
                  last_transfer_block_height = NEW.effectstream_block_height,
                  last_transfer_id = NEW.id
              WHERE primitive_name = NEW.primitive_name
                AND token_id = NEW.payload->>'tokenId'
                AND owner_address = lower(NEW.payload->>'from');
              
              -- Clean up entries with no tokens left
              DELETE FROM ${ownershipTable}
              WHERE primitive_name = NEW.primitive_name
                AND token_id = NEW.payload->>'tokenId'
                AND owner_address = lower(NEW.payload->>'from')
                AND amount <= 0;
          END IF;

          -- Increase balance of the receiver if it's not a burn operation
          IF NOT (NEW.payload->>'isBurn')::boolean THEN
              INSERT INTO ${ownershipTable} (
                  primitive_name,
                  token_id,
                  owner_address,
                  amount,
                  last_transfer_block_height,
                  last_transfer_id
              ) VALUES (
                  NEW.primitive_name,
                  NEW.payload->>'tokenId',
                  lower(NEW.payload->>'to'),
                  (NEW.payload->>'amount')::bigint,
                  NEW.effectstream_block_height,
                  NEW.id
              )
              ON CONFLICT (primitive_name, token_id, owner_address) DO UPDATE SET
                  amount = ${ownershipTable}.amount + (NEW.payload->>'amount')::bigint,
                  last_transfer_block_height = NEW.effectstream_block_height,
                  last_transfer_id = NEW.id;
          END IF;
      END IF;
      
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  -- Create trigger on primitive_accounting
  CREATE TRIGGER trigger_update_erc1155_ownership_${validSQLName}
      AFTER INSERT ON effectstream.primitive_accounting
      FOR EACH ROW
      EXECUTE FUNCTION update_erc1155_ownership_${validSQLName}();

  -- Publish the read-side view (incrementally maintained or plain, per strategy)
  ${strategy.createView(viewName, selectSql)}
  `;
}

// Naming helpers kept in this file to co-locate schema naming with IVM DDL
export const ERC1155_VIEW_PREFIX = "erc1155_ownership_view_" as const;
export const ERC1155_INTERMEDIATE_PREFIX =
  "erc1155_ownership_intermediate_" as const;
