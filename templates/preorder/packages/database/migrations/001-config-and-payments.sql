-- Deterministic config tables.
--
-- These hold all launchpad/campaign/product parameters that used to live in the
-- `launchpadsData` TypeScript const. They are written ONLY by the state machine, in
-- response to on-chain EffectstreamL2 admin inputs (create-campaign / set-product /
-- end-campaign), and read by purchase validation, the API, and the frontend. Because
-- every config mutation is sequenced on-chain just like a purchase, replay is
-- deterministic. The `offchain_` prefix marks them as operator/admin config (as opposed
-- to the on-chain-derived participation tables in 000-init.sql).

CREATE TABLE offchain_campaigns (
  campaign_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image TEXT,
  launchpad_address TEXT NOT NULL,
  -- Campaign routing key: the STM only processes a BuyItems event whose emitted
  -- `receiver` matches this. Lets one launchpad contract optionally serve many receivers.
  receiver TEXT NOT NULL,
  cardano_payment_address TEXT,
  cardano_payment_address_hex TEXT,
  referral_discount_bps INTEGER NOT NULL DEFAULT 0,
  referrer_reward_bps INTEGER NOT NULL DEFAULT 0,
  ts_start_whitelist BIGINT,
  ts_start_public BIGINT NOT NULL DEFAULT 0,
  ts_end_sale BIGINT NOT NULL DEFAULT 9999999999,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'ended'
  admin TEXT NOT NULL,
  created_block INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id)
);

CREATE UNIQUE INDEX offchain_campaigns_slug_idx ON offchain_campaigns (slug);
CREATE INDEX offchain_campaigns_receiver_idx ON offchain_campaigns (receiver);

CREATE TABLE offchain_products (
  campaign_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image TEXT,
  supply INTEGER, -- NULL = unlimited
  kind TEXT NOT NULL DEFAULT 'standard', -- 'standard' | 'reward'
  PRIMARY KEY (campaign_id, item_id)
);

-- Per item, per payment token. For standard items `amount` is the price; for reward
-- items (kind='reward') it is the spend threshold at which the item unlocks
-- (is_free_threshold = true).
CREATE TABLE offchain_product_prices (
  campaign_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  payment_token TEXT NOT NULL,
  amount TEXT NOT NULL,
  is_free_threshold BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (campaign_id, item_id, payment_token)
);

CREATE TABLE offchain_curated_packages (
  campaign_id TEXT NOT NULL,
  package_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (campaign_id, package_name)
);

CREATE TABLE offchain_curated_package_items (
  campaign_id TEXT NOT NULL,
  package_name TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, package_name, item_id)
);

-- Unified payment ledger: every EVM buy-items and every Cardano receipt becomes a row
-- here with a valid/invalid status. Additive alongside launchpad_participations and
-- cardano_payments (those are unchanged).
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  campaign_id TEXT NOT NULL DEFAULT '',
  chain TEXT NOT NULL, -- 'evm' | 'cardano'
  wallet TEXT NOT NULL,
  payment_token TEXT NOT NULL,
  amount TEXT NOT NULL,
  item_ids TEXT NOT NULL DEFAULT '',
  item_quantities TEXT NOT NULL DEFAULT '',
  tx_hash TEXT NOT NULL,
  output_index INTEGER,
  block_height INTEGER NOT NULL,
  status TEXT NOT NULL, -- 'valid' | 'invalid'
  reason TEXT NOT NULL DEFAULT '',
  created_block INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX payments_campaign_idx ON payments (campaign_id);
CREATE INDEX payments_wallet_idx ON payments (campaign_id, wallet);
CREATE INDEX payments_status_idx ON payments (campaign_id, status);
