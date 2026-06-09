-- Post-sale NFT distribution.
--
-- `nft_mints` is the deterministic work-list: the `mint-nfts` admin command (an
-- on-chain EffectstreamL2 input, applied by the STM) inserts one row per
-- (campaign, chain, buyer, item) for every item a buyer owns once the campaign
-- has ended. The off-chain nft-dispatch worker drains pending rows by submitting
-- each to the batcher, which holds funds and performs the actual mint, then marks
-- the row and records the minted token in `minted_nfts`.

CREATE TABLE nft_mints (
  campaign_id TEXT NOT NULL,
  chain TEXT NOT NULL,            -- 'evm' | 'cardano'
  wallet TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'submitted' | 'minted' | 'failed'
  tx_hash TEXT,
  error TEXT,
  created_block INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, chain, wallet, item_id)
);

CREATE INDEX nft_mints_status_idx ON nft_mints (status);

-- One row per minted NFT (EVM tokenId or Cardano policy+asset).
CREATE TABLE minted_nfts (
  campaign_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  wallet TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  token_id TEXT NOT NULL,         -- EVM tokenId (decimal) or Cardano asset name (hex)
  policy_id TEXT,                 -- Cardano only
  tx_hash TEXT NOT NULL,
  PRIMARY KEY (campaign_id, chain, token_id)
);

CREATE INDEX minted_nfts_wallet_idx ON minted_nfts (campaign_id, wallet);
