/* @name evmMidnightTableExists */
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE  table_schema = 'public'
    AND    table_name   = 'evm_midnight'
);

/* @name insertEvmMidnight */
INSERT INTO evm_midnight 
    (contract_address, token_id, owner, block_height) 
VALUES 
    (:contract_address!, :token_id!, :owner!, :block_height!) 
ON CONFLICT (contract_address, token_id) 
DO UPDATE SET 
    owner = EXCLUDED.owner,
    block_height = EXCLUDED.block_height
;

/* @name insertEvmMidnightProperty */
INSERT INTO evm_midnight_properties 
    (contract_address, token_id, property_name, value, block_height) 
VALUES 
    (:contract_address!, :token_id!, :property_name!, :value!, :block_height!) 
ON CONFLICT (contract_address, token_id, property_name) 
DO UPDATE SET 
    value = EXCLUDED.value,
    block_height = EXCLUDED.block_height
;

/* @name getEvmMidnightByTokenId */
SELECT * FROM evm_midnight 
WHERE evm_midnight.token_id = :token_id!
AND evm_midnight.contract_address = :contract_address!
;

/* @name getEvmMidnight */
SELECT 
evm_midnight.token_id, 
evm_midnight.owner, 
evm_midnight.block_height as block_height,
evm_midnight_properties.property_name, 
evm_midnight_properties.value,
evm_midnight_properties.block_height as property_block_height
FROM evm_midnight 
LEFT JOIN evm_midnight_properties ON evm_midnight.token_id = evm_midnight_properties.token_id
ORDER BY evm_midnight.token_id DESC
;