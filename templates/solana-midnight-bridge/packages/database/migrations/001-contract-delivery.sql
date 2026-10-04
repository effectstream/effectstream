-- 00058: delivery into contracts (plan 00058 Interfaces D-6, I-3 (a)).
--
-- Applied to a FRESH database only. @effectstream/runtime applies a migration
-- while it processes the block equal to its `blockHeight` (default 1;
-- node-sdk/db/src/migrations.ts getMigrationsForBlockHeight, called per block
-- by node-sdk/runtime/src/process-blocks.ts), so on a database synced past
-- block 1 this file never runs. The node therefore checks the schema at start
-- (packages/node/schema-check.ts) and refuses an older database: wipe it and
-- re-sync from the deployment's start heights.

-- s2m only: 'wallet' for a Solana LOCK (a shielded wallet), 'contract' for a
-- LockToContract (a Midnight contract). NULL on m2s rows, and on an s2m row
-- that sync has seen only on Midnight so far (its lock not observed yet).
ALTER TABLE bridge_transfers
  ADD COLUMN recipient_kind TEXT CHECK (recipient_kind IN ('wallet', 'contract'));

-- OWNED BY THE RELAYER. A contract recipient the delivery router refused: set
-- ONLY before any operator signature (never on a row with submitted_at), and
-- terminal for the relayer. Deleting the row makes the relayer classify the
-- transfer again (README, "Re-evaluating an undeliverable transfer").
-- `delivery` is the last delivery attempt that was submitted:
--   {"adapter": "...", "account": "<64 hex>",
--    "coin": {"nonce": "<64 hex>", "colour": "<64 hex>", "value": "<decimal>"} | null,
--    "tx": "<midnight tx>" | null}
ALTER TABLE relayer_jobs
  ADD COLUMN undeliverable_code TEXT CHECK (undeliverable_code IN (
    'no-adapter', 'not-a-contract', 'not-a-passport-account', 'authority-live', 'bad-enc-key', 'wrong-network', 'counters'
  )),
  ADD COLUMN undeliverable_reason TEXT,
  ADD COLUMN undeliverable_at TIMESTAMPTZ,
  ADD COLUMN delivery JSONB;
