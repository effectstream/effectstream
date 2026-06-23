-- Liveness sets for offer existence + root-known validation. Populated by the
-- midnight-unshielded-create and midnight-zswap-root sync primitives.
--
-- created_unshielded: every unshielded UTXO ever created on chain (regular AND
-- system transactions). Append-only, kept from genesis — an old UTXO stays
-- spendable forever, so this set must never be pruned. An offer referencing a
-- triple absent here references a UTXO the chain never created.
CREATE TABLE created_unshielded (
    owner TEXT NOT NULL,
    intent_hash TEXT NOT NULL,
    output_no INTEGER NOT NULL,
    height BIGINT NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (owner, intent_hash, output_no)
);

-- known_roots: the coin-commitment Merkle tree roots the chain has held,
-- mirroring the ledger's `past_roots`. Pruned to the configured root window
-- (the chain only accepts proofs against roots inside that window), so it is a
-- rolling set keyed by the block time the root was last seen. An offer whose
-- input proves against a root absent here cannot settle (fabricated or
-- aged-out root).
CREATE TABLE known_roots (
    root TEXT PRIMARY KEY,
    height BIGINT NOT NULL,
    last_seen_ms BIGINT NOT NULL
);

-- PruneKnownRoots runs every ~6 s (once per Midnight block) with:
--   DELETE WHERE last_seen_ms < :cutoff AND height < (SELECT MAX(height) ...)
-- Default window is 14 days at 1 root/6 s = ~201 600 rows — must be indexed.
CREATE INDEX IF NOT EXISTS idx_known_roots_last_seen_ms ON known_roots (last_seen_ms);
CREATE INDEX IF NOT EXISTS idx_known_roots_height       ON known_roots (height);
