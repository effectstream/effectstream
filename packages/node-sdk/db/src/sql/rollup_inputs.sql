/* @name newScheduledHeightData */
WITH
  new_row AS (
    INSERT INTO rollup_inputs(from_address, input_data)
    VALUES (:from_address!, :input_data!)
    RETURNING id
  ),
  insert_origin AS (
    INSERT INTO rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)
    SELECT (SELECT id FROM new_row), :primitive_name, :caip2, :origin_tx_hash::BYTEA, :origin_contract_address
  )
INSERT INTO rollup_input_future_block(id, future_block_height)
SELECT (SELECT id FROM new_row), :future_block_height!;

/* @name newScheduledTimestampData */
WITH
  new_row AS (
    INSERT INTO rollup_inputs(from_address, input_data)
    VALUES (:from_address!, :input_data!)
    RETURNING id
  ),
  insert_origin AS (
    INSERT INTO rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)
    SELECT (SELECT id FROM new_row),null,null,null,null
  )
INSERT INTO rollup_input_future_timestamp(id, future_ms_timestamp)
SELECT (SELECT id FROM new_row), :future_ms_timestamp!;

/* @name newGameInput */
WITH
  new_row AS (
    INSERT INTO rollup_inputs(from_address, input_data)
    VALUES (:from_address!, :input_data!)
    RETURNING id
  ),
  insert_origin AS (
    INSERT INTO rollup_input_origin(id, primitive_name, caip2, tx_hash, contract_address)
    SELECT (SELECT id FROM new_row), :primitive_name!, :caip2!, :origin_tx_hash!::BYTEA, :origin_contract_address
  )
INSERT INTO rollup_input_result(id, success, paima_tx_hash, index_in_block, block_height)
SELECT (SELECT id FROM new_row), :success!, :paima_tx_hash!::BYTEA, :index_in_block!, :block_height!;

/* @name insertGameInputResult */
INSERT INTO rollup_input_result(id, success, paima_tx_hash, index_in_block, block_height)
VALUES (:id!, :success!, :paima_tx_hash!::BYTEA, :index_in_block!, :block_height!);

/* @name getFutureGameInputByBlockHeight */
SELECT
  rollup_inputs.id,
  rollup_input_future_block.future_block_height,
  rollup_inputs.input_data,
  rollup_inputs.from_address,
  rollup_input_origin.primitive_name,
  rollup_input_origin.contract_address,
  rollup_input_origin.caip2,
  rollup_input_origin.tx_hash as "origin_tx_hash"
FROM rollup_inputs
JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
JOIN rollup_input_future_block ON rollup_input_future_block.id = rollup_inputs.id
WHERE rollup_input_future_block.future_block_height = :block_height!
ORDER BY rollup_inputs.id ASC;

/* @name getFutureGameInputByMaxTimestamp */
SELECT
  rollup_inputs.id,
  rollup_input_future_timestamp.future_ms_timestamp,
  rollup_inputs.input_data,
  rollup_inputs.from_address,
  rollup_input_origin.primitive_name,
  rollup_input_origin.contract_address,
  rollup_input_origin.caip2,
  rollup_input_origin.tx_hash as "origin_tx_hash"
FROM rollup_inputs
JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
JOIN rollup_input_future_timestamp ON rollup_inputs.id = rollup_input_future_timestamp.id
LEFT OUTER JOIN rollup_input_result
  ON (rollup_input_result.id = rollup_inputs.id)
WHERE rollup_input_future_timestamp.future_ms_timestamp <= :max_timestamp! AND
      rollup_input_result.id IS NULL
ORDER BY rollup_input_future_timestamp.future_ms_timestamp ASC;

/* @name getGameInputResultByBlockHeight */
SELECT
  rollup_inputs.id,
  paima_blocks.block_height,
  rollup_inputs.input_data,
  rollup_inputs.from_address,
  paima_blocks.paima_block_hash,
  rollup_input_origin.contract_address,
  rollup_input_result.paima_tx_hash,
  rollup_input_result.index_in_block,
  rollup_input_result.success
FROM rollup_inputs
JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id
JOIN paima_blocks ON rollup_input_result.block_height = paima_blocks.block_height
WHERE paima_blocks.block_height = :block_height!;

/* @name getGameInputResultByTxHash */
SELECT
  rollup_inputs.id,
  paima_blocks.block_height,
  rollup_inputs.input_data,
  rollup_inputs.from_address,
  paima_blocks.paima_block_hash,
  rollup_input_result.paima_tx_hash,
  rollup_input_result.index_in_block,
  rollup_input_result.success
FROM rollup_inputs
JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id
JOIN paima_blocks ON rollup_input_result.block_height = paima_blocks.block_height
WHERE rollup_input_result.paima_tx_hash = :tx_hash!;

/* @name getGameInputResultByAddress */
SELECT
  rollup_inputs.id,
  paima_blocks.block_height,
  rollup_inputs.input_data,
  rollup_inputs.from_address,
  paima_blocks.paima_block_hash,
  rollup_input_result.paima_tx_hash,
  rollup_input_result.index_in_block,
  rollup_input_result.success
FROM rollup_inputs
JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id
JOIN paima_blocks ON rollup_input_result.block_height = paima_blocks.block_height
WHERE
  rollup_input_result.block_height = :block_height! AND
  rollup_input_result.success = TRUE AND
  lower(rollup_inputs.from_address) = lower(:from_address!);

/* @name removeScheduledBlockData */
DELETE FROM rollup_inputs
WHERE
  input_data = :input_data! AND
  rollup_inputs.id IN (
    SELECT rollup_input_future_block.id
    FROM rollup_input_future_block
    WHERE rollup_input_future_block.future_block_height = :block_height!
);

/* @name removeScheduledTimestampData */
DELETE FROM rollup_inputs
WHERE
  input_data = :input_data! AND
  rollup_inputs.id IN (
    SELECT rollup_input_future_timestamp.id
    FROM rollup_input_future_timestamp
    WHERE rollup_input_future_timestamp.future_ms_timestamp = :ms_timestamp!
);


/* @name removeAllScheduledDataByInputData */
DELETE FROM rollup_inputs
WHERE input_data = :input_data!;

/* @name deleteScheduled */
DELETE FROM rollup_inputs
WHERE id = :id!;
