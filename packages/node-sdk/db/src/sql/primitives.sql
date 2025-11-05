/* @name insertPrimitiveAccounting */
INSERT INTO effectstream.primitive_accounting(primitive_name, effectstream_block_height, payload_type, payload)
VALUES (:primitive_name!, :effectstream_block_height!, :payload_type!, :payload!);
