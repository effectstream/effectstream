/* @name upsertEligibleVoter */
INSERT INTO eligible_voters
    (staking_credential, pool, epoch, block_height)
VALUES
    (:staking_credential!, :pool!, :epoch!, :block_height!)
ON CONFLICT (staking_credential)
DO UPDATE SET
    pool = EXCLUDED.pool,
    epoch = EXCLUDED.epoch,
    block_height = EXCLUDED.block_height
;

/* @name getEligibleVoter */
SELECT * FROM eligible_voters
WHERE staking_credential = :staking_credential!
;

/* @name upsertProposal */
INSERT INTO proposals
    (id, title, active, block_height)
VALUES
    (:id!, :title, :active!, :block_height!)
ON CONFLICT (id)
DO UPDATE SET
    title = COALESCE(EXCLUDED.title, proposals.title),
    active = EXCLUDED.active,
    block_height = EXCLUDED.block_height,
    updated_at = NOW()
;

/* @name upsertVoteTally */
INSERT INTO vote_tallies
    (proposal_id, yes_count, no_count, block_height)
VALUES
    (:proposal_id!, :yes_count!, :no_count!, :block_height!)
ON CONFLICT (proposal_id)
DO UPDATE SET
    yes_count = EXCLUDED.yes_count,
    no_count = EXCLUDED.no_count,
    block_height = EXCLUDED.block_height,
    updated_at = NOW()
;

/* @name getProposals */
SELECT
    p.id,
    p.title,
    p.active,
    p.block_height,
    COALESCE(vt.yes_count, 0) as yes_count,
    COALESCE(vt.no_count, 0) as no_count
FROM proposals p
LEFT JOIN vote_tallies vt ON p.id = vt.proposal_id
ORDER BY p.id ASC
;

/* @name getAllEligibleVoters */
SELECT * FROM eligible_voters ORDER BY id ASC;

/* @name eligibleVotersTableExists */
SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE  table_schema = 'public'
    AND    table_name   = 'eligible_voters'
);
