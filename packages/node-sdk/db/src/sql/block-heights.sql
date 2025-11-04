/* @name getLatestProcessedBlockHeight */
SELECT * FROM effectstream.effectstream_blocks
WHERE effectstream_block_hash IS NOT NULL
ORDER BY block_height DESC
LIMIT 1;

/* @name getBlockSeeds */
SELECT seed FROM effectstream.effectstream_blocks
WHERE effectstream_block_hash IS NOT NULL
ORDER BY block_height DESC
LIMIT 25;

/*
 @name getBlockHeights
 @param block_heights -> (...)
*/
SELECT * FROM effectstream.effectstream_blocks 
WHERE block_height IN :block_heights!
ORDER BY block_height ASC;

/*
 @name getBlockByHash
*/
SELECT curr.*, prev.effectstream_block_hash as "prev_block"
FROM effectstream.effectstream_blocks curr
LEFT JOIN effectstream.effectstream_blocks prev ON prev.block_height = curr.block_height - 1
WHERE curr.effectstream_block_hash = :block_hash! OR curr.main_chain_block_hash = :block_hash!;

/*  @name saveLastBlock */
INSERT INTO effectstream.effectstream_blocks(block_height, ver, main_chain_block_hash, seed, ms_timestamp, effectstream_block_hash)
VALUES (:block_height!, :ver!, :main_chain_block_hash!, :seed!, :ms_timestamp!, NULL)
ON CONFLICT (block_height)
DO UPDATE SET
block_height = EXCLUDED.block_height,
ver = EXCLUDED.ver,
main_chain_block_hash = EXCLUDED.main_chain_block_hash,
seed = EXCLUDED.seed,
ms_timestamp = EXCLUDED.ms_timestamp,
effectstream_block_hash = EXCLUDED.effectstream_block_hash;

/* @name blockHeightDone */
UPDATE effectstream.effectstream_blocks
SET
effectstream_block_hash = :block_hash!
WHERE block_height = :block_height!;
