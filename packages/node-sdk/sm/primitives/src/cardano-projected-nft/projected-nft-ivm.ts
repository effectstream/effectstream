import { PrimitiveTypeCardanoProjectedNFT } from "../builtin.ts";
import type { MaterializedViewStrategy } from "@effectstream/db";

export function projectedNftIvm(
  name: string,
  strategy: MaterializedViewStrategy,
) {
  const lowerName = name.toLowerCase();
  const validSQLName = lowerName.replace(/[^a-zA-Z0-9_]/g, "");
  if (validSQLName !== lowerName) {
    throw new Error(`Invalid name: ${name}`);
  }

  const intermediateTable = `primitives.cardano_projected_nft_intermediate_${validSQLName}`;
  const viewName = `primitives.cardano_projected_nft_view_${validSQLName}`;
  const selectSql =
    `SELECT primitive_name, owner_address, current_tx_id, current_output_index, previous_tx_id, previous_output_index, policy_id, asset_name, status, for_how_long FROM ${intermediateTable}`;

  return `
    CREATE TABLE IF NOT EXISTS ${intermediateTable} (
        primitive_name TEXT NOT NULL,
        owner_address TEXT NOT NULL,
        current_tx_id TEXT NOT NULL,
        current_output_index INTEGER,
        previous_tx_id TEXT,
        previous_output_index INTEGER,
        policy_id TEXT NOT NULL,
        asset_name TEXT NOT NULL,
        status TEXT NOT NULL,
        for_how_long TEXT,
        block_height INTEGER NOT NULL,
        PRIMARY KEY (primitive_name, current_tx_id, current_output_index)
    );

    CREATE OR REPLACE FUNCTION update_projected_nft_${validSQLName}() RETURNS TRIGGER AS $$
    DECLARE
        v_status TEXT;
    BEGIN
        IF NEW.payload_type = '${PrimitiveTypeCardanoProjectedNFT}'
           AND NEW.primitive_name = '${name}' THEN

            v_status := NEW.payload->>'status';

            IF v_status = 'Claim' THEN
                DELETE FROM ${intermediateTable}
                WHERE primitive_name = NEW.primitive_name
                  AND current_tx_id = NEW.payload->>'previousTxId'
                  AND current_output_index = (NEW.payload->>'previousOutputIndex')::INTEGER;
            ELSE
                IF NEW.payload->>'previousTxId' IS NOT NULL
                   AND NEW.payload->>'previousTxId' != '' THEN
                    DELETE FROM ${intermediateTable}
                    WHERE primitive_name = NEW.primitive_name
                      AND current_tx_id = NEW.payload->>'previousTxId'
                      AND current_output_index = (NEW.payload->>'previousOutputIndex')::INTEGER;
                END IF;

                INSERT INTO ${intermediateTable} (
                    primitive_name, owner_address, current_tx_id, current_output_index,
                    previous_tx_id, previous_output_index, policy_id, asset_name,
                    status, for_how_long, block_height
                ) VALUES (
                    NEW.primitive_name,
                    NEW.payload->>'ownerAddress',
                    NEW.payload->>'currentTxId',
                    (NEW.payload->>'currentOutputIndex')::INTEGER,
                    NULLIF(NEW.payload->>'previousTxId', ''),
                    CASE WHEN NEW.payload->>'previousOutputIndex' IS NOT NULL
                         AND NEW.payload->>'previousOutputIndex' != ''
                         THEN (NEW.payload->>'previousOutputIndex')::INTEGER
                         ELSE NULL END,
                    NEW.payload->>'policyId',
                    NEW.payload->>'assetName',
                    v_status,
                    NULLIF(NEW.payload->>'forHowLong', ''),
                    NEW.effectstream_block_height
                )
                ON CONFLICT (primitive_name, current_tx_id, current_output_index) DO UPDATE SET
                    owner_address = EXCLUDED.owner_address,
                    previous_tx_id = EXCLUDED.previous_tx_id,
                    previous_output_index = EXCLUDED.previous_output_index,
                    status = EXCLUDED.status,
                    for_how_long = EXCLUDED.for_how_long,
                    block_height = EXCLUDED.block_height;
            END IF;
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_projected_nft_${validSQLName}
        AFTER INSERT ON effectstream.primitive_accounting
        FOR EACH ROW
        EXECUTE FUNCTION update_projected_nft_${validSQLName}();

    ${strategy.createView(viewName, selectSql)}
    `;
}

export const PROJECTED_NFT_VIEW_PREFIX = "cardano_projected_nft_view_" as const;
export const PROJECTED_NFT_INTERMEDIATE_PREFIX = "cardano_projected_nft_intermediate_" as const;
