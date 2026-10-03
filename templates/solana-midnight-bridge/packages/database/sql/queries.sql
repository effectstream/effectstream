/* @name upsertLockObserved */
INSERT INTO bridge_transfers (direction, source_id, amount, recipient, sender, status, src_ref, observed_block)
VALUES ('s2m', :source_id!, :amount!, :recipient!, :sender!, 'observed', :src_ref!, :block_height!)
ON CONFLICT (direction, source_id) DO UPDATE
  SET recipient = COALESCE(bridge_transfers.recipient, EXCLUDED.recipient),
      sender = COALESCE(bridge_transfers.sender, EXCLUDED.sender),
      src_ref = COALESCE(bridge_transfers.src_ref, EXCLUDED.src_ref);

/* @name upsertMintCompleted */
INSERT INTO bridge_transfers (direction, source_id, amount, status, dst_ref, observed_block, completed_block, completed_at)
VALUES ('s2m', :source_id!, :amount!, 'completed', :dst_ref!, :block_height!, :block_height!, NOW())
ON CONFLICT (direction, source_id) DO UPDATE
  SET status = 'completed',
      dst_ref = EXCLUDED.dst_ref,
      completed_block = EXCLUDED.completed_block,
      completed_at = NOW()
  WHERE bridge_transfers.status <> 'completed';

/* @name upsertWithdrawalObserved */
INSERT INTO bridge_transfers (direction, source_id, amount, recipient, status, src_ref, observed_block)
VALUES ('m2s', :source_id!, :amount!, :recipient!, 'observed', :src_ref!, :block_height!)
ON CONFLICT (direction, source_id) DO UPDATE
  SET recipient = COALESCE(bridge_transfers.recipient, EXCLUDED.recipient),
      src_ref = COALESCE(bridge_transfers.src_ref, EXCLUDED.src_ref);

/* @name upsertReleaseCompleted */
INSERT INTO bridge_transfers (direction, source_id, amount, recipient, status, dst_ref, observed_block, completed_block, completed_at)
VALUES ('m2s', :source_id!, :amount!, :recipient!, 'completed', :dst_ref!, :block_height!, :block_height!, NOW())
ON CONFLICT (direction, source_id) DO UPDATE
  SET status = 'completed',
      dst_ref = EXCLUDED.dst_ref,
      recipient = COALESCE(bridge_transfers.recipient, EXCLUDED.recipient),
      completed_block = EXCLUDED.completed_block,
      completed_at = NOW()
  WHERE bridge_transfers.status <> 'completed';

/* @name getTransfer */
SELECT t.direction, t.source_id, t.amount, t.recipient, t.sender, t.status, t.src_ref, t.dst_ref,
       t.observed_block, t.completed_block, t.observed_at, t.completed_at,
       CASE WHEN t.status = 'completed' THEN 'completed'
            WHEN j.submitted_at IS NOT NULL THEN 'submitted'
            ELSE 'observed' END AS state,
       j.attempts, j.submitted_at, j.last_attempt_at, j.last_error, j.last_tx
FROM bridge_transfers t
LEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id
WHERE t.direction = :direction! AND t.source_id = :source_id!;

/* @name listTransfers */
SELECT * FROM (
  SELECT t.direction, t.source_id, t.amount, t.recipient, t.sender, t.status, t.src_ref, t.dst_ref,
         t.observed_block, t.completed_block, t.observed_at, t.completed_at,
         CASE WHEN t.status = 'completed' THEN 'completed'
              WHEN j.submitted_at IS NOT NULL THEN 'submitted'
              ELSE 'observed' END AS state,
         j.attempts, j.submitted_at, j.last_attempt_at, j.last_error, j.last_tx
  FROM bridge_transfers t
  LEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id
) v
WHERE (CAST(:direction AS TEXT) IS NULL OR v.direction = :direction)
  AND (CAST(:state AS TEXT) IS NULL OR v.state = :state)
ORDER BY v.observed_block DESC, v.direction, v.source_id DESC
LIMIT :limit!;

/* @name listRelayerCandidates */
SELECT t.direction, t.source_id, t.amount, t.recipient,
       j.attempts, j.last_attempt_at, j.last_tx, j.last_error
FROM bridge_transfers t
LEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id
WHERE t.status = 'observed' AND t.recipient IS NOT NULL
ORDER BY t.direction, t.source_id
LIMIT :limit!;

/* @name recordRelayerAttempt */
INSERT INTO relayer_jobs (direction, source_id, submitted_at, attempts, last_attempt_at)
VALUES (:direction!, :source_id!, :now!, 1, :now!)
ON CONFLICT (direction, source_id) DO UPDATE
  SET attempts = relayer_jobs.attempts + 1,
      submitted_at = COALESCE(relayer_jobs.submitted_at, EXCLUDED.submitted_at),
      last_attempt_at = EXCLUDED.last_attempt_at;

/* @name recordRelayerResult */
UPDATE relayer_jobs
SET last_tx = COALESCE(:last_tx, last_tx),
    last_error = :last_error
WHERE direction = :direction! AND source_id = :source_id!;
