-- Generic effectstream engine table, that can't be modified
CREATE TABLE block_heights (
  block_height INTEGER PRIMARY KEY,
  seed TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false
);

-- The five character "types" a player can mint.
CREATE TYPE nft_type AS ENUM ('air', 'earth', 'fire', 'water', 'ether');

-- A minted, level-able character NFT.
--   address: the wallet that minted / owns the character (lower-cased)
--   nft_id:  the on-chain ERC721 token id
--   level:   starts at 1, incremented by the `lvlUp` action
--   type:    the elemental character type
CREATE TABLE characters (
  address TEXT NOT NULL,
  nft_id TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  type nft_type NOT NULL,
  PRIMARY KEY (address, nft_id)
);

CREATE INDEX idx_characters_nft_id ON characters(nft_id);
