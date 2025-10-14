/* @name evmMidnightTableExists */
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE  table_schema = 'public'
    AND    table_name   = 'evm_midnight'
);

/* @name insertEvmMidnight */
INSERT INTO evm_midnight 
    (contract_address, chain, token_id, amount, owner, block_height) 
VALUES 
    (:contract_address!, :chain!, :token_id!, :amount!, :owner!, :block_height!) 
ON CONFLICT (contract_address, token_id, owner) 
DO UPDATE SET 
    chain = EXCLUDED.chain,
    block_height = EXCLUDED.block_height,
    amount = EXCLUDED.amount
;

/* @name getEvmMidnight */
SELECT * FROM evm_midnight;

/* @name getEvmMidnightByTokenId */
SELECT * FROM evm_midnight 
WHERE evm_midnight.token_id = :token_id!
AND evm_midnight.contract_address = :contract_address!
;

/* @name getEvmMidnightByOwner */
SELECT * FROM evm_midnight 
WHERE evm_midnight.owner = :owner!
AND evm_midnight.contract_address = :contract_address!
;