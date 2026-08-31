-- Track account-NFT ownership so the game can answer "which account NFT does
-- this wallet own?" (used by createdLobby / buyCardPack / setTradeNftCards to
-- verify the signer owns the NFT they're acting as).
CREATE TABLE IF NOT EXISTS nft_ownership (
  nft_id INTEGER NOT NULL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nft_ownership_wallet ON nft_ownership(wallet_address);
