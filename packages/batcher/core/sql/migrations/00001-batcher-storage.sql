-- The queue is keyed on the request id, NEVER on the content key.
--
-- `request_id` is sha256(content_key) — 64 hex characters whatever the payload
-- weighs. `content_key` is the payload itself: `addressType|target|address|
-- timestamp|signature|input`, where `input` is the entire submitted
-- transaction. Indexing that column is not a size risk, it is a size CEILING:
-- a btree tuple may not exceed 2704 bytes (one third of an 8 KB page), and a
-- minimal real Midnight contract call is ~3.3 KB, so its content key is ~6.7 KB.
-- With `PRIMARY KEY (content_key, seq)` — which is what this table used to
-- declare — every such submission failed the index write with
-- `index row size 6880 exceeds btree version 4 maximum 2704`, rolled the
-- acceptance transaction back, and returned a 500 to the caller instead of the
-- request id that request tracking exists to hand out. Measured on BOTH rungs:
-- the ceiling is PostgreSQL's and PgLite is PostgreSQL, so the embedded engine
-- fails at the identical byte count.
--
-- Hashing changes nothing about what a row IS. Same uniqueness class (equal
-- content keys hash equal, different ones do not), same duplicate grouping
-- under `seq`, same remove-all-matching and retry-charging behaviour — the
-- callers all hold the content key already and hash it with the one
-- implementation in `core/request-id.ts`.
--
-- `seq` stays. Inputs without a replay key are allowed to queue twice, so two
-- rows may legally share a request id, and the queue is read in insertion
-- order.
--
-- `content_key` stays as an UNINDEXED column: it is diagnostic, and it is what
-- a legacy `pending-inputs.jsonl` import writes alongside the id it derives.
CREATE TABLE IF NOT EXISTS pending_inputs (
  content_key  text      NOT NULL,
  request_id   text      NOT NULL,
  seq          bigserial NOT NULL,
  row_target   text      NOT NULL,
  address      text      NOT NULL,
  address_type integer   NOT NULL,
  ts           text      NOT NULL,
  signature    text      NOT NULL DEFAULT '',
  input        text      NOT NULL,
  retry_count  integer   NOT NULL DEFAULT 0,
  payload      text      NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, seq)
);

CREATE INDEX IF NOT EXISTS pending_inputs_target_seq_idx
  ON pending_inputs (row_target, seq);

CREATE TABLE IF NOT EXISTS request_status (
  request_id       text PRIMARY KEY,
  seq              bigserial NOT NULL,
  row_target       text NOT NULL,
  address          text,
  state            text NOT NULL,
  terminal         boolean NOT NULL DEFAULT false,
  transaction_hash text,
  block_number     bigint,
  error_code       text,
  message          text,
  retry_count      integer NOT NULL DEFAULT 0,
  replay_key       text,
  accepted_at      timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS request_status_terminal_recency_idx
  ON request_status (terminal, updated_at DESC, seq DESC);

CREATE UNIQUE INDEX IF NOT EXISTS request_status_replay_key_unique_idx
  ON request_status (replay_key) WHERE replay_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS replay_keys (
  replay_key text PRIMARY KEY,
  request_id text NOT NULL,
  row_target text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS replay_keys_request_idx
  ON replay_keys (request_id);

CREATE OR REPLACE FUNCTION batcher_record_accepted(
  p_replay_key text,
  p_request_id text,
  p_row_target text,
  p_address text,
  p_address_type integer,
  p_ts text,
  p_signature text,
  p_input text,
  p_retry_count integer,
  p_payload text,
  p_content_key text,
  p_queue_request_id text
) RETURNS TABLE (
  request_id text,
  row_target text,
  address text,
  state text,
  terminal boolean,
  transaction_hash text,
  block_number bigint,
  error_code text,
  message text,
  retry_count integer,
  replay_key text,
  accepted_at timestamptz,
  updated_at timestamptz,
  outcome_created boolean,
  outcome_duplicate boolean
) LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_status request_status%ROWTYPE;
  v_created boolean := false;
BEGIN
  INSERT INTO request_status
    (request_id, row_target, address, state, terminal, retry_count, replay_key)
  VALUES
    (p_request_id, p_row_target, p_address, 'queued', false,
     p_retry_count, p_replay_key)
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_status;
  v_created := FOUND;

  IF NOT v_created THEN
    IF p_replay_key IS NOT NULL THEN
      SELECT s.* INTO v_status
        FROM request_status s
       WHERE s.replay_key = p_replay_key;
      IF FOUND THEN
        RETURN QUERY SELECT
          v_status.request_id, v_status.row_target, v_status.address,
          v_status.state, v_status.terminal,
          v_status.transaction_hash, v_status.block_number,
          v_status.error_code, v_status.message, v_status.retry_count,
          v_status.replay_key, v_status.accepted_at, v_status.updated_at,
          false, true;
        RETURN;
      END IF;
    END IF;
    SELECT s.* INTO STRICT v_status
      FROM request_status s
     WHERE s.request_id = p_request_id;
  END IF;

  INSERT INTO pending_inputs
    (content_key, request_id, row_target, address, address_type, ts,
     signature, input, retry_count, payload)
  VALUES
    (p_content_key, p_queue_request_id, p_row_target, p_address,
     p_address_type, p_ts, p_signature, p_input, p_retry_count, p_payload);

  RETURN QUERY SELECT
    v_status.request_id, v_status.row_target, v_status.address,
    v_status.state, v_status.terminal,
    v_status.transaction_hash, v_status.block_number,
    v_status.error_code, v_status.message, v_status.retry_count,
    v_status.replay_key, v_status.accepted_at, v_status.updated_at,
    v_created, false;
END;
$$;
