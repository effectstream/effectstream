-- deleteEmptyBlocks deletes the lone "0x0" empty marker every empty block / coalesce flush.
-- Partial index keeps it a ~1-row index scan instead of a seq-scan of the unbounded blocks table.
CREATE INDEX IF NOT EXISTS effectstream_blocks_empty_marker_idx
ON effectstream.effectstream_blocks (block_height)
WHERE effectstream_block_hash = '\x307830'::bytea;

-- Scheduled inputs by future block height (getFutureGameInputByBlockHeight, getEarliestScheduledBlockHeight MIN).
CREATE INDEX IF NOT EXISTS rollup_input_future_block_height_idx
ON effectstream.rollup_input_future_block (future_block_height);

-- Scheduled inputs by future timestamp (getFutureGameInputByMaxTimestamp, getEarliestScheduledTimestamp MIN).
CREATE INDEX IF NOT EXISTS rollup_input_future_timestamp_ms_idx
ON effectstream.rollup_input_future_timestamp (future_ms_timestamp);
