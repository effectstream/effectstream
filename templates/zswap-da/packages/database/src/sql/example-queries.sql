/* @name InsertKnownToken */
INSERT INTO known_tokens (token_color, name)
VALUES (:token_color!, :name!)
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
    is_active
) VALUES (
    :celestia_height!,
    :transaction_hex!,
    :metadata_created_at,
    :metadata_expires_at,
    :metadata_maker_note,
    :auth_signer_public_key,
    :auth_signature,
    :auth_scheme,
    :is_active!
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
SELECT * FROM offer_file ORDER BY created_at DESC;

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
