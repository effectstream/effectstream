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