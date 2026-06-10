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

/* @name UpsertSeenNullifier */
-- Persist a nullifier event that did not (yet) match any indexed offer,
-- so a later-arriving Celestia offer can reconcile against it.
INSERT INTO seen_nullifiers (nullifier, first_seen_height)
VALUES (:nullifier!, :first_seen_height!)
ON CONFLICT (nullifier) DO NOTHING;

/* @name FindSeenNullifier */
SELECT nullifier, first_seen_height
FROM seen_nullifiers
WHERE nullifier = :nullifier!;

/* @name DeleteSeenNullifier */
DELETE FROM seen_nullifiers WHERE nullifier = :nullifier!;

/* @name UpsertSeenUnshieldedSpend */
INSERT INTO seen_unshielded_spends (owner, intent_hash, output_no, first_seen_height)
VALUES (:owner!, :intent_hash!, :output_no!, :first_seen_height!)
ON CONFLICT (owner, intent_hash, output_no) DO NOTHING;

/* @name FindSeenUnshieldedSpend */
SELECT owner, intent_hash, output_no, first_seen_height
FROM seen_unshielded_spends
WHERE owner = :owner!
  AND intent_hash = :intent_hash!
  AND output_no = :output_no!;

/* @name DeleteSeenUnshieldedSpend */
DELETE FROM seen_unshielded_spends
WHERE owner = :owner!
  AND intent_hash = :intent_hash!
  AND output_no = :output_no!;
