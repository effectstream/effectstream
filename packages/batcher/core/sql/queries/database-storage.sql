/* @name findPendingWithoutRequestId */
SELECT content_key, seq
FROM pending_inputs
WHERE request_id = '';

/* @name backfillPendingRequestId */
UPDATE pending_inputs
SET request_id = :request_id!
WHERE content_key = :content_key!
  AND seq = :seq!;

/* @name countPendingInputs */
SELECT count(*)::int AS count
FROM pending_inputs;

/* @name synthesizeQueuedStatuses */
INSERT INTO request_status
  (request_id, row_target, address, state, terminal, retry_count, accepted_at, updated_at)
SELECT p.request_id,
       min(p.row_target),
       min(p.address),
       'queued',
       false,
       min(p.retry_count),
       min(p.created_at),
       now()
FROM pending_inputs p
LEFT JOIN request_status s ON s.request_id = p.request_id
WHERE s.request_id IS NULL
GROUP BY p.request_id
RETURNING request_id;

/* @name countOrphanedStatuses */
SELECT count(*)::int AS count
FROM request_status s
WHERE NOT s.terminal
  AND NOT EXISTS (
    SELECT 1
    FROM pending_inputs p
    WHERE p.request_id = s.request_id
  );

/* @name insertPendingInput */
INSERT INTO pending_inputs
  (content_key, request_id, row_target, address, address_type, ts,
   signature, input, retry_count, payload)
VALUES
  (:content_key!, :request_id!, :row_target!, :address!, :address_type!, :ts!,
   :signature!, :input!, :retry_count!, :payload!);

/* @name getAllPendingPayloads */
SELECT payload
FROM pending_inputs
ORDER BY seq;

/* @name getPendingPayloadsByTarget */
SELECT payload
FROM pending_inputs
WHERE (
  CASE
    WHEN row_target IS NULL OR row_target = '' THEN :default_target!
    ELSE row_target
  END
) = :target!
ORDER BY seq;

/*
 @name deletePendingByContentKeys
 @param content_keys -> (...)
*/
DELETE FROM pending_inputs
WHERE content_key IN :content_keys!
RETURNING 1::int AS one;

/* @name getPendingInputCountAndSize */
SELECT count(*)::int AS count,
       COALESCE(sum(length(payload)), 0)::bigint AS size
FROM pending_inputs;

/*
 @name getPendingForRetry
 @param content_keys -> (...)
*/
SELECT content_key, seq, retry_count, payload
FROM pending_inputs
WHERE content_key IN :content_keys!
ORDER BY seq
FOR UPDATE;

/* @name deletePendingByIdentity */
DELETE FROM pending_inputs
WHERE content_key = :content_key!
  AND seq = :seq!;

/* @name updatePendingRetry */
UPDATE pending_inputs
SET retry_count = :retry_count!,
    payload = :payload!
WHERE content_key = :content_key!
  AND seq = :seq!;

/* @name clearPendingInputs */
DELETE FROM pending_inputs;

/* @name pruneTerminalByAge */
DELETE FROM request_status
WHERE terminal
  AND updated_at < now() - (:ttl_ms!::bigint * interval '1 millisecond')
RETURNING request_id;

/* @name pruneTerminalByCount */
DELETE FROM request_status rs
USING (
  SELECT request_id,
         row_number() OVER (ORDER BY updated_at DESC, seq DESC) AS rn
  FROM request_status
  WHERE terminal
) ranked
WHERE rs.request_id = ranked.request_id
  AND ranked.rn > :keep_count!
RETURNING rs.request_id;

/*
 @name deleteReplayKeysByRequestIds
 @param request_ids -> (...)
*/
DELETE FROM replay_keys
WHERE request_id IN :request_ids!;

/* @name recordAccepted */
SELECT *
FROM batcher_record_accepted(
  :replay_key,
  :request_id!,
  :row_target!,
  :address!,
  :address_type!,
  :ts!,
  :signature!,
  :input!,
  :retry_count!,
  :payload!,
  :content_key!,
  :queue_request_id!
);

/* @name getStatusForUpdate */
SELECT *
FROM request_status
WHERE request_id = :request_id!
FOR UPDATE;

/* @name updateRequestStatus */
UPDATE request_status
SET state = :state!,
    terminal = :terminal!,
    transaction_hash = COALESCE(:transaction_hash, transaction_hash),
    block_number = COALESCE(:block_number::bigint, block_number),
    error_code = COALESCE(:error_code, error_code),
    message = COALESCE(:message, message),
    retry_count = COALESCE(:retry_count::int, retry_count),
    updated_at = now()
WHERE request_id = :request_id!
RETURNING *;

/* @name recordTransitions */
WITH input AS MATERIALIZED (
  SELECT
    ordinality::int AS ord,
    item->>'requestId' AS requested_id,
    item->>'state' AS next_state,
    item->'detail'->>'transactionHash' AS next_transaction_hash,
    NULLIF(item->'detail'->>'blockNumber', '')::bigint AS next_block_number,
    item->'detail'->>'errorCode' AS next_error_code,
    item->'detail'->>'message' AS next_message,
    NULLIF(item->'detail'->>'retryCount', '')::int AS next_retry_count
  FROM jsonb_array_elements(:transitions!::jsonb)
       WITH ORDINALITY AS source(item, ordinality)
), locked AS MATERIALIZED (
  SELECT
    i.*,
    s.request_id, s.row_target, s.address, s.state, s.terminal,
    s.transaction_hash, s.block_number, s.error_code, s.message,
    s.retry_count, s.replay_key, s.accepted_at, s.updated_at
  FROM input i
  JOIN request_status s ON s.request_id = i.requested_id
  ORDER BY s.request_id
  FOR UPDATE OF s
), evaluated AS MATERIALIZED (
  SELECT l.*,
    CASE
      WHEN l.terminal THEN 'already-terminal'
      WHEN
        CASE l.next_state
          WHEN 'queued' THEN 0
          WHEN 'batching' THEN 1
          WHEN 'submitted' THEN 2
          ELSE 3
        END <
        CASE l.state
          WHEN 'queued' THEN 0
          WHEN 'batching' THEN 1
          WHEN 'submitted' THEN 2
          ELSE 3
        END THEN 'regression'
      ELSE NULL
    END AS refusal
  FROM locked l
), updated AS (
  UPDATE request_status s
  SET state = e.next_state,
      terminal = e.next_state IN ('confirmed', 'failed'),
      transaction_hash = COALESCE(e.next_transaction_hash, s.transaction_hash),
      block_number = COALESCE(e.next_block_number, s.block_number),
      error_code = COALESCE(e.next_error_code, s.error_code),
      message = COALESCE(e.next_message, s.message),
      retry_count = COALESCE(e.next_retry_count, s.retry_count),
      updated_at = now()
  FROM evaluated e
  WHERE s.request_id = e.requested_id
    AND e.refusal IS NULL
  RETURNING e.ord, true AS applied, NULL::text AS refused,
    s.request_id, s.row_target, s.address, s.state, s.terminal,
    s.transaction_hash, s.block_number, s.error_code, s.message,
    s.retry_count, s.replay_key, s.accepted_at, s.updated_at
), refused AS (
  SELECT e.ord, false AS applied, e.refusal AS refused,
    e.request_id, e.row_target, e.address, e.state, e.terminal,
    e.transaction_hash, e.block_number, e.error_code, e.message,
    e.retry_count, e.replay_key, e.accepted_at, e.updated_at
  FROM evaluated e
  WHERE e.refusal IS NOT NULL
), unknown AS (
  SELECT i.ord, false AS applied, 'unknown-request'::text AS refused,
    NULL::text AS request_id, NULL::text AS row_target,
    NULL::text AS address, NULL::text AS state, NULL::boolean AS terminal,
    NULL::text AS transaction_hash, NULL::bigint AS block_number,
    NULL::text AS error_code, NULL::text AS message,
    NULL::integer AS retry_count, NULL::text AS replay_key,
    NULL::timestamptz AS accepted_at, NULL::timestamptz AS updated_at
  FROM input i
  LEFT JOIN locked l ON l.ord = i.ord
  WHERE l.ord IS NULL
)
SELECT * FROM updated
UNION ALL
SELECT * FROM refused
UNION ALL
SELECT * FROM unknown
ORDER BY ord;

/* @name getStatus */
SELECT *
FROM request_status
WHERE request_id = :request_id!;

/* @name getStatusByReplayKey */
SELECT s.*
FROM request_status s
WHERE s.replay_key = :replay_key!;
