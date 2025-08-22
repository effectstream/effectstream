/* @name insertPrimitiveAccounting */
INSERT INTO paima.primitive_accounting(primitive_name, paima_block_height, payload_type, payload)
VALUES (:primitive_name!, :paima_block_height!, :payload_type!, :payload!);
