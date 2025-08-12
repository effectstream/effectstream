// TODO This can be replaced by a function that does the insertions.
// This will allow to create new tables during migrations.

// TODO The IVM here is not relevant, as the trigger does the work.

/**
 * Creates a new IVM for the ERC721 token with the given name.
 * This will track the current owner of each token.
 * @param name - The name of the ERC721 token.
 * @returns A string containing the SQL script to create the IVM.
 */
export function erc721Ivm(name: string) {
  const lowerName = name.toLowerCase();
  const validSQLName = lowerName.replace(/[^a-zA-Z0-9_]/g, "");
  if (validSQLName !== lowerName) {
    throw new Error(`Invalid name: ${name}`);
  }

  const script = `

-- Intermediate table for current ERC721 ownership (maintained by triggers)
CREATE TABLE erc721_ownership_intermediate_${validSQLName} (
    primitive_name TEXT NOT NULL,
    token_id TEXT NOT NULL,
    current_owner TEXT NOT NULL,
    last_transfer_block_height INTEGER NOT NULL,
    last_transfer_id INTEGER NOT NULL,
    PRIMARY KEY (primitive_name, token_id)
);

-- Trigger function to maintain current ownership
CREATE OR REPLACE FUNCTION update_erc721_ownership_${validSQLName}() RETURNS TRIGGER AS $$
BEGIN
    -- Only process ERC721 transfers
    IF NEW.payload_type = 'transfer' 
       AND NEW.primitive_name = '${name}' 
       AND NEW.payload->>'to' IS NOT NULL 
       AND NEW.payload->>'to' != '' THEN
        
        INSERT INTO erc721_ownership_intermediate_${validSQLName} (
            primitive_name,
            token_id,
            current_owner,
            last_transfer_block_height,
            last_transfer_id
        ) VALUES (
        NEW.primitive_name,
            NEW.payload->>'tokenId',
            lower(NEW.payload->>'to'),
            NEW.paima_block_height,
            NEW.id
        )
        ON CONFLICT (primitive_name, token_id) DO UPDATE SET
            current_owner = lower(NEW.payload->>'to'),
            last_transfer_block_height = NEW.paima_block_height,
            last_transfer_id = NEW.id
        WHERE NEW.paima_block_height > erc721_ownership_intermediate_${validSQLName}.last_transfer_block_height
           OR (NEW.paima_block_height = erc721_ownership_intermediate_${validSQLName}.last_transfer_block_height 
               AND NEW.id > erc721_ownership_intermediate_${validSQLName}.last_transfer_id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on primitive_accounting
CREATE TRIGGER trigger_update_erc721_ownership_${validSQLName}
    AFTER INSERT ON primitive_accounting
    FOR EACH ROW
    EXECUTE FUNCTION update_erc721_ownership_${validSQLName}();

-- Simple incrementally maintained view on the intermediate table
SELECT pgivm.create_immv('erc721_ownership_view_${validSQLName}',
    'SELECT
        primitive_name,
        token_id,
        current_owner
    FROM erc721_ownership_intermediate_${validSQLName};
');
`;
  return script;
}

// Naming helpers kept in this file to co-locate schema naming with IVM DDL
export const ERC721_VIEW_PREFIX = "erc721_ownership_view_" as const;
export const ERC721_INTERMEDIATE_PREFIX =
  "erc721_ownership_intermediate_" as const;
