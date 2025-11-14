/* @name evmMidnightTableExists */
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE  table_schema = 'public'
    AND    table_name   = 'example_table'
);

/* @name insertExampleTable */
INSERT INTO example_table 
    (contract_address, chain, token_id, amount, owner, block_height) 
VALUES 
    (:contract_address!, :chain!, :token_id!, :amount!, :owner!, :block_height!) 
ON CONFLICT (contract_address, token_id, owner) 
DO UPDATE SET 
    chain = EXCLUDED.chain,
    block_height = EXCLUDED.block_height,
    amount = EXCLUDED.amount
;

/* @name getExampleTable */
SELECT * FROM example_table;

/* @name getExampleTableByTokenId */
SELECT * FROM example_table 
WHERE example_table.token_id = :token_id!
AND example_table.contract_address = :contract_address!
;

/* @name getExampleTableByOwner */
SELECT * FROM example_table 
WHERE example_table.owner = :owner!
AND example_table.contract_address = :contract_address!
;
