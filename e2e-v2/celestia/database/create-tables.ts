import pg from "pg";

const client = new pg.Client({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "postgres",
});

await client.connect();
await client.query("CREATE TABLE IF NOT EXISTS celestia_blobs (id SERIAL PRIMARY KEY, block_height INTEGER NOT NULL, content TEXT NOT NULL)");
await client.end();
console.log("Celestia user tables created");
