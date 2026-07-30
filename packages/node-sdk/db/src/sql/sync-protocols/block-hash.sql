/* @name upsertBlockHash */
INSERT INTO
  effectstream.sync_protocol_block_hash (
    protocol_name,
    block_number,
    block_hash,
    effectstream_block_height
  )
VALUES (
  :protocol_name!,
  :block_number!,
  :block_hash!,
  :effectstream_block_height!
)
ON CONFLICT (protocol_name, block_number) DO UPDATE SET
  block_hash = EXCLUDED.block_hash,
  effectstream_block_height = EXCLUDED.effectstream_block_height;

/* @name getBlockHash */
SELECT * FROM effectstream.sync_protocol_block_hash
WHERE protocol_name = :protocol_name!
  AND block_number = :block_number!;

/* @name getLatestBlockHash */
SELECT * FROM effectstream.sync_protocol_block_hash
WHERE protocol_name = :protocol_name!
ORDER BY block_number DESC
LIMIT 1;

/*
 * Recorded hashes at or above a height, oldest first — used to walk back from a
 * detected mismatch to the fork point.
 */
/* @name getBlockHashesFrom */
SELECT * FROM effectstream.sync_protocol_block_hash
WHERE protocol_name = :protocol_name!
  AND block_number >= :block_number!
ORDER BY block_number ASC;

/* Bounds the table, and with it the maximum diagnosable reorg depth. */
/* @name pruneBlockHashes */
DELETE FROM effectstream.sync_protocol_block_hash
WHERE protocol_name = :protocol_name!
  AND block_number < :block_number!;

/*
 * The lowest effectstream block whose state derives from source blocks at or
 * above `block_number` — the start of the affected range for an incident report.
 */
/* @name getEffectstreamHeightForSourceBlock */
SELECT MIN(effectstream_block_height) AS min_height
FROM effectstream.sync_protocol_block_hash
WHERE protocol_name = :protocol_name!
  AND block_number >= :block_number!;
