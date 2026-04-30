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
    COALESCE(:ttl_seconds, 604800)
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
) ON CONFLICT (nullifier) DO NOTHING;

/* @name GetOfferFileNullifiers */
SELECT * FROM offer_file_nullifiers WHERE offer_file_id = :offer_file_id!;

/* @name ArchiveOfferByNullifier */
WITH matched AS (
    SELECT offer_file_id
    FROM offer_file_nullifiers
    WHERE nullifier = :nullifier!
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
)
DELETE FROM offer_file
WHERE id IN (SELECT offer_file_id FROM matched)
RETURNING id;
