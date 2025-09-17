// TODO This can be replaced by a function that does the insertions.
// This will allow to create new tables during migrations.

// TODO The IVM here is not relevant, as the trigger does the work.

/**
 * Creates a new IVM for the ERC20 token with the given name.
 * This will track the current balance of each address.
 * @param name - The name of the ERC20 token.
 * @returns A string containing the SQL script to create the IVM.
 */
export function erc20Ivm(name: string) {
  const lowerName = name.toLowerCase();
  const validSQLName = lowerName.replace(/[^a-zA-Z0-9_]/g, "");
  if (validSQLName !== lowerName) {
    throw new Error(`Invalid name: ${name}`);
  }

  const balanceTable = `primitives.erc20_balances_intermediate_${validSQLName}`;

  return `
    -- Intermediate table for current ERC20 balances (maintained by triggers)
    CREATE TABLE IF NOT EXISTS ${balanceTable} (
        primitive_name TEXT NOT NULL,
        address TEXT NOT NULL,
        balance numeric(78,0) DEFAULT 0,
        PRIMARY KEY (primitive_name, address)
    );
    
    -- Trigger function to maintain ERC20 balances
    CREATE OR REPLACE FUNCTION update_erc20_balances_${validSQLName}() RETURNS TRIGGER AS $$
    DECLARE
        transfer_value numeric(78,0);
        from_address TEXT;
        to_address TEXT;
    BEGIN
        -- Only process ERC20 transfers
        IF NEW.payload_type = 'transfer' 
           AND NEW.primitive_name = '${name}'
           AND NEW.payload->>'value' IS NOT NULL THEN
           
         transfer_value := (NEW.payload->>'value')::numeric(78,0);
         from_address := lower(NEW.payload->>'from');
         to_address := lower(NEW.payload->>'to');
         
         -- Handle FROM address (subtract balance, but skip burn address)
         IF from_address IS NOT NULL 
            AND from_address != '' 
            AND from_address != '0x0000000000000000000000000000000000000000' THEN
             
             INSERT INTO ${balanceTable} (primitive_name, address, balance)
             VALUES (NEW.primitive_name, from_address, -transfer_value)
             ON CONFLICT (primitive_name, address) DO UPDATE SET
                 balance = ${balanceTable}.balance - transfer_value;
         END IF;
         
         -- Handle TO address (add balance)
         IF to_address IS NOT NULL AND to_address != '' THEN
             INSERT INTO ${balanceTable} (primitive_name, address, balance)
             VALUES (NEW.primitive_name, to_address, transfer_value)
             ON CONFLICT (primitive_name, address) DO UPDATE SET
                 balance = ${balanceTable}.balance + transfer_value;
         END IF;
        END IF;
        
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Create trigger on primitive_accounting for ERC20 balances
    CREATE TRIGGER trigger_update_erc20_balances_${validSQLName}
        AFTER INSERT ON paima.primitive_accounting  -- Note: Qualify with paima schema
        FOR EACH ROW
        EXECUTE FUNCTION update_erc20_balances_${validSQLName}();
    
    -- Simple incrementally maintained view on the intermediate table
    SELECT pgivm.create_immv('primitives.erc20_balances_view_${validSQLName}',
        'SELECT
            primitive_name,
            address,
            balance
        FROM ${balanceTable}
        WHERE balance > 0;
    ');
    `;
}

// Naming helpers kept in this file to co-locate schema naming with IVM DDL
export const ERC20_VIEW_PREFIX = "erc20_balances_view_" as const;
export const ERC20_INTERMEDIATE_PREFIX =
  "erc20_balances_intermediate_" as const;
