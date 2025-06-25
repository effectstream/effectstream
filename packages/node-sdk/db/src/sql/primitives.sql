/* @name insertPrimitiveAccounting */
INSERT INTO primitive_accounting(primitive_name, paima_block_height, payload_type, payload)
VALUES (:primitive_name!, :paima_block_height!, :payload_type!, :payload!);

/* @name getErc20Balance */
SELECT * FROM erc_balance WHERE address = :address!;