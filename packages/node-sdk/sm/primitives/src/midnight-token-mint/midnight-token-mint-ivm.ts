import { PrimitiveTypeMidnightTokenMint } from "../builtin.ts";
import type { MaterializedViewStrategy } from "@effectstream/db";

/**
 * Owned-table DDL for the Midnight:TokenMint primitive — the registry
 * `token_type → (contract_address, domain_sep, kind)` with an accumulating
 * `total_minted`. Maintained entirely by a trigger on
 * effectstream.primitive_accounting (which is written for every primitive
 * event regardless of any state-machine prefix), so consumers get the table
 * for free — no STM handler / migration required.
 *
 * Mirrors the ERC20/NEP141 IVM shape: intermediate table + trigger + a
 * read-side view published per `strategy` (pg_ivm or plain VIEW).
 */
export function midnightTokenMintIvm(
  name: string,
  strategy: MaterializedViewStrategy,
) {
  // The instance name becomes part of an SQL identifier, so strip anything that
  // isn't identifier-safe. The ERC20/NEP141 IVMs *throw* here instead, which
  // makes the owned table reject the repo's own naming convention (hyphenated
  // instance names like "Midnight-TokenMint") — and it throws at sync startup,
  // taking the whole node down for what is only a naming concern. Names that
  // were already safe are untouched, so no existing table/view name shifts.
  const lowerName = name.toLowerCase();
  const validSQLName = lowerName.replace(/[^a-zA-Z0-9_]/g, "");
  if (validSQLName.length === 0) {
    throw new Error(
      `Primitive instance name "${name}" has no SQL-identifier-safe characters`,
    );
  }
  // The name is also compared as a string literal inside the trigger body, and
  // that use is not identifier-restricted — so escape quotes rather than strip
  // them. Without this, a name containing `'` emits DDL that fails to parse.
  const sqlLiteralName = name.replace(/'/g, "''");

  const mintsTable =
    `primitives.midnight_token_mint_intermediate_${validSQLName}`;
  const viewName = `primitives.midnight_token_mint_view_${validSQLName}`;
  const selectSql =
    `SELECT primitive_name, token_type, kind, contract_address, domain_sep, total_minted, tx_hash, block_height FROM ${mintsTable}`;

  return `
    -- Token-mint registry (maintained by a trigger on primitive_accounting).
    -- The mapping columns are immutable (token_type is a pure function of
    -- (domain_sep, contract_address)); total_minted accumulates; tx_hash /
    -- block_height keep first-mint provenance. kind is in the key because the
    -- shielded and unshielded derivation formula is identical.
    CREATE TABLE IF NOT EXISTS ${mintsTable} (
        primitive_name TEXT NOT NULL,
        token_type TEXT NOT NULL,
        kind TEXT NOT NULL,
        contract_address TEXT NOT NULL,
        domain_sep TEXT NOT NULL,
        total_minted numeric(78,0) DEFAULT 0,
        tx_hash TEXT,
        block_height INTEGER,
        PRIMARY KEY (primitive_name, token_type, kind)
    );

    CREATE OR REPLACE FUNCTION update_midnight_token_mint_${validSQLName}() RETURNS TRIGGER AS $$
    DECLARE
        mint_amount numeric(78,0);
    BEGIN
        IF NEW.payload_type = '${PrimitiveTypeMidnightTokenMint}'
           AND NEW.primitive_name = '${sqlLiteralName}'
           AND NEW.payload->>'rawTokenType' IS NOT NULL THEN

         mint_amount := COALESCE((NEW.payload->>'amount')::numeric(78,0), 0);

         INSERT INTO ${mintsTable} (
             primitive_name, token_type, kind, contract_address, domain_sep,
             total_minted, tx_hash, block_height
         )
         VALUES (
             NEW.primitive_name,
             NEW.payload->>'rawTokenType',
             NEW.payload->>'kind',
             NEW.payload->>'contractAddress',
             NEW.payload->>'domainSep',
             mint_amount,
             NEW.payload->>'txHash',
             NEW.effectstream_block_height
         )
         ON CONFLICT (primitive_name, token_type, kind) DO UPDATE SET
             total_minted = ${mintsTable}.total_minted + EXCLUDED.total_minted;
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_midnight_token_mint_${validSQLName}
        AFTER INSERT ON effectstream.primitive_accounting
        FOR EACH ROW
        EXECUTE FUNCTION update_midnight_token_mint_${validSQLName}();

    ${strategy.createView(viewName, selectSql)}
    `;
}

export const MIDNIGHT_TOKEN_MINT_VIEW_PREFIX =
  "midnight_token_mint_view_" as const;
export const MIDNIGHT_TOKEN_MINT_INTERMEDIATE_PREFIX =
  "midnight_token_mint_intermediate_" as const;
