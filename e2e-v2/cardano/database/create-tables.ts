import pg from "pg";

const client = new pg.Client({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "postgres",
});

await client.connect();
await client.query(
  "CREATE TABLE IF NOT EXISTS cardano_transactions (id SERIAL PRIMARY KEY, block_height INTEGER NOT NULL, tx_hash TEXT NOT NULL, bytes_hex TEXT NOT NULL)",
);
await client.end();
console.log("Cardano user tables created");
