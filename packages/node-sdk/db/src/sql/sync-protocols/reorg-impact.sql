/*
 * Impact assessment for a reorg incident report.
 *
 * All four tables key state by effectstream block height, so "which blocks were
 * affected" translates directly into "what state was derived from them". If
 * every count is zero, the reorg touched only empty blocks and no operator
 * action is required — which is the common case and worth saying explicitly.
 */

/* @name countPrimitivesInRange */
SELECT primitive_name, COUNT(*)::int AS count
FROM effectstream.primitive_accounting
WHERE effectstream_block_height >= :from_height!
  AND effectstream_block_height <= :to_height!
GROUP BY primitive_name
ORDER BY primitive_name;

/* @name countInputResultsInRange */
SELECT
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE success)::int AS succeeded,
  COUNT(*) FILTER (WHERE NOT success)::int AS failed
FROM effectstream.rollup_input_result
WHERE block_height >= :from_height!
  AND block_height <= :to_height!;

/* @name countAppEventsInRange */
SELECT COUNT(*)::int AS count
FROM effectstream.event
WHERE block_height >= :from_height!
  AND block_height <= :to_height!;

/* @name countNoncesInRange */
SELECT COUNT(*)::int AS count
FROM effectstream.nonces
WHERE block_height >= :from_height!
  AND block_height <= :to_height!;

/* Bounds the affected range for the report header. */
/* @name getBlockRangeInfo */
SELECT
  MIN(block_height)::int AS min_height,
  MAX(block_height)::int AS max_height,
  COUNT(*)::int AS block_count
FROM effectstream.effectstream_blocks
WHERE block_height >= :from_height!
  AND block_height <= :to_height!;
