import { PrimitiveTypeNEARIntent } from "../builtin.ts";
import type { MaterializedViewStrategy } from "@effectstream/db";

export function nearIntentIvm(name: string, strategy: MaterializedViewStrategy) {
  const lowerName = name.toLowerCase();
  const validSQLName = lowerName.replace(/[^a-zA-Z0-9_]/g, "");
  if (validSQLName !== lowerName) {
    throw new Error(`Invalid name: ${name}`);
  }

  const settlementTable = `primitives.near_intent_settlement_intermediate_${validSQLName}`;
  const viewName = `primitives.near_intent_settlement_view_${validSQLName}`;
  const selectSql =
    `SELECT primitive_name, intent_hash, account_id, token_id, amount, block_height FROM ${settlementTable}`;

  return `
    CREATE TABLE IF NOT EXISTS ${settlementTable} (
        primitive_name TEXT NOT NULL,
        intent_hash TEXT NOT NULL,
        account_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        amount numeric(78,0) DEFAULT 0,
        block_height INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (primitive_name, intent_hash, account_id, token_id)
    );

    CREATE OR REPLACE FUNCTION update_near_intent_settlement_${validSQLName}() RETURNS TRIGGER AS $$
    DECLARE
        diff_item JSONB;
    BEGIN
        IF NEW.payload_type = '${PrimitiveTypeNEARIntent}'
           AND NEW.primitive_name = '${name}'
           AND (NEW.payload::jsonb)->'token_diffs' IS NOT NULL THEN

         FOR diff_item IN SELECT * FROM jsonb_array_elements((NEW.payload::jsonb)->'token_diffs')
         LOOP
             INSERT INTO ${settlementTable} (primitive_name, intent_hash, account_id, token_id, amount, block_height)
             VALUES (
                 NEW.primitive_name,
                 (NEW.payload::jsonb)->>'intent_hash',
                 (NEW.payload::jsonb)->>'account_id',
                 diff_item->>'token_id',
                 (diff_item->>'amount')::numeric(78,0),
                 NEW.effectstream_block_height
             )
             ON CONFLICT (primitive_name, intent_hash, account_id, token_id) DO UPDATE SET
                 amount = (diff_item->>'amount')::numeric(78,0),
                 block_height = NEW.effectstream_block_height;
         END LOOP;
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_near_intent_settlement_${validSQLName}
        AFTER INSERT ON effectstream.primitive_accounting
        FOR EACH ROW
        EXECUTE FUNCTION update_near_intent_settlement_${validSQLName}();

    ${strategy.createView(viewName, selectSql)}
    `;
}

export const NEAR_INTENT_VIEW_PREFIX = "near_intent_settlement_view_" as const;
export const NEAR_INTENT_INTERMEDIATE_PREFIX = "near_intent_settlement_intermediate_" as const;
