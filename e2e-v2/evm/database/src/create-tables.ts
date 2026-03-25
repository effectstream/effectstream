import pg from "pg";

const client = new pg.Client({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "postgres",
});

await client.connect();
await client.query("CREATE TABLE IF NOT EXISTS game_results (id SERIAL PRIMARY KEY, block_height INTEGER NOT NULL, a INTEGER NOT NULL, b INTEGER NOT NULL, result INTEGER NOT NULL)");
await client.query("CREATE TABLE IF NOT EXISTS erc20_transfers (id SERIAL PRIMARY KEY, block_height INTEGER NOT NULL, from_addr TEXT NOT NULL, to_addr TEXT NOT NULL, value TEXT NOT NULL)");
await client.query("CREATE TABLE IF NOT EXISTS erc721_transfers (id SERIAL PRIMARY KEY, block_height INTEGER NOT NULL, from_addr TEXT NOT NULL, to_addr TEXT NOT NULL, token_id TEXT NOT NULL)");
await client.query("CREATE TABLE IF NOT EXISTS erc1155_transfers (id SERIAL PRIMARY KEY, block_height INTEGER NOT NULL, from_addr TEXT NOT NULL, to_addr TEXT NOT NULL, token_id TEXT NOT NULL, amount TEXT NOT NULL)");
await client.query("CREATE TABLE IF NOT EXISTS counter_results (id SERIAL PRIMARY KEY, block_height INTEGER NOT NULL, counter_value INTEGER NOT NULL)");
await client.query("CREATE TABLE IF NOT EXISTS user_state_machine (id SERIAL PRIMARY KEY, block_height INTEGER NOT NULL, inputs TEXT NOT NULL)");
await client.end();
console.log("User tables created");
