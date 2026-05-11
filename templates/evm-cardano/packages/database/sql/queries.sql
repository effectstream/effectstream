/* @name insertEvent */
INSERT INTO events (chain, event_type, from_address, to_address, amount, tx_hash, block_height)
VALUES (:chain!, :event_type!, :from_address, :to_address, :amount, :tx_hash!, :block_height!)
RETURNING *;

/* @name getEvents */
SELECT * FROM events ORDER BY id DESC LIMIT :limit OFFSET :offset;

/* @name getEventsByChain */
SELECT * FROM events WHERE chain = :chain! ORDER BY id DESC LIMIT :limit OFFSET :offset;

/* @name getChainStats */
SELECT * FROM chain_stats ORDER BY chain;

/* @name updateChainStats */
UPDATE chain_stats
SET latest_block = GREATEST(latest_block, :block_height!),
    total_events = total_events + 1
WHERE chain = :chain!;
