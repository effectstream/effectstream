/* @name insertDelegation */
INSERT INTO delegations (block_height, address, pool, epoch, tx_hash)
VALUES (:block_height!, :address!, :pool!, :epoch!, :tx_hash)
RETURNING *;

/* @name getDelegations */
SELECT * FROM delegations ORDER BY id DESC LIMIT :limit OFFSET :offset;

/* @name getDelegationsByPool */
SELECT * FROM delegations WHERE pool = :pool! ORDER BY id DESC LIMIT :limit OFFSET :offset;

/* @name getDelegationsByAddress */
SELECT * FROM delegations WHERE address = :address! ORDER BY id DESC;

/* @name getPoolStats */
SELECT * FROM pool_stats ORDER BY pool;

/* @name getBlockHeights */
SELECT protocol_name, MAX(page_number) AS synced_page
FROM effectstream.sync_protocol_pagination
GROUP BY protocol_name
ORDER BY protocol_name;

/* @name getSyncPagination */
SELECT * FROM effectstream.sync_protocol_pagination
WHERE protocol_name = :protocol_name!
ORDER BY page_number ASC
LIMIT 1;

/* @name updatePoolStats */
INSERT INTO pool_stats (pool, total_delegators, latest_epoch, latest_block)
VALUES (:pool!, 1, :latest_epoch!, :latest_block!)
ON CONFLICT (pool) DO UPDATE SET
  total_delegators = (SELECT COUNT(DISTINCT address) FROM delegations WHERE pool = :pool!),
  latest_epoch = GREATEST(pool_stats.latest_epoch, :latest_epoch!),
  latest_block = GREATEST(pool_stats.latest_block, :latest_block!);
