import pg from "pg";

const client = new pg.Client({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "postgres",
});

await client.connect();
await client.query(`
  CREATE TABLE IF NOT EXISTS bitcoin_transactions (
    id SERIAL PRIMARY KEY,
    block_height INTEGER NOT NULL,
    direction TEXT NOT NULL,
    address TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    index INTEGER NOT NULL,
    value_sats BIGINT NOT NULL,
    utxo_txid TEXT NOT NULL,
    utxo_vout INTEGER NOT NULL,
    label TEXT
  )
`);
await client.end();
console.log("Bitcoin user tables created");
