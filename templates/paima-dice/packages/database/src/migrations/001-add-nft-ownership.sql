-- Add NFT ownership tracking table
CREATE TABLE IF NOT EXISTS nft_ownership (
  nft_id INTEGER NOT NULL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nft_ownership_wallet ON nft_ownership(wallet_address);
