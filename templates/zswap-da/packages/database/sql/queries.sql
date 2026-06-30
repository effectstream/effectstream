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

/* @name GetNtpCurrentBlock */
SELECT MAX(block_height) AS current FROM effectstream.effectstream_blocks;

/* @name GetSyncProtocolPagination */
SELECT protocol_name,
       MIN(page_number) AS merged,
       MAX(page_number) AS fetched
FROM effectstream.sync_protocol_pagination
GROUP BY protocol_name;

/* @name GetLatestEffectstreamBlock */
SELECT block_height, ms_timestamp, effectstream_block_hash, main_chain_block_hash
FROM effectstream.effectstream_blocks
ORDER BY block_height DESC
LIMIT 1;

/* @name GetNullifierStats */
SELECT COUNT(*)::int AS total, MAX(height) AS latest_height FROM nullifiers;

/* @name GetKnownRootStats */
SELECT COUNT(*)::int AS total, MAX(height) AS latest_height FROM known_roots;

/* @name GetUnshieldedStats */
SELECT COUNT(*)::int AS total, MAX(height) AS latest_height FROM created_unshielded;

/* @name GetLastOffer */
SELECT id, celestia_height, created_at
FROM offer_file
ORDER BY id DESC
LIMIT 1;

/* @name GetTradeHistory */
SELECT (EXTRACT(EPOCH FROM h.archived_at) * 1000)::bigint AS at_ms,
       g.token_color AS g_color, g.amount AS g_amt,
       w.token_color AS w_color, w.amount AS w_amt
FROM offer_file_history h
JOIN offer_file_tokens_history g ON g.offer_file_id = h.id AND g.direction = 'GIVING'
JOIN offer_file_tokens_history w ON w.offer_file_id = h.id AND w.direction = 'WANTING'
WHERE h.archive_reason = 'CONSUMED'
  AND ((g.token_color = :base! AND w.token_color = :quote!)
    OR (g.token_color = :quote! AND w.token_color = :base!))
ORDER BY h.archived_at DESC
LIMIT 120;

/* @name GetOpenLegs */
SELECT g.token_color AS g_color, g.amount AS g_amt,
       w.token_color AS w_color, w.amount AS w_amt
FROM offer_file o
JOIN offer_file_tokens g ON g.offer_file_id = o.id AND g.direction = 'GIVING'
JOIN offer_file_tokens w ON w.offer_file_id = o.id AND w.direction = 'WANTING'
WHERE ((g.token_color = :base! AND w.token_color = :quote!)
    OR (g.token_color = :quote! AND w.token_color = :base!));

/* @name GetTokenPrice */
SELECT price_usd FROM token_prices WHERE token_color = :token_color!;

/* @name UpsertTokenPrice */
INSERT INTO token_prices (token_color, price_usd)
VALUES (:token_color!, :price_usd!)
ON CONFLICT (token_color) DO NOTHING;

/* @name CheckTokenNameExists */
SELECT 1 AS present FROM known_tokens WHERE name = :name! LIMIT 1;

/* @name GetTokenByColor */
SELECT name FROM known_tokens WHERE token_color = :token_color! LIMIT 1;

/* @name UpsertPairStatsByOfferId */
INSERT INTO pair_stats (pair_key, base_color, quote_color, trade_count, last_price, last_traded_at)
SELECT
    LEAST(g.token_color, w.token_color) || '|' || GREATEST(g.token_color, w.token_color),
    LEAST(g.token_color, w.token_color),
    GREATEST(g.token_color, w.token_color),
    1,
    w.amount::numeric / NULLIF(g.amount::numeric, 0),
    NOW()
FROM offer_file_tokens_history g
JOIN offer_file_tokens_history w ON w.offer_file_id = g.offer_file_id AND w.direction = 'WANTING'
WHERE g.direction = 'GIVING' AND g.offer_file_id = :offer_id!
ON CONFLICT (pair_key) DO UPDATE SET
    trade_count    = pair_stats.trade_count + 1,
    last_price     = EXCLUDED.last_price,
    last_traded_at = EXCLUDED.last_traded_at;

/* @name GetPairs */
SELECT
    COALESCE(ps.pair_key, live.pair_key) AS pair_key,
    COALESCE(ps.base_color, split_part(live.pair_key, '|', 1)) AS base_color,
    COALESCE(ps.quote_color, split_part(live.pair_key, '|', 2)) AS quote_color,
    COALESCE(ps.trade_count, 0) AS trade_count,
    ps.last_price,
    ps.last_traded_at,
    COALESCE(live.open_count, 0) AS open_count
FROM pair_stats ps
FULL OUTER JOIN (
    SELECT
        LEAST(g.token_color, w.token_color) || '|' || GREATEST(g.token_color, w.token_color) AS pair_key,
        COUNT(*)::int AS open_count
    FROM offer_file_tokens g
    JOIN offer_file_tokens w ON w.offer_file_id = g.offer_file_id AND w.direction = 'WANTING'
    WHERE g.direction = 'GIVING'
    GROUP BY 1
) live ON live.pair_key = ps.pair_key
ORDER BY open_count DESC, last_traded_at DESC NULLS LAST;

/* @name GetZswapStatusByBlob */
SELECT transaction_hex, 'open' AS status, NULL::text AS archive_reason
FROM offer_file
WHERE transaction_hex = :blob!
UNION ALL
SELECT transaction_hex,
    CASE archive_reason WHEN 'CONSUMED' THEN 'completed' ELSE 'expired' END AS status,
    archive_reason
FROM offer_file_history
WHERE transaction_hex = :blob!;
