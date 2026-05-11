import { PrimitiveTypeNEARNEP171 } from "../builtin.ts";

export function nep171Ivm(name: string) {
  const lowerName = name.toLowerCase();
  const validSQLName = lowerName.replace(/[^a-zA-Z0-9_]/g, "");
  if (validSQLName !== lowerName) {
    throw new Error(`Invalid name: ${name}`);
  }

  const ownerTable = `primitives.nep171_owner_intermediate_${validSQLName}`;

  return `
    CREATE TABLE IF NOT EXISTS ${ownerTable} (
        primitive_name TEXT NOT NULL,
        token_id TEXT NOT NULL,
        current_owner TEXT NOT NULL,
        last_transfer_block_height INTEGER NOT NULL,
        last_transfer_id INTEGER NOT NULL,
        PRIMARY KEY (primitive_name, token_id)
    );

    CREATE OR REPLACE FUNCTION update_nep171_owner_${validSQLName}() RETURNS TRIGGER AS $$
    DECLARE
        new_owner TEXT;
        nft_token_id TEXT;
        is_burn BOOLEAN;
    BEGIN
        IF NEW.payload_type = '${PrimitiveTypeNEARNEP171}'
           AND NEW.primitive_name = '${name}' THEN

         new_owner := NEW.payload->>'new_owner_id';
         nft_token_id := NEW.payload->>'token_id';
         is_burn := (NEW.payload->>'isBurn')::boolean;

         IF nft_token_id IS NOT NULL AND NOT is_burn THEN
             INSERT INTO ${ownerTable} (primitive_name, token_id, current_owner, last_transfer_block_height, last_transfer_id)
             VALUES (NEW.primitive_name, nft_token_id, new_owner, NEW.effectstream_block_height, NEW.id)
             ON CONFLICT (primitive_name, token_id) DO UPDATE SET
                 current_owner = new_owner,
                 last_transfer_block_height = NEW.effectstream_block_height,
                 last_transfer_id = NEW.id
             WHERE ${ownerTable}.last_transfer_block_height < NEW.effectstream_block_height
                OR (${ownerTable}.last_transfer_block_height = NEW.effectstream_block_height
                    AND ${ownerTable}.last_transfer_id < NEW.id);
         ELSIF nft_token_id IS NOT NULL AND is_burn THEN
             DELETE FROM ${ownerTable}
             WHERE primitive_name = NEW.primitive_name AND token_id = nft_token_id;
         END IF;
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_nep171_owner_${validSQLName}
        AFTER INSERT ON effectstream.primitive_accounting
        FOR EACH ROW
        EXECUTE FUNCTION update_nep171_owner_${validSQLName}();

    SELECT pgivm.create_immv('primitives.nep171_owner_view_${validSQLName}',
        'SELECT
            primitive_name,
            token_id,
            current_owner
        FROM ${ownerTable};
    ');
    `;
}

export const NEP171_VIEW_PREFIX = "nep171_owner_view_" as const;
export const NEP171_INTERMEDIATE_PREFIX = "nep171_owner_intermediate_" as const;
