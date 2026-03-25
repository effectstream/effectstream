import pg from "pg";

const client = new pg.Client({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "postgres",
});

await client.connect();
await client.query("CREATE TABLE IF NOT EXISTS near_events (id SERIAL PRIMARY KEY, block_height INTEGER NOT NULL, content TEXT NOT NULL)");
await client.query("CREATE TABLE IF NOT EXISTS near_intent_events (id SERIAL PRIMARY KEY, block_height INTEGER NOT NULL, account_id TEXT NOT NULL, intent_hash TEXT NOT NULL, token_diffs JSONB NOT NULL)");
await client.end();
console.log("NEAR user tables created");
