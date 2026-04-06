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
  CREATE TABLE IF NOT EXISTS midnight_state (
    id SERIAL PRIMARY KEY,
    block_height INTEGER NOT NULL,
    primitive_name TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS midnight_nullifiers (
    id SERIAL PRIMARY KEY,
    block_height INTEGER NOT NULL,
    nullifier TEXT NOT NULL UNIQUE,
    tx_hash TEXT NOT NULL DEFAULT ''
  );
`);
await client.end();
console.log("Midnight user tables created");
