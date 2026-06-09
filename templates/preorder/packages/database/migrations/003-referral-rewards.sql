-- Captured referral payouts. EVM rows come from the launchpad's on-chain ReferrerReward event
-- (via a dedicated primitive); Cardano rows are recorded by the cardano-payment transition
-- (reward = lovelace paid * referrer_reward_bps / 10000, mirroring what the validator enforced).
CREATE TABLE referral_rewards (
  id SERIAL PRIMARY KEY,
  campaign_id TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL,
  buyer TEXT NOT NULL,
  chain TEXT NOT NULL, -- 'evm' | 'cardano'
  payment_token TEXT NOT NULL,
  amount TEXT NOT NULL, -- reward in the coin's smallest unit
  tx_hash TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  created_block INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX referral_rewards_campaign_idx ON referral_rewards (campaign_id);
CREATE INDEX referral_rewards_referrer_idx ON referral_rewards (campaign_id, referrer);
