/* @name InsertKnownToken */
INSERT INTO known_tokens (token_color, name, kind)
VALUES (:token_color!, :name!, :kind!)
ON CONFLICT (token_color) DO NOTHING;

/* @name GetKnownTokens */
SELECT * FROM known_tokens;

/* @name InsertOfferFile */
INSERT INTO offer_file (
    celestia_height,
    transaction_hex,
    metadata_created_at,
    metadata_expires_at,
    metadata_maker_note,
    auth_signer_public_key,
    auth_signature,
    auth_scheme,
    ttl_seconds
) VALUES (
    :celestia_height!,
    :transaction_hex!,
    :metadata_created_at,
    :metadata_expires_at,
    :metadata_maker_note,
    :auth_signer_public_key,
    :auth_signature,
    :auth_scheme,
    COALESCE(:ttl_seconds, 3600)
) RETURNING id;

/* @name InsertOfferFileToken */
INSERT INTO offer_file_tokens (
    offer_file_id,
    token_color,
    amount,
    direction
) VALUES (
    :offer_file_id!,
    :token_color!,
    :amount!,
    :direction!
);

/* @name GetOfferFiles */
SELECT DISTINCT of.*
FROM offer_file of
LEFT JOIN offer_file_tokens oft ON oft.offer_file_id = of.id
WHERE
  (:token = '' OR oft.token_color = :token!)
  AND (:direction = 'ANY' OR oft.direction = :direction!)
ORDER BY of.created_at DESC
LIMIT :limit!
OFFSET :offset!;

/* @name GetOfferFileTokens */
SELECT * FROM offer_file_tokens WHERE offer_file_id = :offer_file_id!;

/* @name InsertOfferFileNullifier */
INSERT INTO offer_file_nullifiers (
    offer_file_id,
    nullifier
) VALUES (
    :offer_file_id!,
    :nullifier!
) ON CONFLICT (offer_file_id, nullifier) DO NOTHING;

/* @name GetOfferFileNullifiers */
SELECT * FROM offer_file_nullifiers WHERE offer_file_id = :offer_file_id!;

/* @name InsertOfferFileUnshieldedSpend */
INSERT INTO offer_file_unshielded_spends (
    offer_file_id,
    owner,
    intent_hash,
    output_no
) VALUES (
    :offer_file_id!,
    :owner!,
    :intent_hash!,
    :output_no!
) ON CONFLICT (offer_file_id, owner, intent_hash, output_no) DO NOTHING;

/* @name GetOfferFileUnshieldedSpends */
SELECT * FROM offer_file_unshielded_spends WHERE offer_file_id = :offer_file_id!;

/* @name ArchiveOfferByNullifier */
-- Archive every offer that referenced this nullifier. A single coin can
-- back multiple competing offers (different counter-asset, etc.) — all of
-- them die when the coin is spent.
WITH matched AS (
    SELECT DISTINCT offer_file_id
    FROM offer_file_nullifiers
    WHERE nullifier = :nullifier!
),
archived_offer AS (
    INSERT INTO offer_file_history (
        id,
        celestia_height,
        transaction_hex,
        metadata_created_at,
        metadata_expires_at,
        metadata_maker_note,
        auth_signer_public_key,
        auth_signature,
        auth_scheme,
        created_at,
        ttl_seconds,
        archive_reason
    )
    SELECT
        id,
        celestia_height,
        transaction_hex,
        metadata_created_at,
        metadata_expires_at,
        metadata_maker_note,
        auth_signer_public_key,
        auth_signature,
        auth_scheme,
        created_at,
        ttl_seconds,
        'CONSUMED'
    FROM offer_file
    WHERE id IN (SELECT offer_file_id FROM matched)
    RETURNING id
),
archived_tokens AS (
    INSERT INTO offer_file_tokens_history (
        offer_file_id,
        token_color,
        amount,
        direction
    )
    SELECT
        offer_file_id,
        token_color,
        amount,
        direction
    FROM offer_file_tokens
    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
),
archived_nullifiers AS (
    INSERT INTO offer_file_nullifiers_history (
        offer_file_id,
        nullifier
    )
    SELECT
        offer_file_id,
        nullifier
    FROM offer_file_nullifiers
    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
),
archived_unshielded_spends AS (
    INSERT INTO offer_file_unshielded_spends_history (
        offer_file_id,
        owner,
        intent_hash,
        output_no
    )
    SELECT
        offer_file_id,
        owner,
        intent_hash,
        output_no
    FROM offer_file_unshielded_spends
    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
)
DELETE FROM offer_file
WHERE id IN (SELECT offer_file_id FROM matched)
RETURNING id;

/* @name ArchiveOfferByUnshieldedSpend */
-- Archive every offer that referenced this unshielded UTXO. Same rule as
-- nullifiers: a single UTXO can back multiple competing offers.
WITH matched AS (
    SELECT DISTINCT offer_file_id
    FROM offer_file_unshielded_spends
    WHERE owner = :owner!
      AND intent_hash = :intent_hash!
      AND output_no = :output_no!
),
archived_offer AS (
    INSERT INTO offer_file_history (
        id,
        celestia_height,
        transaction_hex,
        metadata_created_at,
        metadata_expires_at,
        metadata_maker_note,
        auth_signer_public_key,
        auth_signature,
        auth_scheme,
        created_at,
        ttl_seconds,
        archive_reason
    )
    SELECT
        id,
        celestia_height,
        transaction_hex,
        metadata_created_at,
        metadata_expires_at,
        metadata_maker_note,
        auth_signer_public_key,
        auth_signature,
        auth_scheme,
        created_at,
        ttl_seconds,
        'CONSUMED'
    FROM offer_file
    WHERE id IN (SELECT offer_file_id FROM matched)
    RETURNING id
),
archived_tokens AS (
    INSERT INTO offer_file_tokens_history (
        offer_file_id,
        token_color,
        amount,
        direction
    )
    SELECT
        offer_file_id,
        token_color,
        amount,
        direction
    FROM offer_file_tokens
    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
),
archived_nullifiers AS (
    INSERT INTO offer_file_nullifiers_history (
        offer_file_id,
        nullifier
    )
    SELECT
        offer_file_id,
        nullifier
    FROM offer_file_nullifiers
    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
),
archived_unshielded_spends AS (
    INSERT INTO offer_file_unshielded_spends_history (
        offer_file_id,
        owner,
        intent_hash,
        output_no
    )
    SELECT
        offer_file_id,
        owner,
        intent_hash,
        output_no
    FROM offer_file_unshielded_spends
    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
)
DELETE FROM offer_file
WHERE id IN (SELECT offer_file_id FROM matched)
RETURNING id;

/* @name ArchiveOfferByIdTtl */
WITH matched AS (
    SELECT id AS offer_file_id
    FROM offer_file
    WHERE id = :offer_file_id!
    LIMIT 1
),
archived_offer AS (
    INSERT INTO offer_file_history (
        id,
        celestia_height,
        transaction_hex,
        metadata_created_at,
        metadata_expires_at,
        metadata_maker_note,
        auth_signer_public_key,
        auth_signature,
        auth_scheme,
        created_at,
        ttl_seconds,
        archive_reason
    )
    SELECT
        id,
        celestia_height,
        transaction_hex,
        metadata_created_at,
        metadata_expires_at,
        metadata_maker_note,
        auth_signer_public_key,
        auth_signature,
        auth_scheme,
        created_at,
        ttl_seconds,
        'TTL'
    FROM offer_file
    WHERE id IN (SELECT offer_file_id FROM matched)
    RETURNING id
),
archived_tokens AS (
    INSERT INTO offer_file_tokens_history (
        offer_file_id,
        token_color,
        amount,
        direction
    )
    SELECT
        offer_file_id,
        token_color,
        amount,
        direction
    FROM offer_file_tokens
    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
),
archived_nullifiers AS (
    INSERT INTO offer_file_nullifiers_history (
        offer_file_id,
        nullifier
    )
    SELECT
        offer_file_id,
        nullifier
    FROM offer_file_nullifiers
    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
),
archived_unshielded_spends AS (
    INSERT INTO offer_file_unshielded_spends_history (
        offer_file_id,
        owner,
        intent_hash,
        output_no
    )
    SELECT
        offer_file_id,
        owner,
        intent_hash,
        output_no
    FROM offer_file_unshielded_spends
    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
)
DELETE FROM offer_file
WHERE id IN (SELECT offer_file_id FROM matched)
RETURNING id;

/* @name UpsertNullifier */
INSERT INTO nullifiers (nullifier, height)
VALUES (:nullifier!, :height!)
ON CONFLICT (nullifier) DO NOTHING;

/* @name MarkNullifierMatched */
UPDATE nullifiers SET offer_matched = true WHERE nullifier = :nullifier!;

/* @name FindUnmatchedNullifier */
SELECT nullifier, height FROM nullifiers
WHERE nullifier = :nullifier! AND offer_matched = false;

/* @name IsNullifierSpent */
SELECT 1 AS spent FROM nullifiers WHERE nullifier = :nullifier!;

/* @name PruneStaleNullifiers */
DELETE FROM nullifiers WHERE offer_matched = false AND recorded_at < :cutoff_at!;

/* @name InsertCreatedUnshielded */
INSERT INTO created_unshielded (owner, intent_hash, output_no, height)
VALUES (:owner!, :intent_hash!, :output_no!, :height!)
ON CONFLICT (owner, intent_hash, output_no) DO NOTHING;

/* @name DeleteCreatedUnshielded */
DELETE FROM created_unshielded
WHERE owner = :owner!
  AND intent_hash = :intent_hash!
  AND output_no = :output_no!;

/* @name IsUnshieldedCreated */
SELECT 1 AS present
FROM created_unshielded
WHERE owner = :owner!
  AND intent_hash = :intent_hash!
  AND output_no = :output_no!;

/* @name UpsertKnownRoot */
-- Record/refresh a coin-commitment tree root the chain has held (root-known
-- set). last_seen_ms is the block time, used by PruneKnownRoots to age roots
-- out of the on-chain root window.
INSERT INTO known_roots (root, height, last_seen_ms)
VALUES (:root!, :height!, :last_seen_ms!)
ON CONFLICT (root) DO UPDATE
  SET height = EXCLUDED.height,
      last_seen_ms = EXCLUDED.last_seen_ms;

/* @name IsKnownRoot */
SELECT 1 AS present
FROM known_roots
WHERE root = :root!;

/* @name PruneKnownRoots */
-- Drop roots older than the window cutoff, but never the most recent root: on
-- a quiet chain the latest root keeps being re-accepted, mirroring the
-- ledger's past_roots re-insertion each block.
DELETE FROM known_roots
WHERE last_seen_ms < :cutoff_ms!
  AND height < (SELECT MAX(height) FROM known_roots);
