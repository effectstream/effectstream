/* @name insertNftLock */
INSERT INTO nft_locks
    (owner_address, policy_id, asset_name, status, current_tx_id, previous_tx_id, current_output_index, previous_output_index, for_how_long, block_height)
VALUES
    (:owner_address!, :policy_id!, :asset_name!, :status!, :current_tx_id!, :previous_tx_id, :current_output_index, :previous_output_index, :for_how_long, :block_height!)
;

/* @name getNftLocks */
SELECT * FROM nft_locks ORDER BY id DESC;

/* @name getNftLocksByOwner */
SELECT * FROM nft_locks
WHERE owner_address = :owner_address!
ORDER BY id DESC
;

/* @name getNftLocksByStatus */
SELECT * FROM nft_locks
WHERE status = :status!
ORDER BY id DESC
;

/* @name getActiveNftLockByAsset */
SELECT * FROM nft_locks
WHERE policy_id = :policy_id!
  AND asset_name = :asset_name!
  AND status = 'Lock'
ORDER BY id DESC
LIMIT 1
;

/* @name nftLocksTableExists */
SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE  table_schema = 'public'
    AND    table_name   = 'nft_locks'
);
