/* @name insertPrimitiveAccounting */
INSERT INTO effectstream.primitive_accounting(primitive_name, effectstream_block_height, payload_type, payload)
VALUES (:primitive_name!, :effectstream_block_height!, :payload_type!, :payload!)
ON CONFLICT (primitive_name, effectstream_block_height, payload_hash) DO NOTHING;
