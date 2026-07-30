-- Per-source block hashes, for reorg detection.
--
-- Every ChainBlock already carries blockInfo[] = {protocol_name, block_number,
-- blockHash}, but it was used for MQTT events and logging and then discarded,
-- so a reorg on a source chain was undetectable after the fact:
-- effectstream_blocks.main_chain_block_hash is a placeholder derived from the
-- block number, not a real chain hash.
--
-- Written inside the same transaction that commits the block (alongside the
-- sync_protocol_pagination resume marker), then pruned to a bounded window per
-- protocol. The window sets the maximum reorg depth that can be diagnosed.
CREATE TABLE IF NOT EXISTS effectstream.sync_protocol_block_hash (
  protocol_name TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  -- The effectstream block this source block was merged into, so an incident
  -- report can translate "source chain reorged from block N" into the range of
  -- effectstream blocks whose state derives from it.
  effectstream_block_height INTEGER NOT NULL,
  PRIMARY KEY (protocol_name, block_number)
);

CREATE INDEX IF NOT EXISTS sync_protocol_block_hash_effectstream_height_idx
  ON effectstream.sync_protocol_block_hash (protocol_name, effectstream_block_height);
