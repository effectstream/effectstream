CREATE TABLE quotes (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  from_token TEXT NOT NULL,
  filler TEXT NOT NULL,
  to_token TEXT NOT NULL,
  from_amount NUMERIC(78,0) NOT NULL,
  to_amount NUMERIC(78,0) NOT NULL,
  fee NUMERIC(78,0) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX quotes_order_id_filler_index ON quotes(order_id, filler);

CREATE TABLE deposits (
  id SERIAL PRIMARY KEY,
  amount NUMERIC(78,0) NOT NULL,
  token TEXT NOT NULL,
  chain_id TEXT NOT NULL,
  user_address TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE intents (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_address TEXT NOT NULL,
  origin_chain_id TEXT NOT NULL,
  open_deadline TEXT NOT NULL,
  fill_deadline TEXT NOT NULL,
  max_spent_token TEXT NOT NULL,
  max_spent_amount TEXT NOT NULL,
  max_spent_recipient TEXT NOT NULL,
  max_spent_chain_id TEXT NOT NULL,
  min_received_token TEXT NOT NULL,
  min_received_amount TEXT NOT NULL,
  min_received_recipient TEXT NOT NULL,
  min_received_chain_id TEXT NOT NULL,
  destination_chain_id TEXT NOT NULL,
  destination_settler TEXT NOT NULL,
  origin_data TEXT NOT NULL,
  status TEXT NOT NULL
);

create unique index intents_order_id_index on intents(order_id);

CREATE TABLE transfers (
  id SERIAL PRIMARY KEY,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount NUMERIC(78,0) NOT NULL,
  token TEXT NOT NULL,
  chain_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
