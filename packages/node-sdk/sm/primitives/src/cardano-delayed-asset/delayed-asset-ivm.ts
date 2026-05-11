import { PrimitiveTypeCardanoDelayedAsset } from "../builtin.ts";

export function delayedAssetIvm(name: string) {
  const lowerName = name.toLowerCase();
  const validSQLName = lowerName.replace(/[^a-zA-Z0-9_]/g, "");
  if (validSQLName !== lowerName) {
    throw new Error(`Invalid name: ${name}`);
  }

  const intermediateTable = `primitives.cardano_asset_utxos_intermediate_${validSQLName}`;

  return `
    CREATE TABLE IF NOT EXISTS ${intermediateTable} (
        primitive_name TEXT NOT NULL,
        tx_id TEXT NOT NULL,
        output_index INTEGER NOT NULL,
        address TEXT NOT NULL,
        cip14_fingerprint TEXT NOT NULL,
        policy_id TEXT NOT NULL,
        asset_name TEXT NOT NULL,
        amount TEXT NOT NULL,
        block_height INTEGER NOT NULL,
        PRIMARY KEY (primitive_name, tx_id, output_index, cip14_fingerprint)
    );

    CREATE OR REPLACE FUNCTION update_delayed_asset_${validSQLName}() RETURNS TRIGGER AS $$
    DECLARE
        v_amount TEXT;
    BEGIN
        IF NEW.payload_type = '${PrimitiveTypeCardanoDelayedAsset}'
           AND NEW.primitive_name = '${name}' THEN

            v_amount := NEW.payload->>'amount';

            IF v_amount IS NOT NULL AND v_amount != '' THEN
                INSERT INTO ${intermediateTable} (
                    primitive_name, tx_id, output_index, address,
                    cip14_fingerprint, policy_id, asset_name, amount, block_height
                ) VALUES (
                    NEW.primitive_name,
                    NEW.payload->>'txId',
                    (NEW.payload->>'outputIndex')::INTEGER,
                    NEW.payload->>'address',
                    NEW.payload->>'cip14Fingerprint',
                    NEW.payload->>'policyId',
                    NEW.payload->>'assetName',
                    v_amount,
                    NEW.effectstream_block_height
                )
                ON CONFLICT (primitive_name, tx_id, output_index, cip14_fingerprint) DO UPDATE SET
                    address = EXCLUDED.address,
                    amount = EXCLUDED.amount,
                    block_height = EXCLUDED.block_height;
            ELSE
                DELETE FROM ${intermediateTable}
                WHERE primitive_name = NEW.primitive_name
                  AND tx_id = NEW.payload->>'txId'
                  AND output_index = (NEW.payload->>'outputIndex')::INTEGER
                  AND cip14_fingerprint = NEW.payload->>'cip14Fingerprint';
            END IF;
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_delayed_asset_${validSQLName}
        AFTER INSERT ON effectstream.primitive_accounting
        FOR EACH ROW
        EXECUTE FUNCTION update_delayed_asset_${validSQLName}();

    SELECT pgivm.create_immv('primitives.cardano_asset_utxos_view_${validSQLName}',
        'SELECT
            primitive_name,
            tx_id,
            output_index,
            address,
            cip14_fingerprint,
            policy_id,
            asset_name,
            amount,
            block_height
        FROM ${intermediateTable};
    ');
    `;
}

export const DELAYED_ASSET_VIEW_PREFIX = "cardano_asset_utxos_view_" as const;
export const DELAYED_ASSET_INTERMEDIATE_PREFIX = "cardano_asset_utxos_intermediate_" as const;
