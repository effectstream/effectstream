-- Permanent record of every on-chain coin spend the node has observed. The
-- offer validator's liveness check reads these to reject an offer whose inputs
-- are already consumed — so we neither index such an offer (it can never
-- settle) nor pay Celestia fees to publish it.
--
-- Distinct from seen_nullifiers / seen_unshielded_spends: those are a TRANSIENT
-- early-arrival reconciliation buffer (rows are DELETEd once matched to an
-- indexed offer). The spent_* tables below are append-only and never pruned,
-- so a lookup is a definitive "has this coin ever been spent?".

CREATE TABLE spent_nullifiers (
    nullifier TEXT PRIMARY KEY,
    height BIGINT NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE spent_unshielded (
    owner TEXT NOT NULL,
    intent_hash TEXT NOT NULL,
    output_no INTEGER NOT NULL,
    height BIGINT NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (owner, intent_hash, output_no)
);
