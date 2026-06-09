import { PrimitiveTypeNEARNEP141 } from "../builtin.ts";
import type { MaterializedViewStrategy } from "@effectstream/db";

export function nep141Ivm(name: string, strategy: MaterializedViewStrategy) {
  const lowerName = name.toLowerCase();
  const validSQLName = lowerName.replace(/[^a-zA-Z0-9_]/g, "");
  if (validSQLName !== lowerName) {
    throw new Error(`Invalid name: ${name}`);
  }

  const balanceTable = `primitives.nep141_balance_intermediate_${validSQLName}`;
  const viewName = `primitives.nep141_balance_view_${validSQLName}`;
  const selectSql =
    `SELECT primitive_name, account_id, balance FROM ${balanceTable} WHERE balance > 0`;

  return `
    CREATE TABLE IF NOT EXISTS ${balanceTable} (
        primitive_name TEXT NOT NULL,
        account_id TEXT NOT NULL,
        balance numeric(78,0) DEFAULT 0,
        PRIMARY KEY (primitive_name, account_id)
    );

    CREATE OR REPLACE FUNCTION update_nep141_balance_${validSQLName}() RETURNS TRIGGER AS $$
    DECLARE
        transfer_amount numeric(78,0);
        from_account TEXT;
        to_account TEXT;
    BEGIN
        IF NEW.payload_type = '${PrimitiveTypeNEARNEP141}'
           AND NEW.primitive_name = '${name}'
           AND NEW.payload->>'amount' IS NOT NULL THEN

         transfer_amount := (NEW.payload->>'amount')::numeric(78,0);
         from_account := NEW.payload->>'old_owner_id';
         to_account := NEW.payload->>'new_owner_id';

         IF from_account IS NOT NULL AND from_account != '' THEN
             INSERT INTO ${balanceTable} (primitive_name, account_id, balance)
             VALUES (NEW.primitive_name, from_account, -transfer_amount)
             ON CONFLICT (primitive_name, account_id) DO UPDATE SET
                 balance = ${balanceTable}.balance - transfer_amount;
         END IF;

         IF to_account IS NOT NULL AND to_account != '' THEN
             INSERT INTO ${balanceTable} (primitive_name, account_id, balance)
             VALUES (NEW.primitive_name, to_account, transfer_amount)
             ON CONFLICT (primitive_name, account_id) DO UPDATE SET
                 balance = ${balanceTable}.balance + transfer_amount;
         END IF;
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_nep141_balance_${validSQLName}
        AFTER INSERT ON effectstream.primitive_accounting
        FOR EACH ROW
        EXECUTE FUNCTION update_nep141_balance_${validSQLName}();

    ${strategy.createView(viewName, selectSql)}
    `;
}

export const NEP141_VIEW_PREFIX = "nep141_balance_view_" as const;
export const NEP141_INTERMEDIATE_PREFIX = "nep141_balance_intermediate_" as const;
