/* @name getInputsTotal */
WITH scheduled_split AS (
  SELECT CASE WHEN primitive_name IS NULL AND caip2 IS NOT NULL THEN 1 ELSE 0 END as submitted_input
  FROM rollup_inputs
  JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
)
SELECT
    COUNT(CASE WHEN submitted_input = 1 THEN 1 END) AS "submitted_inputs!",
    COUNT(CASE WHEN submitted_input = 0 THEN 1 END) AS "scheduled_data!"
FROM scheduled_split;

/* @name getInputsForBlock */
WITH scheduled_split AS (
  SELECT CASE WHEN primitive_name IS NULL AND caip2 IS NOT NULL THEN 1 ELSE 0 END as submitted_input
  FROM rollup_inputs
  JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
  JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id
  WHERE block_height = :block_height!
)
SELECT
    COUNT(CASE WHEN submitted_input = 1 THEN 1 END) AS "submitted_inputs!",
    COUNT(CASE WHEN submitted_input = 0 THEN 1 END) AS "scheduled_data!"
FROM scheduled_split;

/* @name getInputsForBlockHash */
WITH scheduled_split AS (
  SELECT CASE WHEN primitive_name IS NULL AND caip2 IS NOT NULL THEN 1 ELSE 0 END as submitted_input
  FROM rollup_inputs
  JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
  JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id
  JOIN paima_blocks ON paima_blocks.block_height = rollup_input_result.block_height
  WHERE (main_chain_block_hash = :block_hash! OR paima_block_hash = :block_hash!)
)
SELECT
    COUNT(CASE WHEN submitted_input = 1 THEN 1 END) AS "submitted_inputs!",
    COUNT(CASE WHEN submitted_input = 0 THEN 1 END) AS "scheduled_data!"
FROM scheduled_split;

/* @name getInputsForAddress */
WITH scheduled_split AS (
  SELECT CASE WHEN primitive_name IS NULL AND caip2 IS NOT NULL THEN 1 ELSE 0 END as submitted_input
  FROM rollup_inputs
  JOIN rollup_input_origin ON rollup_inputs.id = rollup_input_origin.id
  JOIN rollup_input_result ON rollup_inputs.id = rollup_input_result.id
  WHERE
        (
          lower(from_address) = lower(:addr!) OR
          lower(rollup_input_origin.contract_address) = lower(:addr!)
        ) AND
        block_height = :block_height!
)
SELECT
    COUNT(CASE WHEN submitted_input = 1 THEN 1 END) AS "submitted_inputs!",
    COUNT(CASE WHEN submitted_input = 0 THEN 1 END) AS "scheduled_data!"
FROM scheduled_split;
