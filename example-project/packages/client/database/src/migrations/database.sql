CREATE TABLE evm_midnight (
  id SERIAL PRIMARY KEY,
  token_id TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  owner TEXT,
  block_height INTEGER NOT NULL
);
CREATE UNIQUE INDEX evm_midnight_contract_address_index ON evm_midnight(contract_address, token_id);

CREATE TABLE evm_midnight_properties (
  id SERIAL PRIMARY KEY,
  property_name TEXT NOT NULL,
  value TEXT NOT NULL,
  token_id TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  FOREIGN KEY (contract_address, token_id) REFERENCES evm_midnight(contract_address, token_id)
);
CREATE UNIQUE INDEX evm_midnight_properties_contract_address_token_id_index ON evm_midnight_properties(contract_address, token_id, property_name);