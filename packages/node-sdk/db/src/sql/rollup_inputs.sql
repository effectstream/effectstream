/* @name newScheduledHeightData */
WITH
  new_row AS (
    INSERT INTO effectstream.rollup_inputs(from_address, from_address_type, input_data)
    VALUES (:from_address!, :from_address_type!, :input_data!)
    RETURNING id
  ),
  insert_origin AS (
    INSERT INTO effectstream.rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)
    SELECT (SELECT id FROM new_row), :primitive_name, :caip2, :origin_tx_hash::BYTEA, :origin_contract_address
  )
INSERT INTO effectstream.rollup_input_future_block(id, future_block_height)
SELECT (SELECT id FROM new_row), :future_block_height!;

/* @name newScheduledTimestampData */
WITH
  new_row AS (
    INSERT INTO effectstream.rollup_inputs(from_address, from_address_type, input_data)
    VALUES (:from_address!, :from_address_type!, :input_data!)
    RETURNING id
  ),
  insert_origin AS (
    INSERT INTO effectstream.rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)
    SELECT (SELECT id FROM new_row),null,null,null,null
  )
INSERT INTO effectstream.rollup_input_future_timestamp(id, future_ms_timestamp)
SELECT (SELECT id FROM new_row), :future_ms_timestamp!;

/* @name newGameInput */
WITH
  new_row AS (
    INSERT INTO effectstream.rollup_inputs(from_address, from_address_type, input_data)
    VALUES (:from_address!, :from_address_type!, :input_data!)
    RETURNING id
  ),
  insert_origin AS (
    INSERT INTO effectstream.rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)
    SELECT (SELECT id FROM new_row), :primitive_name!, :caip2!, :origin_tx_hash!::BYTEA, :origin_contract_address
  )
INSERT INTO effectstream.rollup_input_result(id, success, effectstream_tx_hash, index_in_block, block_height)
SELECT (SELECT id FROM new_row), :success!, :effectstream_tx_hash!::BYTEA, :index_in_block!, :block_height!;

/* @name insertGameInputResult */
INSERT INTO effectstream.rollup_input_result(id, success, effectstream_tx_hash, index_in_block, block_height)
VALUES (:id!, :success!, :effectstream_tx_hash!::BYTEA, :index_in_block!, :block_height!);

/* @name getAllScheduledData */
(
SELECT
  rollup_inputs.id,
  NULL AS future_ms_timestamp,
  rollup_input_future_block.future_block_height,
  rollup_inputs.input_data,
  rollup_inputs.from_address,
  rollup_inputs.from_address_type,
  rollup_input_origin.primitive_name,
  rollup_input_origin.contract_address,
  rollup_input_origin.caip2,
  rollup_input_origin.tx_hash as "origin_tx_hash"
FROM effectstream.rollup_inputs
JOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id
JOIN effectstream.rollup_input_future_block ON effectstream.rollup_input_future_block.id = effectstream.rollup_inputs.id
WHERE rollup_inputs.id > :after_id::INT
ORDER BY rollup_inputs.id ASC
)
	UNION ALL 
(
SELECT
  rollup_inputs.id,
  rollup_input_future_timestamp.future_ms_timestamp,
  NULL AS "future_block_height",
  rollup_inputs.input_data,
  rollup_inputs.from_address,
  rollup_inputs.from_address_type,
  rollup_input_origin.primitive_name,
  rollup_input_origin.contract_address,
  rollup_input_origin.caip2,
  rollup_input_origin.tx_hash as "origin_tx_hash"
FROM effectstream.rollup_inputs
JOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id
JOIN effectstream.rollup_input_future_timestamp ON effectstream.rollup_inputs.id = effectstream.rollup_input_future_timestamp.id
LEFT OUTER JOIN effectstream.rollup_input_result
  ON (effectstream.rollup_input_result.id = effectstream.rollup_inputs.id)
WHERE 
 effectstream.rollup_input_result.id IS NULL AND
 effectstream.rollup_inputs.id > :after_id::INT
ORDER BY rollup_input_future_timestamp.future_ms_timestamp ASC
)
ORDER BY id ASC
LIMIT COALESCE(:limit, 999999);

/* @name getAllScheduledDataCount */
SELECT COUNT(*) as total FROM (
  (
  SELECT rollup_inputs.id
  FROM effectstream.rollup_inputs
  JOIN effectstream.rollup_input_future_block ON effectstream.rollup_input_future_block.id = effectstream.rollup_inputs.id
  )
  UNION ALL 
  (
  SELECT rollup_inputs.id
  FROM effectstream.rollup_inputs
  JOIN effectstream.rollup_input_future_timestamp ON effectstream.rollup_inputs.id = effectstream.rollup_input_future_timestamp.id
  LEFT OUTER JOIN effectstream.rollup_input_result
    ON (effectstream.rollup_input_result.id = effectstream.rollup_inputs.id)
  WHERE rollup_input_result.id IS NULL
  )
) AS scheduled_data;

/* @name getFutureGameInputByBlockHeight */
SELECT
  rollup_inputs.id,
  rollup_input_future_block.future_block_height,
  rollup_inputs.input_data,
  rollup_inputs.from_address,
  rollup_inputs.from_address_type,
  rollup_input_origin.primitive_name,
  rollup_input_origin.contract_address,
  rollup_input_origin.caip2,
  rollup_input_origin.tx_hash as "origin_tx_hash"
FROM effectstream.rollup_inputs
JOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id
JOIN effectstream.rollup_input_future_block ON effectstream.rollup_input_future_block.id = effectstream.rollup_inputs.id
WHERE rollup_input_future_block.future_block_height = :block_height!
ORDER BY rollup_inputs.id ASC;

/* @name getFutureGameInputByMaxTimestamp */
SELECT
  rollup_inputs.id,
  rollup_input_future_timestamp.future_ms_timestamp,
  rollup_inputs.input_data,
  rollup_inputs.from_address,
  rollup_inputs.from_address_type,
  rollup_input_origin.primitive_name,
  rollup_input_origin.contract_address,
  rollup_input_origin.caip2,
  rollup_input_origin.tx_hash as "origin_tx_hash"
FROM effectstream.rollup_inputs
JOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id
JOIN effectstream.rollup_input_future_timestamp ON effectstream.rollup_inputs.id = effectstream.rollup_input_future_timestamp.id
LEFT OUTER JOIN effectstream.rollup_input_result
  ON (effectstream.rollup_input_result.id = effectstream.rollup_inputs.id)
WHERE rollup_input_future_timestamp.future_ms_timestamp <= :max_timestamp! AND
     effectstream.rollup_input_result.id IS NULL
ORDER BY rollup_input_future_timestamp.future_ms_timestamp ASC;

/* @name getGameInputResultByBlockHeight */
SELECT
  rollup_inputs.id,
  effectstream_blocks.block_height,
  rollup_inputs.input_data,
  rollup_inputs.from_address,
  rollup_inputs.from_address_type,
  effectstream_blocks.effectstream_block_hash,
  rollup_input_origin.contract_address,
  rollup_input_result.effectstream_tx_hash,
  rollup_input_result.index_in_block,
  rollup_input_result.success
FROM effectstream.rollup_inputs
JOIN effectstream.rollup_input_origin ON effectstream.rollup_inputs.id = effectstream.rollup_input_origin.id
JOIN effectstream.rollup_input_result ON effectstream.rollup_inputs.id = effectstream.rollup_input_result.id
JOIN effectstream.effectstream_blocks ON effectstream.rollup_input_result.block_height = effectstream.effectstream_blocks.block_height
WHERE effectstream_blocks.block_height = :block_height!;

/* @name getGameInputResultByTxHash */
SELECT
  rollup_inputs.id,
  effectstream_blocks.block_height,
  rollup_inputs.input_data,
  rollup_inputs.from_address,
  rollup_inputs.from_address_type,
  effectstream_blocks.effectstream_block_hash,
  rollup_input_result.effectstream_tx_hash,
  rollup_input_result.index_in_block,
  rollup_input_result.success
FROM effectstream.rollup_inputs
JOIN effectstream.rollup_input_result ON effectstream.rollup_inputs.id = effectstream.rollup_input_result.id
JOIN effectstream.effectstream_blocks ON effectstream.rollup_input_result.block_height = effectstream.effectstream_blocks.block_height
WHERE rollup_input_result.effectstream_tx_hash = :tx_hash!;

/* @name getGameInputResultByAddress */
SELECT
  rollup_inputs.id,
  effectstream_blocks.block_height,
  rollup_inputs.input_data,
  rollup_inputs.from_address,
  rollup_inputs.from_address_type,
  effectstream_blocks.effectstream_block_hash,
  rollup_input_result.effectstream_tx_hash,
  rollup_input_result.index_in_block,
  rollup_input_result.success
FROM effectstream.rollup_inputs
JOIN effectstream.rollup_input_result ON effectstream.rollup_inputs.id = effectstream.rollup_input_result.id
JOIN effectstream.effectstream_blocks ON effectstream.rollup_input_result.block_height = effectstream.effectstream_blocks.block_height
WHERE
  rollup_input_result.block_height = :block_height! AND
  rollup_input_result.success = TRUE AND
  lower(rollup_inputs.from_address) = lower(:from_address!);

/* @name removeScheduledBlockData */
DELETE FROM effectstream.rollup_inputs
WHERE
  input_data = :input_data! AND
  rollup_inputs.id IN (
    SELECT rollup_input_future_block.id
    FROM effectstream.rollup_input_future_block
    WHERE effectstream.rollup_input_future_block.future_block_height = :block_height!
);

/* @name removeScheduledTimestampData */
DELETE FROM effectstream.rollup_inputs
WHERE
  input_data = :input_data! AND
  rollup_inputs.id IN (
    SELECT rollup_input_future_timestamp.id
    FROM effectstream.rollup_input_future_timestamp
    WHERE effectstream.rollup_input_future_timestamp.future_ms_timestamp = :ms_timestamp!
);


/* @name removeAllScheduledDataByInputData */
DELETE FROM effectstream.rollup_inputs
WHERE input_data = :input_data!;

/* @name deleteScheduled */
DELETE FROM effectstream.rollup_inputs
WHERE id = :id!;
