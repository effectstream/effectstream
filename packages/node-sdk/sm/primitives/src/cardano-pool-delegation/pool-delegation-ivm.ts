import { PrimitiveTypeCardanoPoolDelegation } from "../builtin.ts";
import type { MaterializedViewStrategy } from "@effectstream/db";

export function poolDelegationIvm(
  name: string,
  strategy: MaterializedViewStrategy,
) {
  const lowerName = name.toLowerCase();
  const validSQLName = lowerName.replace(/[^a-zA-Z0-9_]/g, "");
  if (validSQLName !== lowerName) {
    throw new Error(`Invalid name: ${name}`);
  }

  const intermediateTable = `primitives.cardano_pool_delegation_intermediate_${validSQLName}`;
  const viewName = `primitives.cardano_pool_delegation_view_${validSQLName}`;
  const selectSql =
    `SELECT primitive_name, staking_credential, pool_keyhash FROM ${intermediateTable}`;

  return `
    CREATE TABLE IF NOT EXISTS ${intermediateTable} (
        primitive_name TEXT NOT NULL,
        staking_credential TEXT NOT NULL,
        pool_keyhash TEXT NOT NULL,
        epoch INTEGER NOT NULL,
        last_block_height INTEGER NOT NULL,
        last_id INTEGER NOT NULL,
        PRIMARY KEY (primitive_name, staking_credential)
    );

    CREATE OR REPLACE FUNCTION update_pool_delegation_${validSQLName}() RETURNS TRIGGER AS $$
    BEGIN
        IF NEW.payload_type = '${PrimitiveTypeCardanoPoolDelegation}'
           AND NEW.primitive_name = '${name}' THEN

            INSERT INTO ${intermediateTable} (
                primitive_name, staking_credential, pool_keyhash, epoch, last_block_height, last_id
            ) VALUES (
                NEW.primitive_name,
                NEW.payload->>'address',
                NEW.payload->>'pool',
                (NEW.payload->>'epoch')::INTEGER,
                NEW.effectstream_block_height,
                NEW.id
            )
            ON CONFLICT (primitive_name, staking_credential) DO UPDATE SET
                pool_keyhash = EXCLUDED.pool_keyhash,
                epoch = EXCLUDED.epoch,
                last_block_height = EXCLUDED.last_block_height,
                last_id = EXCLUDED.last_id;
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_pool_delegation_${validSQLName}
        AFTER INSERT ON effectstream.primitive_accounting
        FOR EACH ROW
        EXECUTE FUNCTION update_pool_delegation_${validSQLName}();

    ${strategy.createView(viewName, selectSql)}
    `;
}

export const POOL_DELEGATION_VIEW_PREFIX = "cardano_pool_delegation_view_" as const;
export const POOL_DELEGATION_INTERMEDIATE_PREFIX = "cardano_pool_delegation_intermediate_" as const;
