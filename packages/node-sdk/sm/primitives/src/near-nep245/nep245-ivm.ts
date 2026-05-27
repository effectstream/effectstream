import { PrimitiveTypeNEARNEP245 } from "../builtin.ts";
import type { MaterializedViewStrategy } from "@effectstream/db";

export function nep245Ivm(name: string, strategy: MaterializedViewStrategy) {
  const lowerName = name.toLowerCase();
  const validSQLName = lowerName.replace(/[^a-zA-Z0-9_]/g, "");
  if (validSQLName !== lowerName) {
    throw new Error(`Invalid name: ${name}`);
  }

  const balanceTable = `primitives.nep245_balance_intermediate_${validSQLName}`;
  const viewName = `primitives.nep245_balance_view_${validSQLName}`;
  const selectSql =
    `SELECT primitive_name, token_id, account_id, amount FROM ${balanceTable} WHERE amount > 0`;

  return `
    CREATE TABLE IF NOT EXISTS ${balanceTable} (
        primitive_name TEXT NOT NULL,
        token_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        amount numeric(78,0) DEFAULT 0,
        last_transfer_block_height INTEGER NOT NULL DEFAULT 0,
        last_transfer_id INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (primitive_name, token_id, account_id)
    );

    CREATE OR REPLACE FUNCTION update_nep245_balance_${validSQLName}() RETURNS TRIGGER AS $$
    DECLARE
        transfer_amount numeric(78,0);
        from_account TEXT;
        to_account TEXT;
        mt_token_id TEXT;
        is_mint BOOLEAN;
        is_burn BOOLEAN;
    BEGIN
        IF NEW.payload_type = '${PrimitiveTypeNEARNEP245}'
           AND NEW.primitive_name = '${name}'
           AND NEW.payload->>'amount' IS NOT NULL THEN

         transfer_amount := (NEW.payload->>'amount')::numeric(78,0);
         from_account := NEW.payload->>'old_owner_id';
         to_account := NEW.payload->>'new_owner_id';
         mt_token_id := NEW.payload->>'token_id';
         is_mint := COALESCE((NEW.payload->>'isMint')::boolean, false);
         is_burn := COALESCE((NEW.payload->>'isBurn')::boolean, false);

         IF from_account IS NOT NULL AND from_account != '' AND NOT is_mint THEN
             INSERT INTO ${balanceTable} (primitive_name, token_id, account_id, amount, last_transfer_block_height, last_transfer_id)
             VALUES (NEW.primitive_name, mt_token_id, from_account, -transfer_amount, NEW.effectstream_block_height, NEW.id)
             ON CONFLICT (primitive_name, token_id, account_id) DO UPDATE SET
                 amount = ${balanceTable}.amount - transfer_amount,
                 last_transfer_block_height = NEW.effectstream_block_height,
                 last_transfer_id = NEW.id;
         END IF;

         IF to_account IS NOT NULL AND to_account != '' AND NOT is_burn THEN
             INSERT INTO ${balanceTable} (primitive_name, token_id, account_id, amount, last_transfer_block_height, last_transfer_id)
             VALUES (NEW.primitive_name, mt_token_id, to_account, transfer_amount, NEW.effectstream_block_height, NEW.id)
             ON CONFLICT (primitive_name, token_id, account_id) DO UPDATE SET
                 amount = ${balanceTable}.amount + transfer_amount,
                 last_transfer_block_height = NEW.effectstream_block_height,
                 last_transfer_id = NEW.id;
         END IF;
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_nep245_balance_${validSQLName}
        AFTER INSERT ON effectstream.primitive_accounting
        FOR EACH ROW
        EXECUTE FUNCTION update_nep245_balance_${validSQLName}();

    ${strategy.createView(viewName, selectSql)}
    `;
}

export const NEP245_VIEW_PREFIX = "nep245_balance_view_" as const;
export const NEP245_INTERMEDIATE_PREFIX = "nep245_balance_intermediate_" as const;
