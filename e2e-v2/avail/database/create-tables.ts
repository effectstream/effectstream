import pg from "pg";

const client = new pg.Client({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "postgres",
});

await client.connect();
await client.query("CREATE TABLE IF NOT EXISTS avail_messages (id SERIAL PRIMARY KEY, height INTEGER NOT NULL, message TEXT NOT NULL)");
await client.end();
console.log("Avail user tables created");
