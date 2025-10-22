CREATE TABLE evm_midnight (
  id SERIAL PRIMARY KEY,
  chain TEXT NOT NULL,
  token_id TEXT NOT NULL,
  amount numeric(78,0) NOT NULL,
  contract_address TEXT NOT NULL,
  owner TEXT NOT NULL,
  block_height INTEGER NOT NULL
);

CREATE UNIQUE INDEX evm_midnight_contract_address_index ON evm_midnight(contract_address, token_id, owner);
