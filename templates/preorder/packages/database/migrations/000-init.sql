CREATE TABLE launchpad_users (
  launchpad TEXT NOT NULL,
  wallet TEXT NOT NULL,
  payment_token TEXT NOT NULL,
  total_amount TEXT NOT NULL,
  last_referrer TEXT NOT NULL,
  last_participation_valid BOOLEAN NOT NULL,
  chain TEXT NOT NULL DEFAULT 'evm',
  PRIMARY KEY (launchpad, wallet)
);

CREATE TABLE launchpad_participations (
  launchpad TEXT NOT NULL,
  wallet TEXT NOT NULL,
  payment_token TEXT NOT NULL,
  payment_amount TEXT NOT NULL,
  referrer TEXT NOT NULL,
  item_ids TEXT NOT NULL,
  item_quantities TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  preconditions_met BOOLEAN NOT NULL,
  participation_valid BOOLEAN NOT NULL,
  chain TEXT NOT NULL DEFAULT 'evm',
  PRIMARY KEY (launchpad, tx_hash, wallet)
);

CREATE TABLE launchpad_user_items (
  launchpad TEXT NOT NULL,
  wallet TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  PRIMARY KEY (launchpad, wallet, item_id),
  FOREIGN KEY (launchpad, wallet) REFERENCES launchpad_users (launchpad, wallet)
);

CREATE TABLE cardano_payments (
  tx_hash TEXT NOT NULL,
  output_index INTEGER NOT NULL,
  payment_address TEXT NOT NULL,
  amount TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  PRIMARY KEY (tx_hash, output_index)
);
